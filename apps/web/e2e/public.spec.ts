import { test, expect, type Page } from "@playwright/test";
import { preparePage } from "./harness.js";

/**
 * Публичные витрины (десктоп + мобила). Только чтение: ничего не отправляем.
 * Cookie-баннер гасим заранее, чтобы не перекрывал низ.
 *
 * Каталог/новости подменяем: Safari-приёмка не должна краснеть из-за падения
 * Directus на стенде (CMS – отдельный контур; живой каталог – staged-catalog).
 */

const PROGRAMS = [
  {
    id: "p1",
    slug: "dogovornoe-pravo",
    title: "Договорное право",
    direction: "Гражданское право",
    format: "online",
    duration: "3 месяца",
    price: 90_000_00,
    enrollment: "actual",
    source_url: null,
    description: "Тестовая программа для e2e.",
    document: "Удостоверение",
    dates: { start: "1 октября 2026" },
  },
];

const NEWS = [
  {
    id: "n1",
    slug: "vstrecha-vypuska",
    title: "Встреча выпуска",
    excerpt: "Короткий анонс",
    body: "Текст",
    published_at: "2026-05-01T10:00:00.000Z",
  },
];

async function stubCatalog(page: Page) {
  const json = (body: unknown) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
  await page.route("**/api/programs", (r) => {
    if (new URL(r.request().url()).pathname.endsWith("/programs")) return r.fulfill(json(PROGRAMS));
    return r.fallback();
  });
  await page.route("**/api/news", (r) => {
    if (new URL(r.request().url()).pathname.endsWith("/news")) return r.fulfill(json(NEWS));
    return r.fallback();
  });
}

test.beforeEach(async ({ page }) => {
  await preparePage(page);
});

test("главная отдаётся и содержит бренд клуба", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveTitle(/Клуб выпускников факультета права Вышки/);
  await expect(page.getByText("Клуб выпускников").first()).toBeVisible();
});

test("витрина ДПО показывает программы с ценами", async ({ page }) => {
  await stubCatalog(page);
  await page.goto("/dpo", { waitUntil: "domcontentloaded" });
  // Десктоп: «Программы по праву со скидкой выпускника»; мобила: «Программы ДПО».
  await expect(page.getByRole("heading", { name: /Программы (ДПО|по праву|дополнительного)/ }).first()).toBeVisible();
  // Цены в рублях – признак того, что каталог реально загрузился из API.
  await expect(page.getByText(/₽/).first()).toBeVisible();
});

test("скидка выпускника не раскрывается гостю", async ({ page }) => {
  // Правило клуба: −N% видит только верифицированный выпускник, гость – базовую цену.
  await stubCatalog(page);
  await page.goto("/dpo", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/₽/).first()).toBeVisible();
  await expect(page.getByText(/выпускнику|цена выпускника/)).toHaveCount(0);
});

test("герой ведёт гостя во вступление, а не во вход", async ({ page, isMobile }) => {
  test.skip(!!isMobile, "на телефоне главная – native app-shell");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const hero = page.locator("#top");
  await expect(hero.getByRole("link", { name: "Вступить в клуб" })).toBeVisible();
  await expect(hero.getByRole("link", { name: /Уже в клубе – войти/ })).toBeVisible();
});

test("якорь #kak ведёт на объяснение вступления, а не на «Три причины»", async ({ page, isMobile }) => {
  test.skip(!!isMobile, "на телефоне главная – native app-shell");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const kak = page.locator("#kak");
  await expect(kak.getByRole("heading", { name: /Три шага и вы в клубе/ })).toBeVisible();
  await expect(kak.getByText(/учебный офис сверит выпуск/i)).toBeVisible();
  await expect(kak.getByText(/Оплаты и взносов на сайте нет|Оплаты на сайте нет/)).toBeVisible();
  await expect(kak.getByText(/честные сроки|1–3 рабочих дня/)).toHaveCount(0);
});

test("новости: список открывается и ведёт на публикацию", async ({ page }) => {
  await stubCatalog(page);
  await page.goto("/news", { waitUntil: "domcontentloaded" });
  const first = page.getByRole("link", { name: /Читать|новость|Встреча выпуска/i }).first();
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
  // Sitemap ходит в Directus; без CMS – осознанный skip, не ложный fail Safari.
  test.skip(sitemap.status() !== 200, "sitemap.xml требует живой Directus на стенде");
  const xml = await sitemap.text();
  expect(xml).toContain("<urlset");
  expect(xml).toContain("changefreq");
});

test("страница-404 не индексируется", async ({ page }) => {
  await page.goto("/this-page-does-not-exist", { waitUntil: "domcontentloaded" });
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});
