import { expect, test } from "@playwright/test";
const base = (process.env.E2E_BASE_URL || "http://127.0.0.1:4297/club-pravo-hse-mirror/").replace(/\/$/, "");

async function openSearch(page: import("@playwright/test").Page) {
  const burger = page.getByRole("button", { name: "Открыть меню", exact: true });
  if (await burger.isVisible()) {
    await burger.click();
    await page.getByRole("button", { name: "Поиск по клубу", exact: true }).click();
  } else await page.getByRole("button", { name: "Поиск", exact: true }).click();
}

test("меню отмечает раздел, закрывается по Escape и не перекрывает нижнюю панель", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/changes`);
  await page.getByRole("button", { name: "Только необходимые" }).click();
  const burger = page.getByRole("button", { name: "Открыть меню", exact: true });
  await burger.click();
  const menu = page.getByRole("navigation", { name: "Меню", exact: true });
  await expect(menu.getByRole("link", { name: "Изменения в праве" })).toHaveAttribute("aria-current", "page");
  const box = await menu.boundingBox();
  const tabs = await page.getByRole("navigation", { name: "Основные разделы", exact: true }).boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(tabs!.y + 1);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(burger).toBeFocused();
});

test("поиск находит справку по содержанию и открывает её", async ({ page }) => {
  await page.goto(`${base}/`);
  await page.getByRole("button", { name: "Только необходимые" }).click();
  await openSearch(page);
  const search = page.getByRole("searchbox");
  await expect(search).toBeFocused();
  await search.fill("казначейского мониторинга");
  const result = page.getByRole("dialog").getByRole("link").filter({ hasText: "№ 941" });
  await expect(result).toBeVisible();
  await search.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await result.click();
  await expect(page).toHaveURL(/changes\/tg-9$/);
  await expect(page.locator(".changes-brief")).toBeVisible();
});

test("быстрые переходы и частичная ошибка поиска доступны", async ({ page }) => {
  await page.route("**/data/changes.json", route => route.abort());
  await page.goto(`${base}/news`);
  await page.getByRole("button", { name: "Только необходимые" }).click();
  await openSearch(page);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("link", { name: "Поддержка", exact: true })).toBeVisible();
  await expect(dialog.getByText("Часть материалов не загрузилась.", { exact: false })).toBeVisible();
  await dialog.getByRole("link", { name: "Поддержка", exact: true }).click();
  await expect(page).toHaveURL(/\/support$/);
});

test("шапка помещается на промежуточной ширине", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 900 });
  await page.goto(`${base}/podcasts`);
  await expect(page.getByRole("button", { name: "Открыть меню", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
