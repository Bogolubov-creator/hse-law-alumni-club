import { checkoutPool } from "./checkout-store.js";
import type { YkPayment } from "./yookassa.js";
import type { PoolClient } from "pg";

export type PaymentOrder = {
  id: string; number: string; alumni_id: string | null; type: string; status: string;
  payment_id: string | null; payment_status: string | null; total_estimate: number;
  contact_email: string | null; contact_fio: string | null;
};
export type PaymentOutcome = "missing" | "ignored" | "duplicate" | "review" | "succeeded" | "canceled" | "pending";
export type PaymentResult = { outcome: PaymentOutcome; order?: PaymentOrder };
const failure = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });

export function assertPayableOrder(order: PaymentOrder | undefined, alumniId: string): asserts order is PaymentOrder {
  if (!order) throw failure("Заявка не найдена", 404);
  if (!order.alumni_id || order.alumni_id !== alumniId) throw failure("Оплата доступна владельцу заявки", 403);
  if (["canceled", "expired"].includes(order.status)) throw failure("Заявка закрыта", 400);
  if (order.payment_status === "succeeded") throw failure("Заявка уже оплачена", 400);
  if (order.payment_status === "review") throw failure("Платёж требует сверки с учебным офисом", 409);
  if (!Number.isSafeInteger(order.total_estimate) || order.total_estimate <= 0) throw failure("Некорректная сумма оплаты", 400);
}

/** Решение одно для HTTP-тестов и SQL. Состояние succeeded нельзя понизить. */
export function paymentOutcome(order: PaymentOrder, payment: YkPayment): PaymentOutcome {
  if (order.payment_id && order.payment_id !== payment.id) return "ignored";
  if (order.payment_status === "succeeded") return "duplicate";
  if (payment.status === "succeeded") {
    const amount = payment.amount?.value;
    const amountKop = typeof amount === "string" && /^\d+\.\d{2}$/.test(amount)
      ? Number(amount.replace(".", "")) : NaN;
    if (payment.amount?.currency !== "RUB" || payment.paid !== true || !Number.isSafeInteger(amountKop) ||
        amountKop !== Number(order.total_estimate) || ["canceled", "expired"].includes(order.status)) return "review";
    return "succeeded";
  }
  if (order.payment_status === "review" || ["canceled", "expired"].includes(order.status)) return "ignored";
  if (payment.status === "canceled") return "canceled";
  if (order.payment_status === "canceled") return "ignored";
  return "pending";
}

export function nextPodcastExpiry(current: string | Date | null, months = 12, now = new Date()): string {
  const previous = current ? new Date(current) : null;
  const base = previous && previous.getTime() > now.getTime() ? previous : new Date(now);
  base.setMonth(base.getMonth() + months);
  return base.toISOString();
}

async function extendPodcast(client: PoolClient, alumniId: string, months = 12) {
  const { rows } = await client.query<{ podcast_sub_until: string | Date | null }>(
    "SELECT podcast_sub_until FROM alumni WHERE id=$1 FOR UPDATE", [alumniId],
  );
  if (!rows[0]) throw failure("Профиль подписчика не найден", 404);
  const until = nextPodcastExpiry(rows[0].podcast_sub_until, months);
  await client.query("UPDATE alumni SET podcast_sub_until=$2, podcast_reminder_sent=false WHERE id=$1", [alumniId, until]);
  return until;
}

/** Ручная выдача офиса использует ту же блокировку профиля, что и оплата. */
export async function extendPodcastSubscription(alumniId: string, months = 12) {
  const client = await checkoutPool().connect();
  try {
    await client.query("BEGIN");
    const until = await extendPodcast(client, alumniId, months);
    await client.query("COMMIT");
    return until;
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

/** Первый запрос резервирует pending; у связанного платежа сохраняем проверенный статус. */
export async function prepareOrderPayment(number: string, alumniId: string): Promise<PaymentOrder> {
  const client = await checkoutPool().connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<PaymentOrder>("SELECT * FROM orders WHERE number=$1 FOR UPDATE", [number]);
    const order = rows[0];
    assertPayableOrder(order, alumniId);
    if (!order.payment_id) {
      await client.query("UPDATE orders SET payment_status='pending' WHERE id=$1", [order.id]);
    }
    await client.query("COMMIT");
    return order;
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

/** Проверенный ответ провайдера применяется целиком или откатывается целиком. */
export async function applyVerifiedPayment(payment: YkPayment): Promise<PaymentResult> {
  const number = payment.metadata?.order_number;
  if (!number) return { outcome: "missing" };
  const client = await checkoutPool().connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<PaymentOrder>("SELECT * FROM orders WHERE number=$1 FOR UPDATE", [number]);
    const order = rows[0];
    if (!order) { await client.query("COMMIT"); return { outcome: "missing" }; }
    const outcome = paymentOutcome(order, payment);
    if (outcome === "succeeded") {
      if (order.type === "podcast" && order.alumni_id) {
        await extendPodcast(client, order.alumni_id);
      }
      await client.query("UPDATE orders SET payment_id=$2, payment_status='succeeded', paid_at=now(), status=CASE WHEN status='new' THEN 'confirmed' ELSE status END WHERE id=$1", [order.id, payment.id]);
    } else if (["review", "canceled", "pending"].includes(outcome)) {
      await client.query("UPDATE orders SET payment_id=$2, payment_status=$3 WHERE id=$1", [
        order.id, payment.id, outcome === "pending" ? payment.status : outcome,
      ]);
    }
    await client.query("COMMIT");
    return { outcome, order };
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export async function recordCreatedPayment(number: string, payment: YkPayment) {
  return applyVerifiedPayment({ ...payment, metadata: { ...payment.metadata, order_number: number } });
}
