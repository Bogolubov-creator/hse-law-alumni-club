import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import cron from "node-cron";
import { ZodError } from "zod";
import { env } from "./env.js";
import { checkDirectus } from "./lib/directus.js";
import { contentRoutes } from "./routes/content.js";
import { pointsRoutes } from "./routes/points.js";
import { authRoutes } from "./routes/auth.js";
import { meRoutes } from "./routes/me.js";
import { cartRoutes } from "./routes/cart.js";
import { ordersRoutes } from "./routes/orders.js";
import { adminRoutes } from "./routes/admin.js";
import { communityRoutes } from "./routes/community.js";
import { paymentsRoutes } from "./routes/payments.js";
import { podcastsRoutes } from "./routes/podcasts.js";
import { avatarsRoutes } from "./routes/avatars.js";
import { eventsRoutes } from "./routes/events.js";
import { pushRoutes } from "./routes/push.js";
import { telegramRoutes } from "./routes/telegram.js";
import { registerBotCommands } from "./lib/telegram-bot.js";
import { startTelegramPolling } from "./lib/telegram-polling.js";
import { runDecay } from "./lib/engine.js";
import { runEventReminders } from "./lib/event-reminders.js";
import { initSentry, captureError } from "./lib/sentry.js";
import { syncDpoCatalog } from "./lib/hse-sync.js";

const app = Fastify({ logger: true, trustProxy: true, bodyLimit: 256 * 1024 });

// Валидационные ошибки zod → 400 (не 500).
await initSentry();

app.setErrorHandler((err, _req, reply) => {
  if (err instanceof ZodError) return reply.code(400).send({ error: "Некорректные данные", details: err.issues.map((i) => i.message) });
  app.log.error(err);
  const st = (err as { statusCode?: number }).statusCode;
  if (!st || st >= 500) captureError(err); // в Sentry — только наши падения, не 4xx клиента
  const code = (err as { statusCode?: number }).statusCode;
  // 4xx — честное сообщение (это ошибка запроса, не наша); 5xx не раскрываем.
  if (code && code < 500) return reply.code(code).send({ error: (err as Error).message || "Некорректный запрос" });
  return reply.code(500).send({ error: "Внутренняя ошибка" });
});

// Заголовки безопасности (API всегда JSON и не встраивается во фрейм).
await app.register(helmet, {
  contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
  hsts: { maxAge: 15552000, includeSubDomains: true },
});

// Персональные/платёжные ответы не должны оседать в кэшах браузера и прокси.
app.addHook("onSend", async (req, reply) => {
  const url = req.url;
  if (url.startsWith("/me") || url.startsWith("/admin") || url.startsWith("/auth") || url.startsWith("/podcasts") || url.startsWith("/orders")) {
    reply.header("Cache-Control", "no-store");
  }
});

// Предупреждения о небезопасной прод-конфигурации — видны в логах при старте.
if (env.YOOKASSA_SHOP_ID && !env.PUBLIC_URL.startsWith("https://")) {
  app.log.warn("ОПЛАТА ВКЛЮЧЕНА, но PUBLIC_URL не https:// — на проде это недопустимо (redirect после оплаты пойдёт по HTTP)");
}
if (!env.ADMIN_AUTH_SECRET) {
  app.log.warn("ADMIN_AUTH_SECRET пуст — админ-сессии подписываются общим AUTH_SECRET (на проде задайте отдельный)");
}
// Глобальный лимит запросов per-IP (на auth/оплату/заявки — жёстче, см. роуты).
// Health-пинги мониторинга не лимитируем. Ключ — реальный IP за Caddy (trustProxy).
await app.register(rateLimit, {
  max: 300,
  timeWindow: "1 minute",
  allowList: ["/health", "/ready"],
  continueExceeding: true, // упорный флуд держим в отказе, а не сбрасываем окно
});
// CORS: same-origin (без Origin) + Telegram + явный список из CORS_ORIGINS. Токены в Authorization, не в cookie.
const corsAllow = new Set([
  "https://web.telegram.org",
  "https://oauth.telegram.org",
  ...env.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
]);
await app.register(cors, {
  origin: (origin, cb) => cb(null, !origin || corsAllow.has(origin)),
  methods: ["GET", "POST", "PATCH", "DELETE"],
});
await app.register(contentRoutes);
await app.register(pointsRoutes);
await app.register(authRoutes);
await app.register(meRoutes);
await app.register(cartRoutes);
await app.register(ordersRoutes);
await app.register(adminRoutes);
await app.register(communityRoutes);
await app.register(paymentsRoutes);
await app.register(podcastsRoutes);
await app.register(avatarsRoutes);
await app.register(eventsRoutes);
await app.register(pushRoutes);
await app.register(telegramRoutes);

// Cron-decay: 03:00 первого числа каждого месяца. Идемпотентно по месяцу.
cron.schedule("0 3 1 * *", () => {
  runDecay().catch((e) => app.log.error(e, "decay failed"));
});

// Ночная автосинхронизация каталога ДПО с hse.ru (05:00). Сбой не критичен —
// каталог остаётся прежним, следующая попытка через сутки (или вручную из админки).
cron.schedule("0 5 * * *", () => {
  syncDpoCatalog()
    .then((r) => app.log.info(r, "dpo sync ok"))
    .catch((e) => app.log.error(e, "dpo sync failed"));
});

// Напоминание записавшимся за сутки до события (10:00 МСК; идемпотентно).
cron.schedule("0 10 * * *", () => {
  runEventReminders()
    .then((r) => { if (r.events) app.log.info(r, "event reminders sent"); })
    .catch((e) => app.log.error(e, "event reminders failed"));
});

// Базовый health — для healthcheck'а docker и Caddy.
app.get("/health", async () => ({
  status: "ok",
  service: "club-api",
  ts: new Date().toISOString(),
}));

// Готовность — проверяет связь с Directus сервисным токеном (критерий приёмки Фазы 0).
app.get("/ready", async (_req, reply) => {
  const directus = await checkDirectus();
  if (!directus.ok) return reply.code(503).send({ status: "degraded", directus });
  return { status: "ok", directus };
});

try {
  await app.listen({ host: "0.0.0.0", port: env.API_PORT });
  app.log.info(`club-api слушает :${env.API_PORT}`);
  if (env.TELEGRAM_BOT_TOKEN) void registerBotCommands(env.TELEGRAM_BOT_TOKEN);
  startTelegramPolling();
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
