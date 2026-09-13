import { test, expect, type Page } from "@playwright/test";
import { seedClientStorage, stubSw, mockPublicApi } from "./harness.js";

test.beforeEach(async ({ page }) => { await mockPublicApi(page); });

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
    for (const [label, href] of [["ДПО", "/dpo"], ["События", "/events"], ["Новости", "/news"], ["Подкасты", "/podcasts"], ["Мерч", "/merch"], ["Корзина", "/cart"], ["Вступить в клуб", "/join"]]) {
      const link = menu(page).getByRole("link", { name: label!, exact: true });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("href", href!);
    }
    await menu(page).getByRole("button", { name: /Поиск/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("searchbox")).toBeFocused();
    await page.getByRole("button", { name: "Закрыть поиск" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
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
