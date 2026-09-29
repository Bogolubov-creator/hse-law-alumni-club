import { afterEach, expect, it, vi } from "vitest";
vi.mock("./telegram-bot.js", () => ({ handleTelegramUpdate: vi.fn() }));
const { env } = await import("../env.js");
const { startTelegramPolling } = await import("./telegram-polling.js");
const original = { token: env.TELEGRAM_BOT_TOKEN, polling: env.TELEGRAM_POLLING };
afterEach(() => { env.TELEGRAM_BOT_TOKEN = original.token; env.TELEGRAM_POLLING = original.polling; vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it.each([
  { status: 200, body: { ok: true, result: { url: "https://example.org/api/telegram/webhook" } } },
  { status: 401, body: { ok: false } },
])("локальный polling не снимает webhook и не читает очередь при неготовности", async response => {
  env.TELEGRAM_BOT_TOKEN = "test-token"; env.TELEGRAM_POLLING = "true";
  const fetcher = vi.fn(async () => new Response(JSON.stringify(response.body), { status: response.status }));
  vi.stubGlobal("fetch", fetcher);
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  startTelegramPolling();
  await vi.waitFor(() => expect(log).toHaveBeenCalled());
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]?.[0]).toContain("/getWebhookInfo");
});
