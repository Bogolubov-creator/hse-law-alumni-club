import { test, expect, type Page } from "@playwright/test";

/**
 * Разделы v2: новости, события, подкасты.
 *
 * Списки проверяются на живом API – это заодно проверяет, что шапка v2 больше
 * никуда не роняет в старый интерфейс. Отдельные состояния (закрытый выпуск,
 * запись на событие, прошедшие события) подменяются: в базе их сейчас нет,
 * и без фикстур они остались бы непроверенными.
 */

async function stubSw(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "serviceWorker", { get: () => undefined });
  });
}

test.describe("Новости v2", () => {
  test.beforeEach(async ({ page }) => { await stubSw(page); });

  test("список открывается и ведёт на публикацию v2, а не v1", async ({ page }) => {
    await page.goto("/v2/news");
    await expect(page.getByRole("heading", { level: 1, name: "Что в клубе сейчас" })).toBeVisible();

    const first = page.locator("article.v2-row").first();
    await expect(first).toBeVisible();
    const title = (await first.locator("h2").innerText()).trim();
    await first.getByRole("link", { name: "читать →" }).click();

    await expect(page).toHaveURL(/\/v2\/news\/[a-z0-9-]+$/);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  });

  test("публикация разбивает текст на абзацы, а не сливает в один", async ({ page }) => {
    await page.route("**/api/news/test-post", (r) => r.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        id: "n1", slug: "test-post", title: "Клуб подписал соглашение с факультетом",
        excerpt: "Короткий лид публикации.",
        body: "Первый абзац текста.\n\nВторой абзац текста.\n\nТретий абзац.",
        published_at: "2026-06-01T10:00:00.000Z",
      }),
    }));
    await page.goto("/v2/news/test-post");

    await expect(page.getByText("Короткий лид публикации.")).toBeVisible();
    await expect(page.getByText("Первый абзац текста.")).toBeVisible();
    await expect(page.getByText("Третий абзац.")).toBeVisible();
  });

  test("несуществующая публикация объясняет это и не индексируется", async ({ page }) => {
    await page.goto("/v2/news/takoj-novosti-net");
    await expect(page.getByRole("heading", { name: "Новость не найдена" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Все новости", exact: true })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });

  test("canonical ведёт на индексируемую страницу v1", async ({ page }) => {
    await page.goto("/v2/news");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/news$/);
  });
});

const EVENT = {
  id: "e1", title: "Встреча выпуска: нетворкинг", description: "Знакомство с клубом.\nСтолы по интересам.",
  starts_at: "2027-03-14T18:30:00.000Z", location: "Милютинский пер., 13", cover: null,
  reg_url: "https://example.org/reg", format: "offline", points: 60,
  status: "published", going: 12, my_rsvp: false, my_attended: false,
};

test.describe("События v2", () => {
  test.beforeEach(async ({ page }) => { await stubSw(page); });

  test("афиша показывает ближайшие события с датой и местом", async ({ page }) => {
    await page.goto("/v2/events");
    await expect(page.getByRole("heading", { level: 1, name: "События и встречи клуба" })).toBeVisible();
    await expect(page.locator("article.v2-row").first()).toBeVisible();
  });

  test("гостю предлагают войти, а не молча ничего не делают", async ({ page }) => {
    await page.route("**/api/events", (r) => r.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify([EVENT]),
    }));
    await page.goto("/v2/events");

    const login = page.getByRole("link", { name: "войти, чтобы записаться" }).first();
    await expect(login).toBeVisible();
    await expect(login).toHaveAttribute("href", "/v2/lk");
  });

  test("клик по записи открывает детали с календарём", async ({ page }) => {
    await page.route("**/api/events", (r) => r.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify([EVENT]),
    }));
    await page.goto("/v2/events");
    await page.getByRole("button", { name: "Быстрый просмотр" }).click();

    // Заголовок есть и в строке афиши, и в модалке – смотрим именно модалку
    await expect(page.locator("#ev2-modal-title")).toHaveText("Встреча выпуска: нетворкинг");
    await expect(page.getByText("Милютинский пер., 13").first()).toBeVisible();
    await expect(page.getByRole("link", { name: ".ics" })).toHaveAttribute("href", "/api/events/e1.ics");
    await expect(page.getByRole("link", { name: /google/i })).toHaveAttribute("href", /calendar\.google\.com/);
    await expect(page.getByRole("link", { name: /регистрация/i })).toHaveAttribute("href", "https://example.org/reg");
  });

  test("прошедшие события отделены от ближайших", async ({ page }) => {
    await page.route("**/api/events", (r) => r.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify([EVENT, { ...EVENT, id: "e2", title: "Лекция прошлого года", starts_at: "2024-02-01T18:00:00.000Z", status: "done" }]),
    }));
    await page.goto("/v2/events");

    await expect(page.getByText("ближайших 1")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Прошедшие" })).toBeVisible();
    await expect(page.getByText("Лекция прошлого года")).toBeVisible();
    // У прошедшего события записи быть не должно
    await expect(page.getByRole("link", { name: "войти, чтобы записаться" })).toHaveCount(1);
  });

  test("пустая афиша объясняет, что делать", async ({ page }) => {
    await page.route("**/api/events", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
    await page.goto("/v2/events");
    await expect(page.getByText(/Ближайших событий пока нет/)).toBeVisible();
  });
});

