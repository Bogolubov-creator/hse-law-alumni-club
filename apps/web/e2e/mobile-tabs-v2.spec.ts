import { test, expect, type Page } from "@playwright/test";
import { seedClientStorage, stubSw } from "./harness.js";

/**
 * Нижняя панель вкладок (ClubTabBar / MobileTabs).
 *
 * Канон: Карта · Лента · ДПО · Мерч · Кабинет.
 * На takeover-маршрутах (`/`, `/dpo`, …) панель внутри MobileApp;
 * эти тесты смотрят fixed-панель на `/events`, `/lk`, `/join`.
 */

const tabs = (page: Page) => page.getByRole("navigation", { name: "Основные разделы" });

test.describe("Панель вкладок v2", () => {
  test.beforeEach(async ({ page }) => {
    await stubSw(page);
    await seedClientStorage(page);
  });

  test("на телефоне панель есть, на десктопе её нет", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/events");
    await expect(tabs(page)).toBeVisible();
    await expect(tabs(page).getByRole("link")).toHaveCount(5);

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(tabs(page)).toBeHidden();
  });

  test("текущий раздел помечен для экранного диктора, а не только цветом", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/lk");
    await expect(tabs(page).getByRole("link", { name: "Кабинет" })).toHaveAttribute("aria-current", "page");
    await expect(tabs(page).getByRole("link", { name: "Карта" })).not.toHaveAttribute("aria-current", "page");
  });

  test("панель переносит между разделами", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/events");
    await tabs(page).getByRole("link", { name: "Кабинет" }).click();
    await expect(page).toHaveURL(/\/lk$/);
    await expect(page.getByRole("heading", { name: "Вход для выпускников" })).toBeVisible();
    await expect(tabs(page)).toBeVisible();
  });

  test("панель есть и в кабинете – из приватной зоны не выпадаешь", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/lk");
    await expect(tabs(page)).toBeVisible();
    await expect(tabs(page).getByRole("link", { name: "Кабинет" })).toHaveAttribute("aria-current", "page");
  });

  test("панель не перекрывает низ страницы", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/events");

    const last = page.locator("footer a").last();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(last).toBeVisible();

    const box = (await last.boundingBox())!;
    const covered = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return !!el?.closest(".v2-tabs, .club-tab-bar");
    }, [box.x + box.width / 2, box.y + box.height / 2]);
    expect(covered, "низ страницы уехал под панель вкладок").toBe(false);

    await last.click();
    await expect(page).toHaveURL(/\/(requisites|support|privacy|confidential)$/);
  });

  test("в меню шапки нет того, что уже есть во вкладках", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/events");
    await page.getByRole("button", { name: "Открыть меню" }).click();

    const menu = page.locator("header nav.mob-only");
    const labels = await menu.getByRole("link").allInnerTexts();
    expect(labels.map((t) => t.trim().replace(/\d+$/, "").trim())).toEqual(["Подкасты", "События", "Корзина", "Вступить в клуб"]);
  });

  test("счётчик корзины виден в меню шапки", async ({ page }) => {
    await page.route("**/api/cart", (r) => r.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ items: [], count: 3, subtotal: 0 }),
    }));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/events");
    await page.getByRole("button", { name: "Открыть меню" }).click();
    await expect(page.locator("header nav.mob-only").getByRole("link", { name: /Корзина/ }).getByText("3")).toBeVisible();
  });
});

/** Баннер специально не гасим – проверяем z-index над вкладками. */
test.describe("Панель вкладок v2 · cookie-баннер", () => {
  test.beforeEach(async ({ page }) => {
    await stubSw(page);
  });

  test("cookie-баннер поднят над панелью и его кнопка нажимается", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/events");
    const accept = page.getByRole("button", { name: "Принять все" });
    const box = (await accept.boundingBox())!;
    const covered = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return !!el?.closest(".v2-tabs, .club-tab-bar");
    }, [box.x + box.width / 2, box.y + box.height / 2]);
    expect(covered, "кнопка согласия перекрыта панелью").toBe(false);

    await accept.click();
    await expect(accept).toHaveCount(0);
  });
});
