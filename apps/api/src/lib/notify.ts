import nodemailer from "nodemailer";
import { formatRub } from "@club/shared";
import { env } from "../env.js";

// SMTP-транспорт создаётся при первой отправке и переиспользуется. Лениво, а не
// на импорте: источник правды – env.SMTP_HOST в момент запроса, иначе модуль,
// загруженный раньше конфигурации, навсегда остался бы «без почты».
let mailer: ReturnType<typeof nodemailer.createTransport> | null = null;
function transport(): ReturnType<typeof nodemailer.createTransport> | null {
  if (!env.SMTP_HOST) return null;
  if (!mailer) {
    mailer = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465, // 465 = implicit TLS; 587 – STARTTLS
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  return mailer;
}

/**
 * Настроен ли почтовый канал. Роуты, смысл которых – доставить письмо
 * (восстановление пароля), обязаны это проверять и говорить правду, а не
 * отвечать «письмо отправлено», когда отправлять нечем.
 */
export function mailEnabled(): boolean {
  return !!env.SMTP_HOST;
}

/** Письмо пользователю. Без SMTP возвращаем false, содержимое и адрес не логируем. */
export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const t = transport();
  if (!t) {
    console.warn("[mail:blocked] SMTP не настроен; письмо не отправлено");
    return false;
  }
  try {
    await t.sendMail({ from: env.SMTP_FROM || env.SMTP_USER, to, subject, text });
    return true;
  } catch (e) {
    console.error("[mail] ошибка доставки; содержимое и адрес скрыты");
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
  // 152-ФЗ: Telegram – зарубежный сервис (трансграничная передача). НЕ отправляем
  // туда ПДн заявителя (ФИО/телефон/email) – только номер, состав и сумму; контакты
  // офис смотрит в админ-панели (РФ, под доступом). Так же не пишем ПДн в лог.
  const text =
    `🆕 Новая заявка ${o.number}\n` +
    `${o.itemsSummary}\n` +
    `Сумма (справочно): ${formatRub(o.total_estimate)} ₽ (скидка −${o.member_discount}%)\n` +
    `Контакты и детали – в админ-панели.`;

  const results: { channel: string; ok: boolean; blocked?: boolean }[] = [];
  if (env.OFFICE_NOTIFY_CHANNEL === "email" || env.OFFICE_NOTIFY_CHANNEL === "both") {
    const configured = !!env.OFFICE_EMAIL && mailEnabled();
    results.push({ channel: "email", ok: configured && await sendEmail(env.OFFICE_EMAIL, `Новая заявка ${o.number}`, text), blocked: !configured });
  }
  if (env.OFFICE_NOTIFY_CHANNEL === "telegram" || env.OFFICE_NOTIFY_CHANNEL === "both") {
    const configured = !!env.OFFICE_TG_BOT_TOKEN && !!env.OFFICE_TG_CHAT_ID;
    let ok = false;
    if (configured) {
      try {
        const r = await fetch(`https://api.telegram.org/bot${env.OFFICE_TG_BOT_TOKEN}/sendMessage`, {
          method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(10000),
          body: JSON.stringify({ chat_id: env.OFFICE_TG_CHAT_ID, text }),
        });
        const response = await r.json() as { ok?: boolean };
        ok = r.ok && response.ok === true;
      } catch { ok = false; }
    }
    results.push({ channel: "telegram", ok, blocked: !configured });
  }
  return { channel: results.map((r) => r.channel).join("+"), ok: results.every((r) => r.ok), blocked: results.some((r) => r.blocked) };
}

/** Подтверждение заявителю: письмо через SMTP (или лог в dev). */
export async function confirmApplicant(o: OrderNotice): Promise<void> {
  await sendEmail(
    o.contact_email,
    `Заявка ${o.number} принята – Клуб выпускников факультета права`,
    `Здравствуйте, ${o.contact_fio}!\n\nВаша заявка ${o.number} принята:\n${o.itemsSummary}\nСумма (справочно): ${formatRub(o.total_estimate)} ₽.\n\nМенеджер учебного офиса свяжется с вами для подтверждения деталей.\n\n– Клуб выпускников факультета права Вышки`,
  );
}
