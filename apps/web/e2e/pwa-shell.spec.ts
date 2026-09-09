import { test, expect } from "@playwright/test";

test("PWA-оболочка: ?pwa=1 включает phone-shell и MobileApp на главной", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("club_cookie_consent", "all");
    localStorage.setItem("club_pwa_dismiss", "1");
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/?pwa=1");
  await expect(page.locator('[data-testid="pwa-shell"]')).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/pwa-shell/);
  // На широком экране без PWA была бы HomeV2; в оболочке – табы MobileApp
  await expect(page.getByRole("navigation").getByRole("link", { name: "Карта" })).toBeVisible();
  await expect(page.getByRole("navigation").getByRole("link", { name: "ДПО" })).toBeVisible();
});
