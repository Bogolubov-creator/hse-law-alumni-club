import { test, expect } from "@playwright/test";

test("на главной Фемида, угловая ворона открывает бота поддержки", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("club_cookie_consent", "all");
    localStorage.setItem("club_pwa_dismiss", "1");
  });
  await page.goto("/");
  await expect(page.locator(".community-themis, .vestnik-themis")).toBeVisible();
  await expect(page.locator(".crow-support-portrait")).toHaveCount(0);
  await expect(page.locator(".crow-mascot.club-crow-corner")).toBeVisible({ timeout: 15000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Открыть бота поддержки" }).click();
  await expect(page.getByRole("dialog", { name: "Поддержка клуба" })).toBeVisible();
  await page.getByRole("dialog").getByRole("link", { name: "Написать человеку" }).first().click();
  await expect(page).toHaveURL(/\/support/);
});
