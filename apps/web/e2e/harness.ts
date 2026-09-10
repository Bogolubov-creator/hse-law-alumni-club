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
