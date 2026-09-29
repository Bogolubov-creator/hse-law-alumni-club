import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { checkoutPool, commitCheckout, changeOrderStatus, checkoutKey, findCheckout } from "./checkout-store.js";

// Только явно выделенная локальная БД. Обычный unit-прогон не подключается к данным.
const enabled = process.env.RUN_CHECKOUT_INTEGRATION === "true";
if (enabled && new URL(process.env.CHECKOUT_DATABASE_URL!).pathname !== "/alumni_staged") throw new Error("Интеграция разрешена только в alumni_staged");
const ids: { products: string[]; carts: string[]; orders: string[] } = { products: [], carts: [], orders: [] };
const pool = enabled ? checkoutPool() : null;
async function fixture(stock = 1) {
  const productId = randomUUID(), cartId = randomUUID(), session = randomUUID(), slug = `qa-${productId}`;
  await pool!.query("INSERT INTO products(id,slug,title,price,stock,status) VALUES($1,$2,'Тест резерва',10000,$3,'published')", [productId, slug, stock]);
  ids.products.push(productId);
  const items = [{ type: "merch" as const, ref_id: slug, variant_sku: null, qty: 1, price: 10000, title: "Тест резерва" }];
  await pool!.query("INSERT INTO carts(id,session_token,items_json) VALUES($1,$2,$3::json)", [cartId, session, JSON.stringify(items)]);
  ids.carts.push(cartId);
  const key = checkoutKey(session, randomUUID());
  const base = { alumni_id: null, type: 'merch', items_json: items, subtotal: 10000, member_discount: 0, total_estimate: 10000, contact_fio: 'Тест транзакции', contact_phone: '+70000000000', contact_email: 'transaction@staged.example.com', fulfillment: 'pickup', address: null, comment: null, consent_pdn: true, status: 'new' };
  return { productId, input: { session, key, requestHash: 'fixture', cartId, cartItems: items, base } };
}
async function keep(number: string) { const { rows } = await pool!.query('SELECT id FROM orders WHERE number=$1', [number]); ids.orders.push(rows[0].id); return rows[0].id as string; }
afterAll(async () => {
  if (!pool) return;
  await pool.query('DELETE FROM orders WHERE id=ANY($1::uuid[])', [ids.orders]);
  await pool.query('DELETE FROM carts WHERE id=ANY($1::uuid[])', [ids.carts]);
  await pool.query('DELETE FROM products WHERE id=ANY($1::uuid[])', [ids.products]);
  await pool.end();
});
describe.skipIf(!enabled)('PostgreSQL: атомарность и повтор', () => {
  it('один запрос одновременно дважды создаёт одну заявку; повтор возвращает её', async () => {
    const { input, productId } = await fixture();
    const results = await Promise.all([commitCheckout(input), commitCheckout(input)]);
    expect(results[0].number).toBe(results[1].number);
    await keep(results[0].number);
    expect((await pool!.query('SELECT stock FROM products WHERE id=$1', [productId])).rows[0].stock).toBe(0);
    expect((await pool!.query('SELECT items_json FROM carts WHERE id=$1', [input.cartId])).rows[0].items_json).toEqual([]);
    expect((await findCheckout(input.key, input.requestHash)).number).toBe(results[0].number);
    await expect(findCheckout(input.key, 'different-body')).rejects.toMatchObject({ statusCode: 409 });
  });
  it('последняя вещь достаётся только одному из двух клиентов', async () => {
    const { input, productId } = await fixture();
    const secondId = randomUUID(), secondSession = randomUUID(); ids.carts.push(secondId);
    await pool!.query('INSERT INTO carts(id,session_token,items_json) VALUES($1,$2,$3::json)', [secondId, secondSession, JSON.stringify(input.cartItems)]);
    const second = { ...input, cartId: secondId, session: secondSession, key: checkoutKey(secondSession, randomUUID()) };
    const results = await Promise.allSettled([commitCheckout(input), commitCheckout(second)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    for (const result of results) if (result.status === 'fulfilled') await keep(result.value.number); else expect(result.reason.statusCode).toBe(409);
    expect((await pool!.query('SELECT stock FROM products WHERE id=$1', [productId])).rows[0].stock).toBe(0);
  });
  it('сбой после списания первой позиции откатывает резерв и сохраняет корзину', async () => {
    const { input, productId } = await fixture();
    input.base.items_json.push({ ...input.base.items_json[0]!, ref_id: 'zz-missing-product' });
    await pool!.query('UPDATE carts SET items_json=$2::json WHERE id=$1', [input.cartId, JSON.stringify(input.cartItems)]);
    await expect(commitCheckout(input)).rejects.toMatchObject({ statusCode: 409 });
    expect((await pool!.query('SELECT stock FROM products WHERE id=$1', [productId])).rows[0].stock).toBe(1);
    expect((await pool!.query('SELECT items_json FROM carts WHERE id=$1', [input.cartId])).rows[0].items_json).toHaveLength(2);
    expect(await findCheckout(input.key, input.requestHash)).toBeNull();
  });
  it('отмена возвращает резерв один раз и не разрешает повторное открытие', async () => {
    const { input, productId } = await fixture(); const result = await commitCheckout(input); const id = await keep(result.number);
    expect(await changeOrderStatus(id, 'canceled')).toBe(true);
    expect(await changeOrderStatus(id, 'canceled')).toBe(false);
    expect((await pool!.query('SELECT stock FROM products WHERE id=$1', [productId])).rows[0].stock).toBe(1);
    await expect(changeOrderStatus(id, 'new')).rejects.toMatchObject({ statusCode: 409 });
  });
  it('до ответа платёжного провайдера pending уже сохранён и блокирует отмену', async () => {
    const { input, productId } = await fixture();
    const result = await commitCheckout({ ...input, base: { ...input.base, payment_status: 'pending' } });
    const id = await keep(result.number);
    await expect(changeOrderStatus(id, 'canceled')).rejects.toMatchObject({ statusCode: 409 });
    expect((await pool!.query('SELECT stock FROM products WHERE id=$1', [productId])).rows[0].stock).toBe(0);
  });
  it('не отменяет оплаченный заказ и сохраняет резерв', async () => {
    const { input, productId } = await fixture(); const result = await commitCheckout(input); const id = await keep(result.number);
    await pool!.query("UPDATE orders SET payment_status='succeeded' WHERE id=$1", [id]);
    await expect(changeOrderStatus(id, 'canceled')).rejects.toMatchObject({ statusCode: 409 });
    expect((await pool!.query('SELECT stock FROM products WHERE id=$1', [productId])).rows[0].stock).toBe(0);
  });
  it('истечение резерва возвращает склад и ставит expired', async () => {
    const { input, productId } = await fixture();
    const result = await commitCheckout(input);
    const id = await keep(result.number);
    expect(await changeOrderStatus(id, 'expired')).toBe(true);
    expect((await pool!.query('SELECT status FROM orders WHERE id=$1', [id])).rows[0].status).toBe('expired');
    expect((await pool!.query('SELECT stock FROM products WHERE id=$1', [productId])).rows[0].stock).toBe(1);
    await expect(changeOrderStatus(id, 'new')).rejects.toMatchObject({ statusCode: 409 });
  });
});
