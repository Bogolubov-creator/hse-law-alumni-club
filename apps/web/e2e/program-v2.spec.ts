import { test, expect, type Page } from "@playwright/test";

/**
 * Карточка программы v2 (/v2/dpo/:slug).
 *
 * Часть проверок идёт на живом каталоге, часть – на подменённом ответе
 * /api/programs/:slug. Подмена нужна не для удобства: ни у одной программы в
 * базе сейчас нет модулей и преподавателей, и без фикстуры эти секции остались
 * бы непроверенными вообще. Заодно так проверяются все три состояния действия,
 * включая закрытый набор, которого в актуальном каталоге тоже нет.
 */

const BASE = {
  id: "p1", slug: "test-program", title: "Договорное право в цифровой среде",
  direction: "Гражданское право", format: "blended", duration: "3 месяца",
  price: 9000000, enrollment: "actual", source_url: null,
  description: "Как составлять и оспаривать договоры, заключённые в электронной форме.",
  document: "Удостоверение о повышении квалификации",
  dates: { start: "1 октября 2026" },
  modules: [
    { title: "Электронная форма сделки", hours: 16, points: ["Простая письменная форма", "Электронная подпись"] },
    { title: "Оспаривание и толкование", hours: 24, points: ["Пороки воли", "Практика ВС РФ"] },
    { title: "Без раскрытия", hours: 8 },
  ],
  teachers: [
    { name: "Орлова Мария Петровна", role: "к.ю.н., доцент" },
    { name: "Гаврилов Илья Олегович" },
  ],
};

async function mockProgram(page: Page, over: Record<string, unknown> = {}) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "serviceWorker", { get: () => undefined });
  });
  await page.route("**/api/programs/test-program", (r) => r.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ ...BASE, ...over }),
  }));
}

