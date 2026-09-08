import { test, expect } from '@playwright/test';

test('на главной Фемида, ворона открывает поддержку', async ({ page }) => {
  await page.goto('/v2');
  await expect(page.locator('.community-themis')).toBeVisible();
  await expect(page.locator('.crow-rig')).toHaveCount(0);
  await expect(page.locator('.crow-support-portrait img')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'Обратиться в поддержку' }).click();
  await expect(page).toHaveURL(/\/v2\/support/);
});
