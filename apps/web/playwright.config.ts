import { defineConfig, devices } from "@playwright/test";

/**
 * E2E против ЖИВОГО локального стека (docker compose up, http://localhost).
 * Стек не поднимается автоматически – тесты предполагают уже запущенный сайт
 * (как и ручные проверки). Запуск: pnpm --filter @club/web e2e
 * Данные не мутируются: заказы НЕ отправляются, логин – демо-аккаунтом (read-only).
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: 1, // сеть/анимации: один ретрай гасит флейки, настоящие падения останутся
  fullyParallel: true,
  reporter: [["list"]],
  // Воркеров ограничиваем: локальный стек – один инстанс API, параллель его душит.
  workers: 4,
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost",
    screenshot: "only-on-failure",
    // Ждём разбор HTML, а не полный "load": последний висит на внешних Google Fonts
    // и давал ложные таймауты page.goto (шрифты к проверяемой логике отношения не имеют).
    navigationTimeout: 20_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // Мобильная оболочка (<768px): проверяем native app-shell.
    { name: "mobile", use: { ...devices["iPhone 13"] } },
  ],
});
