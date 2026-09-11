import { test, expect, type Page } from "@playwright/test";
import { seedClientStorage, stubSw } from "./harness.js";

/**
 * Телефон после решения заказчика 12.09: публичные страницы – та же адаптивная
 * вёрстка с бургер-меню в шапке; нижняя панель вкладок (ClubTabBar) осталась
 * только кабинету.
 */

const tabs = (page: Page) => page.getByRole("navigation", { name: "Основные разделы" });
const menu = (page: Page) => page.getByRole("navigation", { name: "Меню" });

test.describe("Меню шапки на телефоне", () => {
  test.beforeEach(async ({ page }) => {
    await stubSw(page);
    await seedClientStorage(page);
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test("на публичных страницах панели вкладок нет, есть бургер", async ({ page }) => {
    await page.goto("/events");
    await expect(tabs(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Открыть меню" })).toBeVisible();
  });

  test("меню открывает все разделы, поиск и корзину", async ({ page }) => {
    await page.goto("/events");
    await page.getByRole("button", { name: "Открыть меню" }).click();
    const labels = await menu(page).getByRole("link").allInnerTexts();
    expect(labels.map((t) => t.trim().replace(/\d+$/, "").trim())).toEqual(["ДПО", "События", "Новости", "Подкасты", "Мерч", "Корзина", "Вступить в клуб"]);
    await expect(menu(page).getByRole("button", { name: /Поиск/ })).toBeVisible();
  });

  test("счётчик корзины виден в меню шапки", async ({ page }) => {
    await page.route("**/api/cart", (r) => r.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ items: [], count: 3, subtotal: 0 }),
    }));
    await page.goto("/events");
    await page.getByRole("button", { name: "Открыть меню" }).click();
    await expect(menu(page).getByRole("link", { name: /Корзина/ }).getByText("3")).toBeVisible();
  });

  test("нет горизонтальной прокрутки на 390px", async ({ page }) => {
    for (const path of ["/", "/dpo", "/news", "/events", "/merch", "/podcasts", "/cart"]) {
      await page.goto(path);
      await page.locator("#main").waitFor();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow, `${path} шире экрана`).toBe(false);
    }
  });
});

test.describe("Панель вкладок в кабинете", () => {
  test.beforeEach(async ({ page }) => {
    await stubSw(page);
    await seedClientStorage(page);
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test("текущий раздел помечен для экранного диктора, а не только цветом", async ({ page }) => {
    await page.goto("/lk");
    await expect(tabs(page)).toBeVisible();
    await expect(tabs(page).getByRole("link", { name: "Кабинет" })).toHaveAttribute("aria-current", "page");
    await expect(tabs(page).getByRole("link", { name: "Карта" })).not.toHaveAttribute("aria-current", "page");
  });
});

/** Баннер специально не гасим – проверяем, что его кнопка нажимается на телефоне. */
test.describe("cookie-баннер на телефоне", () => {
  test.beforeEach(async ({ page }) => {
    await stubSw(page);
  });

  test("кнопка согласия видна и нажимается", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/events");
    const accept = page.getByRole("button", { name: "Принять все" });
    await expect(accept).toBeVisible();
    await accept.click();
    await expect(accept).toHaveCount(0);
  });
});
