import { test, expect, type Page } from "@playwright/test";

/**
 * Воронка входа v2 и юридические страницы v2.
 *
 * POST /auth/register и /auth/confirm подменяются: иначе каждый прогон создавал
 * бы живые заявки на вступление и работу учебному офису. Всё остальное –
 * настоящая страница на живом стеке.
 */

async function stubSw(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "serviceWorker", { get: () => undefined });
  });
}

async function fillForm(page: Page) {
  await page.getByLabel("фио").fill("Белов Роман Игоревич");
  await page.getByLabel("почта").fill("belov@example.com");
  await page.getByLabel(/пароль/).fill("verylongpassword");
  await page.getByLabel("год выпуска").fill("2019");
  await page.getByLabel("образовательная программа").fill("Публичное право");
  await page.getByRole("checkbox").check();
}

test.describe("Вступление в клуб v2", () => {
  test.beforeEach(async ({ page }) => { await stubSw(page); });

  test("без согласия на обработку данных заявку не отправить", async ({ page }) => {
    await page.goto("/v2/join");
    const submit = page.getByRole("button", { name: "Нужно согласие на обработку данных" });
    await expect(submit).toBeDisabled();

    await page.getByRole("checkbox").check();
    await expect(page.getByRole("button", { name: "Подать заявку на вступление" })).toBeEnabled();
  });

  test("год выпуска принимает только цифры и не длиннее четырёх", async ({ page }) => {
    await page.goto("/v2/join");
    await page.getByLabel("год выпуска").fill("20a19999");
    await expect(page.getByLabel("год выпуска")).toHaveValue("2019");
  });

  test("заявка уходит с анкетой и пустым honeypot", async ({ page }) => {
    let sent: Record<string, unknown> | null = null;
    await page.route("**/api/auth/register", (r) => {
      sent = r.request().postDataJSON();
      return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    await page.goto("/v2/join");
    await fillForm(page);
    await page.getByRole("button", { name: "Подать заявку на вступление" }).click();

    await expect(page.getByRole("heading", { name: "Заявка отправлена" })).toBeVisible();
    const body = sent as unknown as Record<string, unknown>;
    expect(body.fio).toBe("Белов Роман Игоревич");
    expect(body.cohort).toBe("2019");
    expect(body.edu_level).toBe("магистратура");
    expect(body.consent_pdn).toBe(true);
    expect(body.website).toBe(""); // honeypot: живой человек его не видит
  });

  test("при включённой почте зовут в письмо, а не в кабинет", async ({ page }) => {
    await page.route("**/api/auth/register", (r) => r.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ confirm_required: true }),
    }));
    await page.goto("/v2/join");
    await fillForm(page);
    await page.getByRole("button", { name: "Подать заявку на вступление" }).click();

    await expect(page.getByRole("heading", { name: "Проверьте почту" })).toBeVisible();
    await expect(page.getByText(/belov@example\.com/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Войти в кабинет" })).toHaveCount(0);
  });

  test("ошибка сервера показывается, анкета не теряется", async ({ page }) => {
    await page.route("**/api/auth/register", (r) => r.fulfill({
      status: 409, contentType: "application/json", body: JSON.stringify({ error: "Такая почта уже зарегистрирована" }),
    }));
    await page.goto("/v2/join");
    await fillForm(page);
    await page.getByRole("button", { name: "Подать заявку на вступление" }).click();

    await expect(page.getByRole("alert")).toContainText("Такая почта уже зарегистрирована");
    await expect(page.getByLabel("фио")).toHaveValue("Белов Роман Игоревич");
  });

  test("пришедшему по приглашению это объясняют", async ({ page }) => {
    await page.goto("/v2/join?ref=SK-2019-4471");
    await expect(page.getByText(/по приглашению однокурсника/)).toBeVisible();
  });

  test("уже вошедшему предлагают кабинет, а не анкету", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("club_token", "stub");
      Object.defineProperty(navigator, "serviceWorker", { get: () => undefined });
    });
    await page.goto("/v2/join");

    await expect(page.getByRole("heading", { name: "Вы уже в клубе" })).toBeVisible();
    await expect(page.getByRole("link", { name: "В личный кабинет" })).toHaveAttribute("href", "/v2/lk");
    await expect(page.getByLabel("фио")).toHaveCount(0);

    // Выход возвращает анкету – заявку можно подать за другого человека
    await page.getByRole("button", { name: "Выйти и заполнить анкету" }).click();
    await expect(page.getByLabel("фио")).toBeVisible();
  });
});

