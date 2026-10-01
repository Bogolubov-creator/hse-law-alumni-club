import type { Page } from "@playwright/test";


export async function seedClientStorage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("club_cookie_consent", "all");
    localStorage.setItem("club_pwa_dismiss", "1");
  });
}

export async function stubSw(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "serviceWorker", { get: () => undefined });
  });
}

export async function preparePage(page: Page): Promise<void> {
  await seedClientStorage(page);
  await stubSw(page);
}

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
