import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";

// Настоящий SW, изолированный HTTP-сервер; без API и пользовательской базы.
test.describe("PWA: автономный запуск и изоляция кэша", () => {
  test.use({ serviceWorkers: "allow" });
  test.describe.configure({ mode: "serial" });
  let server: Server;
  let origin: string;
  let disconnected = false;

  test.beforeAll(async () => {
    server = createServer(async (req, res) => {
      const path = new URL(req.url!, "http://localhost").pathname;
      if (disconnected) { req.socket.destroy(); return; }
      const asset = path.replace(/^\/club\//, "");
      const files: Record<string, string> = {
        "sw.js": "application/javascript", "offline.html": "text/html",
        "icon-192.png": "image/png",
      };
      if (files[asset]) {
        res.setHeader("Content-Type", files[asset]!);
        res.end(await readFile(new URL(`../public/${asset}`, import.meta.url)));
      } else if (path.includes("/api/")) {
        res.setHeader("Content-Type", "application/json");
        res.end('{"private":true}');
      } else if (path.endsWith(".svg")) {
        res.setHeader("Content-Type", "image/svg+xml");
        res.end('<svg xmlns="http://www.w3.org/2000/svg"/>');
      } else {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end('<!doctype html><html><h1>Онлайн</h1></html>');
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as { port: number };
    origin = `http://127.0.0.1:${address.port}`;
  });
  test.afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  test("обновление сохраняет чужой кэш, API и внешние пути не попадают в кэш", async ({ page }) => {
    await page.goto(`${origin}/club/`);
    await page.evaluate(async () => {
      await caches.open("another-app");
      await caches.open("club-pwa-other-scope-v1");
      await caches.open(`club-pwa-${encodeURIComponent(`${location.origin}/club/`)}-v0`);
      await navigator.serviceWorker.register("/club/sw.js");
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await page.evaluate(async () => {
      await fetch("/club/api/me");
      await fetch("/club/api/avatar.svg");
      await fetch("/other/photo.svg");
      await fetch("/club/photo.svg");
    });
    await expect.poll(() => page.evaluate(async () => {
      const name = (await caches.keys()).find((k) => k.endsWith("v7"))!;
      return (await (await caches.open(name)).keys()).map((r) => new URL(r.url).pathname);
    })).toContain("/club/photo.svg");
    const state = await page.evaluate(async () => {
      const names = await caches.keys();
      const paths = (await Promise.all(names.map(async (name) =>
        (await (await caches.open(name)).keys()).map((r) => new URL(r.url).pathname)))).flat();
      return { names, paths };
    });
    expect(state.names).toEqual(expect.arrayContaining(["another-app", "club-pwa-other-scope-v1"]));
    expect(state.names.some((k) => k.endsWith("v0"))).toBe(false);
    expect(state.paths.some((p) => p.includes("/api/") || p.startsWith("/other/"))).toBe(false);
  });

  test("незнакомый вложенный маршрут офлайн открывает сообщение и возвращается после восстановления сети", async ({ page, context, browserName }) => {
    await page.goto(`${origin}/club/`);
    await page.evaluate(async () => {
      await navigator.serviceWorker.register("/club/sw.js");
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    // WebKit не поддерживает offline-навигацию через SW в Playwright.
    // Для него рвём соединение на HTTP-сервере; Chromium отключаем полностью.
    if (browserName === "webkit") disconnected = true;
    else await context.setOffline(true);
    await page.goto(`${origin}/club/news/never-visited`);
    await expect(page.getByRole("heading", { name: "Нет подключения" })).toBeVisible();
    expect(await page.locator(".mark img").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    await expect(page).toHaveURL(`${origin}/club/news/never-visited`);
    disconnected = false;
    await context.setOffline(false);
    await page.getByRole("button", { name: "Обновить" }).click();
    await expect(page.getByRole("heading", { name: "Онлайн" })).toBeVisible();
    await expect(page).toHaveURL(`${origin}/club/news/never-visited`);
  });
});
