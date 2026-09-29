import { test, expect } from "@playwright/test";

test("ворона остаётся доступной над приглашением установки", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("club_cookie_consent", "all"));
  await page.route("**/api/**", r => r.fulfill({ json: [] }));
  await page.route("**/api/podcasts", r => r.fulfill({ json: { items: [], subscribed: false, sub_until: null, price: 499900 } }));
  await page.goto("/podcasts");
  await page.evaluate(() => window.dispatchEvent(new Event("beforeinstallprompt")));
  const prompt = page.getByRole("dialog", { name: "Установка приложения" });
  await expect(prompt).toBeVisible({ timeout: 15000 });
  const hit = page.locator(".club-crow-hit");
  await expect(hit).toBeVisible();
  await expect.poll(async () => {
    const crow = await hit.boundingBox(); const banner = await prompt.boundingBox();
    return !!crow && !!banner && crow.y + crow.height <= banner.y;
  }).toBe(true);
  expect(await hit.evaluate(el => {
    const r = el.getBoundingClientRect();
    return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === el;
  })).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("crow-above-install.png") });
  await hit.click();
  await expect(page.getByRole("dialog", { name: "Поддержка клуба" })).toBeVisible();
  await expect(prompt).toBeHidden();
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await expect(hit).toBeFocused();
  await expect(prompt).toBeVisible();
  const before = (await hit.boundingBox())!.y;
  await prompt.getByRole("button", { name: "Скрыть" }).click();
  await expect(prompt).toBeHidden();
  await expect.poll(async () => (await hit.boundingBox())!.y).toBeGreaterThan(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const reduced of [false, true]) {
  test(`анимация вороны: уменьшенное движение ${reduced}`, async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
    await page.addInitScript(() => { localStorage.setItem("club_cookie_consent", "all"); localStorage.setItem("club_pwa_dismiss", "1"); });
    await page.route("**/api/**", r => r.fulfill({ json: [] }));
    await page.goto("/podcasts");
    const crow = page.locator(".crow-mascot.club-crow-corner");
    await expect(crow).toBeVisible();
    await crow.locator("img").evaluateAll(images => Promise.all(images.map(image => (image as HTMLImageElement).decode())));
    const part = crow.locator('[data-part="char"]');
    const before = await part.getAttribute("style");
    await page.waitForTimeout(300);
    const after = await part.getAttribute("style");
    if (reduced) expect(after).toBe(before); else expect(after).not.toBe(before);
    await page.screenshot({ path: testInfo.outputPath("crow-desktop.png") });
  });
}