test.describe("Программа v2", () => {
  test("реальная программа каталога открывается из витрины", async ({ page }) => {
    await page.goto("/dpo");
    const row = page.locator("article.v2-prog")
      .filter({ has: page.getByRole("button", { name: "В корзину" }) }).first();
    const title = (await row.locator("h2").innerText()).trim();
    await row.getByRole("link", { name: "Подробнее" }).click();

    await expect(page).toHaveURL(/\/dpo\/[a-z0-9-]+$/);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByRole("link", { name: "витрина дпо" })).toBeVisible();
  });

  test("модули раскрываются и схлопываются, пункты без раскрытия не кликаются", async ({ page }) => {
    await mockProgram(page);
    await page.goto("/dpo/test-program");

    await expect(page.getByText("3 модуля · 48 ак. ч.")).toBeVisible();

    // Первый модуль открыт по умолчанию – содержание видно сразу
    await expect(page.getByText("Простая письменная форма")).toBeVisible();

    // Второй раскрывается, первый закрывается: открыт всегда один
    await page.getByRole("button", { name: /Оспаривание и толкование/ }).click();
    await expect(page.getByText("Пороки воли")).toBeVisible();
    await expect(page.getByText("Простая письменная форма")).toHaveCount(0);

    // Повторный клик закрывает
    await page.getByRole("button", { name: /Оспаривание и толкование/ }).click();
    await expect(page.getByText("Пороки воли")).toHaveCount(0);

    // Модуль без пунктов не притворяется кликабельным
    await expect(page.getByRole("button", { name: /Без раскрытия/ })).toBeDisabled();
  });

  test("преподаватели показаны, роль необязательна", async ({ page }) => {
    await mockProgram(page);
    await page.goto("/dpo/test-program");
    await expect(page.getByText("Орлова Мария Петровна")).toBeVisible();
    await expect(page.getByText("к.ю.н., доцент")).toBeVisible();
    await expect(page.getByText("Гаврилов Илья Олегович")).toBeVisible();
  });

  test("бланк программы показывает данные, по которым принимают решение", async ({ page }) => {
    await mockProgram(page);
    await page.goto("/dpo/test-program");
    await expect(page.getByText("90 000 ₽")).toBeVisible();
    await expect(page.getByText("1 октября 2026")).toBeVisible();
    await expect(page.getByText("Удостоверение о повышении квалификации")).toBeVisible();
    await expect(page.getByText("48 ак. ч.").first()).toBeVisible();
  });

  test("своя программа предлагает заявку, а не сторонний сайт", async ({ page }) => {
    await mockProgram(page);
    await page.goto("/dpo/test-program");

    await expect(page.getByRole("link", { name: /hse\.ru/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Оставить заявку" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Положить в корзину" })).toBeEnabled();
  });

  test("«оставить заявку» кладёт программу в корзину и ведёт к оформлению", async ({ page }) => {
    // Здесь фикстура не годится: кнопка обращается к живой корзине, и подменённого
    // слага на сервере нет. Берём настоящую программу каталога.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "serviceWorker", { get: () => undefined });
    });
    await page.goto("/dpo");
    const row = page.locator("article.v2-prog")
      .filter({ has: page.getByRole("button", { name: "В корзину" }) }).first();
    const title = (await row.locator("h2").innerText()).trim();
    await row.getByRole("link", { name: "Подробнее" }).click();

    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/cart") && r.request().method() !== "GET" && r.ok()),
      page.getByRole("button", { name: "Оставить заявку" }).click(),
    ]);
    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.getByText(title, { exact: true })).toBeVisible();
  });

  test("программа ВШЭ уводит на маркетплейс, а не в корзину", async ({ page }) => {
    await mockProgram(page, { source_url: "https://hse.ru/edu/dpo/test" });
    await page.goto("/dpo/test-program");

    const link = page.getByRole("link", { name: /Записаться на hse\.ru/ });
    await expect(link).toHaveAttribute("href", "https://hse.ru/edu/dpo/test");
    await expect(link).toHaveAttribute("rel", /noopener/);
    await expect(page.getByRole("button", { name: "Оставить заявку" })).toHaveCount(0);
  });

  test("закрытый набор не даёт оформить заявку", async ({ page }) => {
    await mockProgram(page, { enrollment: "nonactual" });
    await page.goto("/dpo/test-program");

    await expect(page.getByText("Набор закрыт", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Оставить заявку" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Положить в корзину" })).toHaveCount(0);
  });

  test("несуществующая программа объясняет это и не индексируется", async ({ page }) => {
    await page.goto("/dpo/takoj-programmy-net");
    await expect(page.getByRole("heading", { name: "Программа не найдена" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Весь каталог программ" })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });

  test("canonical ведёт на индексируемую страницу v1", async ({ page }) => {
    await mockProgram(page);
    await page.goto("/dpo/test-program");
    // Превью не должно конкурировать в выдаче с настоящей карточкой
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/dpo\/test-program$/);
  });

  // <768px отдаёт MobileApp; адаптив ProgramV2 (aside order:-1) – на 768..900.
  test("на планшете бланк с ценой уходит над описанием, прокрутки вбок нет", async ({ page }) => {
    await mockProgram(page);
    await page.setViewportSize({ width: 820, height: 900 });
    await page.goto("/dpo/test-program");

    await expect(page.getByText("90 000 ₽")).toBeVisible();
    const [priceY, bodyY] = await page.evaluate(() => {
      const price = [...document.querySelectorAll("aside *")].find((e) => e.textContent?.includes("90 000"));
      const body = document.querySelector(".v2-prog-page > div");
      return [price?.getBoundingClientRect().top ?? 0, body?.getBoundingClientRect().top ?? 0];
    });
    expect(priceY).toBeLessThan(bodyY);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test('сбой API программы отличим от 404 и повтор восстанавливает содержание', async ({page}) => {
  let available=false;
  await page.route('**/api/programs/test-program',r=>r.fulfill({status:available?200:503,contentType:'application/json',body:JSON.stringify(available?BASE:{error:'temporarily unavailable'})}));
  await page.goto('/dpo/test-program');
  await expect(page.getByRole('heading',{name:'Не удалось загрузить программу'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Программа не найдена'})).not.toBeVisible();
  await page.screenshot({path:'/Users/macbook/alumni-staged-evidence/screenshots/program-api-error.png',fullPage:true});
  available=true;await page.getByRole('button',{name:'Повторить загрузку'}).click();
  await expect(page.getByRole('heading',{level:1,name:BASE.title})).toBeVisible();
  // Планшетный брейкпоинт ProgramV2: заголовок выше бланка, бланк выше модулей.
  await page.setViewportSize({width:820,height:900});
  const heading=await page.locator('h1').boundingBox();const price=await page.locator('.v2-prog-aside').boundingBox();
  expect(heading!.y+heading!.height).toBeLessThanOrEqual(price!.y);
  await page.screenshot({path:'/Users/macbook/alumni-staged-evidence/screenshots/program-title-before-price.png',fullPage:true});
});
