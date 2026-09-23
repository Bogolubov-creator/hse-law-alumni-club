import { expect, test } from "@playwright/test";

const base = process.env.E2E_BASE_URL || "http://127.0.0.1:4297/club-pravo-hse-mirror/";
const url = (path = "changes?view=act") => `${base.replace(/\/$/, "")}/${path}`;

test("поиск, чтение, возврат и прямая ссылка", async ({ page }) => {
  await page.goto(url());
  await expect(page.getByRole("status").filter({ hasText: "Найдено: 65" })).toBeVisible();
  await page.getByRole("searchbox").fill("237-ФЗ");
  await expect(page.locator(".changes-row")).toHaveCount(1);
  await page.locator(".changes-row h2 a").click();
  await expect(page.locator(".changes-reader")).toBeVisible();
  await expect(page.getByRole("link", { name: "Открыть первоисточник" })).toHaveAttribute("href", "https://publication.pravo.gov.ru/document/0001202607040026");
  await expect(page.locator(".changes-reader")).toContainText("Дата не установлена");
  const direct = page.url().split("?")[0]!;
  await page.getByRole("button", { name: "К списку изменений" }).click();
  await expect(page.getByRole("searchbox")).toHaveValue("237-ФЗ");
  await expect(page.locator(".changes-row")).toHaveCount(1);
  await page.goto(direct);
  await expect(page.locator(".changes-reader")).toContainText("акционерных обществах");
});

test("период, пагинация и сброс", async ({ page }) => {
  await page.goto(url());
  await expect(page.locator(".changes-row")).toHaveCount(20);
  await page.getByRole("button", { name: "Далее", exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await page.getByRole("button", { name: "Фильтры", exact: true }).click();
  await page.getByLabel("Опубликовано с", { exact: true }).fill("2026-07-01");
  await page.getByRole("button", { name: "Закрыть фильтры" }).click();
  await page.getByRole("button", { name: "Фильтры", exact: true }).click();
  await expect(page.getByLabel("Опубликовано с", { exact: true })).toHaveValue("");
  await page.getByLabel("Опубликовано с", { exact: true }).fill("2026-07-04");
  await page.getByLabel("Опубликовано по", { exact: true }).fill("2026-07-04");
  await page.getByRole("button", { name: "Показать результаты" }).click();
  await expect(page.locator(".changes-dialog")).not.toBeVisible();
  await expect(page).not.toHaveURL(/page=2/);
  await expect(page.locator(".changes-row time").first()).toHaveAttribute("datetime", "2026-07-04");
  await page.getByRole("button", { name: "Сбросить всё" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Найдено: 65" })).toBeVisible();
  await page.getByRole("searchbox").fill("неттакогозакона123");
  await expect(page.getByRole("heading", { name: "Совпадений нет" })).toBeVisible();
});

test("сбой архива не выдаётся за пустой результат", async ({ page }) => {
  await page.route("**/data/changes.json", route => route.fulfill({ status: 503, body: "Unavailable" }));
  await page.goto(url());
  await expect(page.getByRole("alert")).toContainText("Архив не загрузился");
  await expect(page.getByRole("status").filter({ hasText: "Результаты недоступны" })).toBeVisible();
  await page.unroute("**/data/changes.json");
  await page.getByRole("button", { name: "Повторить", exact: true }).click();
  await expect(page.locator(".changes-row")).toHaveCount(20);
});

test("главная ведёт в раздел; нет переполнения на разных ширинах", async ({ page }) => {
  await page.goto(url(""));
  await page.getByRole("link", { name: "Открыть раздел" }).click();
  await expect(page.getByRole("heading", { name: "Изменения в праве", exact: true })).toBeVisible();
  for (const width of [360, 390, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
