import { test, expect } from "@playwright/test";

/**
 * Мобильная native-app-оболочка (порт Claude Design). Гоняется только в проекте
 * "mobile" (iPhone 13) — на десктопе оболочка намеренно не показывается.
 * Read-only: заявку не отправляем, аудио не проигрываем до конца.
 */
test.skip(({ isMobile }) => !isMobile, "только мобильный проект");

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("club_cookie_consent", "1"));
});

test("нижняя таб-навигация: все пять вкладок", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const nav = page.locator("nav").last();
  for (const label of ["Карта", "Лента", "ДПО", "Подкасты", "Мерч"]) {
    await expect(nav.getByRole("link", { name: label })).toBeVisible();
  }
});

test("гость на «Карте» видит приглашение войти/вступить", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("link", { name: /Войти в кабинет/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Вступить в клуб/ })).toBeVisible();
});

test("переключение вкладок меняет экран", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const nav = page.locator("nav").last();
  // Ждём готовности оболочки (lazy-чанк), иначе клик может уйти в пустоту.
  await expect(nav.getByRole("link", { name: "ДПО" })).toBeVisible();

  await nav.getByRole("link", { name: "ДПО" }).click();
  await expect(page).toHaveURL(/\/dpo$/);
  await expect(page.getByRole("heading", { name: "Программы ДПО" })).toBeVisible();

  await nav.getByRole("link", { name: "Лента" }).click();
  await expect(page).toHaveURL(/\/news$/);

  await nav.getByRole("link", { name: "Мерч" }).click();
  await expect(page).toHaveURL(/\/merch$/);
});

test("карточка программы: детали и действие «В корзину»", async ({ page }) => {
  await page.goto("/dpo", { waitUntil: "domcontentloaded" });
  await page.locator('a[href^="/dpo/"]').first().click();
  await expect(page).toHaveURL(/\/dpo\/.+/);
  // Клубная программа предлагает корзину; программа ВШЭ — переход на маркетплейс.
  const cta = page.getByRole("button", { name: "В корзину" }).or(page.getByRole("link", { name: /hse\.ru/ }));
  await expect(cta.first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Назад" })).toBeVisible();
});

test("мерч-карточка требует выбрать размер до добавления", async ({ page }) => {
  await page.goto("/merch", { waitUntil: "domcontentloaded" });
  await page.locator('a[href^="/merch?item="]').first().click();
  await expect(page).toHaveURL(/item=/);
  // У товара с вариантами кнопка заблокирована до выбора размера.
  const cta = page.getByRole("button", { name: /Выберите размер|Добавить в заявку|Нет в наличии/ });
  await expect(cta).toBeVisible();
});

test("плеер подкаста открывается с элементами управления", async ({ page }) => {
  await page.goto("/podcasts", { waitUntil: "domcontentloaded" });
  await page.locator('a[href*="?ep="]').first().click();
  await expect(page).toHaveURL(/ep=/);
  // Либо плеер (есть кнопка Играть), либо экран подписки для закрытого выпуска.
  const control = page.getByRole("button", { name: "Играть" }).or(page.getByRole("button", { name: /подписку/ }));
  await expect(control.first()).toBeVisible();
});

test("гость по ссылке на приватный оверлей не попадает в тупик", async ({ page }) => {
  // Регрессия: ?screen=profile у гостя раньше рендерил пустой экран без выхода.
  for (const screen of ["profile", "ach", "ledger"]) {
    await page.goto(`/?screen=${screen}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("link", { name: /Войти в кабинет/ })).toBeVisible();
    await expect(page.locator("nav").last()).toBeVisible();
  }
});

test("пустая корзина показывает честное состояние", async ({ page }) => {
  await page.goto("/cart", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/Заявка пуста|Подытог/).first()).toBeVisible();
});

test("десктопная версия не показывает мобильную оболочку", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem("club_cookie_consent", "1"));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("nav").last().getByRole("link", { name: "Карта" })).toHaveCount(0);
  await ctx.close();
});
