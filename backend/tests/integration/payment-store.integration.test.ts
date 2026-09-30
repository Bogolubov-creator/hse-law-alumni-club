import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { checkoutPool, changeOrderStatus } from "../../src/db/checkout-store.js";
import { applyVerifiedPayment, prepareOrderPayment, recordCreatedPayment, extendPodcastSubscription } from "../../src/modules/checkout/payment-store.js";
import type { YkPayment } from "../../src/modules/checkout/yookassa.js";

const enabled = process.env.RUN_CHECKOUT_INTEGRATION === "true";
if (enabled && new URL(process.env.CHECKOUT_DATABASE_URL!).pathname !== "/alumni_staged") throw new Error("Only alumni_staged is allowed");
const pool = enabled ? checkoutPool() : null;
const alumniIds: string[] = [], orderIds: string[] = [];

async function fixture() {
  const alumniId = randomUUID(), orderId = randomUUID(), number = `PAY-QA-${randomUUID()}`, paymentId = randomUUID();
  alumniIds.push(alumniId); orderIds.push(orderId);
  await pool!.query("INSERT INTO alumni(id,verification_status,podcast_reminder_sent) VALUES($1,'verified',true)", [alumniId]);
  await pool!.query("INSERT INTO orders(id,number,alumni_id,type,status,payment_status,total_estimate,payment_id) VALUES($1,$2,$3,'podcast','new','pending',100000,$4)", [orderId, number, alumniId, paymentId]);
  const payment: YkPayment = { id: paymentId, status: "succeeded", paid: true, amount: { value: "1000.00", currency: "RUB" }, metadata: { order_number: number } };
  const state = async () => {
    const order = (await pool!.query("SELECT * FROM orders WHERE id=$1", [orderId])).rows[0];
    const alumni = (await pool!.query("SELECT * FROM alumni WHERE id=$1", [alumniId])).rows[0];
    return { order, alumni };
  };
  return { alumniId, orderId, number, payment, state };
}

afterAll(async () => {
  if (!pool) return;
  await pool.query("DELETE FROM orders WHERE id=ANY($1::uuid[])", [orderIds]);
  await pool.query("DELETE FROM alumni WHERE id=ANY($1::uuid[])", [alumniIds]);
  await pool.end();
});

