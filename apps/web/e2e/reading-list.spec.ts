import { test, expect } from "@playwright/test";
const base = (process.env.E2E_BASE_URL || "http://127.0.0.1:4297/club-pravo-hse-mirror").replace(/\/$/, "");
test("сохранение, перезагрузка, фильтр, удаление и отмена", async ({ page }) => {
  await page.goto(`${base}/changes/tg-9`);
  await page.getByRole("button", { name: "Только необходимые" }).click();
  const save = page.getByRole("button", { name: "Сохранить", exact: true });
  await save.click();
  await expect(page.getByRole("button", { name: "Сохранено", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.goto(`${base}/saved`);
  await expect(page.getByRole("heading", { name: /№ 941/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: /№ 941/ })).toBeVisible();
  await page.getByRole("combobox", { name: "Раздел", exact: true }).selectOption("podcast");
  await expect(page.getByRole("heading", { name: "Ничего не найдено" })).toBeVisible();
  await page.getByRole("combobox").selectOption("all");
  await page.getByRole("button", { name: /^Удалить из сохранённого:/ }).click();
  await expect(page.getByRole("heading", { name: "Сохраните первый материал" })).toBeVisible();
  await page.getByRole("button", { name: "Отменить", exact: true }).click();
  await page.getByRole("link", { name: /№ 941/ }).click();
  await expect(page.getByRole("button", { name: "Сохранено", exact: true })).toBeVisible();
});
test("отказ хранилища не отображается как сохранение", async ({ page }) => {
  await page.goto(`${base}/changes/tg-9`);
  await page.getByRole("button", { name: "Только необходимые" }).click();
  await page.evaluate(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) { if (key === "club-reading-v1") throw new Error("quota"); return original.call(this, key, value); }; });
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Не удалось сохранить");
  await expect(page.getByRole("button", { name: "Сохранить", exact: true })).toHaveAttribute("aria-pressed", "false");
});
