import { test, expect, type Page } from "@playwright/test";

const alumni = { fio: "Выпускник клуба", cohort: "2020", verification_status: "verified", contacts: { email: "graduate@example.com" } };
const me = { alumni, level: { points: 0, level: "graduate", level_title: "Выпускник", discount: 5, next_level: null, to_next: 0 }, achievements: [], activity: [] };
async function setup(page: Page) {
  await page.addInitScript(() => { localStorage.setItem("club_cookie_consent", "all"); localStorage.setItem("club_pwa_dismiss", "1"); });
  await page.route("**/api/**", r => r.fulfill({ json: [] }));
  await page.route("**/api/me", r => r.fulfill({ json: me }));
  await page.route("**/api/podcasts", r => r.fulfill({ json: { items: [], subscribed: false, sub_until: null, price: 499900 } }));
  await page.route("**/api/auth/login", r => r.fulfill({ json: { token: "test-session", alumni } }));
}
async function login(page: Page) {
  await page.getByLabel("Почта", { exact: true }).fill("graduate@example.com");
  await page.getByLabel("Пароль", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Войти в кабинет", exact: true }).click();
}
test("после входа из подкастов возвращает к условиям и фокусу панели", async ({ page }, testInfo) => {
  await setup(page);
  await page.goto("/podcasts#podcast-subscription");
  await page.getByRole("link", { name: "Войти в кабинет", exact: true }).click();
  await expect(page.getByText("Войдите, чтобы продолжить оформление подписки", { exact: false })).toBeVisible();
  const registration = new URL((await page.getByRole("link", { name: "Вступить в клуб", exact: true }).getAttribute("href"))!, "http://localhost");
  expect(registration.searchParams.get("next")).toBe("/lk?next=%2Fpodcasts%23podcast-subscription");
  await page.screenshot({ path: `/tmp/alumni-login-${testInfo.project.name}.png`, fullPage: true });
  await login(page);
  await expect(page).toHaveURL(/\/podcasts#podcast-subscription$/);
  await expect(page.locator("#podcast-subscription")).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("обычный вход и чужой next оставляют пользователя в кабинете", async ({ page }) => {
  await setup(page);
  await page.goto("/lk?next=https%3A%2F%2Fexample.org");
  await login(page);
  await expect(page.getByRole("button", { name: "выйти", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/lk\?next=/);
});
