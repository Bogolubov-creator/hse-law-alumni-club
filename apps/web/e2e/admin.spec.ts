import { test, expect, type Page } from "@playwright/test";

/**
 * Админ-панель офиса.
 *
 * Тесты написаны ДО редизайна и фиксируют поведение, а не оформление: панель –
 * рабочий инструмент учебного офиса, и редизайн не имеет права его сломать.
 * Проверяется то, что офис делает каждый день: верификация выпускника, смена
 * статуса заявки, начисление баллов, поиск, выход.
 *
 * Все ручки /api/admin/* подменяются. Настоящий админ-пароль в тесты не кладём,
 * а живые заявки и верификации трогать нельзя тем более.
 */

const OVERVIEW = {
  new_orders: 2, orders_count: 41, orders_paid: 12,
  pending_verifications: 1, alumni_count: 128, alumni_verified: 119, points_total: 40350,
  programs_actual: 21, programs_total: 21, products_count: 6, news_count: 9,
  friendships: 34, friend_requests: 3, podcasts_count: 2, podcast_subscribers: 7,
  push_subs_count: 0,
  next_event: { id: "e1", title: "Встреча выпуска 2026", starts_at: "2027-03-14T18:30:00.000Z", rsvps: 12 },
};

const ORDERS = {
  total: 2, page: 1, limit: 50,
  items: [
    {
      id: "o1", number: "ORD-000418", type: "dpo", contact_fio: "Кондратьев Сергей Андреевич",
      contact_phone: "+7 916 000-00-00", contact_email: "k@example.com", fulfillment: "none",
      status: "new", payment_status: null, subtotal: 4500000, total_estimate: 4050000,
      created_at: "2026-05-14T10:00:00.000Z",
      items_json: [{ title: "Договорное право", qty: 1 }], address: null, comment: null,
    },
    {
      id: "o2", number: "ORD-000377", type: "merch", contact_fio: "Орлова Мария Петровна",
      contact_phone: "+7 916 111-11-11", contact_email: "o@example.com", fulfillment: "delivery",
      status: "confirmed", payment_status: "review", subtotal: 350000, total_estimate: 315000,
      created_at: "2026-04-02T10:00:00.000Z",
      items_json: [{ title: "Худи клуба", qty: 1, variant_sku: "HD-M" }], address: "Москва", comment: null,
    },
  ],
};

const MEMBERS = {
  total: 1, page: 1, page_size: 50,
  items: [{
    id: "m1", fio: "Белов Роман Игоревич", cohort: "2019", status: "active",
    verification_status: "pending", points_cached: 120, level_cached: "graduate",
    personal_discount: 0, email: "belov@example.com", edu_level: "магистратура",
    edu_program: "Публичное право", joined_at: "2026-07-30T09:00:00.000Z",
  }],
};

/** Панель за админ-логином: кладём токен и подменяем ручки. */
async function mockAdmin(page: Page, over: Record<string, unknown> = {}) {
  await page.addInitScript(() => {
    localStorage.setItem("club_admin_token", "e2e-admin-stub");
    Object.defineProperty(navigator, "serviceWorker", { get: () => undefined });
  });
  const json = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  await page.route("**/api/admin/overview", (r) => r.fulfill(json(over.overview ?? OVERVIEW)));
  await page.route("**/api/admin/orders**", (r) =>
    r.request().method() === "GET" ? r.fulfill(json(over.orders ?? ORDERS)) : r.fulfill(json({ ok: true })));
  await page.route("**/api/admin/members**", (r) =>
    r.request().method() === "GET" ? r.fulfill(json(over.members ?? MEMBERS)) : r.fulfill(json({ ok: true })));
  await page.route("**/api/admin/audit**", (r) => r.fulfill(json([]))); // ручка отдаёт массив, не страницу
  // Остальные разделы контента – пустыми списками, чтобы не падали
  for (const p of ["programs", "products", "news", "timeline", "podcasts", "events"]) {
    await page.route(`**/api/admin/${p}**`, (r) =>
      r.request().method() === "GET" ? r.fulfill(json([])) : r.fulfill(json({ ok: true })));
  }
}