test.describe("Восстановление пароля v2", () => {
  test.beforeEach(async ({ page }) => { await stubSw(page); });

  test("ответ не раскрывает, существует ли аккаунт", async ({ page }) => {
    await page.route("**/api/auth/forgot", (r) => r.fulfill({ status: 404, contentType: "application/json", body: "{}" }));
    await page.goto("/v2/forgot");
    await page.getByLabel("почта").fill("net-takogo@example.com");
    await page.getByRole("button", { name: "Прислать ссылку" }).click();

    // Даже на 404 экран один и тот же – по нему нельзя перебирать почты
    await expect(page.getByText(/Если такой аккаунт существует/)).toBeVisible();
  });

  test("ссылка без токена честно называет причину", async ({ page }) => {
    await page.goto("/v2/reset");
    await expect(page.getByRole("heading", { name: "Ссылка неполная" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Запросить новую" })).toHaveAttribute("href", "/v2/forgot");
  });

  test("несовпадающие пароли не уходят на сервер", async ({ page }) => {
    let called = false;
    await page.route("**/api/auth/reset", (r) => { called = true; return r.fulfill({ status: 200, contentType: "application/json", body: "{}" }); });
    await page.goto("/v2/reset?token=abc");
    await page.getByLabel("новый пароль").fill("verylongpassword");
    await page.getByLabel("повторите пароль").fill("другой-пароль");
    await page.getByRole("button", { name: "Сохранить пароль" }).click();

    await expect(page.getByRole("alert")).toContainText("Пароли не совпадают");
    expect(called).toBe(false);
  });
});

test.describe("Подтверждение почты v2", () => {
  test.beforeEach(async ({ page }) => { await stubSw(page); });

  test("адрес без токена – это неполная ссылка, а не провал", async ({ page }) => {
    await page.goto("/v2/confirm");
    await expect(page.getByRole("heading", { name: "Ссылка неполная" })).toBeVisible();
  });

  test("подтверждённая почта ведёт в кабинет v2", async ({ page }) => {
    await page.route("**/api/auth/confirm", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await page.goto("/v2/confirm?token=abc");
    await expect(page.getByRole("heading", { name: "Почта подтверждена" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Войти в кабинет" })).toHaveAttribute("href", "/v2/lk");
  });
});

test.describe("Юридические страницы v2", () => {
  test.beforeEach(async ({ page }) => { await stubSw(page); });

  const pages = [
    { url: "/v2/privacy", heading: "Политика обработки персональных данных", canonical: /\/privacy$/ },
    { url: "/v2/confidential", heading: "Политика конфиденциальности", canonical: /\/confidential$/ },
    { url: "/v2/requisites", heading: "Реквизиты", canonical: /\/requisites$/ },
  ];

  for (const p of pages) {
    test(`${p.heading}: текст на месте, canonical на v1`, async ({ page }) => {
      await page.goto(p.url);
      await expect(page.getByRole("heading", { level: 1, name: p.heading })).toBeVisible();
      await expect(page.getByText(/редакция от/)).toBeVisible();
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", p.canonical);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
      // Оболочка именно v2 – со своей шапкой
      await expect(page.getByRole("link", { name: /Клуб выпускников/ })).toBeVisible();
    });
  }

  test("реквизиты оператора не потерялись при переносе", async ({ page }) => {
    await page.goto("/v2/requisites");
    await expect(page.getByText("1257700005551")).toBeVisible(); // ОГРН
    await expect(page.getByText("9707041865")).toBeVisible();    // ИНН
    await expect(page.getByText(/Большая Черкизовская/)).toBeVisible();
  });
});

/**
 * Сторож изоляции: НИ ОДНА ссылка на страницах v2 не должна вести в старый фронт.
 *
 * Проверка по всей странице, а не только по шапке и подвалу: ровно так в герое
 * главной проскочила кнопка «Вступить в клуб», которая вела в /join – то есть
 * самая заметная кнопка сайта роняла человека в старый интерфейс.
 */
const V1_PATH = /^\/(privacy|confidential|requisites|news|events|podcasts|dpo|merch|cart|lk|join|forgot|reset|confirm)(\/|$)/;

for (const url of ["/v2", "/v2/dpo", "/v2/merch", "/v2/cart", "/v2/news", "/v2/events", "/v2/podcasts", "/v2/join", "/v2/privacy"]) {
  test(`на ${url} нет ссылок в старый фронт`, async ({ page }) => {
    await stubSw(page);
    await page.goto(url);
    await expect(page.locator("h1")).toBeVisible();
    const hrefs = await page.locator("a[href]").evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href") ?? ""));
    const v1 = hrefs.filter((h) => V1_PATH.test(h));
    expect(v1, `${url} ведёт в v1: ${[...new Set(v1)].join(", ")}`).toEqual([]);
  });
}
