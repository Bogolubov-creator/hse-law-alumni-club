import { test, expect, type Page } from "@playwright/test";

const alumni = { fio: "Выпускник клуба", cohort: "2020", verification_status: "verified", contacts: { email: "graduate@example.com" } };
const me = { alumni, level: { points: 0, level: "graduate", level_title: "Выпускник", discount: 5, next_level: null, to_next: 0 }, achievements: [], activity: [] };
async function setup(page: Page) {
  await page.addInitScript(() => { localStorage.setItem("club_cookie_consent", "all"); localStorage.setItem("club_pwa_dismiss", "1"); });
  await page.route("**/api/**", r => r.fulfill({ json: [] }));
  await page.route("**/api/payments/config", r => r.fulfill({ json: { enabled: false } }));
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
  await page.screenshot({ path: testInfo.outputPath(`alumni-login-${testInfo.project.name}.png`), fullPage: true });
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

for (const status of ["pending", "rejected"]) {
  test(`выпуск ${status}: объяснение вместо отправки заявки`, async ({ page }, testInfo) => {
    await setup(page);
    await page.addInitScript(() => localStorage.setItem("club_token", "test-session"));
    await page.route("**/api/me", r => r.fulfill({ json: { ...me, alumni: { ...alumni, verification_status: status } } }));
    await page.goto("/podcasts#podcast-subscription");
    await expect(page.getByRole("heading", { name: status === "pending" ? "Выпуск на проверке" : "Нужно подтвердить выпуск" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Отправить заявку/ })).toHaveCount(0);
    await page.locator("#podcast-subscription").screenshot({ path: testInfo.outputPath(`alumni-subscription-${status}-${testInfo.project.name}.png`), fullPage: true });
  });
}

test("отправка: контакт, номер заявки и сохранение состояния после перезагрузки", async ({ page }, testInfo) => {
  await setup(page);
  await page.addInitScript(() => localStorage.setItem("club_token", "test-session"));
  await page.route("**/api/payments/config", r => r.fulfill({ json: { enabled: false } }));
  let sent = 0;
  const order = { number: "2026-0042", type: "podcast", status: "new", subtotal: 499900, member_discount: 0, total_estimate: 499900, created_at: "2026-09-12T00:00:00Z", payment_status: null };
  await page.route("**/api/me/orders", r => r.fulfill({ json: sent ? [order] : [] }));
  await page.route("**/api/podcasts/subscribe", r => { sent++; return r.fulfill({ json: { number: order.number } }); });
  await page.goto("/podcasts#podcast-subscription");
  await expect(page.getByText("graduate@example.com", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Отправить заявку на подписку" })).toBeEnabled();
  await page.locator("#podcast-subscription").screenshot({ path: testInfo.outputPath(`alumni-subscription-ready-${testInfo.project.name}.png`), fullPage: true });
  await page.getByRole("button", { name: "Отправить заявку на подписку" }).click();
  await expect(page.getByRole("heading", { name: "Заявка 2026-0042" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Посмотреть заявку" })).toHaveAttribute("href", "/lk?section=orders");
  await expect(page.getByRole("button", { name: /Отправить заявку/ })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Заявка 2026-0042" })).toBeVisible();
  expect(sent).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator("#podcast-subscription").screenshot({ path: testInfo.outputPath(`alumni-subscription-sent-${testInfo.project.name}.png`), fullPage: true });
});

test("ошибка профиля допускает повторную проверку", async ({ page }) => {
  await setup(page);
  await page.addInitScript(() => localStorage.setItem("club_token", "test-session"));
  await page.route("**/api/payments/config", r => r.fulfill({ json: { enabled: false } }));
  let failed = true;
  await page.route("**/api/me", r => failed ? r.fulfill({ status: 503, json: { error: "Недоступно" } }) : r.fulfill({ json: me }));
  await page.goto("/podcasts#podcast-subscription");
  await expect(page.getByRole("alert")).toContainText("Не удалось проверить профиль");
  await expect(page.getByRole("button", { name: /Отправить заявку/ })).toHaveCount(0);
  failed = false;
  await page.getByRole("button", { name: "Повторить проверку" }).click();
  await expect(page.getByRole("button", { name: "Отправить заявку на подписку" })).toBeEnabled();
});

test("ошибка отправки позволяет повторить заявку", async ({ page }) => {
  await setup(page);
  await page.addInitScript(() => localStorage.setItem("club_token", "test-session"));
  let attempts = 0;
  await page.route("**/api/podcasts/subscribe", r => {
    attempts++;
    return attempts === 1 ? r.fulfill({ status: 503, json: { error: "Не удалось сохранить заявку" } }) : r.fulfill({ json: { number: "2026-0043" } });
  });
  await page.goto("/podcasts#podcast-subscription");
  await page.getByRole("button", { name: "Отправить заявку на подписку" }).click();
  await expect(page.getByRole("alert")).toContainText("Не удалось сохранить заявку");
  await page.getByRole("button", { name: "Отправить заявку на подписку" }).click();
  await expect(page.getByRole("heading", { name: "Заявка 2026-0043" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
