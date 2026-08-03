import { test, expect, type Page } from "@playwright/test";

/**
 * Профиль v2 (/v2/lk/profile) – на подменённых ответах API, как и кабинет:
 * настоящие учётные данные в тесты не кладём. Схемы ответов – прод-овские
 * zod-схемы, поэтому расхождение фикстуры с контрактом сразу видно.
 *
 * Отдельно проверяются права по 152-ФЗ: выгрузка данных и удаление аккаунта
 * с подтверждением словом. Это не косметика, урезать её при редизайне нельзя.
 */

const ME = {
  alumni: {
    fio: "Кондратьев Сергей Андреевич",
    cohort: "2019",
    verification_status: "verified",
    edu_program: "Публичное право",
    edu_level: "магистратура",
    contacts: { phone: "+7 916 000-00-00", telegram: "@kondratev" },
    interests: ["Корпоративное право"],
    avatar: null,
    referral_code: "SK-2019-4471",
    referrals_verified: 3,
    referrals_pending: 1,
  },
  level: { points: 480, level: "2", level_title: "Активный выпускник", discount: 10, next_level: "Амбассадор", to_next: 220 },
  achievements: [
    { key: "first_order", title: "Первая заявка", description: "Оформлена первая заявка в клубе", earned: true, current: 1, target: 1, icon: "📄", kind: "count", star: false },
    { key: "friends_5", title: "Пятеро однокурсников", description: "Добавить пятерых однокурсников в друзья", earned: false, current: 2, target: 5, icon: "👥", kind: "count", star: false },
  ],
  activity: [],
};

const LEDGER = [
  { id: "l1", delta: 300, reason: "program", ref: null, comment: null, created_at: "2026-05-14T10:00:00.000Z" },
  { id: "l2", delta: -50, reason: "decay", ref: null, comment: null, created_at: "2026-03-01T10:00:00.000Z" },
];

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

async function mockProfile(page: Page, over: Partial<Record<"me" | "ledger", unknown>> = {}) {
  const json = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  await page.route("**/api/me", (r) => r.fulfill(json(over.me ?? ME)));
  await page.route("**/api/me/ledger", (r) => r.fulfill(json(over.ledger ?? LEDGER)));
  await stubSession(page);
}

test.describe("Профиль v2", () => {
  test("гостя уводит на вход, а не показывает пустую форму", async ({ page }) => {
    await page.goto("/v2/lk/profile");
    await expect(page.getByRole("heading", { name: "Вход для выпускников" })).toBeVisible();
    await expect(page).toHaveURL(/\/v2\/lk$/);
  });

  test("контакты, история баллов и правила достижений заполнены данными", async ({ page }) => {
    await mockProfile(page);
    await page.goto("/v2/lk/profile");

    // Удостоверение
    await expect(page.getByText("Кондратьев Сергей Андреевич")).toBeVisible();
    await expect(page.getByText("подтверждён")).toBeVisible();
    await expect(page.getByRole("button", { name: "загрузить фото" })).toBeVisible();

    // Форма приходит заполненной с сервера, а не пустой
    await expect(page.getByLabel("фио")).toHaveValue("Кондратьев Сергей Андреевич");
    await expect(page.getByLabel("телефон")).toHaveValue("+7 916 000-00-00");
    await expect(page.getByLabel("telegram")).toHaveValue("@kondratev");
    await expect(page.getByLabel("почта")).toHaveValue("");

    // Выбранный интерес отмечен
    await expect(page.getByRole("button", { name: "Корпоративное право" })).toHaveAttribute("aria-pressed", "true");

    // История: начисление и списание с разными знаками
    await expect(page.getByText("Пройдена программа ДПО")).toBeVisible();
    await expect(page.getByText("+300")).toBeVisible();
    await expect(page.getByText("Списание за неактивность")).toBeVisible();
    await expect(page.getByText("-50")).toBeVisible();

    // Правила достижений: описание видно, прогресс посчитан
    await expect(page.getByText("Оформлена первая заявка в клубе")).toBeVisible();
    await expect(page.getByText("2 / 5")).toBeVisible();
  });

  test("сохранение отправляет введённые данные на сервер", async ({ page }) => {
    await mockProfile(page);
    let sent: Record<string, unknown> | null = null;
    await page.route("**/api/me/profile", (r) => {
      sent = r.request().postDataJSON();
      return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    await page.goto("/v2/lk/profile");

    await page.getByLabel("почта").fill("new@mail.ru");
    await page.getByRole("button", { name: "сохранить" }).click();

    await expect(page.getByRole("button", { name: "сохранено" })).toBeVisible();
    expect(sent).toBeTruthy();
    expect((sent as unknown as { contacts: Record<string, string> }).contacts.email).toBe("new@mail.ru");
    expect((sent as unknown as { fio: string }).fio).toBe("Кондратьев Сергей Андреевич");
  });

  test("лимит интересов не даёт выбрать лишнее", async ({ page }) => {
    // MAX_INTERESTS = 8: восемь уже выбрано, девятый должен быть недоступен
    const chosen = ["Корпоративное право", "M&A и сделки", "Гражданское право", "Публичное право",
      "Налоговое право", "Банкротство", "Разрешение споров", "Арбитраж и медиация"];
    await mockProfile(page, { me: { ...ME, alumni: { ...ME.alumni, interests: chosen } } });
    await page.goto("/v2/lk/profile");

    await expect(page.getByText("выбрано 8 из 8")).toBeVisible();
    await expect(page.getByRole("button", { name: chosen[0] })).toBeEnabled();
    await expect(page.getByRole("button", { name: "LegalTech" })).toBeDisabled();
  });

  test("152-ФЗ: удаление требует точного слова подтверждения", async ({ page }) => {
    await mockProfile(page);
    await page.goto("/v2/lk/profile");

    await expect(page.getByRole("button", { name: "скачать мои данные (json)" })).toBeVisible();
    await page.getByRole("button", { name: "удалить мой аккаунт" }).click();

    const del = page.getByRole("button", { name: "удалить навсегда" });
    await expect(del).toBeDisabled();
    await page.getByLabel(/Введите/).fill("удалить");
    await expect(del).toBeDisabled(); // регистр важен
    await page.getByLabel(/Введите/).fill("УДАЛИТЬ");
    await expect(del).toBeEnabled();

    await page.getByRole("button", { name: "отмена" }).click();
    await expect(del).toHaveCount(0);
  });

  test("истёкшая сессия возвращает ко входу и стирает токен", async ({ page }) => {
    await stubSession(page);
    await page.route("**/api/me", (r) => r.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
    await page.goto("/v2/lk/profile");

    await expect(page.getByRole("heading", { name: "Вход для выпускников" })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("club_token"))).toBeNull();
  });

  test("на телефоне профиль складывается в колонку без горизонтальной прокрутки", async ({ page }) => {
    await mockProfile(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/v2/lk/profile");

    await expect(page.getByLabel("фио")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