test.describe("Админ-панель", () => {
  test("без токена показывается вход, а не данные", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "serviceWorker", { get: () => undefined });
    });
    await page.goto("/admin");
    await expect(page.getByRole("button", { name: "Войти" })).toBeVisible();
    await expect(page.getByText("Новые заявки")).toHaveCount(0);
  });

  test("панель не индексируется", async ({ page }) => {
    await mockAdmin(page);
    await page.goto("/admin");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });

  test("обзор показывает счётчики офиса", async ({ page }) => {
    await mockAdmin(page);
    await page.goto("/admin");

    await expect(page.getByText("Новые заявки")).toBeVisible();
    await expect(page.getByText("128", { exact: true })).toBeVisible();   // выпускников
    await expect(page.getByText("подтверждено 119")).toBeVisible();
    await expect(page.getByText("Встреча выпуска 2026")).toBeVisible();
    await expect(page.getByText("записались: 12")).toBeVisible();
  });

  test("верификация выпускника уходит на сервер", async ({ page }) => {
    await mockAdmin(page);
    let sent: { url: string; body: unknown } | null = null;
    await page.route("**/api/admin/members/m1", (r) => {
      sent = { url: r.request().url(), body: r.request().postDataJSON() };
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });
    await page.goto("/admin");

    await expect(page.getByText("Белов Роман Игоревич")).toBeVisible();
    await page.getByRole("button", { name: "Подтвердить" }).click();

    await expect.poll(() => sent).not.toBeNull();
    expect((sent as unknown as { body: { verification_status: string } }).body.verification_status).toBe("verified");
  });

  test("смена статуса заявки уходит на сервер", async ({ page }) => {
    await mockAdmin(page);
    let sent: Record<string, unknown> | null = null;
    await page.route("**/api/admin/orders/o1", (r) => {
      sent = r.request().postDataJSON();
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });
    await page.goto("/admin");
    await page.getByRole("button", { name: /Заявки/ }).click();

    await page.getByLabel("Статус заявки ORD-000418").selectOption("in_progress");
    await expect.poll(() => sent).not.toBeNull();
    expect((sent as unknown as { status: string }).status).toBe("in_progress");
  });

  test("расхождение суммы платежа видно офису, а не спрятано", async ({ page }) => {
    await mockAdmin(page);
    await page.goto("/admin");
    await page.getByRole("button", { name: /Заявки/ }).click();

    // Вебхук ЮKassa пометил заявку: пришла не та сумма. Это нельзя терять при редизайне.
    await expect(page.getByText("сумма ≠")).toBeVisible();
    await expect(page.getByText("ORD-000377")).toBeVisible();
  });

  test("состав заявки виден без похода в Directus", async ({ page }) => {
    await mockAdmin(page);
    await page.goto("/admin");
    await page.getByRole("button", { name: /Заявки/ }).click();
    await expect(page.getByText(/Худи клуба \(HD-M\) ×1/)).toBeVisible();
    await expect(page.getByText(/доставка: Москва/)).toBeVisible();
  });

  test("поиск по заявкам уходит на сервер, а не фильтрует локально", async ({ page }) => {
    await mockAdmin(page);
    const urls: string[] = [];
    await page.route("**/api/admin/orders?**", (r) => {
      urls.push(r.request().url());
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ORDERS) });
    });
    await page.goto("/admin");
    await page.getByRole("button", { name: /Заявки/ }).click();
    await page.getByLabel("Поиск по заявкам").fill("Орлова");

    await expect.poll(() => urls.some((u) => u.includes("q=") && u.includes("%D0%9E%D1%80%D0%BB%D0%BE%D0%B2%D0%B0"))).toBe(true);
  });

  test("разделы панели переключаются", async ({ page }) => {
    await mockAdmin(page);
    await page.goto("/admin");
    for (const [btn, heading] of [
      ["Выпускники", "Выпускники"],
      ["Контент", "Контент"],
      ["Журнал", "Журнал безопасности"],
      ["Обзор", "Обзор"],
    ] as const) {
      await page.getByRole("button", { name: new RegExp(btn) }).click();
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    }
  });

  test("пуш-рассылка заблокирована и называет причину", async ({ page }) => {
    await mockAdmin(page);
    await page.goto("/admin");
    // Изменено сознательно при редизайне: раньше кнопка молчала бледной охрой,
    // а причину приходилось искать подписью рядом. Теперь она на самой кнопке.
    await expect(page.getByRole("button", { name: "Подписчиков пока нет" })).toBeDisabled();
  });

  test("с подписчиками кнопка сначала просит заполнить поля", async ({ page }) => {
    await mockAdmin(page, { overview: { ...OVERVIEW, push_subs_count: 12 } });
    await page.goto("/admin");
    const btn = page.getByRole("button", { name: "Заполните заголовок и текст" });
    await expect(btn).toBeDisabled();

    await page.getByLabel("Заголовок пуш-уведомления").fill("Новое событие");
    await page.getByLabel("Текст пуш-уведомления").fill("Встреча выпуска в пятницу");
    await expect(page.getByRole("button", { name: "Отправить всем" })).toBeEnabled();
  });

  test("выход гасит сессию и возвращает на вход", async ({ page }) => {
    await mockAdmin(page);
    let loggedOut = false;
    await page.route("**/api/auth/admin-logout", (r) => {
      loggedOut = true;
      return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    await page.goto("/admin");
    await page.getByRole("button", { name: "Выйти" }).click();

    await expect(page.getByRole("button", { name: "Войти" })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("club_admin_token"))).toBeNull();
    expect(loggedOut, "сессия должна гаситься и на сервере, а не только в localStorage").toBe(true);
  });

  test("истёкшая сессия возвращает на вход, а сетевая ошибка – нет", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("club_admin_token", "e2e-admin-stub");
      Object.defineProperty(navigator, "serviceWorker", { get: () => undefined });
    });
    await page.route("**/api/admin/overview", (r) => r.fulfill({ status: 500, contentType: "application/json", body: "{}" }));
    await page.goto("/admin");
    // 5xx – это не разлогин: офис должен увидеть ретрай, а не форму входа
    await expect(page.getByRole("button", { name: "Повторить" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Войти" })).toHaveCount(0);
  });
});
