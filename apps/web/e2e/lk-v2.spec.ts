import { test, expect, type Page } from "@playwright/test";

/**
 * Кабинет v2 (/v2/lk).
 *
 * Авторизованный экран проверяется на подменённых ответах API, а не реальным
 * логином: настоящие учётные данные в тесты не кладём, а отрисовку и пустые
 * состояния проверить надо. Токен в localStorage – заглушка, до бэкенда
 * запросы не доходят: их перехватывает route().
 *
 * Схемы ответов – те же zod-схемы, что и в проде: если фикстура разойдётся
 * с контрактом, парсинг упадёт и тест это покажет.
 */

const ME = {
  alumni: {
    fio: "Кондратьев Сергей Андреевич",
    cohort: "2019",
    verification_status: "verified",
    edu_program: "Публичное право",
    edu_level: "магистратура",
    interests: ["арбитраж", "антимонопольное"],
    avatar: null,
    referral_code: "SK-2019-4471",
    referrals_verified: 3,
    referrals_pending: 1,
  },
  // level – строка по схеме (levelInfoSchema), не номер уровня
  level: { points: 480, level: "2", level_title: "Активный выпускник", discount: 10, next_level: "Амбассадор", to_next: 220 },
  achievements: [
    { key: "first_order", title: "Первая заявка", description: "Оформлена первая заявка", earned: true, current: 1, target: 1, icon: "📄", kind: "count", star: false },
    { key: "friends_5", title: "Пятеро однокурсников", description: "Добавить пятерых", earned: false, current: 2, target: 5, icon: "👥", kind: "count", star: false },
  ],
  activity: [],
};

const ORDERS = [
  { number: "ORD-000418", type: "dpo", status: "confirmed", subtotal: 4500000, member_discount: 10, total_estimate: 4050000, created_at: "2026-05-14T10:00:00.000Z" },
  { number: "ORD-000377", type: "merch", status: "new", subtotal: 350000, member_discount: 10, total_estimate: 315000, created_at: "2026-04-02T10:00:00.000Z" },
];

const CLASSMATES = [
  { id: "a1", fio: "Орлова Мария Петровна", cohort: "2019", edu_program: "Публичное право", edu_level: "магистратура", level_title: "Амбассадор", interests: [], avatar: null, match: "both", friend_status: "accepted" },
  { id: "a2", fio: "Гаврилов Илья Олегович", cohort: "2019", edu_program: "Публичное право", edu_level: "магистратура", level_title: "Выпускник", interests: [], avatar: null, match: "cohort", friend_status: "none" },
  { id: "a3", fio: "Тимофеева Анна Львовна", cohort: "2019", edu_program: "Частное право", edu_level: "магистратура", level_title: "Выпускник", interests: [], avatar: null, match: "program", friend_status: "pending" },
];

const EVENTS = [
  { kind: "friend_request", from_id: "a4", from_fio: "Белов Роман Игоревич", created_at: "2026-07-30T09:00:00.000Z" },
  { kind: "order_status", number: "ORD-000418", status: "confirmed", paid: true, created_at: "2026-07-29T09:00:00.000Z" },
];

/** Подменяем только личные ручки; остальное идёт на живой стек как обычно. */
/**
 * Тестовая сессия: токен-заглушка и выключенный service worker.
 *
 * SW отключаем не для красоты: мобильный проект Playwright бежит на WebKit
 * (девайс iPhone 13), а там запросы, прошедшие через активный service worker,
 * до page.route() не доходят – перехват мутаций молча пролетает на живой API.
 * Прод это не затрагивает: sw.js и так не трогает /api (см. public/sw.js).
 */
async function stubSession(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("club_token", "e2e-stub-token");
    Object.defineProperty(navigator, "serviceWorker", { get: () => undefined });
  });
}

async function mockCabinet(page: Page, over: Partial<Record<"me" | "orders" | "classmates" | "events", unknown>> = {}) {
  const json = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  await page.route("**/api/me", (r) => r.fulfill(json(over.me ?? ME)));
  await page.route("**/api/me/orders", (r) => r.fulfill(json(over.orders ?? ORDERS)));
  await page.route("**/api/me/classmates", (r) => r.fulfill(json(over.classmates ?? CLASSMATES)));
  await page.route("**/api/me/events", (r) => r.fulfill(json(over.events ?? EVENTS)));
  await stubSession(page);
}

