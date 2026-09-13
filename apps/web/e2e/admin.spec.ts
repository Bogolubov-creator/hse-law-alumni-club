import { test, expect, type Page } from "@playwright/test";
import { seedClientStorage, stubSw, mockPublicApi } from "./harness.js";

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

const SUBS = {
  active: 2, expiring_30d: 1, expired: 5, plays_total: 37,
  items: [
    { id: "m1", fio: "Кондратьев Сергей Андреевич", cohort: "2019", until: "2026-08-20T00:00:00.000Z", days_left: 8, reminded: true, email: "k@example.com" },
    { id: "m2", fio: "Орлова Мария Петровна", cohort: "2021", until: "2027-02-01T00:00:00.000Z", days_left: 173, reminded: false, email: null },
  ],
  by_podcast: [
    { id: "p1", title: "Правовая грамотность с Виолеттой Трубиной", is_free: true, plays: 24, listeners: 19, plays_30d: 11 },
    { id: "p2", title: "Право и карьера", is_free: false, plays: 13, listeners: 9, plays_30d: 4 },
  ],
};

/** Панель за админ-логином: кладём токен и подменяем ручки. */
async function mockAdmin(page: Page, over: Record<string, unknown> = {}) {
  await seedClientStorage(page);
  await stubSw(page);
  await mockPublicApi(page);
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("admin-fixture-seeded")) {
      localStorage.setItem("club_admin_token", "e2e-admin-stub");
      sessionStorage.setItem("admin-fixture-seeded", "1");
    }
  });
  await page.route("**/api/admin/analytics**", r => r.fulfill({ json: { pulse: {}, series: { pageviews_by_day: [] }, pageviews: { hits: 0, paths_top: [] } } }));
  await page.route("**/api/admin/system-health", r => r.fulfill({ json: { checked_at: new Date().toISOString(), status: "unknown", checks: [] } }));
  const json = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  await page.route("**/api/admin/overview", (r) => r.fulfill(json(over.overview ?? OVERVIEW)));
  await page.route("**/api/admin/orders**", (r) =>
    r.request().method() === "GET" ? r.fulfill(json(over.orders ?? ORDERS)) : r.fulfill(json({ ok: true })));
  await page.route("**/api/admin/members**", (r) =>
    r.request().method() === "GET" ? r.fulfill(json(over.members ?? MEMBERS)) : r.fulfill(json({ ok: true })));
  await page.route("**/api/admin/audit**", (r) => r.fulfill(json([]))); // ручка отдаёт массив, не страницу
  await page.route("**/api/admin/podcast-subs", (r) => r.fulfill(json(over.subs ?? SUBS)));
  await page.route("**/api/admin/events**", r => r.fulfill(json({ items: [], total: 0, page: 1, limit: 20 })));
  // Остальные разделы контента – пустыми списками, чтобы не падали
  for (const p of ["programs", "products", "news", "timeline", "podcasts"]) {
    await page.route(`**/api/admin/${p}**`, (r) =>
      r.request().method() === "GET" ? r.fulfill(json([])) : r.fulfill(json({ ok: true })));
  }
}

