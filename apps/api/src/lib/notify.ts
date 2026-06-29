import { env } from "../env.js";

export interface OrderNotice {
  number: string;
  contact_fio: string;
  contact_phone: string;
  contact_email: string;
  itemsSummary: string;
  total_estimate: number; // копейки
  member_discount: number;
}

const rub = (kop: number) => (kop / 100).toLocaleString("ru-RU");

/** Уведомление офиса о новой заявке. Telegram если есть токен, иначе лог + BLOCKED-пометка. */
export async function notifyOffice(o: OrderNotice): Promise<{ channel: string; ok: boolean; blocked?: boolean }> {
  const text =
    `🆕 Новая заявка ${o.number}\n` +
    `${o.contact_fio} · ${o.contact_phone} · ${o.contact_email}\n` +
    `${o.itemsSummary}\n` +
    `Сумма (справочно): ${rub(o.total_estimate)} ₽ (скидка −${o.member_discount}%)`;

  const useTg = (env.OFFICE_NOTIFY_CHANNEL === "telegram" || env.OFFICE_NOTIFY_CHANNEL === "both")
    && env.OFFICE_TG_BOT_TOKEN && env.OFFICE_TG_CHAT_ID;

  if (useTg) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${env.OFFICE_TG_BOT_TOKEN}/sendMessage`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: env.OFFICE_TG_CHAT_ID, text }),
      });
      return { channel: "telegram", ok: r.ok };
    } catch {
      return { channel: "telegram", ok: false };
    }
  }

  // Токена нет — заявка всё равно создана, но офис не уведомлён.
  console.warn(`[notify:BLOCKED] нет OFFICE_TG_BOT_TOKEN/CHAT_ID. Заявка ${o.number} создана, офис НЕ уведомлён.\n${text}`);
  return { channel: "none", ok: false, blocked: true };
}

/** Подтверждение заявителю. Email если настроен SMTP, иначе лог. */
export async function confirmApplicant(o: OrderNotice): Promise<void> {
  if (env.SMTP_HOST) {
    console.log(`[confirm] (SMTP настроен) письмо ${o.contact_email}: заявка ${o.number} принята.`);
    // Реальная отправка SMTP — когда дадут креды (BLOCKED).
  } else {
    console.log(`[confirm:log] ${o.contact_email}: заявка ${o.number} принята, офис свяжется с вами.`);
  }
}
