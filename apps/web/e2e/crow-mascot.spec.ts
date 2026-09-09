import { test, expect } from '@playwright/test';

test('на главной Фемида, ворона открывает бота поддержки', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.community-themis, .vestnik-themis')).toBeVisible();
  await expect(page.locator('.crow-rig')).toHaveCount(0);
  await expect(page.locator('.crow-support-portrait img')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Открыть бота поддержки' }).click();
  await expect(page.getByRole('dialog', { name: 'Поддержка клуба' })).toBeVisible();
  await page.getByRole('dialog').getByRole('link', { name: 'Написать человеку' }).first().click();
  await expect(page).toHaveURL(/\/support/);
});
