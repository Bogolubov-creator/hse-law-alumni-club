import { vi } from "vitest";
import { db } from "./fake-data.js";
import type { PaymentOrder, PaymentResult } from "../../src/modules/checkout/payment-store.js";
import type { YkPayment } from "../../src/modules/checkout/yookassa.js";

// Только адаптер хранения для HTTP-тестов. Правила переходов берём из production;
// блокировки, откат и конкуренция проверяются payment-store.integration.test.ts.
const rules = await vi.importActual<typeof import("../../src/modules/checkout/payment-store.js")>("../../src/modules/checkout/payment-store.js");
export const nextPodcastExpiry = rules.nextPodcastExpiry;
export async function extendPodcastSubscription(alumniId: string, months = 12) {
  const alumni = db.alumni!.find(row => row.id === alumniId);
  if (!alumni) throw Object.assign(new Error("Профиль подписчика не найден"), { statusCode: 404 });
  const until = rules.nextPodcastExpiry(alumni.podcast_sub_until, months);
  Object.assign(alumni, { podcast_sub_until: until, podcast_reminder_sent: false });
  return until;
}
export async function prepareOrderPayment(number: string, alumniId: string) {
  const order = db.orders?.find(row => row.number === number) as PaymentOrder | undefined;
  rules.assertPayableOrder(order, alumniId);
  const previous = { ...order };
  if (!order.payment_id) order.payment_status = "pending";
  return previous;
}
export async function applyVerifiedPayment(payment: YkPayment): Promise<PaymentResult> {
  const order = db.orders?.find(row => row.number === payment.metadata?.order_number) as PaymentOrder | undefined;
  if (!order) return { outcome: "missing" };
  const outcome = rules.paymentOutcome(order, payment);
  const previous = { ...order };
  if (outcome === "succeeded") {
    if (order.type === "podcast" && order.alumni_id) {
      const alumni = db.alumni!.find(row => row.id === order.alumni_id)!;
      alumni.podcast_sub_until = rules.nextPodcastExpiry(alumni.podcast_sub_until);
      alumni.podcast_reminder_sent = false;
    }
    Object.assign(order, { payment_id: payment.id, payment_status: "succeeded", paid_at: new Date().toISOString(), status: order.status === "new" ? "confirmed" : order.status });
  } else if (["review", "canceled", "pending"].includes(outcome)) {
    Object.assign(order, { payment_id: payment.id, payment_status: outcome === "pending" ? payment.status : outcome });
  }
  return { outcome, order: previous };
}
export const recordCreatedPayment = (number: string, payment: YkPayment) =>
  applyVerifiedPayment({ ...payment, metadata: { ...payment.metadata, order_number: number } });
