import Fastify from "fastify";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("../lib/telegram-bot.js", () => ({ handleTelegramUpdate: vi.fn(async () => {}) }));
const { env } = await import("../env.js");
const { telegramRoutes } = await import("./telegram.js");
const { handleTelegramUpdate } = await import("../lib/telegram-bot.js");
const original = { token: env.TELEGRAM_BOT_TOKEN, secret: env.TELEGRAM_WEBHOOK_SECRET };
afterEach(() => { env.TELEGRAM_BOT_TOKEN = original.token; env.TELEGRAM_WEBHOOK_SECRET = original.secret; vi.clearAllMocks(); });
it("webhook закрыт без секрета даже в локальном окружении", async () => {
  env.TELEGRAM_BOT_TOKEN = "test-token"; env.TELEGRAM_WEBHOOK_SECRET = "";
  const app = Fastify(); await app.register(telegramRoutes);
  const response = await app.inject({ method: "POST", url: "/telegram/webhook", payload: { update_id: 1 } });
  expect(response.statusCode).toBe(503); expect(handleTelegramUpdate).not.toHaveBeenCalled(); await app.close();
});
it("только правильный секрет допускает update", async () => {
  env.TELEGRAM_BOT_TOKEN = "test-token"; env.TELEGRAM_WEBHOOK_SECRET = "test-webhook-secret";
  const app = Fastify(); await app.register(telegramRoutes);
  for (const secret of ["", "wrong", "test-webhook-secret"]) {
    const response = await app.inject({ method: "POST", url: "/telegram/webhook", headers: { "x-telegram-bot-api-secret-token": secret }, payload: { update_id: 1 } });
    expect(response.statusCode).toBe(secret === "test-webhook-secret" ? 200 : 403);
  }
  expect(handleTelegramUpdate).toHaveBeenCalledTimes(1); await app.close();
});
