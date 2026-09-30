import { setTimeout as delay } from "node:timers/promises";
import { env } from "../../config/env.js";
import { handleTelegramUpdate, type TgUpdate } from "./telegram-bot.js";

/**
 * Long-polling для @pravohse_alumni_bot – режим без публичного HTTPS (локальный
 * стенд, dev). Включается TELEGRAM_POLLING=true; на проде вместо него ставится
 * webhook (scripts/setup-telegram-webhook.ts), одновременно они не работают –
 * при настроенном webhook polling не запускается и не меняет его.
 */
export function startTelegramPolling(): () => Promise<void> {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token || env.TELEGRAM_POLLING !== "true") return async () => {};
  const controller = new AbortController();

  const api = (method: string, body?: unknown) =>
    fetch(`https://api.telegram.org/bot${token}/${method}`, {
      signal: controller.signal,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });

  let offset = 0;
  const work = (async () => {
    // Локальный запуск не должен отключать уже работающий сервер.
    try {
      const response = await api("getWebhookInfo");
      const info = await response.json() as { ok: boolean; result?: { url: string } };
      if (!response.ok || !info.ok || !info.result || info.result.url) {
        console.error("[telegram-bot] polling не запущен: проверьте токен и отсутствие webhook");
        return;
      }
    } catch {
      console.error("[telegram-bot] не удалось проверить webhook; polling не запущен");
      return;
    }
    console.log("[telegram-bot] long-polling запущен");
    while (!controller.signal.aborted) {
      try {
        const r = await api("getUpdates", { offset, timeout: 25, allowed_updates: ["message", "message_reaction"] });
        if (!r.ok) { await delay(5000, undefined, { signal: controller.signal }).catch(() => {}); continue; }
        const data = (await r.json()) as { ok: boolean; result?: TgUpdate[] };
        for (const u of data.result ?? []) {
          if (controller.signal.aborted) break;
          await handleTelegramUpdate(u, token);
          offset = u.update_id + 1;
        }
      } catch {
        if (controller.signal.aborted) break;
        console.error("[telegram-bot] polling request failed");
        await delay(5000, undefined, { signal: controller.signal }).catch(() => {});
      }
    }
  })();
  return async () => { controller.abort(); await work; };
}
