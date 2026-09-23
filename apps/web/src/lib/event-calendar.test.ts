import { expect, test } from "vitest";
import { eventCalendar } from "./event-calendar.js";
import type { ClubEvent } from "./events.js";

test("календарь сохраняет время UTC, экранирует текст и переносит строки по байтам", () => {
  const event = { id: "meeting", title: "Встреча, выпускников; право ".repeat(8), description: "Первая\r\nВторая", starts_at: "2026-10-15T19:00:00+03:00", format: "offline", location: "Москва" } as ClubEvent;
  const result = eventCalendar(event, "https://example.com/events/meeting", new Date("2026-09-23T00:00:00Z"));
  const unfolded = result.replace(/\r\n /g, "");
  expect(unfolded).toContain("DTSTART:20261015T160000Z\r\nDTEND:20261015T180000Z");
  expect(unfolded).toContain("SUMMARY:" + event.title.replace(/,/g, "\\,").replace(/;/g, "\\;"));
  expect(unfolded).toContain("DESCRIPTION:Первая\\nВторая");
  expect(result.split("\r\n").every(line => new TextEncoder().encode(line).length <= 75)).toBe(true);
});
