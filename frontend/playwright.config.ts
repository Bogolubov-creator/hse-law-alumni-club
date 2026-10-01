import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: ["**/live-stack.spec.ts"],
  timeout: 30_000,
  retries: 0,
  fullyParallel: true,
  reporter: [["list"]],
  workers: 4,
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost",
    screenshot: "only-on-failure",
    serviceWorkers: "block",
    navigationTimeout: 20_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"] } },
    { name: "safari", use: { ...devices["Desktop Safari"] } },
    { name: "iphone-safari", use: { ...devices["iPhone 13"], defaultBrowserType: "webkit" } },
  ],
});
