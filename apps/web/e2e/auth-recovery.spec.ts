import { test, expect } from "@playwright/test";

for (const failure of ["network", "unavailable", "rate-limit"] as const) {
  test(`восстановление: ${failure} не выдаётся за отправленное письмо`, async ({ page }, testInfo) => {
    await page.addInitScript(() => localStorage.setItem("club_cookie_consent", "all"));
    await page.route("**/api/**", r => r.fulfill({ json: [] }));
    let attempts = 0;
    await page.route("**/api/auth/forgot", r => {
      attempts++;
      if (attempts > 1) return r.fulfill({ json: { ok: true } });
      return failure === "network" ? r.abort("failed") : r.fulfill({ status: failure === "unavailable" ? 503 : 429, json: { error: "Временно недоступно" } });
    });
    await page.goto("/forgot");
    await page.getByLabel("почта", { exact: true }).fill("graduate@example.com");
    await page.getByRole("button", { name: "Прислать ссылку" }).click();
    await expect(page.getByRole("alert")).toContainText("Не удалось отправить запрос");
    await expect(page.getByText("Если такой аккаунт существует", { exact: false })).toHaveCount(0);
    await expect(page.getByLabel("почта", { exact: true })).toHaveValue("graduate@example.com");
    if (failure === "unavailable") await page.locator(".club-auth__card").screenshot({ path: testInfo.outputPath("recovery-error.png") });
    await page.getByRole("button", { name: "Прислать ссылку" }).click();
    await expect(page.getByText("Если такой аккаунт существует", { exact: false })).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(attempts).toBe(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