const PODCASTS = {
  subscribed: false, sub_until: null, price: 399900,
  items: [
    { id: "pd1", title: "Пробный выпуск: зачем клубу подкаст", description: "О чём будем говорить.", cover: null, duration: "42 мин", is_free: true, audio_url: "/api/podcasts/pd1/audio", video_url: null },
    { id: "pd2", title: "Договорная работа в 2026", description: "Практика и споры.", cover: null, duration: "58 мин", is_free: false, audio_url: null, video_url: null },
  ],
};

const RUTUBE_SRC = "https://rutube.ru/play/embed/a1b2c3d4e5f60718293a4b5c6d7e8f90";

test.describe("Подкасты v2", () => {
  test.beforeEach(async ({ page }) => { await stubSw(page); });

  test("пробный выпуск даёт плеер, закрытый – замок и цену", async ({ page }) => {
    await page.route("**/api/podcasts", (r) => r.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify(PODCASTS),
    }));
    await page.goto("/v2/podcasts");

    await expect(page.getByText("пробный выпуск · бесплатно")).toBeVisible();
    await expect(page.locator("audio")).toHaveCount(1);
    await expect(page.getByText(/доступно по подписке/)).toBeVisible();
  });

  test("гостя ведут в кабинет v2, а не в старый", async ({ page }) => {
    await page.route("**/api/podcasts", (r) => r.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify(PODCASTS),
    }));
    await page.goto("/v2/podcasts");

    const cta = page.getByRole("link", { name: "Войти в кабинет" });
    await expect(cta).toHaveAttribute("href", "/v2/lk");
  });

  test("активная подписка показывается вместо предложения купить", async ({ page }) => {
    await page.route("**/api/podcasts", (r) => r.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ ...PODCASTS, subscribed: true, sub_until: "2027-01-01T00:00:00.000Z" }),
    }));
    await page.goto("/v2/podcasts");

    await expect(page.getByText(/подписка активна/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Войти в кабинет" })).toHaveCount(0);
  });

  test("видеовыпуск показывается плеером RuTube вместо аудио", async ({ page }) => {
    await page.route("**/api/podcasts", (r) => r.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ ...PODCASTS, items: [{ ...PODCASTS.items[0], title: "Видеовыпуск клуба", video_url: RUTUBE_SRC }] }),
    }));
    await page.goto("/v2/podcasts");

    let videoRequests = 0;
    await page.route("https://rutube.ru/**", async route => { videoRequests++; await route.fulfill({ contentType: "text/html", body: "<p>Тестовый плеер</p>" }); });
    const frame = page.locator("iframe");
    await expect(frame).toHaveCount(0);
    expect(videoRequests).toBe(0);
    await page.getByRole("button", { name: "Загрузить видео с RuTube" }).click();
    await expect(frame).toHaveAttribute("src", RUTUBE_SRC);
    await expect(frame).toHaveAttribute("title", /Видеовыпуск клуба/);
    await expect(frame).toHaveAttribute("referrerpolicy", "no-referrer");
    await expect.poll(() => videoRequests).toBe(1);
    // Видео вытесняет аудио: два плеера на один выпуск – это шум
    await expect(page.locator("audio")).toHaveCount(0);
  });

  test("закрытому выпуску не отдаётся ни аудио, ни видео", async ({ page }) => {
    // Сервер уже не прислал ссылок – страница обязана показать замок, а не пустоту
    await page.route("**/api/podcasts", (r) => r.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ ...PODCASTS, items: [{ ...PODCASTS.items[1], video_url: null }] }),
    }));
    await page.goto("/v2/podcasts");

    await expect(page.locator("iframe")).toHaveCount(0);
    await expect(page.locator("audio")).toHaveCount(0);
    await expect(page.getByText(/доступно по подписке/)).toBeVisible();
  });

  test("на телефоне разделы не едут вбок", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const url of ["/v2/news", "/v2/events", "/v2/podcasts"]) {
      await page.goto(url);
      await expect(page.locator("h1")).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `горизонтальная прокрутка на ${url}`).toBeLessThanOrEqual(1);
    }
  });
});

test("в шапке v2 не осталось ссылок на старый фронт", async ({ page }) => {
  await stubSw(page);
  await page.goto("/v2");
  const hrefs = await page.locator("header a").evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href") ?? ""));
  const v1 = hrefs.filter((h) => /^\/(news|events|podcasts|dpo|merch|cart|lk)(\/|$)/.test(h));
  expect(v1, `шапка ведёт в v1: ${v1.join(", ")}`).toEqual([]);
});
