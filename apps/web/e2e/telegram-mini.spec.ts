import { test, expect } from "@playwright/test";
import { preparePage, mockPublicApi } from "./harness.js";

test.beforeEach(async ({ page }) => {
  await preparePage(page); await mockPublicApi(page);
  await page.route("https://telegram.org/js/telegram-web-app.js", (route) => route.abort());
});

test("предпросмотр: общие каталоги, нижнее меню, возврат к сайту", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tg");
  await expect(page.getByRole("heading", { name: /Свои люди/ })).toBeVisible();
  await expect(page.getByText("Предпросмотр мини-приложения", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Войти через Telegram" })).toHaveCount(0);
  const tabs = page.getByRole("navigation", { name: "Основные разделы" });
  await tabs.getByRole("link", { name: "ДПО", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/telegram-mini/);
  await expect(page.locator(".club-dpo-masthead__media")).toBeHidden();
  await expect(page.locator(".mini-catalog-options select").first()).toBeHidden();
  await page.getByText("Фильтры и сортировка", { exact: true }).click();
  await expect(page.locator(".mini-catalog-options select").first()).toBeVisible();
  await page.getByRole("combobox", { name: "Порядок", exact: true }).selectOption("price");
  await expect(page).toHaveURL(/sort=price/);
  await tabs.getByRole("link", { name: "Клуб", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Свои люди/ })).toBeVisible();
  await page.getByRole("button", { name: "Вернуться на сайт" }).click();
  await expect(page.locator("html")).not.toHaveClass(/telegram-mini/);
  await expect(page.locator(".home-hero")).toBeVisible();
});

test("Telegram SDK: ready, safe-area, кнопка назад и неподтверждённый вход", async ({ page }) => {
  await page.addInitScript(() => {
    const calls: string[] = [];
    const host = window as unknown as { Telegram: unknown; tgCalls: string[] };
    host.tgCalls = calls;
    host.Telegram = { WebApp: {
      initData: "opaque-signed-test", ready: () => calls.push("ready"), expand: () => calls.push("expand"),
      isVersionAtLeast: () => true, setHeaderColor: () => {}, setBackgroundColor: () => {},
      safeAreaInset: { top: 10, bottom: 20 }, contentSafeAreaInset: { top: 5, bottom: 4 },
      onEvent: () => {}, offEvent: () => {},
      BackButton: { show: () => calls.push("back-show"), hide: () => {}, onClick: () => {}, offClick: () => {} },
    } };
  });
  let sent = "";
  await page.route("**/api/auth/telegram", (route) => {
    sent = route.request().postDataJSON().initData;
    return route.fulfill({ status: 404, json: { error: "not linked" } });
  });
  await page.goto("/tg");
  await expect(page.getByText("Предпросмотр мини-приложения", { exact: true })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--mini-top"))).toBe("15px");
  await page.getByRole("button", { name: "Войти через Telegram" }).click();
  await expect(page.getByRole("alert")).toContainText("не привязан");
  expect(sent).toBe("opaque-signed-test");
  expect(await page.evaluate(() => localStorage.getItem("club_token"))).toBeNull();
  await page.getByRole("navigation", { name: "Основные разделы" }).getByRole("link", { name: "ДПО", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { tgCalls: string[] }).tgCalls)).toEqual(expect.arrayContaining(["ready", "expand", "back-show"]));
});