describe.skipIf(!enabled)("PostgreSQL: применение проверенной оплаты", () => {
  it("одновременные оплата и выдача офиса сохраняют оба продления", async () => {
    const f = await fixture();
    await Promise.all([applyVerifiedPayment(f.payment), extendPodcastSubscription(f.alumniId)]);
    const until = (await f.state()).alumni.podcast_sub_until.getTime();
    expect(until - Date.now()).toBeGreaterThan(729 * 86400000);
    expect(until - Date.now()).toBeLessThan(734 * 86400000);
  });
  it("одновременные дубли дают одно продление и один succeeded", async () => {
    const f = await fixture();
    const results = await Promise.all([applyVerifiedPayment(f.payment), applyVerifiedPayment(f.payment)]);
    expect(results.map(result => result.outcome).sort()).toEqual(["duplicate", "succeeded"]);
    const first = await f.state();
    expect(first.order.payment_status).toBe("succeeded");
    expect(first.order.status).toBe("confirmed");
    expect(first.alumni.podcast_reminder_sent).toBe(false);
    expect(first.alumni.podcast_sub_until.getTime() - Date.now()).toBeLessThan(367 * 86400000);
    await applyVerifiedPayment(f.payment);
    expect((await f.state()).alumni.podcast_sub_until).toEqual(first.alumni.podcast_sub_until);
  });

  it("SQL-сбой после изменения подписки откатывает её; повтор выдаёт один год", async () => {
    const f = await fixture();
    // UUID сгенерирован самим тестом. CHECK ломает именно вторую запись транзакции.
    await pool!.query(`ALTER TABLE orders ADD CONSTRAINT qa_fail_payment CHECK (id <> '${f.orderId}'::uuid OR payment_status <> 'succeeded') NOT VALID`);
    try {
      await expect(applyVerifiedPayment(f.payment)).rejects.toMatchObject({ code: "23514" });
      const failed = await f.state();
      expect(failed.alumni.podcast_sub_until).toBeNull();
      expect(failed.alumni.podcast_reminder_sent).toBe(true);
      expect(failed.order.payment_status).toBe("pending");
      expect(failed.order.paid_at).toBeNull();
    } finally { await pool!.query("ALTER TABLE orders DROP CONSTRAINT qa_fail_payment"); }
    expect((await applyVerifiedPayment(f.payment)).outcome).toBe("succeeded");
    const paid = await f.state();
    expect(paid.alumni.podcast_sub_until.getTime() - Date.now()).toBeLessThan(367 * 86400000);
    expect((await applyVerifiedPayment(f.payment)).outcome).toBe("duplicate");
    expect((await f.state()).alumni.podcast_sub_until).toEqual(paid.alumni.podcast_sub_until);
  });

  it.each([
    { value: "999.99", currency: "RUB" },
    { value: "1000.00", currency: "USD" },
    { value: "1000.001", currency: "RUB" },
  ])("не выдаёт подписку при неправильной сумме/валюте %j", async amount => {
    const f = await fixture();
    expect((await applyVerifiedPayment({ ...f.payment, amount })).outcome).toBe("review");
    const state = await f.state();
    expect(state.order.payment_status).toBe("review");
    expect(state.alumni.podcast_sub_until).toBeNull();
  });

  it("не заменяет связанный payment_id чужим и не понижает succeeded", async () => {
    const f = await fixture();
    expect((await applyVerifiedPayment({ ...f.payment, id: randomUUID() })).outcome).toBe("ignored");
    expect((await f.state()).order.payment_id).toBe(f.payment.id);
    await applyVerifiedPayment(f.payment);
    const paid = await f.state();
    expect((await applyVerifiedPayment({ ...f.payment, status: "canceled" })).outcome).toBe("duplicate");
    await recordCreatedPayment(f.number, { ...f.payment, status: "pending" });
    const after = await f.state();
    expect(after.order.payment_status).toBe("succeeded");
    expect(after.alumni.podcast_sub_until).toEqual(paid.alumni.podcast_sub_until);
  });

  it("поздняя оплата expired направляется на сверку без подписки", async () => {
    const f = await fixture();
    await pool!.query("UPDATE orders SET status='expired' WHERE id=$1", [f.orderId]);
    await expect(prepareOrderPayment(f.number, f.alumniId)).rejects.toMatchObject({ statusCode: 400 });
    expect((await applyVerifiedPayment(f.payment)).outcome).toBe("review");
    expect((await f.state()).alumni.podcast_sub_until).toBeNull();
  });

  it("перед сетью сохраняет pending и не допускает отмену или чужого владельца", async () => {
    const f = await fixture();
    await pool!.query("UPDATE orders SET payment_status=NULL,payment_id=NULL WHERE id=$1", [f.orderId]);
    await expect(prepareOrderPayment(f.number, randomUUID())).rejects.toMatchObject({ statusCode: 403 });
    expect((await f.state()).order.payment_status).toBeNull();
    await prepareOrderPayment(f.number, f.alumniId);
    expect((await f.state()).order.payment_status).toBe("pending");
    await expect(changeOrderStatus(f.orderId, "canceled")).rejects.toMatchObject({ statusCode: 409 });
  });

  it.each(["canceled", "waiting_for_capture"])("подготовка запроса не меняет известный статус %s", async paymentStatus => {
    const f = await fixture();
    await pool!.query("UPDATE orders SET payment_status=$2 WHERE id=$1", [f.orderId, paymentStatus]);
    await prepareOrderPayment(f.number, f.alumniId);
    const { order } = await f.state();
    expect(order.payment_id).toBe(f.payment.id);
    expect(order.payment_status).toBe(paymentStatus);
    if (paymentStatus === "canceled") {
      await changeOrderStatus(f.orderId, "canceled");
      expect((await f.state()).order.status).toBe("canceled");
    } else {
      await expect(changeOrderStatus(f.orderId, "canceled")).rejects.toMatchObject({ statusCode: 409 });
    }
  });
});
