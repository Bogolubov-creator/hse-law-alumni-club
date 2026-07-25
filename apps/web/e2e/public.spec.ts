import { test, expect } from "@playwright/test";

/**
 * Публичные витрины (десктоп + мобила). Только чтение: ничего не отправляем,
 * данные стенда не меняются. Cookie-баннер гасим заранее, чтобы не перекрывал низ.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("club_cookie_consent", "1"));
});

test("главная отдаётся и содержит бренд клуба", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveTitle(/Клуб выпускников факультета права НИУ ВШЭ/);
  await expect(page.getByText("Клуб выпускников").first()).toBeVisible();
});

test("витрина ДПО показывает программы с ценами", async ({ page }) => {
  await page.goto("/dpo", { waitUntil: "domcontentloaded" });
  // Десктоп: «Программы по праву со скидкой выпускника»; мобила: «Программы ДПО».
  await expect(page.getByRole("heading", { name: /Программы (ДПО|по праву)/ }).first()).toBeVisible();
  // Цены в рублях — признак того, что каталог реально загрузился из API.
  await expect(page.getByText(/₽/).first()).toBeVisible();
});

test("скидка выпускника не раскрывается гостю", async ({ page }) => {
  // Правило клуба: −N% видит только верифицированный выпускник, гость — базовую цену.
  await page.goto("/dpo", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/₽/).first()).toBeVisible();
  await expect(page.getByText(/выпускнику|цена выпускника/)).toHaveCount(0);
});

test("герой ведёт гостя во вступление, а не во вход", async ({ page, isMobile }) => {
  test.skip(!!isMobile, "на телефоне главная — native app-shell");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const hero = page.locator("#top");
  await expect(hero.getByRole("link", { name: "Вступить в клуб" })).toBeVisible();
  await expect(hero.getByRole("link", { name: /Уже в клубе — войти/ })).toBeVisible();
});

test("якорь #kak ведёт на объяснение вступления, а не на «Три причины»", async ({ page, isMobile }) => {
  test.skip(!!isMobile, "на телефоне главная — native app-shell");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const kak = page.locator("#kak");
  await expect(kak.getByRole("heading", { name: /Три шага и честные сроки/ })).toBeVisible();
  await expect(kak.getByText(/обычно 1–3 рабочих дня/)).toBeVisible();
  await expect(kak.getByText(/Оплаты на сайте нет/)).toBeVisible();
});

test("новости: список открывается и ведёт на публикацию", async ({ page }) => {
  await page.goto("/news", { waitUntil: "domcontentloaded" });
  const first = page.getByRole("link", { name: /Читать|новость/i }).first();
  await expect(first).toBeVisible();
});

test("подкасты и мерч отдаются без ошибок", async ({ page }) => {
  for (const path of ["/podcasts", "/merch"]) {
    const res = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(res?.status(), `${path} должен отдаваться 200`).toBeLessThan(400);
    await expect(page.locator("#root")).not.toBeEmpty();
  }
});

test("юридические страницы (152-ФЗ) доступны", async ({ page }) => {
  for (const path of ["/privacy", "/confidential", "/requisites"]) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#root")).not.toBeEmpty();
  }
});

test("приватные разделы закрыты от индексации", async ({ page }) => {
  for (const path of ["/lk", "/cart"]) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  }
});

test("robots.txt и sitemap.xml отдаются", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain("Sitemap:");

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  const xml = await sitemap.text();
  expect(xml).toContain("<urlset");
  expect(xml).toContain("changefreq");
});

test("страница-404 не индексируется", async ({ page }) => {
  await page.goto("/this-page-does-not-exist", { waitUntil: "domcontentloaded" });
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});
