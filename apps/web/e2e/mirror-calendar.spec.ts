import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const base = (process.env.E2E_BASE_URL || "").replace(/\/$/, "");
test.skip(!base.includes("club-pravo-hse-mirror"), "Проверка собранного зеркала");

test("календарь скачивается, ресурсы маскота загружаются без 404 на вложенной странице", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("club_cookie_consent", "all");
    localStorage.setItem("club_pwa_dismiss", "1");
  });
  const failures: string[] = [];
  page.on("response", response => {
    if (response.status() >= 400 && response.request().resourceType() !== "document") failures.push(response.url());
  });
  await page.goto(`${base}/events/mirror-ev-1`);
  await expect(page.getByRole("heading", { name: "Встреча выпусков", exact: true })).toBeVisible();
  await expect.poll(() => page.locator(".crow-mascot img").evaluateAll(images => images.length > 0 && images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Файл .ics", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("club-event.ics");
  const text = await readFile((await download.path())!, "utf8");
  expect(text).toContain("DTSTART:20261015T160000Z");
  expect(text).toContain("SUMMARY:Встреча выпусков");
  expect(text.replace(/\r\n /g, "")).toContain(`${base}/events/mirror-ev-1`);
  expect(failures).toEqual([]);
});
