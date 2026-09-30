import { env } from "./env.js";
import { registerBotCommands } from "./lib/telegram-bot.js";
import { startTelegramPolling } from "./lib/telegram-polling.js";

/** Отдельный процесс бота: без HTTP-сервера, cron и рассылок уведомлений. */
if (!env.TELEGRAM_BOT_TOKEN || env.TELEGRAM_POLLING !== "true") {
  console.error("Для локального бота нужны TELEGRAM_BOT_TOKEN и TELEGRAM_POLLING=true");
  process.exitCode = 1;
} else {
  await registerBotCommands(env.TELEGRAM_BOT_TOKEN);
  startTelegramPolling();
}