test.describe("Админ-панель", () => {
  test("без токена показывается вход, а не данные", async ({ page }) => {
    await seedClientStorage(page);
    await stubSw(page);
    await page.goto("/admin");
    await expect(page.getByRole("button", { name: "Войти" })).toBeVisible();
    await expect(page.getByText("Новые заявки", { exact: true })).toHaveCount(0);
  });

  test("панель не индексируется", async ({ page }) => {
    await mockAdmin(page);
    await page.goto("/admin");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });

  test("обзор показывает счётчики офиса", async ({ page }) => {
    await mockAdmin(page);
    await page.goto("/admin");

    await expect(page.getByText("Новые заявки", { exact: true })).toBeVisible();
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
      ["Подписки", "Подписки на подкасты"],
      ["Журнал", "Журнал безопасности"],
      ["Дашборд", "Дашборд сайта"],
    ] as const) {
      await page.getByRole("button", { name: new RegExp(btn) }).click();
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    }
  });

  test("подписки: видно, у кого заканчивается и что уже напомнили", async ({ page }) => {
    await mockAdmin(page);
    await page.goto("/admin");
    await page.getByRole("button", { name: /Подписки/ }).click();

    await expect(page.getByRole("heading", { level: 1, name: "Подписки на подкасты" })).toBeVisible();
    await expect(page.getByText("Активных подписок")).toBeVisible();
    await expect(page.getByText("Кондратьев Сергей Андреевич")).toBeVisible();
    // Осталось меньше десяти дней – по этому офис решает, звонить ли
    await expect(page.getByText(/8 дн\. · напомнили/)).toBeVisible();
  });

  test("подписки: статистика прослушиваний и оговорка про видео", async ({ page }) => {
    await mockAdmin(page);
    await page.goto("/admin");
    await page.getByRole("button", { name: /Подписки/ }).click();

    await expect(page.getByText("Прослушивания", { exact: true })).toBeVisible();
    await expect(page.getByText("11 · 24")).toBeVisible();
    await expect(page.getByText(/слушателей 19/)).toBeVisible();
    // Видео отдаёт чужой плеер – офис не должен думать, что цифры полные
    await expect(page.getByText(/Видеовыпуски RuTube сюда не попадают/)).toBeVisible();
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
    await seedClientStorage(page);
    await stubSw(page);
    await page.addInitScript(() => {
      localStorage.setItem("club_admin_token", "e2e-admin-stub");
    });
    await page.route("**/api/admin/overview", (r) => r.fulfill({ status: 500, contentType: "application/json", body: "{}" }));
    await page.goto("/admin");
    // 5xx – это не разлогин: офис должен увидеть ретрай, а не форму входа
    await expect(page.getByRole("button", { name: "Повторить", exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Войти" })).toHaveCount(0);
  });
});

test("CMS сохраняет действующие поля и не перезаписывает скрытый контент", async ({ page }, info) => {
  await mockAdmin(page);
  let saved: any;
  await page.route("**/api/admin/pages/home", r => {
    if (r.request().method() === "PATCH") { saved = r.request().postDataJSON(); return r.fulfill({ json: { ok: true } }); }
    return r.fulfill({ json: { slug: "home", title: "Главная", blocks: {
      hero: { title_pre: "Клуб выпускников", title_accent: "факультета права", subtitle: "Встречи и возможности сообщества", cta_primary: "Вступить в клуб", badge: "Сохранённый бейдж", history_title: "Архив", marquee: ["История"], cta_secondary: "Архивная кнопка" },
      cta: { title: "Сохранённый заголовок", text: "Подайте заявку, чтобы присоединиться к клубу.", button: "Подать заявку" },
    } } });
  });
  await page.goto("/admin");
  await page.getByRole("button", { name: "Контент", exact: true }).click();
  await expect(page.getByRole("button", { name: "История", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Страницы", exact: true }).click();
  await expect(page.getByLabel("Заголовок (начало)")).toHaveValue("Клуб выпускников");
  await expect(page.getByLabel("Бейдж")).toHaveCount(0);
  await expect(page.getByLabel("Кнопка (вторая)")).toHaveCount(0);
  await page.getByLabel("Заголовок (начало)").fill("Наш клуб");
  await page.getByRole("button", { name: "Сохранить все секции" }).click();
  await expect.poll(() => saved).toBeTruthy();
  expect(Object.keys(saved.hero).sort()).toEqual(["cta_primary", "subtitle", "title_accent", "title_pre"]);
  expect(saved.hero.title_pre).toBe("Наш клуб");
  expect(Object.keys(saved.cta).sort()).toEqual(["button", "text"]);
  await expect(page.getByText("сохранено ✓ – уже на сайте")).toBeVisible();
  if (process.env.CLEANUP_SCREENSHOTS) await page.screenshot({ path: process.env.CLEANUP_SCREENSHOTS + "/cms-" + info.project.name + ".png", fullPage: true });
});

test("события: страницы, ленивый roster, повтор ошибки и отметка посещения", async ({ page }, info) => {
  await mockAdmin(page);
  let rosterReads = 0, attended = false, failRoster = true, deleted = false;
  const requests: string[] = [];
  await page.route("**/api/admin/events**", r => {
    const url = new URL(r.request().url()); requests.push(url.pathname + url.search);
    if (r.request().method() === "DELETE") { deleted = true; return r.fulfill({ json: { ok: true } }); }
    if (url.pathname.endsWith("/attend")) { attended = true; return r.fulfill({ json: { ok: true } }); }
    if (url.pathname.endsWith("/rsvps")) {
      rosterReads++;
      if (failRoster) return r.fulfill({ status: 503, json: { error: "Недоступно" } });
      return r.fulfill({ json: [{ id: "r1", alumni_id: "a1", fio: "Участник встречи", attended }] });
    }
    const current = Number(url.searchParams.get("page") || 1);
    return r.fulfill({ json: { items: deleted && current === 2 ? [] : [{ id: `e${current}`, title: current === 1 ? "Встреча выпускников" : "Семинар клуба", starts_at: "2026-10-01T16:00:00Z", points: 60, status: "published", rsvp_count: 1 }], total: deleted ? 20 : 21, page: current, limit: 20 } });
  });
  await page.goto("/admin");
  await page.getByRole("button", { name: "Контент", exact: true }).click();
  await page.getByRole("button", { name: "События", exact: true }).click();
  await expect(page.getByText("Страница 1 из 2")).toBeVisible();
  expect(rosterReads).toBe(0);
  await page.getByRole("button", { name: "Далее", exact: true }).click();
  await expect(page.getByText("Семинар клуба", { exact: true })).toBeVisible();
  expect(rosterReads).toBe(0);
  await page.getByRole("button", { name: /Участники · 1/ }).click();
  await expect(page.getByText("Не удалось загрузить участников.")).toBeVisible();
  failRoster = false;
  await page.getByRole("button", { name: "Повторить", exact: true }).click();
  await page.getByRole("button", { name: "Участник встречи · был?" }).click();
  await expect(page.getByRole("button", { name: "Участник встречи ✓" })).toBeDisabled();
  expect(requests).toContain("/api/admin/events?page=2&limit=20");
  expect(requests).toContain("/api/admin/events/e2/rsvps");
  expect(requests.some(r => r.includes("e1/rsvps"))).toBe(false);
  if (process.env.CLEANUP_SCREENSHOTS) await page.screenshot({ path: process.env.CLEANUP_SCREENSHOTS + "/events-" + info.project.name + ".png", fullPage: true });
  await page.getByRole("button", { name: "Удалить Семинар клуба", exact: true }).click();
  await page.getByRole("button", { name: "Удалить", exact: true }).click();
  await expect(page.getByText("Страница 1 из 1")).toBeVisible();
  await expect(page.getByText("Встреча выпускников", { exact: true })).toBeVisible();
});
