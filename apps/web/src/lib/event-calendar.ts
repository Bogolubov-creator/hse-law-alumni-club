import type { ClubEvent } from "./events.js";

/** Публичное событие зеркала: файл календаря без обращения к API. */
export function eventCalendar(event: ClubEvent, url: string, now = new Date()): string {
  const date = (value: Date) => value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const escape = (value: string) => value.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
  const start = new Date(event.starts_at);
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//HSE Law Alumni Club//RU", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT", `UID:event-${escape(event.id)}@club-pravo-hse`, `DTSTAMP:${date(now)}`,
    `DTSTART:${date(start)}`, `DTEND:${date(new Date(start.getTime() + 7200000))}`,
    `SUMMARY:${escape(event.title)}`,
    `DESCRIPTION:${escape([event.description, event.reg_url && `Регистрация: ${event.reg_url}`].filter(Boolean).join("\n"))}`,
    ...(event.location && event.format !== "online" ? [`LOCATION:${escape(event.location)}`] : []),
    `URL:${url.replace(/[\r\n]/g, "")}`, "END:VEVENT", "END:VCALENDAR",
  ];
  // RFC 5545: строка не длиннее 75 октетов; не разрываем UTF-8 символы.
  return lines.map(line => {
    let result = "", bytes = 0;
    for (const character of line) {
      const size = new TextEncoder().encode(character).length;
      if (bytes + size > 75) { result += "\r\n "; bytes = 1; }
      result += character; bytes += size;
    }
    return result;
  }).join("\r\n") + "\r\n";
}
