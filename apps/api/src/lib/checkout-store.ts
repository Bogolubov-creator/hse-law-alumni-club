import { createHash, randomUUID } from "node:crypto";
import pg, { type PoolClient } from "pg";
import { effectiveDiscount, type StoredCartItem } from "@club/shared";
import { env } from "../env.js";

let pool: pg.Pool | undefined;
export function checkoutPool() {
  if (!env.CHECKOUT_DATABASE_URL) throw Object.assign(new Error("Транзакционное оформление не настроено"), { statusCode: 503 });
  return pool ??= new pg.Pool({ connectionString: env.CHECKOUT_DATABASE_URL, max: 6, connectionTimeoutMillis: 5000, statement_timeout: 15000 });
}
export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export const checkoutKey = (session: string, key: string) => digest(`${session}:${key}`);
const conflict = (message: string) => Object.assign(new Error(message), { statusCode: 409 });
export async function withCartLock<T>(session: string, fn: () => Promise<T>): Promise<T> {
  const c = await checkoutPool().connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`cart:${session}`]);
    const result = await fn();
    await c.query("COMMIT");
    return result;
  } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
}
async function replay(c: Pick<PoolClient, "query">, key: string, requestHash: string) {
  const { rows } = await c.query("SELECT receipt, request_hash FROM club_checkout_commits WHERE key_hash=$1", [key]);
  if (!rows[0]) return null;
  if (rows[0].request_hash !== requestHash) throw conflict("Этот ключ уже использован для другой заявки. Проверьте сохранённую заявку в кабинете.");
  return rows[0].receipt;
}
export async function findCheckout(key: string, requestHash: string) { return replay(checkoutPool(), key, requestHash); }
export async function saveReceipt(key: string, receipt: unknown) {
  await checkoutPool().query("UPDATE club_checkout_commits SET receipt=$2::jsonb WHERE key_hash=$1", [key, JSON.stringify(receipt)]);
}

type OrderBase = {
  alumni_id: string | null; type: string; items_json: StoredCartItem[]; subtotal: number; member_discount: number; total_estimate: number;
  contact_fio: string; contact_phone: string; contact_email: string; fulfillment: string; address: string | null; comment: string | null; consent_pdn: boolean; status: string; payment_status?: string | null;
};
export async function commitCheckout(input: { session: string; key: string; requestHash: string; cartId: string; cartItems: StoredCartItem[]; base: OrderBase }) {
  const c = await checkoutPool().connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`cart:${input.session}`]);
    const previous = await replay(c, input.key, input.requestHash);
    if (previous) { await c.query("COMMIT"); return { replay: previous, number: previous.number as string }; }
    const { rows: carts } = await c.query("SELECT items_json FROM carts WHERE id=$1 AND session_token=$2 FOR UPDATE", [input.cartId, input.session]);
    if (!carts[0] || JSON.stringify(carts[0].items_json) !== JSON.stringify(input.cartItems)) throw conflict("Корзина изменилась. Обновите её перед оформлением.");
    const base = input.base;
    if (base.alumni_id) {
      const { rows } = await c.query("SELECT verification_status, points_cached, personal_discount FROM alumni WHERE id=$1 FOR SHARE", [base.alumni_id]);
      const a = rows[0];
      if (!a || effectiveDiscount(a.verification_status === "verified", a.points_cached ?? 0, a.personal_discount ?? 0) !== base.member_discount) throw conflict("Статус или скидка изменились. Обновите корзину.");
    }
    const reservations: { id: string; sku: string | null; qty: number }[] = [];
    // Одинаковый порядок блокировок исключает взаимную блокировку двух смешанных заказов.
    for (const item of [...base.items_json].sort((a, b) => `${a.type}:${a.ref_id}:${a.variant_sku}`.localeCompare(`${b.type}:${b.ref_id}:${b.variant_sku}`))) {
      const table = item.type === "merch" ? "products" : "programs";
      const { rows } = await c.query(`SELECT * FROM ${table} WHERE slug=$1 FOR UPDATE`, [item.ref_id]);
      const product = rows[0];
      if (!product || product.status !== "published" || product.price !== item.price || (item.type === "dpo" && (product.source_url || product.enrollment === "nonactual"))) throw conflict("Цена или доступность позиции изменились. Обновите корзину.");
      if (!Number.isInteger(item.qty) || item.qty < 1 || item.qty > 99) throw conflict("Некорректное количество.");
      if (item.type === "merch") {
        const variants = product.variants_json ?? [];
        const variant = variants.find((v: { sku: string }) => v.sku === item.variant_sku);
        if ((variants.length && !variant) || (!variants.length && item.variant_sku)) throw conflict("Вариант товара больше недоступен.");
        const available = variant ? variant.stock : product.stock;
        if (!Number.isInteger(available) || available < item.qty) throw conflict(`Недостаточно на складе: ${item.title}.`);
        if (variant) { variant.stock -= item.qty; await c.query("UPDATE products SET variants_json=$2::json WHERE id=$1", [product.id, JSON.stringify(variants)]); }
        else await c.query("UPDATE products SET stock=stock-$2 WHERE id=$1", [product.id, item.qty]);
        reservations.push({ id: product.id, sku: item.variant_sku ?? null, qty: item.qty });
      }
    }
    await c.query("SELECT pg_advisory_xact_lock(81920260908)");
    const year = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Moscow", year: "numeric" });
    const { rows } = await c.query("SELECT COALESCE(MAX(CAST(split_part(number,'-',3) AS integer)),0)+1 AS seq FROM orders WHERE number ~ $1", [`^ALU-${year}-[0-9]+$`]);
    const number = `ALU-${year}-${String(rows[0].seq).padStart(6, "0")}`;
    const id = randomUUID();
    const data = { id, ...base, number, created_at: new Date().toISOString() };
    const columns = Object.keys(data);
    const values = Object.values(data).map((v) => typeof v === "object" && v !== null ? JSON.stringify(v) : v);
    await c.query(`INSERT INTO orders (${columns.join(",")}) VALUES (${values.map((_, i) => `$${i + 1}`).join(",")})`, values);
    const receipt = { number, status: base.status, member_discount: base.member_discount, subtotal: base.subtotal, total_estimate: base.total_estimate, notified: { channel: "none", ok: false, blocked: true } };
    await c.query("INSERT INTO club_checkout_commits(key_hash,request_hash,order_id,reservations,receipt) VALUES($1,$2,$3,$4::jsonb,$5::jsonb)", [input.key, input.requestHash, id, JSON.stringify(reservations), JSON.stringify(receipt)]);
    await c.query("UPDATE carts SET items_json='[]'::json, updated_at=now() WHERE id=$1", [input.cartId]);
    await c.query("COMMIT");
    return { number, replay: null };
  } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
}

