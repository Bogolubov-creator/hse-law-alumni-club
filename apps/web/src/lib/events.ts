/**
 * Событие клуба: тип, форматирование дат и ссылка «в Google Календарь».
 * Вынесено из страницы, чтобы v1 и v2 не разошлись в описании одной сущности.
 */

export interface ClubEvent {
  id: string; title: string; description: string | null; starts_at: string;
  location: string | null; cover: string | null; reg_url: string | null;
  format: "offline" | "online"; points: number;
  status: string; going: number; my_rsvp: boolean; my_attended: boolean;
}

export const fmtEventDate = (iso: string) =>
  new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

export const fmtEventDateFull = (iso: string) =>
  new Date(iso).toLocaleString("ru-RU", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Ссылка «добавить в Google Календарь» (2 часа по умолчанию, как в .ics). */
export function gcalUrl(e: ClubEvent): string {
  const dt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const start = new Date(e.starts_at);
  const end = new Date(start.getTime() + 2 * 3600 * 1000);
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${dt(start)}/${dt(end)}`,
    details: (e.description ?? "") + (e.reg_url ? `\nРегистрация: ${e.reg_url}` : ""),
    ...(e.location && e.format !== "online" ? { location: e.location } : {}),
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}
