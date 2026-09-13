import { test, expect } from "@playwright/test";
import { preparePage, mockPublicApi } from "./harness";
import type { ClubEvent } from "../src/lib/events";

const event: ClubEvent = {
  id: "meeting", title: "Встреча выпускников факультета права", description: "Возвращаемся на факультет, чтобы увидеть однокурсников и преподавателей.\n\nОбсудим новости профессионального сообщества и планы клуба.",
  starts_at: "2030-10-12T15:00:00Z", location: "Москва, Покровский бульвар, 11", cover: "/assets/photos/hall-first-day.jpg",
  reg_url: "https://example.org/registration", format: "offline", points: 20, status: "published", going: 12, my_rsvp: false, my_attended: false,
};
test.beforeEach(async ({ page }) => { await preparePage(page); await mockPublicApi(page); });

for (const width of [320, 768, 1024, 1440]) test(`event spread at ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 });
  await page.route("**/api/events", r => r.fulfill({ json: [event] }));
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto("/events/meeting");
  await expect(page.getByRole("heading", { level: 1, name: event.title })).toBeVisible();
  await expect(page.getByRole("link", { name: "вступить, чтобы записаться" })).toHaveAttribute("href", "/join");
  await expect(page.getByRole("link", { name: "Файл .ics" })).toHaveAttribute("href", "/api/events/meeting.ics");
  await expect(page.getByRole("link", { name: "Google Календарь" })).toHaveAttribute("href", /calendar.google.com/);
  await expect(page.locator("time")).toHaveText(/18:00/);
  await page.evaluate(() => document.fonts.ready);
  expect(await page.locator("h1").evaluate(el => getComputedStyle(el).fontFamily)).toContain("HSE Slab");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  const image = page.locator(".club-event-detail__cover");
  await expect(image).toBeVisible();
  expect(await image.evaluate(el => { const i = el as HTMLImageElement; return i.naturalWidth > 0 && Math.abs(i.width / i.height - i.naturalWidth / i.naturalHeight) < .02; })).toBe(true);
  expect(errors).toEqual([]);
  if (process.env.EVENT_SCREENSHOTS) await page.screenshot({ path: `${process.env.EVENT_SCREENSHOTS}/event-${info.project.name}-${width}.png`, fullPage: true });
});

test("quick view traps focus, closes and opens full route", async ({ page }) => {
  await page.route("**/api/events", r => r.fulfill({ json: [event] }));
  await page.goto("/events");
  const trigger = page.getByRole("button", { name: "Быстрый просмотр" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: event.title });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Tab");
  expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByRole("link", { name: "Открыть страницу события" }).click();
  await expect(page).toHaveURL(/\/events\/meeting$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("broken cover and long copy remain readable", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.route("**/missing.jpg", r => r.fulfill({ status: 404 }));
  await page.route("**/api/events", r => r.fulfill({ json: [{ ...event, title: event.title.repeat(3), cover: "/missing.jpg", description: null }] }));
  await page.goto("/events/meeting");
  await expect(page.getByText("Описание встречи пока не опубликовано.")).toBeVisible();
  await expect(page.locator(".club-event-detail__cover")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test("loading, retry and missing event", async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let available = false;
  await page.route("**/api/events", async r => { await pending; return r.fulfill(!available ? { status: 503, json: { error: "Недоступно" } } : { json: [] }); });
  await page.goto("/events/meeting");
  await expect(page.getByRole("status").filter({ hasText: "Загружаем событие" })).toBeVisible();
  release();
  await expect(page.getByRole("alert").filter({ hasText: "Не удалось загрузить событие" })).toBeVisible({ timeout: 15000 });
  available = true;
  await page.getByRole("button", { name: "Повторить", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Событие не найдено" })).toBeVisible();
});

test("member can register and cancel from detail", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("club_token", "test-member"));
  let going = false;
  await page.route("**/api/events", r => r.fulfill({ json: [{ ...event, cover: null, my_rsvp: going }] }));
  await page.route("**/api/events/meeting/rsvp", r => { going = !going; return r.fulfill({ json: { going } }); });
  await page.goto("/events/meeting");
  await page.getByRole("button", { name: `Записаться: ${event.title}`, exact: true }).click();
  await page.getByRole("button", { name: `Отменить запись: ${event.title}`, exact: true }).click();
  await expect(page.getByRole("button", { name: `Записаться: ${event.title}`, exact: true })).toBeVisible();
});
