import { test, expect } from "@playwright/test";

const alumni = { fio: "Выпускник клуба", cohort: "2020", verification_status: "verified" };
const me = { alumni, level: { points: 0, level: "graduate", level_title: "Выпускник", discount: 5, next_level: null, to_next: 0 }, achievements: [], activity: [] };

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("club_token", "expired-session");
    localStorage.setItem("club_cookie_consent", "all");
    localStorage.setItem("club_pwa_dismiss", "1");
  });
  await page.route("**/api/**", r => r.fulfill({ json: [] }));
});

test("истёкшая сессия: повторный вход сохраняет раздел заявок", async ({ page }, testInfo) => {
  await page.route("**/api/me", r => r.request().headers().authorization === "Bearer renewed-session"
    ? r.fulfill({ json: me }) : r.fulfill({ status: 401, json: { detail: "Session expired" } }));
  await page.route("**/api/auth/login", r => r.fulfill({ json: { token: "renewed-session", alumni } }));
  await page.goto("/lk?section=orders");
  await expect(page.getByRole("heading", { name: "Вход для выпускников" })).toBeVisible();
  await expect(page.locator("form").getByRole("status")).toContainText("Сессия завершилась");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("club_token"))).toBeNull();
  await page.screenshot({ path: testInfo.outputPath("session-expired.png"), scale: "css" });
  await page.getByLabel("Почта", { exact: true }).fill("graduate@example.com");
  await page.getByLabel("Пароль", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Войти в кабинет" }).click();
  await expect(page.getByRole("heading", { name: "Мои заявки", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/section=orders/);
});

test("временная ошибка: повторная попытка сохраняет сессию", async ({ page }) => {
  let available = false;
  await page.route("**/api/me", r => available ? r.fulfill({ json: me }) : r.fulfill({ status: 503, json: { detail: "Unavailable" } }));
  await page.goto("/lk?section=orders");
  await expect(page.getByText("кабинет сейчас недоступен", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("club_token"))).toBe("expired-session");
  available = true;
  await page.getByRole("button", { name: "повторить", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Мои заявки", exact: true })).toBeVisible();
});
