// Съёмка скриншотов экранов для отчётов «до / после».
//
// Оба набора снимаются ОДНИМ скриптом с одними параметрами, иначе сравнение нечестное:
// те же вьюпорты, тот же deviceScaleFactor, та же пауза на осадку шрифтов.
//
// Запуск (стек должен быть поднят, см. README):
//   cd apps/web
//   TEST_ALUMNI_EMAIL=… TEST_ALUMNI_PASSWORD=… \
//     node ../../docs/screenshots/capture.mjs ../../docs/screenshots/before
//
// Импорт из "@playwright/test", а не из "playwright": pnpm со строгими линками
// не поднимает транзитивный пакет в node_modules приложения.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost";
const OUT = process.argv[2] || "./shots";
mkdirSync(OUT, { recursive: true });

const PUBLIC = [
  ["home", "/"],
  ["dpo", "/dpo"],
  ["merch", "/merch"],
  ["podcasts", "/podcasts"],
  ["events", "/events"],
  ["news", "/news"],
  ["cart", "/cart"],
  ["join", "/join"],
];
const PRIVATE = [["lk", "/lk"], ["profile", "/lk/profile"]];

// 360px — нижняя граница из планки качества, 1440 — типовой ноутбук.
const VIEWPORTS = [
  ["desktop", 1440, 900],
  ["mobile", 360, 780],
];

const browser = await chromium.launch();

for (const [vpName, width, height] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  for (const [name, path] of PUBLIC) {
    try {
      await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${OUT}/${vpName}-${name}.png`, fullPage: true });
      console.log(`ok   ${vpName}-${name}`);
    } catch (e) {
      console.log(`FAIL ${vpName}-${name}: ${e.message.split("\n")[0]}`);
    }
  }

  // Приватные экраны: логинимся через API и кладём токен под тем же ключом,
  // что читает фронт (TOKEN_KEY в apps/web/src/lib/cart.ts).
  try {
    const r = await ctx.request.post(BASE + "/api/auth/login", {
      data: { email: process.env.TEST_ALUMNI_EMAIL, password: process.env.TEST_ALUMNI_PASSWORD },
    });
    const body = await r.json();
    const tok = body.token;
    if (!tok) throw new Error("нет токена: " + JSON.stringify(body).slice(0, 120));
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => localStorage.setItem("club_token", t), tok);
    for (const [name, path] of PRIVATE) {
      await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${OUT}/${vpName}-${name}.png`, fullPage: true });
      console.log(`ok   ${vpName}-${name}`);
    }
  } catch (e) {
    console.log(`FAIL ${vpName}-приватные: ${e.message.split("\n")[0]}`);
  }

  await ctx.close();
}

await browser.close();
console.log("готово:", OUT);
