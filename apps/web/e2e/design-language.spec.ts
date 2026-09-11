import { test, expect, type Page } from "@playwright/test";

/**
 * Визуальное направление: название, контраст, шкала.
 *
 * Эти три вещи разъезжаются тише всего – их не видно в диффе и не ловит tsc.
 * Название клуба жило в трёх вариантах одновременно; приглушённый серый
 * проваливал AA на 0,1 пункта; титул витрины был того же кегля, что и главной,
 * поэтому иерархии страниц не было. Тест держит зафиксированное решение.
 */

const NAME = "Клуб выпускников факультета права Вышки";

/** Витрины и главная. Кабинет и админка живут по своим правилам плотности. */
const PUBLIC_V2 = ["/", "/dpo", "/merch", "/podcasts", "/events", "/news", "/cart"];

async function stubSw(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "serviceWorker", { get: () => undefined });
  });
}

/**
 * Замер контраста прямо в браузере: цвет текста и фон под ним, как считает WCAG.
 *
 * Две тонкости, на которых легко намерить ерунду. Первая: полупрозрачный фон
 * (шапка v2 – `color-mix(... transparent)`) надо смешивать с тем, что под ним,
 * а не брать как есть. Вторая: Chromium сериализует такой цвет как
 * `color(srgb 0.98 0.95 0.91 / 0.88)` – доли единицы, а не 0–255, и наивный
 * разбор чисел даёт из светлой шапки почти чёрную.
 */
async function contrastFailures(page: Page) {
  return page.evaluate(() => {
    type RGBA = { r: number; g: number; b: number; a: number };
    const parse = (c: string): RGBA => {
      const nums = (c.match(/-?\d*\.?\d+(e-?\d+)?/gi) ?? []).map(Number);
      const scale = c.startsWith("color(") ? 255 : 1; // color() приходит в долях
      const [r = 0, g = 0, b = 0, a = 1] = nums;
      return { r: r * scale, g: g * scale, b: b * scale, a: c.startsWith("color(") ? (nums[3] ?? 1) : a };
    };
    const over = (fg: RGBA, bg: RGBA): RGBA => ({
      r: fg.r * fg.a + bg.r * (1 - fg.a),
      g: fg.g * fg.a + bg.g * (1 - fg.a),
      b: fg.b * fg.a + bg.b * (1 - fg.a),
      a: 1,
    });
    const lum = ({ r, g, b }: RGBA) => {
      const [R, G, B] = [r, g, b].map((v) => {
        const s = v / 255;
        return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      }) as [number, number, number];
      return 0.2126 * R + 0.7152 * G + 0.0722 * B;
    };
    /** Собираем стопку полупрозрачных фонов вверх по дереву до непрозрачного. */
    const bgOf = (el: Element): RGBA => {
      const stack: RGBA[] = [];
      let n: Element | null = el;
      while (n) {
        const c = parse(getComputedStyle(n).backgroundColor);
        if (c.a > 0) { stack.push(c); if (c.a >= 1) break; }
        n = n.parentElement;
      }
      let base: RGBA = { r: 255, g: 255, b: 255, a: 1 };
      for (let i = stack.length - 1; i >= 0; i--) base = over(stack[i]!, base);
      return base;
    };
    const ratio = (fg: string, bg: RGBA) => {
      const text = parse(fg);
      const composed = text.a < 1 ? over(text, bg) : text;
      const [x, y] = [lum(composed), lum(bg)].sort((p, q) => q - p) as [number, number];
      return (x + 0.05) / (y + 0.05);
    };
    const bad: { text: string; size: number; ratio: number }[] = [];
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      const text = Array.from(el.childNodes)
        .filter((n) => n.nodeType === 3 && n.textContent?.trim())
        .map((n) => n.textContent!.trim()).join(" ");
      if (!text) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      const size = parseFloat(cs.fontSize);
      const weight = parseInt(cs.fontWeight) || 400;
      // Крупный текст по WCAG: от 24px, либо от 18,66px при полужирном
      const need = size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5;
      const r = ratio(cs.color, bgOf(el));
      if (r < need) bad.push({ text: text.slice(0, 40), size, ratio: Math.round(r * 100) / 100 });
    }
    return bad;
  });
}

const minFontSize = (page: Page) => page.evaluate(() =>
  Math.min(...Array.from(document.querySelectorAll("body *"))
    .filter((e) => Array.from(e.childNodes).some((n) => n.nodeType === 3 && n.textContent?.trim()))
    .map((e) => parseFloat(getComputedStyle(e).fontSize)).filter(Boolean)));

test.describe("Название клуба", () => {
  test("в заголовке вкладки стоит ровно зафиксированное имя", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(new RegExp(NAME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    // Ни «НИУ ВШЭ», ни «Вышки» в кавычках – три варианта имени уже были
    expect(await page.title()).not.toContain("НИУ ВШЭ");
  });

  test("локап в шапке читается как полное имя клуба", async ({ page }) => {
    await page.goto("/");
    const lockup = page.getByRole("link", { name: /Клуб выпускников/ }).first();
    await expect(lockup).toContainText("Клуб выпускников");
    await expect(lockup).toContainText(/факультета права Вышки/i);
  });

  test("подвал называет клуб так же, как шапка", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(`© 2026 ${NAME}`)).toBeVisible();
  });
});

test.describe("Контраст и нижняя граница шкалы", () => {
  for (const path of PUBLIC_V2) {
    test(`${path} – весь текст проходит AA и не мельче 12px`, async ({ page }) => {
      await stubSw(page);
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect(await contrastFailures(page)).toEqual([]);
      expect(await minFontSize(page)).toBeGreaterThanOrEqual(12);
    });
  }
});

test.describe("Иерархия титулов", () => {
  test("титул главной крупнее титула витрины", async ({ page }) => {
    await page.goto("/");
    const home = await page.locator("h1").first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    await page.goto("/dpo");
    const showcase = await page.locator("h1").first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    expect(home).toBeGreaterThan(showcase);
  });

  test("титул набран фирменной плитой, а не тем же гротеском, что текст", async ({ page }) => {
    await page.goto("/dpo");
    const h1 = page.locator("h1").first();
    await expect(h1).toHaveCSS("font-family", /HSE Slab/);
    // Плита есть только в 400 и 900: промежуточные веса браузер синтезирует
    await expect(h1).toHaveCSS("font-weight", /400|900/);
    const body = await page.locator("body").evaluate((e) => getComputedStyle(e).fontFamily);
    expect(body).toContain("HSE Sans");
  });
});

test.describe("Один акцент на действие", () => {
  test("уход на hse.ru не тяжелее внутреннего перехода", async ({ page }) => {
    await page.goto("/dpo");
    await page.waitForLoadState("networkidle");
    const external = page.getByRole("link", { name: /Запись на hse\.ru/ }).first();
    if (await external.count()) {
      // Синей заливки быть не должно: институциональный синий здесь – цвет ссылки
      await expect(external).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    }
  });
});
