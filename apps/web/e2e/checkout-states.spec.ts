import { test, expect } from '@playwright/test';
import { preparePage, mockPublicApi } from './harness';
const line = { type: 'merch', ref_id: 'shirt', variant_sku: 'M', qty: 1, price: 250000, title: 'Футболка клуба выпускников' };
const summary = (qty = 1) => ({ items: [{ ...line, qty }], count: qty, subtotal: qty * line.price });
test.beforeEach(async ({ page }) => { await preparePage(page); await mockPublicApi(page); });
for (const width of [320, 768, 1440]) test(`checkout layout ${width}`, async ({ page }, info) => {
 await page.setViewportSize({ width, height: 900 });
 await page.route('**/api/cart', r => r.fulfill({ json: summary() }));
 await page.goto('/cart');
 await page.getByRole('button', { name: 'доставка', exact: true }).click();
 await expect(page.getByLabel('адрес доставки')).toBeVisible();
 await expect(page.getByLabel('фио', { exact: true })).toHaveAttribute('autocomplete', 'name');
 await expect(page.getByLabel('телефон', { exact: true })).toHaveAttribute('autocomplete', 'tel');
 await expect(page.getByRole('button', { name: 'Нужно согласие на обработку данных' })).toBeDisabled();
 await page.evaluate(() => document.fonts.ready);
 expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
 if (process.env.CHECKOUT_SCREENSHOTS) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${process.env.CHECKOUT_SCREENSHOTS}/checkout-${info.project.name}-${width}.png`, fullPage: true });
  if (width === 320) await page.locator('form').screenshot({ path: `${process.env.CHECKOUT_SCREENSHOTS}/checkout-form-${info.project.name}.png` });
 }
});
test('quantity update and checkout are serialized; failed order can retry', async ({ page }) => {
 let releaseQty!: () => void; let releaseOrder!: () => void; let qty = 1; let succeed = false;
 const keys: string[] = []; const bodies: any[] = [];
 await page.route('**/api/cart', async r => {
  if (r.request().method() === 'PATCH') { await new Promise<void>(resolve => { releaseQty = resolve; }); qty = 2; }
  return r.fulfill({ json: summary(qty) });
 });
 await page.route('**/api/orders', async r => {
  keys.push(r.request().headers()['idempotency-key']!); bodies.push(r.request().postDataJSON());
  await new Promise<void>(resolve => { releaseOrder = resolve; });
  return r.fulfill(succeed ? { json: { number: 'QA-913', status: 'new', member_discount: 0, subtotal: 500000, total_estimate: 500000, notified: { channel: 'telegram', ok: true } } } : { status: 503, json: { error: 'Сервис временно недоступен. Повторите попытку.' } });
 });
 await page.goto('/cart');
 await page.getByLabel('фио', { exact: true }).fill('Тестовый Выпускник');
 await page.getByLabel('телефон', { exact: true }).fill('+79990000000');
 await page.getByLabel('почта', { exact: true }).fill('qa@example.com');
 await page.getByRole('checkbox').check();
 await page.getByRole('button', { name: `Увеличить количество: ${line.title}` }).click();
 await expect(page.getByRole('button', { name: 'Обновляем корзину…' })).toBeDisabled();
 await expect.poll(() => Boolean(releaseQty)).toBe(true); releaseQty();
 await page.getByRole('button', { name: 'Оформить заявку' }).click();
 await expect(page.getByLabel('фио', { exact: true })).toBeDisabled();
 await expect(page.getByRole('button', { name: `Убрать из корзины: ${line.title}` })).toBeDisabled();
 await expect.poll(() => Boolean(releaseOrder)).toBe(true); releaseOrder();
 await expect(page.getByRole('alert').filter({ hasText: 'Сервис временно недоступен' })).toBeVisible();
 await expect(page.getByLabel('фио', { exact: true })).toHaveValue('Тестовый Выпускник');
 succeed = true; releaseOrder = undefined as any;
 await page.getByRole('button', { name: 'Оформить заявку' }).click();
 await expect.poll(() => Boolean(releaseOrder)).toBe(true); releaseOrder();
 await expect(page.getByRole('heading', { name: 'Заявка отправлена в учебный офис' })).toBeFocused();
 expect(keys).toHaveLength(2); expect(keys[0]).toBeTruthy(); expect(keys[1]).toBe(keys[0]);
 expect(bodies[1]).toMatchObject({ contact_email: 'qa@example.com', fulfillment: 'pickup', address: null, consent_pdn: true });
});
test('DPO does not request shipping address', async ({ page }) => {
 await page.route('**/api/cart', r => r.fulfill({ json: { ...summary(), items: [{ ...line, type: 'dpo', variant_sku: null }] } }));
 await page.goto('/cart'); await expect(page.getByText('1 место')).toBeVisible();
 await expect(page.getByRole('button', { name: 'доставка', exact: true })).toHaveCount(0);
 await expect(page.getByLabel('адрес доставки')).toHaveCount(0);
});
