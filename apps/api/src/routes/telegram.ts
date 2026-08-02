import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../env.js";
import { handleTelegramUpdate, type TgUpdate } from "../lib/telegram-bot.js";

const updateSchema = z.object({
  update_id: z.number(),
  message: z.object({
    message_id: z.number(),
    text: z.string().optional(),
    chat: z.object({ id: z.number(), type: z.string() }),
    from: z.object({ id: z.number(), first_name: z.string().optional() }).optional(),
  }).optional(),
}).passthrough();

/**
 * Webhook @pravohse_alumni_bot: /start, /points, /calendar, /help.
 * Токен TELEGRAM_BOT_TOKEN; опционально TELEGRAM_WEBHOOK_SECRET (заголовок
 * X-Telegram-Bot-Api-Secret-Token при setWebhook).
 */
export async function telegramRoutes(app: FastifyInstance) {
  app.post("/telegram/webhook", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!env.TELEGRAM_BOT_TOKEN) return reply.code(503).send({ error: "Telegram-бот не настроен" });
    if (env.TELEGRAM_WEBHOOK_SECRET) {
      const hdr = req.headers["x-telegram-bot-api-secret-token"];
      if (hdr !== env.TELEGRAM_WEBHOOK_SECRET) return reply.code(403).send({ error: "Forbidden" });
    }

    const update = updateSchema.parse(req.body) as TgUpdate;
    // Telegram ждёт быстрый 200 – обработку не блокируем.
    void handleTelegramUpdate(update, env.TELEGRAM_BOT_TOKEN).catch((e) => {
      app.log.error(e, "telegram webhook handler failed");
    });
    return { ok: true };
  });
}