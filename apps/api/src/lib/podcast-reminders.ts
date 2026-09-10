import { readItems, updateItem } from "@directus/sdk";
import { directus } from "./directus.js";
import { pushToAlumniMany } from "./push.js";
import { sendEmail, mailEnabled } from "./notify.js";

const di = directus;

/** За сколько дней до конца подписки предупреждаем. */
export const REMIND_DAYS_BEFORE = 10;

/**
 * Напоминание об окончании подписки на подкасты.
 *
 * Идемпотентность через `podcast_reminder_sent`: флаг ставится после отправки
 * и сбрасывается при продлении подписки (см. активацию подписки). Без него
 * ежедневный cron слал бы напоминание все десять дней подряд.
 *
 * Письмо и пуш – независимо: у выпускника может не быть ни подписки на пуши,
 * ни настроенного SMTP, и молчать в обоих случаях нельзя.
 */
export async function runPodcastSubReminders(): Promise<{ due: number; pushes: number; emails: number }> {
  const now = Date.now();
  const horizon = now + REMIND_DAYS_BEFORE * 24 * 3600 * 1000;

  const rows = (await di.request((readItems as any)("alumni", {
    filter: { podcast_sub_until: { _nnull: true } },
    limit: -1,
    fields: ["id", "fio", "podcast_sub_until", "podcast_reminder_sent", "contacts_json"],
  }))) as {
    id: string; fio: string | null; podcast_sub_until: string | null;
    podcast_reminder_sent: boolean | null; contacts_json: Record<string, string> | null;
  }[];

  const due = rows.filter((a) => {
    if (a.podcast_reminder_sent) return false;
    const t = a.podcast_sub_until ? new Date(a.podcast_sub_until).getTime() : 0;
    // Уже истёкшие не трогаем: напоминать «продлите» задним числом бессмысленно,
    // человек и так видит замок на выпусках.
    return t > now && t <= horizon;
  });
  if (!due.length) return { due: 0, pushes: 0, emails: 0 };

  const pushes = await pushToAlumniMany(due.map((a) => a.id), {
    title: "Подписка на подкасты заканчивается",
    body: `Осталось меньше ${REMIND_DAYS_BEFORE} дней. Продлите, чтобы не потерять доступ к выпускам.`,
    url: "/podcasts",
  });

  let emails = 0;
  for (const a of due) {
    const to = a.contacts_json?.email;
    if (mailEnabled() && to) {
      const until = new Date(a.podcast_sub_until!).toLocaleDateString("ru-RU");
      const ok = await sendEmail(
        to,
        "Подписка на подкасты клуба заканчивается",
        `${a.fio ?? "Здравствуйте"}!\n\n`
        + `Ваша подписка на подкасты клуба выпускников действует до ${until}.\n`
        + `После этой даты выпуски снова закроются.\n\n`
        + `Продлить можно в разделе «Подкасты» на сайте клуба.`,
      );
      if (ok) emails++;
    }
    // Флаг ставим в любом случае: иначе при выключенном SMTP и без пуш-подписки
    // выборка оставалась бы «горячей» и cron дёргал бы её каждый день.
    await di.request((updateItem as any)("alumni", a.id, { podcast_reminder_sent: true }));
  }

  return { due: due.length, pushes, emails };
}
