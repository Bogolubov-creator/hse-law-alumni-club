import { test, expect, type Page } from "@playwright/test";

async function addProgram(page: Page): Promise<string> {
  const response = await page.request.get("/api/programs");
  expect(response.ok()).toBe(true);
  const programs = await response.json() as { slug: string; title: string; source_url: string | null; enrollment: string | null }[];
  const program = programs.find((item) => !item.source_url && item.enrollment !== "nonactual");
  expect(program, "Для проверки нужна доступная программа ДПО").toBeDefined();

  await page.goto(`/dpo/${program!.slug}`);
  await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/api/cart") && r.request().method() === "POST" && r.ok()),
    page.getByRole("button", { name: "В корзину", exact: true }).click(),
  ]);
  await page.getByRole("link", { name: "Корзина" }).click();
  await expect(page.getByText(program!.title, { exact: true })).toBeVisible();
  return program!.title;
}

test.describe("Мобильная заявка", () => {
  test.skip(({ isMobile }) => !isMobile, "Мобильный сценарий");

  test("пустая заявка ведёт к программам", async ({ page }) => {
    await page.goto("/cart");
    await expect(page.getByRole("heading", { name: "Заявка пуста" })).toBeVisible();
    await page.getByRole("button", { name: "К программам" }).click();
    await expect(page).toHaveURL(/\/dpo$/);
  });

  test("ДПО попадает в заявку без полей доставки и горизонтальной прокрутки", async ({ page }) => {
    await addProgram(page);
    await expect(page.getByRole("textbox", { name: "ФИО" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Самовывоз" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Доставка" })).toHaveCount(0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("заявка сохраняет контакты и сообщает о сбое уведомления", async ({ page }) => {
    await addProgram(page);
    await page.getByRole("button", { name: "Только необходимые" }).click();
    let submitted: Record<string, unknown> | undefined;
    await page.route("**/api/orders", async (route) => {
      submitted = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        number: "QA-000001", status: "new", member_discount: 0, subtotal: 1500000,
        total_estimate: 1500000, notified: { channel: "telegram", ok: false },
      }) });
    });

    await expect(page.getByRole("button", { name: "Отправить заявку" })).toBeDisabled();
    await page.getByRole("textbox", { name: "ФИО" }).fill("Тестовая заявка");
    await page.getByRole("textbox", { name: "Телефон" }).fill("+7 000 000-00-00");
    await page.getByRole("textbox", { name: "E-mail" }).fill("qa@example.com");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Отправить заявку" }).click();

    await expect(page.getByRole("heading", { name: "Заявка отправлена" })).toBeVisible();
    await expect(page.getByText("QA-000001")).toBeVisible();
    await expect(page.getByRole("alert")).toContainText("уведомление офиса не прошло");
    expect(submitted).toMatchObject({
      contact_fio: "Тестовая заявка", contact_email: "qa@example.com",
      fulfillment: "pickup", address: null, consent_pdn: true,
    });
  });
});
