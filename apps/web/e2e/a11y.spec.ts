import { test, expect, type Page } from "@playwright/test";
import { preparePage, stubSw } from "./harness.js";

/**
 * Доступность: WCAG 2.1 AA на публичном контуре.
 *
 * Текстовый контраст и нижняя граница шкалы проверяются в
 * `design-language.spec.ts`. Здесь – то, что легко теряется при правках
 * вёрстки: пропуск блоков, контур элементов управления и версия для
 * слабовидящих. Последняя особенно: её ломает любое новое правило, потому что
 * работает она агрессивным переопределением всего подряд.
 */

const V2 = ["/", "/dpo", "/cart", "/join"];
/** Экраны входа обходятся без ссылки-пропуска: повторяющегося блока навигации
 *  там нет, пропускать нечего – требование 2.4.1 к ним не применяется. */
const V2_WITH_NAV = ["/", "/dpo", "/cart"];

/** Композит цвета с учётом прозрачности: полупрозрачный контур смешивается с фоном. */
const CONTRAST_FN = `
  const parse = (c) => {
    const n = (c.match(/-?\\d*\\.?\\d+/g) || []).map(Number);
    const sc = c.startsWith("color(") ? 255 : 1;
    return { r: n[0] * sc, g: n[1] * sc, b: n[2] * sc, a: n[3] ?? 1 };
  };
  const over = (f, b) => ({ r: f.r*f.a + b.r*(1-f.a), g: f.g*f.a + b.g*(1-f.a), b: f.b*f.a + b.b*(1-f.a), a: 1 });
  const lum = ({ r, g, b }) => { const [R,G,B] = [r,g,b].map(v => { v/=255; return v <= 0.04045 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); }); return 0.2126*R + 0.7152*G + 0.0722*B; };
  const bgOf = (el) => { const st = []; let n = el;
    while (n) { const c = parse(getComputedStyle(n).backgroundColor); if (c.a > 0) { st.push(c); if (c.a >= 1) break; } n = n.parentElement; }
    let base = { r:255, g:255, b:255, a:1 };
    for (let i = st.length - 1; i >= 0; i--) base = over(st[i], base);
    return base; };
  const ratio = (fg, bg) => { const f = parse(fg); const c = f.a < 1 ? over(f, bg) : f;
    const [x, y] = [lum(c), lum(bg)].sort((a, b) => b - a); return (x + 0.05) / (y + 0.05); };
`;


/** Включает версию для слабовидящих: на телефоне переключатель лежит в меню. */
async function enableVision(page: Page) {
  await page.locator("#main").waitFor();
  const burger = page.getByLabel("Открыть меню");
  if (await burger.isVisible().catch(() => false)) await burger.click();
  // На телефоне кнопка есть и в скрытой десктопной строке – берём видимую
  await page.getByLabel("Версия для слабовидящих").locator("visible=true").first().click();
}

test.describe("2.4.1 Пропуск блоков", () => {
  // WebKit в Playwright не двигает фокус по Tab без «полного доступа с
  // клавиатуры» – это модель ввода движка, а не дефект страницы. Клавиатурные
  // проверки живут в desktop-проекте, а мобильный остаётся на touch.
  test.skip(({ browserName }) => browserName === "webkit", "Tab в WebKit требует Full Keyboard Access");

  for (const path of V2_WITH_NAV) {
    test(`${path} – первая остановка табуляции ведёт к содержанию`, async ({ page }) => {
      await preparePage(page);
      await page.goto(path);
      await page.locator("#main").waitFor();
      await page.keyboard.press("Tab");
      // Ссылка выезжает переходом 140ms – замер сразу поймал бы её на полпути
      await page.waitForTimeout(300);
      const active = await page.evaluate(() => {
        const a = document.activeElement as HTMLAnchorElement;
        return { tag: a?.tagName, href: a?.getAttribute("href"), text: a?.textContent?.trim(), top: Math.round(a?.getBoundingClientRect().top ?? -999) };
      });
      expect(active.tag).toBe("A");
      expect(active.href).toBe("#main");
      // Появляется только при фокусе: мышью её быть не должно
      expect(active.top).toBeGreaterThan(0);
      // Якорь существует, иначе ссылка ведёт в никуда
      expect(await page.locator("#main").count()).toBeGreaterThan(0);
    });
  }
});

test.describe("1.4.11 Контраст нетекстовых элементов", () => {
  // Одна светлая тема (решение заказчика 12.09); тёмные панели живут областью .club-dark.
  for (const theme of ["light"] as const) {
    test(`контур полей и кнопок различим, тема ${theme}`, async ({ page }) => {
      await preparePage(page);
      await page.goto("/join");
      await page.locator("#main").waitFor();
      const bad = await page.evaluate(`(() => {
        ${CONTRAST_FN}
        const bad = [];
        for (const el of document.querySelectorAll("input, select, textarea, button")) {
          const cs = getComputedStyle(el);
          if (parseFloat(cs.borderTopWidth) < 0.5) continue;
          const own = parse(cs.backgroundColor);
          const around = bgOf(el.parentElement || document.body);
          // Элемент опознают либо по заливке, либо по контуру – достаточно одного.
          // Белая кнопка на кости не различима заливкой, но различима рамкой.
          const byFill = own.a >= 1 ? ratio(cs.backgroundColor, around) : 0;
          const byBorder = ratio(cs.borderTopColor, around);
          const r = Math.max(byFill, byBorder);
          if (r < 3) bad.push({ el: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 24), r: Math.round(r * 100) / 100 });
        }
        return bad;
      })()`);
      expect(bad).toEqual([]);
    });
  }
});

