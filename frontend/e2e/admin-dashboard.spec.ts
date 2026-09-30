import { test, expect } from "@playwright/test";
import { preparePage, mockPublicApi } from "./harness.js";

test("дашборд: период, отказ проверки, повтор и отсутствие мобильных вкладок", async ({ page }) => {
  await preparePage(page);
  await mockPublicApi(page);
  await page.addInitScript(() => localStorage.setItem("club_admin_token", "test-admin"));
  let failed = false;
  let lastRange = "";
  await page.route("**/api/admin/**", async (route) => {
    const url = new URL(route.request().url());
    let data: unknown = {};
    if (url.pathname.endsWith("/overview")) data = { next_event: null };
    else if (url.pathname.endsWith("/orders") || url.pathname.endsWith("/members")) data = { items: [] };
    else if (url.pathname.endsWith("/analytics")) {
      lastRange = url.searchParams.get("range")!;
      data = { generated_at: new Date().toISOString(), pulse: { joins: 3, orders_created: 4, orders_paid: 1, rsvps: 2, podcast_plays: 5 }, series: { pageviews_by_day: [{ day: "2026-09-13", count: 12 }] }, pageviews: { hits: 12, paths_top: [{ path: "/", count: 12 }] } };
    } else if (url.pathname.endsWith("/system-health")) {
      if (failed) return route.fulfill({ status: 503, json: { error: "unavailable" } });
      data = { checked_at: new Date().toISOString(), uptime_seconds: 120, status: "degraded", checks: [{ id: "cms", name: "CMS · Directus", status: "error", detail: "Контрольный запрос не выполнен" }, { id: "telegram", name: "Telegram-бот", status: "unknown", detail: "Доставка не проверена" }] };
    }
    await route.fulfill({ json: data });
  });
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Дашборд сайта" })).toBeVisible();
  await expect(page.getByText("Есть проблема, требующая проверки")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Основные разделы" })).toHaveCount(0);
  await page.getByRole("button", { name: "7 дней", exact: true }).click();
  await expect.poll(() => lastRange).toBe("7d");
  failed = true;
  await page.getByRole("button", { name: "Проверить сейчас" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Статусы сервисов неизвестны" })).toBeVisible();
  await expect(page.getByText("Контрольный запрос не выполнен", { exact: true })).toHaveCount(0);
  failed = false;
  await page.getByRole("button", { name: "Проверить сейчас" }).click();
  await expect(page.getByText("Контрольный запрос не выполнен", { exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const overflow = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
    elements: Array.from(document.querySelectorAll("body *")).filter(e => e.getBoundingClientRect().right > innerWidth + 1).map(e => `${e.tagName}.${e.className}`).slice(0, 10) }));
  expect(overflow.scroll, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.width + 1);
});
