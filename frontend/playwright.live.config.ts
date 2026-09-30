import { defineConfig, devices } from '@playwright/test';

if (process.env.E2E_LIVE_AUTHORIZED !== 'club-ci-live' || process.env.E2E_BASE_URL !== 'http://127.0.0.1:8180') {
  throw new Error('Запускайте live E2E через scripts/test-live.sh на одноразовом локальном стенде');
}
const phase = process.env.E2E_LIVE_PHASE;
if (phase !== 'write' && phase !== 'read') throw new Error('E2E_LIVE_PHASE должен быть write или read');

export default defineConfig({
  testDir: './tests/e2e', testMatch: 'live-stack.spec.ts',
  timeout: 120_000, globalTimeout: 360_000, retries: 0, workers: 1,
  fullyParallel: false, reporter: [['list']], outputDir: `test-results/live/${phase}`,
  use: {
    baseURL: process.env.E2E_BASE_URL,
    serviceWorkers: 'block', screenshot: 'only-on-failure', trace: 'off',
    navigationTimeout: 20_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
});