test.describe("Версия для слабовидящих", () => {
  const schemes = [
    { key: "bw", name: "чёрным по белому" },
    { key: "wb", name: "белым по чёрному" },
    { key: "bb", name: "тёмно-синим по бежевому" },
  ];

  /**
   * Индикатор фокуса здесь ломался: охряная обводка на бежевой схеме давала
   * 1,97:1, и человек не видел, где он находится – в режиме, которым как раз
   * и пользуются при слабом зрении.
   */
  for (const s of schemes) {
    test(`${s.name}: обводка фокуса различима`, async ({ page, browserName }) => {
      test.skip(browserName === "webkit", "Tab в WebKit требует Full Keyboard Access");
      await preparePage(page);
      await page.goto("/dpo");
      await enableVision(page);
      await page.evaluate((k) => document.documentElement.setAttribute("data-vis-scheme", k), s.key);
      // Только клавиатура: программный focus() не включает :focus-visible,
      // и обводки в замере не оказалось бы – ровно та ловушка, из-за которой
      // дефект и жил незамеченным.
      for (let i = 0; i < 12; i++) {
        await page.keyboard.press("Tab");
        if (await page.evaluate(() => document.activeElement?.classList.contains("vis-btn"))) break;
      }
      const res = await page.evaluate(`(() => {
        ${CONTRAST_FN}
        const el = document.activeElement;
        const cs = getComputedStyle(el);
        const hex = getComputedStyle(document.documentElement).getPropertyValue("--vis-bg").trim();
        const bg = { r: parseInt(hex.slice(1,3),16), g: parseInt(hex.slice(3,5),16), b: parseInt(hex.slice(5,7),16), a: 1 };
        return { ratio: Math.round(ratio(cs.outlineColor, bg) * 100) / 100, width: parseFloat(cs.outlineWidth), style: cs.outlineStyle };
      })()`) as { ratio: number; width: number; style: string };
      expect(res.ratio).toBeGreaterThanOrEqual(3);
      expect(res.width).toBeGreaterThanOrEqual(2);
      expect(res.style).toBe("solid");
    });
  }

  test("все органы управления панели получают обводку фокуса", async ({ page }) => {
    await preparePage(page);
    await page.goto("/dpo");
    await enableVision(page);
    const without = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".vis-bar button, .vis-bar a, .vis-bar select")]
        .filter((c) => !c.classList.contains("foc"))
        .map((c) => (c.getAttribute("aria-label") || c.textContent || "").trim()));
    expect(without).toEqual([]);
  });

  /**
   * Универсальное правило версии снимает фон со всего подряд. Диалогу это
   * оставляло текст висеть поверх страницы: cookie-баннер накрывал фильтры.
   * Согласие специально НЕ гасим – нужен живой dialog.
   */
  test("у диалога остаётся непрозрачный фон", async ({ page }) => {
    await stubSw(page);
    await page.goto("/dpo");
    await enableVision(page);
    const d = await page.evaluate(() => {
      const el = document.querySelector('[role="dialog"]');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, border: parseFloat(cs.borderTopWidth) };
    });
    expect(d, "cookie-баннер должен быть на странице").not.toBeNull();
    expect(d!.bg).not.toBe("rgba(0, 0, 0, 0)");
    expect(d!.border).toBeGreaterThan(0);
  });
});

test.describe("1.3.1 Структура страницы", () => {
  for (const path of V2) {
    test(`${path} – ориентиры и заголовки на месте`, async ({ page }) => {
      await preparePage(page);
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const s = await page.evaluate(() => {
        const hs = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) => +h.tagName[1]!);
        let skips = 0;
        for (let i = 1; i < hs.length; i++) if (hs[i]! - hs[i - 1]! > 1) skips++;
        return {
          main: document.querySelectorAll("main").length,
          h1: hs.filter((x) => x === 1).length,
          skips,
          imgNoAlt: [...document.querySelectorAll("img")].filter((i) => i.getAttribute("alt") === null).length,
        };
      });
      expect(s.main).toBe(1);
      expect(s.h1).toBe(1);
      expect(s.skips, "уровень заголовка не перепрыгивается").toBe(0);
      expect(s.imgNoAlt, "у картинки должен быть alt, пустой для декоративной").toBe(0);
    });
  }
});

test.describe("Доступ к версии для слабовидящих", () => {
  test("режим включается и с телефона, и с десктопа", async ({ page, isMobile }) => {
    // На узком viewport /events остаётся SiteShell (не MobileApp takeover).
    const path = isMobile ? "/events" : "/dpo";
    await preparePage(page);
    await page.goto(path);
    await enableVision(page);
    await expect(page.locator("html.vis")).toHaveCount(1);
    await expect(page.locator(".vis-bar")).toBeVisible();
  });
});
