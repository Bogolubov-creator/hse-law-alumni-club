import { test, expect } from '@playwright/test';
const out = '/Users/macbook/alumni-staged-evidence/screenshots';
for (const width of [320, 360, 390, 768, 1024, 1280, 1440, 1920]) test(`public shell and event ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  for (const route of ['/', '/events']) {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('h1')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `${out}/stage2-${route.replaceAll('/', '_')}-${width}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: 'Быстрый просмотр' }).first().click();
  const dialog = page.locator('[role="dialog"][aria-modal="true"]');
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  await expect(dialog.getByRole('button', { name: 'Закрыть' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Закрыть' }).click({ trial: true });
  const calendar = dialog.getByRole('link', { name: '.ics', exact: true });
  await calendar.scrollIntoViewIfNeeded();
  await calendar.click({ trial: true });
  expect(await page.locator('#root').evaluate(el => (el as HTMLElement).inert)).toBe(true);
  await page.keyboard.press('Tab');
  expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
  await page.screenshot({ path: `${out}/stage2-event-dialog-${width}.png` });
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Быстрый просмотр' }).first()).toBeFocused();
  await page.locator('.club-event-row h3 a').first().click();
  await expect(page).toHaveURL(/\/events\/.+/);
  await page.reload();
  await expect(page.locator('h1')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});
