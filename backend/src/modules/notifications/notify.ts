import nodemailer from "nodemailer";
import { formatRub } from "@club/shared";
import { env } from "../../config/env.js";
import { checkoutPool } from "../../db/checkout-store.js";

export const EMAIL_CONFIRMATION_KIND = "email_confirmation";

// SMTP создаётся лениво, чтобы использовать конфигурацию на момент отправки.
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

export function mailEnabled(): boolean {
  return !!env.SMTP_HOST;
}

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
  let id: number;
  try {
    const { rows } = await checkoutPool().query<{ id: number }>(
      `INSERT INTO club_mail_outbox(kind, to_addr, subject, body)
       VALUES($1,$2,$3,$4) RETURNING id`,
      [input.kind ?? "office", input.to, input.subject, input.body],
    );
    id = rows[0]!.id;
  } catch {
    const sent = await sendEmail(input.to, input.subject, input.body);
    return { id: null, sent, blocked: !mailEnabled() };
  }

  const sent = await sendEmail(input.to, input.subject, input.body);
  try {
    if (sent) {
      await checkoutPool().query(
        `UPDATE club_mail_outbox
         SET status='sent', attempts=1, sent_at=now(),
             body=CASE WHEN kind=$2 THEN '' ELSE body END
         WHERE id=$1`,
        [id, EMAIL_CONFIRMATION_KIND],
      );
    } else {
      await checkoutPool().query(
        `UPDATE club_mail_outbox
         SET attempts=1, next_attempt_at=now() + interval '5 minutes',
             last_error=$2, status=CASE WHEN 1 >= $3 THEN 'failed' ELSE 'pending' END,
             body=CASE WHEN 1 >= $3 AND kind=$4 THEN '' ELSE body END
         WHERE id=$1`,
        [id, mailEnabled() ? "smtp_fail" : "smtp_missing", env.MAIL_OUTBOX_MAX_ATTEMPTS, EMAIL_CONFIRMATION_KIND],
      );
    }
  } catch {
    // Попытка SMTP уже сделана. Повтор здесь создал бы немедленный дубль;
    // если статус не сохранился, очередной проход может отправить письмо снова.
    console.error("[mail] не удалось записать статус доставки в очередь");
  }
  return { id, sent, blocked: !mailEnabled() };
}

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
          `UPDATE club_mail_outbox
           SET status='sent', attempts=$2, sent_at=now(), last_error=NULL,
               body=CASE WHEN kind=$3 THEN '' ELSE body END
           WHERE id=$1`,
          [row.id, attempts, EMAIL_CONFIRMATION_KIND],
        );
        sent += 1;
      } else if (attempts >= env.MAIL_OUTBOX_MAX_ATTEMPTS) {
        await checkoutPool().query(
          `UPDATE club_mail_outbox
           SET status='failed', attempts=$2, last_error='max_attempts',
               body=CASE WHEN kind=$3 THEN '' ELSE body END
           WHERE id=$1`,
          [row.id, attempts, EMAIL_CONFIRMATION_KIND],
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
    // Сбой outbox не прерывает остальные фоновые задачи.
  }
  return { sent, failed, skipped };
}

export async function notifyOfficeText(text: string): Promise<void> {
  let delivered = false;
  if ((env.OFFICE_NOTIFY_CHANNEL === "email" || env.OFFICE_NOTIFY_CHANNEL === "both") && env.OFFICE_EMAIL) {
    const email = await enqueueMail({ to: env.OFFICE_EMAIL, subject: "Событие клуба выпускников", body: text, kind: "office_event" });
    delivered = email.sent;
  }
  if (env.OFFICE_NOTIFY_CHANNEL !== "email" && env.OFFICE_TG_BOT_TOKEN && env.OFFICE_TG_CHAT_ID) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${env.OFFICE_TG_BOT_TOKEN}/sendMessage`, {
        method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(10000),
        body: JSON.stringify({ chat_id: env.OFFICE_TG_CHAT_ID, text }),
      });
      const telegram = await response.json() as { ok?: boolean };
      delivered = delivered || (response.ok && telegram.ok === true);
    } catch { /* лог ниже */ }
  }
  if (!delivered) console.warn("[notify:blocked] уведомление офиса не доставлено; проверьте канал и очередь");
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

export async function notifyOffice(o: OrderNotice): Promise<{ channel: string; ok: boolean; blocked?: boolean }> {
  // Telegram и журналы не получают ФИО, телефон или email заявителя.
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

export async function confirmApplicant(o: OrderNotice): Promise<void> {
  await sendEmail(
    o.contact_email,
    `Заявка ${o.number} принята – Клуб выпускников факультета права`,
    `Здравствуйте, ${o.contact_fio}!\n\nВаша заявка ${o.number} принята:\n${o.itemsSummary}\nСумма (справочно): ${formatRub(o.total_estimate)} ₽.\n\nМенеджер учебного офиса свяжется с вами для подтверждения деталей.\n\n– Клуб выпускников факультета права Вышки`,
  );
}
