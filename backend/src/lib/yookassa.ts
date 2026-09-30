import { env } from "../env.js";
import { orderIdempotenceKey } from "./idempotency.js";

/**
 * ЮKassa (yookassa.ru) – создание платежа и верификация статуса.
 *
 * Включается только при заданных YOOKASSA_SHOP_ID + YOOKASSA_SECRET_KEY;
 * без ключей сайт работает в прежнем режиме «заявка без оплаты».
 *
 * Безопасность: webhook-уведомлениям не доверяем на слово – статус всегда
 * перепроверяется прямым GET /payments/{id} к API ЮKassa (рекомендация ЮKassa).
 */

const API = "https://api.yookassa.ru/v3";

export function paymentsEnabled(): boolean {
  return !!(env.YOOKASSA_SHOP_ID && env.YOOKASSA_SECRET_KEY);
}

function authHeader(): string {
  return "Basic " + Buffer.from(`${env.YOOKASSA_SHOP_ID}:${env.YOOKASSA_SECRET_KEY}`).toString("base64");
}

export interface YkPayment {
  id: string;
  status: "pending" | "waiting_for_capture" | "succeeded" | "canceled";
  paid: boolean;
  amount: { value: string; currency: string };
  confirmation?: { type: string; confirmation_url?: string };
  metadata?: Record<string, string>;
}

/**
 * Создать платёж: redirect-подтверждение, автосписание (capture: true).
 * amountKop – сумма в копейках (как во всей денежной математике проекта).
 */
export async function createPayment(input: {
  amountKop: number;
  description: string;
  orderNumber: string;
  customerEmail?: string;
}): Promise<YkPayment> {
  const body: Record<string, unknown> = {
    amount: { value: (input.amountKop / 100).toFixed(2), currency: "RUB" },
    capture: true,
    confirmation: { type: "redirect", return_url: `${env.PUBLIC_URL}/cart?paid=${encodeURIComponent(input.orderNumber)}` },
    description: input.description.slice(0, 128),
    metadata: { order_number: input.orderNumber },
  };
  // Чек 54-ФЗ формирует ЮKassa при включённой в кабинете фискализации; e-mail плательщика – для чека.
  if (input.customerEmail) {
    body.receipt = {
      customer: { email: input.customerEmail },
      items: [{
        description: input.description.slice(0, 128),
        quantity: "1.00",
        amount: { value: (input.amountKop / 100).toFixed(2), currency: "RUB" },
        vat_code: 1, // без НДС; уточняется по учётной политике владельца
        payment_subject: "service",
        payment_mode: "full_payment",
      }],
    };
  }

  const res = await fetch(`${API}/payments`, {
    method: "POST",
    headers: {
      authorization: authHeader(),
      "content-type": "application/json",
      // Детерминированный по заявке ключ: повтор (ретрай/двойной клик) не создаёт
      // дубль платежа – ЮKassa вернёт тот же платёж (аудит L7).
      "Idempotence-Key": orderIdempotenceKey(input.orderNumber),
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as YkPayment & { description?: string };
  if (!res.ok) throw new Error(`ЮKassa create payment: HTTP ${res.status} ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

/** Актуальный статус платежа напрямую из API (верификация webhook-уведомлений). */
export async function fetchPayment(paymentId: string): Promise<YkPayment> {
  const res = await fetch(`${API}/payments/${encodeURIComponent(paymentId)}`, {
    headers: { authorization: authHeader() },
  });
  const data = (await res.json().catch(() => ({}))) as YkPayment;
  if (!res.ok) throw new Error(`ЮKassa fetch payment: HTTP ${res.status}`);
  return data;
}
