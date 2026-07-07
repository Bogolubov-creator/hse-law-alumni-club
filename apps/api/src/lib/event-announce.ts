import { readItems, readUsers } from "@directus/sdk";
import { directus } from "./directus.js";
import { sendEmail } from "./notify.js";
import { env } from "../env.js";

const di = directus;

/**
 * Email-анонс нового события тем, до кого пуш и Telegram не дотянутся:
 * верифицированные без push-подписки и без привязанного telegram_id.
 * Пуш-подписчики и телеграм-привязанные получают анонс своими каналами —
 * не дублируем. Fire-and-forget, сбой почты события не ломает.
 */
export function announceEventByEmail(ev: { id: string; title: string; starts_at: string; location?: string | null; format?: string; reg_url?: string | null }): void {
  void (async () => {
    const alumni = (await di.request((readItems as any)("alumni", {
      filter: { verification_status: { _eq: "verified" } },
      limit: -1, fields: ["id", "user_id", "fio", "telegram_id"],
    }))) as { id: string; user_id: string | null; fio: string | null; telegram_id: string | null }[];

    const pushed = new Set(
      ((await di.request((readItems as any)("push_subs", { limit: -1, fields: ["alumni_id"] }))) as { alumni_id: string }[])
        .map((s) => s.alumni_id),
    );

    const targets = alumni.filter((a) => a.user_id && !a.telegram_id && !pushed.has(a.id));
    if (!targets.length) return;

    const users = (await di.request((readUsers as any)({
      filter: { id: { _in: targets.map((a) => a.user_id) } }, limit: -1, fields: ["id", "email"],
    }))) as { id: string; email: string | null }[];
    const emailByUser = new Map(users.map((u) => [u.id, u.email]));

    const when = new Date(ev.starts_at).toLocaleString("ru-RU", {
      day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow",
    });
    const place = ev.format === "online" ? "онлайн" : ev.location ?? "";
    let sent = 0;
    for (const a of targets) {
      const email = emailByUser.get(a.user_id!);
      if (!email) continue;
      const ok = await sendEmail(
        email,
        `Новое событие клуба: ${ev.title}`,
        `Здравствуйте${a.fio ? `, ${a.fio}` : ""}!\n\nВ клубе выпускников новое событие:\n\n${ev.title}\n${when}${place ? ` · ${place}` : ""}\n${ev.reg_url ? `Регистрация: ${ev.reg_url}\n` : ""}\nЗаписаться («Пойду») и добавить в календарь: ${env.PUBLIC_URL}/events\nЗа участие начисляются баллы клуба.\n\n— Клуб выпускников факультета права НИУ ВШЭ\n\nЧтобы получать анонсы мгновенно — включите уведомления или привяжите Telegram в личном кабинете: ${env.PUBLIC_URL}/lk`,
      );
      if (ok) sent++;
    }
    if (sent) console.log(`[event-announce] email-анонс «${ev.title}»: отправлено ${sent}`);
  })().catch((e) => console.error("[event-announce] failed:", (e as Error).message));
}
