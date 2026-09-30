import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: ["**/live-stack.spec.ts"],
  timeout: 30_000,
  retries: 0, // нестабильность расследуется, автоматический повтор её не скрывает
  fullyParallel: true,
  reporter: [["list"]],
  // Воркеров ограничиваем: локальный стек – один инстанс API, параллель его душит.
  workers: 4,
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost",
    screenshot: "only-on-failure",
    // Фикстуры page.route должны видеть каждый запрос. Настоящий SW проверяется отдельным runtime-набором.
    serviceWorkers: "block",
    // domcontentloaded исключает ожидание внешних шрифтов.
    navigationTimeout: 20_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // Мобильная оболочка (<768px): проверяем native app-shell.
    { name: "mobile", use: { ...devices["iPhone 13"] } },
    // Safari / WebKit – приёмка перед релизом (движок близок к iOS Safari).
    { name: "safari", use: { ...devices["Desktop Safari"] } },
    { name: "iphone-safari", use: { ...devices["iPhone 13"], defaultBrowserType: "webkit" } },
  ],
});
