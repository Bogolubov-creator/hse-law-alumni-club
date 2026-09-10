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

test("PWA deep link /lk: оболочка не ломает кабинет", async ({ page }) => {
  await preparePage(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/lk?pwa=1");
  await expect(page.locator('[data-testid="pwa-shell"]')).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/pwa-shell/);
  // /lk не в MobileApp takeover – Gate/кабинет внутри PwaShell
  await expect(page.getByRole("heading", { name: "Вход для выпускников" })).toBeVisible({ timeout: 15_000 });
});

test("PWA meta: apple-touch-icon, theme-color, capable", async ({ page }) => {
  await preparePage(page);
  await page.goto("/");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#EC5A13");
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute("content", "yes");
  await expect(page.locator('link[rel="apple-touch-icon"][sizes="180x180"]')).toHaveAttribute("href", /icon-180\.png/);
  await expect(page.locator('link[rel="apple-touch-icon"][sizes="167x167"]')).toHaveAttribute("href", /icon-167\.png/);
  await expect(page.locator('link[rel="apple-touch-icon"][sizes="152x152"]')).toHaveAttribute("href", /icon-152\.png/);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", /manifest\.webmanifest/);
});

test("offline.html: относительная иконка и theme-color", async ({ page }) => {
  await preparePage(page);
  const res = await page.goto("/offline.html");
  expect(res?.ok()).toBeTruthy();
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#EC5A13");
  const src = await page.locator(".mark img").getAttribute("src");
  expect(src).toMatch(/^\.\/icon-192\.png$/);
  expect(src).not.toMatch(/^\/assets\//);
});

test("manifest: relative start_url/scope и shortcut /lk", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBeTruthy();
  const manifest = await res.json();
  expect(manifest.start_url).toMatch(/^\.\//);
  expect(manifest.scope).toMatch(/^\.\//);
  expect(manifest.theme_color).toBe("#EC5A13");
  const lk = (manifest.shortcuts || []).find((s: { url?: string }) => String(s.url || "").includes("lk"));
  expect(lk?.url).toMatch(/^\.\/lk/);
  for (const icon of manifest.icons || []) {
    expect(String(icon.src)).toMatch(/^\.\//);
  }
});
