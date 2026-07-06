/**
 * Одноразовая настройка webhook @pravohse_alumni_bot.
 * Требует PUBLIC_URL с https:// (Telegram не принимает localhost).
 *
 *   PUBLIC_URL=https://club.example.ru TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... \
 *     pnpm exec tsx scripts/setup-telegram-webhook.ts
 */
const token = process.env.TELEGRAM_BOT_TOKEN;
const publicUrl = (process.env.PUBLIC_URL ?? "").replace(/\/$/, "");
const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";

if (!token) {
  console.error("TELEGRAM_BOT_TOKEN не задан");
  process.exit(1);
}
if (!publicUrl.startsWith("https://")) {
  console.error("PUBLIC_URL должен быть https:// (для локали используйте туннель, напр. ngrok)");
  process.exit(1);
}

const webhookUrl = `${publicUrl}/api/telegram/webhook`;
const body: Record<string, string> = { url: webhookUrl };
if (secret) body.secret_token = secret;

const r = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const data = await r.json();
console.log(JSON.stringify(data, null, 2));
if (!data.ok) process.exit(1);
console.log(`Webhook: ${webhookUrl}`);