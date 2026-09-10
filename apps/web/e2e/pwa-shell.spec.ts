import { test, expect } from "@playwright/test";
import { preparePage } from "./harness.js";

test("PWA-оболочка: ?pwa=1 включает phone-shell и MobileApp на главной", async ({ page }) => {
  await preparePage(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/?pwa=1");
  await expect(page.locator('[data-testid="pwa-shell"]')).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/pwa-shell/);
  // На широком экране без PWA была бы HomeV2; в оболочке – табы MobileApp
  await expect(page.getByRole("navigation").getByRole("link", { name: "Карта" })).toBeVisible();
  await expect(page.getByRole("navigation").getByRole("link", { name: "ДПО" })).toBeVisible();
});