test.describe("Кабинет v2", () => {
  test("гостю показываются ворота, а не данные", async ({ page }) => {
    await page.goto("/v2/lk");
    await expect(page.getByRole("heading", { name: "Вход для выпускников" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Войти в кабинет" })).toBeVisible();
    // Ни одного раздела кабинета быть не должно
    await expect(page.getByRole("heading", { name: "Мои заявки" })).toHaveCount(0);
  });

  test("удостоверение, заявки, достижения и однокурсники на месте", async ({ page }) => {
    await mockCabinet(page);
    await page.goto("/v2/lk");

    await expect(page.getByRole("navigation", { name: "Разделы кабинета" })).toBeVisible();
    const mobileIdentity = page.locator(".club-identity-mobile");
    if (await mobileIdentity.isVisible()) await mobileIdentity.locator("summary").click();
    const identity = page.locator(".club-identity-desktop, .club-identity-mobile").filter({ visible: true });
    // Удостоверение: имя, подпись бланка и данные уровня
    await expect(identity.getByText("Кондратьев Сергей Андреевич", { exact: true })).toBeVisible();
    await expect(identity.getByText("выпуск 2019 · Публичное право")).toBeVisible();
    await expect(identity.getByText("Активный выпускник")).toBeVisible();
    await expect(identity.getByText("480", { exact: true })).toBeVisible();
    await expect(identity.getByText("10%", { exact: true })).toBeVisible();
    await expect(identity.getByText("SK-2019-4471")).toBeVisible();

    // Заявки: номер и посчитанная сумма
    await expect(page.getByRole("heading", { name: "Мои заявки" })).toBeVisible();
    await expect(page.getByText("ORD-000418", { exact: true })).toBeVisible();
    await expect(page.locator("summary").filter({ hasText: "ORD-000418" })).toContainText("Подтверждена");
    await expect(page.locator("summary").filter({ hasText: "ORD-000418" })).toContainText("40 500 ₽");

    await page.getByRole("button", { name: "Достижения", exact: true }).click();
    // Достижения: полученное и то, что в процессе
    await expect(page.getByRole("heading", { name: "Первая заявка", exact: true })).toBeVisible();
    await expect(page.getByText("2 / 5", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Сообщество", exact: true }).click();
    // Однокурсники и состояния дружбы
    await expect(page.getByText("Орлова Мария Петровна")).toBeVisible();
    await expect(page.getByRole("button", { name: "в друзьях – Орлова Мария Петровна" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "заявка отправлена – Тимофеева Анна Львовна" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "в друзья – Гаврилов Илья Олегович" })).toBeEnabled();

    await page.getByRole("button", { name: "Обзор", exact: true }).click();
    // Входящая заявка в друзья
    await expect(page.getByText("хочет добавить вас в друзья")).toBeVisible();
    await expect(page.getByText("Заявка ORD-000418 подтверждена · оплата прошла")).toBeVisible();
    await expect(page.getByRole("button", { name: "Принять заявку в друзья – Белов Роман Игоревич" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Отклонить заявку в друзья – Белов Роман Игоревич" })).toBeEnabled();
  });

  test("пустой кабинет объясняет, что делать, и не падает", async ({ page }) => {
    await mockCabinet(page, {
      me: { ...ME, achievements: [], alumni: { ...ME.alumni, referral_code: null, avatar: null } },
      orders: [],
      classmates: [],
      events: [],
    });
    await page.goto("/v2/lk");

    await expect(page.getByText("Заявок пока нет.")).toBeVisible();
    await expect(page.getByRole("link", { name: /Посмотреть программы ДПО/ })).toBeVisible();
    await page.getByRole("button", { name: "Сообщество", exact: true }).click();
    await expect(page.getByText(/в клубе пока никого нет/)).toBeVisible();
    // Пустые разделы не рисуются вовсе, а не пустыми заголовками
    await expect(page.getByRole("heading", { name: "Достижения" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Уведомления" })).toHaveCount(0);
  });

  test("сорванный запрос показывает ошибку с повтором, а не пустой экран", async ({ page }) => {
    await stubSession(page);
    await page.route("**/api/me", (r) => r.fulfill({ status: 500, contentType: "application/json", body: "{}" }));
    await page.goto("/v2/lk");

    await expect(page.getByText("кабинет сейчас недоступен")).toBeVisible();
    await expect(page.getByRole("button", { name: "повторить" })).toBeVisible();
  });

  test("истёкшая сессия возвращает к воротам и стирает токен", async ({ page }) => {
    await stubSession(page);
    await page.route("**/api/me", (r) => r.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
    await page.goto("/v2/lk");

    await expect(page.getByRole("heading", { name: "Вход для выпускников" })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("club_token"))).toBeNull();
  });

  test("на телефоне кабинет складывается в колонку без горизонтальной прокрутки", async ({ page }) => {
    await mockCabinet(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/v2/lk");

    await expect(page.locator(".club-identity-mobile summary")).toContainText("Кондратьев Сергей Андреевич");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

// Обзор остаётся компактным, полная история доступна отдельным переходом.
test("все заявки доступны из компактного обзора", async ({ page }) => {
  const orders = Array.from({ length: 6 }, (_, i) => ({ ...ORDERS[0], number: "HISTORY-" + i }));
  await mockCabinet(page, { orders, events: [] });
  await page.goto("/v2/lk");
  await expect(page.getByText("HISTORY-2", { exact: true })).toBeVisible();
  await expect(page.getByText("HISTORY-3", { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Все заявки (6)", exact: true }).click();
  await expect(page).toHaveURL(/section=orders/);
  await expect(page.getByText("HISTORY-5", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("HISTORY-5", { exact: true })).toBeVisible();
});
test("уведомления раскрываются без потери действий", async ({ page }) => {
  await mockCabinet(page, { events: [EVENTS[1], EVENTS[1], EVENTS[1], EVENTS[0]] });
  await page.goto("/v2/lk");
  await page.getByRole("button", { name: "Все уведомления (4)", exact: true }).click();
  await expect(page.getByRole("button", { name: "Принять заявку в друзья – Белов Роман Игоревич" })).toBeVisible();
});

test('общий каталог достижений целиком и в одном порядке при разном прогрессе', async ({ page }, info) => {
  const achievements = Array.from({ length: 10 }, (_, i) => ({ key: `common_${i}`, title: `Достижение ${i + 1}`, description: `Общее условие ${i + 1}`, icon: '★', kind: 'мероприятия', target: i + 1, current: 0, earned: false, star: false }));
  await mockCabinet(page, { me: { ...ME, achievements } });
  await page.goto('/v2/lk?section=achievements');
  await expect(page.locator('[data-achievement]')).toHaveCount(10);
  await page.getByRole('button', { name: 'Полученные (0)', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Коллекция ещё впереди' })).toBeVisible();
  await page.getByRole('button', { name: 'Посмотреть все достижения', exact: true }).click();
  await page.locator('[data-achievement="common_9"] summary').click();
  await expect(page.getByText('Общее условие 10', { exact: true })).toBeVisible();
  const before = await page.locator('[data-achievement]').evaluateAll(els => els.map(e => e.getAttribute('data-achievement')));
  await page.route('**/api/me', r => r.fulfill({ json: { ...ME, achievements: achievements.map((a, i) => ({ ...a, earned: i === 9, current: i === 9 ? 10 : 0 })) } }));
  await page.reload();
  await expect(page.locator('[data-achievement="common_9"]')).toContainText('получено');
  expect(await page.locator('[data-achievement]').evaluateAll(els => els.map(e => e.getAttribute('data-achievement')))).toEqual(before);
  await page.getByRole('button', { name: 'Полученные (1)', exact: true }).click();
  await expect(page.locator('[data-achievement]')).toHaveCount(1);
  await expect(page.locator('[data-achievement="common_9"]')).toBeVisible();
  await page.getByRole('button', { name: 'Все достижения (10)', exact: true }).click();
  await expect(page.locator('[data-achievement]')).toHaveCount(10);
  await page.getByRole('button', { name: 'Принять', exact: true }).click();
  await page.screenshot({ path: `/Users/macbook/alumni-staged-evidence/achievements-${info.project.name}.png`, fullPage: true });
});

test('из кабинета доступны все разделы клуба и возврат из новостей', async ({ page }) => {
  await mockCabinet(page);
  await page.goto('/v2/lk');
  const nav = page.getByRole('navigation', { name: 'Разделы клуба', exact: true });
  for (const [name, route] of [['Новости','news'],['События','events'],['ДПО','dpo'],['Мерч','merch'],['Подкасты','podcasts'],['Корзина','cart'],['Поддержка','support']]) {
    await expect(nav.getByRole('link',{name,exact:true})).toHaveAttribute('href', `/v2/${route}`);
  }
  await expect(page.getByRole('heading',{name:'Ближайшая встреча',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Новости клуба',exact:true})).toBeVisible();
  await nav.getByRole('link',{name:'Новости',exact:true}).click();
  await expect(page).toHaveURL(/\/v2\/news$/);
  await page.goBack();
  await expect(page.getByRole('heading',{name:'Мой кабинет',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
});