/** Отмена освобождает только наш резерв и ровно один раз. Оплаченный заказ требует возврата. */
export async function changeOrderStatus(id: string, status: string) {
  const c = await checkoutPool().connect();
  try {
    await c.query("BEGIN");
    const { rows } = await c.query("SELECT status,payment_status FROM orders WHERE id=$1 FOR UPDATE", [id]);
    if (!rows[0]) throw Object.assign(new Error("Заявка не найдена"), { statusCode: 404 });
    if (rows[0].status === status) { await c.query("COMMIT"); return false; }
    if (rows[0].status === "canceled") throw conflict("Отменённую заявку нельзя открыть повторно. Создайте новую.");
    if (status === "canceled" && ["succeeded", "pending", "waiting_for_capture", "review"].includes(rows[0].payment_status)) throw conflict("Сначала завершите сверку или возврат платежа. Резерв сохранён.");
    if (status === "canceled") {
      const { rows: commits } = await c.query("SELECT reservations,released FROM club_checkout_commits WHERE order_id=$1 FOR UPDATE", [id]);
      if (commits[0] && !commits[0].released) {
        for (const reserve of commits[0].reservations) {
          const { rows: products } = await c.query("SELECT variants_json FROM products WHERE id=$1 FOR UPDATE", [reserve.id]);
          if (!products[0]) throw conflict("Товар резерва удалён. Восстановите его перед отменой.");
          if (reserve.sku) {
            const variants = products[0].variants_json ?? [];
            const variant = variants.find((v: { sku: string }) => v.sku === reserve.sku);
            if (!variant) throw conflict("Вариант резерва удалён. Восстановите его перед отменой.");
            variant.stock += reserve.qty;
            await c.query("UPDATE products SET variants_json=$2::json WHERE id=$1", [reserve.id, JSON.stringify(variants)]);
          } else await c.query("UPDATE products SET stock=stock+$2 WHERE id=$1", [reserve.id, reserve.qty]);
        }
        await c.query("UPDATE club_checkout_commits SET released=true WHERE order_id=$1", [id]);
      }
    }
    await c.query("UPDATE orders SET status=$2 WHERE id=$1", [id, status]);
    await c.query("COMMIT"); return true;
  } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
}
