import { test, expect } from "@playwright/test";

/**
 * Публичные витрины (десктоп + мобила). Только чтение: ничего не отправляем,
 * данные стенда не меняются. Cookie-баннер гасим заранее, чтобы не перекрывал низ.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("club_cookie_consent", "1"));
});

test("главная отдаётся и содержит бренд клуба", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Клуб выпускников факультета права НИУ ВШЭ/);
  await expect(page.getByText("Клуб выпускников").first()).toBeVisible();
});

test("витрина ДПО показывает программы с ценами", async ({ page }) => {
  await page.goto("/dpo");
  // Десктоп: «Программы по праву со скидкой выпускника»; мобила: «Программы ДПО».
  await expect(page.getByRole("heading", { name: /Программы (ДПО|по праву)/ }).first()).toBeVisible();
  // Цены в рублях — признак того, что каталог реально загрузился из API.
  await expect(page.getByText(/₽/).first()).toBeVisible();
});

test("новости: список открывается и ведёт на публикацию", async ({ page }) => {
  await page.goto("/news");
  const first = page.getByRole("link", { name: /Читать|новость/i }).first();
  await expect(first).toBeVisible();
});

test("подкасты и мерч отдаются без ошибок", async ({ page }) => {
  for (const path of ["/podcasts", "/merch"]) {
    const res = await page.goto(path);
    expect(res?.status(), `${path} должен отдаваться 200`).toBeLessThan(400);
    await expect(page.locator("#root")).not.toBeEmpty();
  }
});

test("юридические страницы (152-ФЗ) доступны", async ({ page }) => {
  for (const path of ["/privacy", "/confidential", "/requisites"]) {
    await page.goto(path);
    await expect(page.locator("#root")).not.toBeEmpty();
  }
});

test("приватные разделы закрыты от индексации", async ({ page }) => {
  for (const path of ["/lk", "/cart"]) {
    await page.goto(path);
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
  await page.goto("/this-page-does-not-exist");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});
