import type { Page } from "@playwright/test";

/**
 * Общий e2e-харнесс: гасим cookie-баннер и PWA-промпт до первой навигации,
 * чтобы WebKit/Safari не ловили клики на диалог и не зависали на «Загрузка».
 */

/** Полное согласие + скрытый install prompt (как в проде после выбора пользователя). */
export async function seedClientStorage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("club_cookie_consent", "all");
    localStorage.setItem("club_pwa_dismiss", "1");
  });
}

/** Отключает SW: иначе на WebKit page.route не видит /api (см. lk-v2). */
export async function stubSw(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "serviceWorker", { get: () => undefined });
  });
}

/** seed + stubSw – типичный beforeEach для публичных/кабинетных спек. */
export async function preparePage(page: Page): Promise<void> {
  await seedClientStorage(page);
  await stubSw(page);
}

/** Данные оболочки для UI-тестов без CMS; конкретный сценарий может переопределить ответ. */
export async function mockPublicApi(page: Page): Promise<void> {
  const responses: Record<string, unknown> = {
    "/api/cart": { items: [], count: 0, subtotal: 0 },
    "/api/pages/home": { slug: "home", title: "Главная", blocks: {} },
    "/api/programs": [], "/api/products": [], "/api/news": [], "/api/events": [],
    "/api/podcasts": { items: [], subscribed: false, sub_until: null, price: 0 },
    "/api/payments/config": { enabled: false },
  };
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "GET" && path in responses) return route.fulfill({ json: responses[path] });
    if (route.request().method() === "POST" && path === "/api/analytics/pageview") return route.fulfill({ status: 204 });
    return route.fallback();
  });
}
