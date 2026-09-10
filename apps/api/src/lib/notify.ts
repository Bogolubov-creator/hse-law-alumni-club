import nodemailer from "nodemailer";
import { formatRub } from "@club/shared";
import { env } from "../env.js";
import { checkoutPool } from "./checkout-store.js";

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

/** Прямая отправка (восстановление пароля и т.п.). Без SMTP – false. */
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

/** Кладёт письмо в outbox и сразу пробует отправить; при сбое – повтор из cron. */
export async function enqueueMail(input: {
  to: string;
  subject: string;
  body: string;
  kind?: string;
}): Promise<{ id: number | null; sent: boolean; blocked: boolean }> {
  if (!env.CHECKOUT_DATABASE_URL) {
    const sent = await sendEmail(input.to, input.subject, input.body);
    return { id: null, sent, blocked: !mailEnabled() };
  }
  try {
    const { rows } = await checkoutPool().query<{ id: number }>(
      `INSERT INTO club_mail_outbox(kind, to_addr, subject, body)
       VALUES($1,$2,$3,$4) RETURNING id`,
      [input.kind ?? "office", input.to, input.subject, input.body],
    );
    const id = rows[0]!.id;
    const sent = await sendEmail(input.to, input.subject, input.body);
    if (sent) {
      await checkoutPool().query(
        `UPDATE club_mail_outbox SET status='sent', attempts=1, sent_at=now() WHERE id=$1`,
        [id],
      );
      return { id, sent: true, blocked: false };
    }
    await checkoutPool().query(
      `UPDATE club_mail_outbox
       SET attempts=1, next_attempt_at=now() + interval '5 minutes',
           last_error=$2, status=CASE WHEN 1 >= $3 THEN 'failed' ELSE 'pending' END
       WHERE id=$1`,
      [id, mailEnabled() ? "smtp_fail" : "smtp_missing", env.MAIL_OUTBOX_MAX_ATTEMPTS],
    );
    return { id, sent: false, blocked: !mailEnabled() };
  } catch {
    const sent = await sendEmail(input.to, input.subject, input.body);
    return { id: null, sent, blocked: !mailEnabled() };
  }
}

/** Слив due-писем из outbox. Возвращает { sent, failed, pending }. */
export async function drainMailOutbox(limit = 20): Promise<{ sent: number; failed: number; skipped: number }> {
  if (!env.CHECKOUT_DATABASE_URL) return { sent: 0, failed: 0, skipped: 0 };
  let sent = 0, failed = 0, skipped = 0;
  try {
    const { rows } = await checkoutPool().query<{
      id: number; to_addr: string; subject: string; body: string; attempts: number;
    }>(
      `SELECT id, to_addr, subject, body, attempts FROM club_mail_outbox
       WHERE status='pending' AND next_attempt_at <= now()
       ORDER BY id ASC LIMIT $1`,
      [limit],
    );
    for (const row of rows) {
      const ok = await sendEmail(row.to_addr, row.subject, row.body);
      const attempts = row.attempts + 1;
      if (ok) {
        await checkoutPool().query(
          `UPDATE club_mail_outbox SET status='sent', attempts=$2, sent_at=now(), last_error=NULL WHERE id=$1`,
          [row.id, attempts],
        );
        sent += 1;
      } else if (attempts >= env.MAIL_OUTBOX_MAX_ATTEMPTS) {
        await checkoutPool().query(
          `UPDATE club_mail_outbox SET status='failed', attempts=$2, last_error='max_attempts' WHERE id=$1`,
          [row.id, attempts],
        );
        failed += 1;
      } else {
        const delayMin = Math.min(60, 5 * attempts);
        await checkoutPool().query(
          `UPDATE club_mail_outbox
           SET attempts=$2, next_attempt_at=now() + ($3::text || ' minutes')::interval, last_error='smtp_fail'
           WHERE id=$1`,
          [row.id, attempts, String(delayMin)],
        );
        skipped += 1;
      }
    }
  } catch {
    /* таблица ещё не накачена */
  }
  return { sent, failed, skipped };
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
    if (env.OFFICE_EMAIL) {
      const q = await enqueueMail({
        to: env.OFFICE_EMAIL,
        subject: `Новая заявка ${o.number}`,
        body: text,
        kind: "office_order",
      });
      results.push({ channel: "email", ok: q.sent, blocked: q.blocked || !configured });
    } else {
      results.push({ channel: "email", ok: false, blocked: true });
    }
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
