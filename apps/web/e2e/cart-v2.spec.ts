import { test, expect, type Page } from "@playwright/test";

/**
 * Корзина v2 (/v2/cart).
 *
 * Наполнение корзины идёт через ЖИВОЙ API – это проверяет реальную связку
 * витрина → корзина → суммы. Подменяется только POST /api/orders: заявка
 * улетела бы настоящему учебному офису, а тесты не должны создавать работу
 * живым людям (в playwright.config это и записано: заказы не отправляем).
 *
 * SW отключаем по той же причине, что и в приватных сюитах: мобильный проект
 * бежит на WebKit, где запросы через активный service worker до page.route()
 * не доходят и подмена молча пролетает на живой API.
 */

async function stubSw(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "serviceWorker", { get: () => undefined });
  });
}

/**
 * Кладёт в корзину первую СВОЮ программу каталога и возвращает её название.
 *
 * Именно «свою»: у программ с source_url вместо «В корзину» стоит «Запись на
 * hse.ru» – они продаются на маркетплейсе Вышки, а не у нас. Брать просто
 * первую строку нельзя, порядок каталога задаётся в админке.
 */
async function addProgram(page: Page): Promise<string> {
  await page.goto("/v2/dpo");
  const row = page.locator("article.v2-prog")
    .filter({ has: page.getByRole("button", { name: "В корзину" }) })
    .first();
  await expect(row).toBeVisible();
  const title = (await row.locator("h2").innerText()).trim();
  // Ждём ответ API, а не счётчик в шапке: на телефоне шапка сворачивается
  // в бургер и ссылки «Корзина» в DOM просто нет.
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/cart") && r.request().method() !== "GET" && r.ok()),
    row.getByRole("button", { name: "В корзину" }).click(),
  ]);
  return title;
}

const ORDER = {
  number: "ORD-000999", status: "new", member_discount: 0,
  subtotal: 1500000, total_estimate: 1500000,
  notified: { channel: "telegram", ok: true },
};

test.describe("Корзина v2", () => {
  test.beforeEach(async ({ page }) => { await stubSw(page); });

  test("пустая корзина ведёт в витрины v2, а не в старые", async ({ page }) => {
    await page.goto("/v2/cart");
    await expect(page.getByRole("heading", { name: "В корзине пока пусто" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Программы ДПО" })).toHaveAttribute("href", "/v2/dpo");
    await expect(page.getByRole("link", { name: "Одежда клуба" })).toHaveAttribute("href", "/v2/merch");
  });

  test("добавленная программа попадает в опись, суммы сходятся", async ({ page }) => {
    const title = await addProgram(page);
    await page.goto("/v2/cart");

    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await expect(page.getByText("1 место")).toBeVisible();

    // Итог совпадает с подытогом: гостю скидка выпускника не положена
    const sub = await page.getByText("подытог").locator("xpath=following-sibling::*[1]").innerText();
    const total = await page.getByText("итого (справочно)").locator("xpath=following-sibling::*[1]").innerText();
    expect(total).toBe(sub);
    await expect(page.getByText(/скидка выпускника/)).toHaveCount(0);
  });

  test("выбор получения не показывается, когда доставлять нечего", async ({ page }) => {
    await addProgram(page);
    await page.goto("/v2/cart");
    // В корзине одни программы – самовывоз/доставка и адрес только сбивали бы с толку
    await expect(page.getByRole("button", { name: "самовывоз" })).toHaveCount(0);
    await expect(page.getByText("адрес доставки")).toHaveCount(0);
  });

  test("позицию можно убрать, корзина становится пустой", async ({ page }) => {
    const title = await addProgram(page);
    await page.goto("/v2/cart");
    await page.getByRole("button", { name: `Убрать из корзины: ${title}` }).click();
    await expect(page.getByRole("heading", { name: "В корзине пока пусто" })).toBeVisible();
  });

  test("без согласия на обработку данных заявку не отправить", async ({ page }) => {
    await addProgram(page);
    await page.goto("/v2/cart");

    const submit = page.getByRole("button", { name: "Нужно согласие на обработку данных" });
    await expect(submit).toBeDisabled();

    await page.getByRole("checkbox").check();
    await expect(page.getByRole("button", { name: "Оформить заявку" })).toBeEnabled();
  });

  test("заявка уходит с введёнными контактами и показывает номер", async ({ page }) => {
    await addProgram(page);

    let sent: Record<string, unknown> | null = null;
    await page.route("**/api/orders", (r) => {
      sent = r.request().postDataJSON();
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ORDER) });
    });

    await page.goto("/v2/cart");
    await page.getByLabel("фио").fill("Орлова Мария Петровна");
    await page.getByLabel("телефон").fill("+7 916 000-00-00");
    await page.getByLabel("почта").fill("orlova@example.com");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Оформить заявку" }).click();

    await expect(page.getByRole("heading", { name: "Учебный офис получил заявку" })).toBeVisible();
    await expect(page.getByText("ORD-000999")).toBeVisible();

    const body = sent as unknown as Record<string, unknown>;
    expect(body.contact_fio).toBe("Орлова Мария Петровна");
    expect(body.contact_email).toBe("orlova@example.com");
    expect(body.consent_pdn).toBe(true);
    expect(body.website).toBe(""); // honeypot остаётся пустым у живого человека
    expect(body.fulfillment).toBe("pickup");
  });

  test("непрошедшее уведомление офиса показывается, а не скрывается", async ({ page }) => {
    await addProgram(page);
    await page.route("**/api/orders", (r) => r.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ ...ORDER, notified: { channel: "telegram", ok: false } }),
    }));

    await page.goto("/v2/cart");
    await page.getByLabel("фио").fill("Орлова Мария Петровна");
    await page.getByLabel("телефон").fill("+7 916 000-00-00");
    await page.getByLabel("почта").fill("orlova@example.com");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Оформить заявку" }).click();

    await expect(page.getByRole("alert")).toContainText("уведомление офиса не прошло");
    await expect(page.getByRole("link", { name: "@pravohse" })).toBeVisible();
  });

  test("ошибка сервера показывается, корзина не теряется", async ({ page }) => {
    await addProgram(page);
    await page.route("**/api/orders", (r) => r.fulfill({
      status: 400, contentType: "application/json", body: JSON.stringify({ error: "Проверьте телефон" }),
    }));

    await page.goto("/v2/cart");
    await page.getByLabel("фио").fill("Орлова Мария Петровна");
    await page.getByLabel("телефон").fill("нет");
    await page.getByLabel("почта").fill("orlova@example.com");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Оформить заявку" }).click();

    await expect(page.getByRole("alert")).toContainText("Проверьте телефон");
    await expect(page.getByText("подытог")).toBeVisible();
  });

  test("на телефоне корзина складывается без горизонтальной прокрутки", async ({ page }) => {
    await addProgram(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/v2/cart");

    await expect(page.getByLabel("фио")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
