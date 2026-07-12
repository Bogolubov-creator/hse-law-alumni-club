import { readItems, updateItem } from "@directus/sdk";
import { directus } from "./directus.js";
import { pushToAlumniMany } from "./push.js";

const di = directus;

/**
 * Пуш-напоминание записавшимся за сутки до события. Запускается кроном раз в
 * день; идемпотентно через events.reminder_sent — событие напоминается один раз,
 * даже если крон перезапустился. Окно [сейчас; +24ч] покрывает любой час старта.
 */
export async function runEventReminders(): Promise<{ events: number; pushes: number }> {
  const now = Date.now();
  const events = (await di.request((readItems as any)("events", {
    filter: { status: { _eq: "published" } },
    limit: -1,
    fields: ["id", "title", "starts_at", "location", "format", "reminder_sent"],
  }))) as { id: string; title: string; starts_at: string; location: string | null; format: string; reminder_sent: boolean | null }[];

  const due = events.filter((e) => {
    const t = new Date(e.starts_at).getTime();
    return !e.reminder_sent && t > now && t <= now + 24 * 3600 * 1000;
  });

  let pushes = 0;
  for (const ev of due) {
    const rsvps = (await di.request((readItems as any)("event_rsvps", {
      filter: { event_id: { _eq: ev.id } }, limit: -1, fields: ["alumni_id"],
    }))) as { alumni_id: string }[];
    const when = new Date(ev.starts_at).toLocaleString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });
    const place = ev.format === "online" ? "онлайн" : ev.location ?? "";
    // Подписки всех записавшихся — одним запросом (без N+1 по каждому выпускнику).
    pushes += await pushToAlumniMany(rsvps.map((r) => r.alumni_id), {
      title: "Завтра событие клуба 📅",
      body: `${ev.title} — в ${when}${place ? `, ${place}` : ""}`,
      url: "/events",
    });
    await di.request((updateItem as any)("events", ev.id, { reminder_sent: true }));
  }
  return { events: due.length, pushes };
}
