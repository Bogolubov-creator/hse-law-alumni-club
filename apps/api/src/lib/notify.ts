import nodemailer from "nodemailer";
import { formatRub } from "@club/shared";
import { env } from "../env.js";

// SMTP-транспорт создаётся один раз при наличии кредов (иначе письма в лог).
const mailer = env.SMTP_HOST
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465, // 465 = implicit TLS; 587 — STARTTLS
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    })
  : null;

/** Письмо пользователю. Без SMTP — содержимое в лог (dev-режим), не падаем. */
export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  if (!mailer) {
    console.warn(`[mail:dev] SMTP не настроен. Кому: ${to}\nТема: ${subject}\n${text}`);
    return false;
  }
  try {
    await mailer.sendMail({ from: env.SMTP_FROM || env.SMTP_USER, to, subject, text });
    return true;
  } catch (e) {
    console.error(`[mail] не отправилось на ${to}:`, (e as Error).message);
    return false;
  }
}

/** Произвольное текстовое уведомление офису (Telegram при токене, иначе лог). */
export async function notifyOfficeText(text: string): Promise<void> {
  if (env.OFFICE_TG_BOT_TOKEN && env.OFFICE_TG_CHAT_ID) {
    try {
      await fetch(`https://api.telegram.org/bot${env.OFFICE_TG_BOT_TOKEN}/sendMessage`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: env.OFFICE_TG_CHAT_ID, text }),
      });
      return;
    } catch { /* лог ниже */ }
  }
  console.warn(`[notify:log] ${text}`);
}

export interface OrderNotice {
  number: string;
  contact_fio: string;
  contact_phone: string;
  contact_email: string;
  itemsSummary: string;
  total_estimate: number; // копейки
  member_discount: number;
}



/** Уведомление офиса о новой заявке. Telegram если есть токен, иначе лог + BLOCKED-пометка. */
export async function notifyOffice(o: OrderNotice): Promise<{ channel: string; ok: boolean; blocked?: boolean }> {
  const text =
    `🆕 Новая заявка ${o.number}\n` +
    `${o.contact_fio} · ${o.contact_phone} · ${o.contact_email}\n` +
    `${o.itemsSummary}\n` +
    `Сумма (справочно): ${formatRub(o.total_estimate)} ₽ (скидка −${o.member_discount}%)`;

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

/** Подтверждение заявителю: письмо через SMTP (или лог в dev). */
export async function confirmApplicant(o: OrderNotice): Promise<void> {
  await sendEmail(
    o.contact_email,
    `Заявка ${o.number} принята — Клуб выпускников факультета права`,
    `Здравствуйте, ${o.contact_fio}!\n\nВаша заявка ${o.number} принята:\n${o.itemsSummary}\nСумма (справочно): ${formatRub(o.total_estimate)} ₽.\n\nМенеджер учебного офиса свяжется с вами для подтверждения деталей.\n\n— Клуб выпускников факультета права НИУ ВШЭ`,
  );
}
