import { test, expect } from "@playwright/test";

test("главная загружает фото героя заранее без исполняемого inline-скрипта", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('link[rel="preload"][as="image"]')).toHaveAttribute(
    "href", /\/assets\/photos\/themis-facade-full\.avif$/,
  );
  const inlineScripts = await page.locator('script:not([src]):not([type="application/ld+json"])')
    .evaluateAll((scripts) => scripts.filter((script) => !script.textContent?.includes("@react-refresh")).length);
  expect(inlineScripts).toBe(0);
});

test("на внутренних страницах фото главной не загружается заранее", async ({ page }) => {
  await page.goto("/join");
  await expect(page.locator('link[rel="preload"][as="image"]')).toHaveCount(0);
});
