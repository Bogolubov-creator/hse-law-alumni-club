import { test, expect, type Page } from "@playwright/test";

/**
 * Оболочка приложения v2 на телефоне: нижняя панель вкладок.
 *
 * Главная проверка тут – не «панель нарисовалась», а «панель ничего не
 * перекрыла»: фиксированный элемент внизу легко съедает последнюю строку
 * страницы, и человек не может нажать то, что под ним.
 */

async function stubSw(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "serviceWorker", { get: () => undefined });
  });
}

const tabs = (page: Page) => page.getByRole("navigation", { name: "Основные разделы" });

test.describe("Панель вкладок v2", () => {
  test.beforeEach(async ({ page }) => { await stubSw(page); });

  test("на телефоне панель есть, на десктопе её нет", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/v2");
    await expect(tabs(page)).toBeVisible();
    await expect(tabs(page).getByRole("link")).toHaveCount(5);

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(tabs(page)).toBeHidden();
  });

  test("текущий раздел помечен для экранного диктора, а не только цветом", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/v2/dpo");
    await expect(tabs(page).getByRole("link", { name: "дпо" })).toHaveAttribute("aria-current", "page");
    await expect(tabs(page).getByRole("link", { name: "главная" })).not.toHaveAttribute("aria-current", "page");
  });

  test("карточка программы держит вкладку ДПО активной", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/v2/dpo/takoj-programmy-net");
    await expect(tabs(page).getByRole("link", { name: "дпо" })).toHaveAttribute("aria-current", "page");
  });

  test("панель переносит между разделами", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/v2");
    await tabs(page).getByRole("link", { name: "мерч" }).click();
    await expect(page).toHaveURL(/\/v2\/merch$/);
    await tabs(page).getByRole("link", { name: "кабинет" }).click();
    await expect(page).toHaveURL(/\/v2\/lk$/);
    await expect(page.getByRole("heading", { name: "Вход для выпускников" })).toBeVisible();
  });

  test("панель есть и в кабинете – из приватной зоны не выпадаешь", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/v2/lk");
    await expect(tabs(page)).toBeVisible();
    await expect(tabs(page).getByRole("link", { name: "кабинет" })).toHaveAttribute("aria-current", "page");
  });

  test("панель не перекрывает низ страницы", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/v2");
    // Принимаем cookies: иначе баннер тоже висит внизу и мешает измерению
    await page.getByRole("button", { name: "Принять" }).click();

    const last = page.locator("footer a").last();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(last).toBeVisible();

    // Настоящая проверка: под последней ссылкой в этой точке именно она,
    // а не панель вкладок. toBeVisible() такого не ловит.
    const box = (await last.boundingBox())!;
    const covered = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return !!el?.closest(".v2-tabs");
    }, [box.x + box.width / 2, box.y + box.height / 2]);
    expect(covered, "низ страницы уехал под панель вкладок").toBe(false);

    await last.click(); // и она действительно нажимается
    await expect(page).toHaveURL(/\/v2\/requisites$/);
  });

  test("cookie-баннер поднят над панелью и его кнопка нажимается", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/v2");
    const accept = page.getByRole("button", { name: "Принять" });
    const box = (await accept.boundingBox())!;
    const covered = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return !!el?.closest(".v2-tabs");
    }, [box.x + box.width / 2, box.y + box.height / 2]);
    expect(covered, "кнопка согласия перекрыта панелью").toBe(false);

    await accept.click();
    await expect(accept).toHaveCount(0);
  });

  test("в меню шапки нет того, что уже есть во вкладках", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/v2");
    await page.getByRole("button", { name: "Открыть меню" }).click();

    const menu = page.locator("header nav.mob-only");
    const labels = await menu.getByRole("link").allInnerTexts();
    expect(labels.map((t) => t.trim())).toEqual(["Подкасты", "События", "Новости", "Вступить в клуб"]);
  });

  test("счётчик корзины виден на вкладке", async ({ page }) => {
    await page.route("**/api/cart", (r) => r.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ items: [], count: 3, subtotal: 0 }),
    }));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/v2");
    await expect(tabs(page).getByRole("link", { name: "корзина" }).getByText("3")).toBeVisible();
  });
});
