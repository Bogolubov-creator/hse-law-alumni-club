import { expect, test } from "@playwright/test";
const base = (process.env.E2E_BASE_URL || "http://127.0.0.1:4297/club-pravo-hse-mirror/").replace(/\/$/, "");

test("справки из Telegram читаются на сайте и находятся по тексту", async ({ page }) => {
  await page.goto(`${base}/changes`);
  await expect(page.getByRole("button", { name: "Справки и обзоры", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".changes-row").first()).toContainText("LegisDigest");
  await page.getByRole("searchbox").fill("казначейского мониторинга");
  await page.locator(".changes-row h2 a").filter({ hasText: "№ 941" }).click();
  await expect(page.locator(".changes-brief")).toBeVisible();
  await expect(page.locator(".changes-brief")).toContainText("Что меняется");
  await expect(page.locator(".changes-attribution")).toContainText("проверка человеком не подтверждена");
  await expect(page.getByRole("link", { name: "Оригинал в Telegram" })).toHaveAttribute("href", "https://t.me/LegisDigest/9");
  const links = page.locator(".changes-brief a");
  expect(await links.count()).toBeGreaterThan(0);
  await page.reload();
  await expect(page.locator(".changes-brief")).toContainText("Что меняется");
  await page.getByRole("button", { name: "К списку изменений" }).click();
  await expect(page.getByRole("searchbox")).toHaveValue("казначейского мониторинга");
});

test("успешная синхронизация не маскирует старую дату поста", async ({ page }) => {
  await page.goto(`${base}/changes`);
  await expect(page.locator(".changes-notice")).toContainText("Обновлено:");
  await expect(page.locator(".changes-notice")).toContainText("Последняя публикация:");
  await expect(page.locator(".changes-notice")).not.toContainText("Архивный срез");
  await page.getByRole("button", { name: "Архив актов", exact: true }).click();
  await expect(page.getByText("Найдено: 65", { exact: true })).toBeVisible();
});
