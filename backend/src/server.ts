import { startBackgroundJobs } from "./jobs/jobs.js";
import { restoreAdminRevocations } from "./modules/auth/auth.js";
import { buildSystemHealth } from "./observability/system-health.js";
import { supportRoutes } from "./modules/support/routes.js";
import { safeRequestLog } from "./observability/request-log.js";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { env, assertProdConfig } from "./config/env.js";
import { contentRoutes } from "./modules/content/routes.js";
import { pointsRoutes } from "./modules/gamification/routes.js";
import { authRoutes } from "./modules/auth/routes.js";
import { meRoutes } from "./modules/members/profile-routes.js";
import { cartRoutes } from "./modules/checkout/cart-routes.js";
import { ordersRoutes } from "./modules/checkout/order-routes.js";
import { adminRoutes } from "./modules/office/routes.js";
import { communityRoutes } from "./modules/members/community-routes.js";
import { paymentsRoutes } from "./modules/checkout/payment-routes.js";
import { podcastsRoutes } from "./modules/podcasts/routes.js";
import { avatarsRoutes } from "./modules/media/avatar-routes.js";
import { registerMediaRoutes } from "./modules/media/routes.js";
import { eventsRoutes } from "./modules/events/routes.js";
import { pushRoutes } from "./modules/notifications/routes.js";
import { telegramRoutes } from "./modules/telegram/routes.js";
import { pageviewRoutes } from "./modules/analytics/routes.js";
import { initSentry } from "./observability/sentry.js";
import { registerErrorHandler } from "./common/errors.js";
import { trustDockerProxy } from "./modules/auth/security.js";

// API не публикует порт на хосте (docker-compose.yml). Доверяем адресу
// Docker-прокси и только одному хопу; клиент попадает в API через Caddy.
const app = Fastify({
  logger: {
    // Подписанные ссылки и токены подтверждения не попадают в журнал URL.
    serializers: { req: safeRequestLog },
    redact: ["req.headers.authorization", "req.headers.cookie", "res.headers.set-cookie", "password", "token"],
  },
  trustProxy: trustDockerProxy, bodyLimit: 256 * 1024,
});

// Валидационные ошибки zod → 400 (не 500).
await initSentry();

// Обработчик живёт в lib/errors.ts – тем же пользуются тесты роутов.
registerErrorHandler(app);

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

// Предупреждения о небезопасной прод-конфигурации – видны в логах при старте.
if (env.YOOKASSA_SHOP_ID && !env.PUBLIC_URL.startsWith("https://")) {
  app.log.warn("ОПЛАТА ВКЛЮЧЕНА, но PUBLIC_URL не https:// – на проде это недопустимо (redirect после оплаты пойдёт по HTTP)");
}
if (!env.ADMIN_AUTH_SECRET) {
  app.log.warn("ADMIN_AUTH_SECRET пуст – админ-сессии подписываются общим AUTH_SECRET (на проде задайте отдельный)");
}
// Fail-fast: при APP_ENV=production небезопасная конфигурация прерывает старт
// (плейсхолдеры секретов, PUBLIC_URL не https, бот на webhook без секрета).
const prodErrs = assertProdConfig();
if (prodErrs.length) {
  for (const e of prodErrs) app.log.error(`[prod-config] ${e}`);
  app.log.fatal("НЕБЕЗОПАСНАЯ ПРОД-КОНФИГУРАЦИЯ (APP_ENV=production) – старт прерван");
  process.exit(1);
}
// Общий лимит учитывает NAT; health-проверки исключены.
await app.register(rateLimit, {
  max: env.RATE_LIMIT_MAX,
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
await app.register(supportRoutes);
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
await app.register(registerMediaRoutes);
await app.register(eventsRoutes);
await app.register(pushRoutes);
await app.register(telegramRoutes);
await app.register(pageviewRoutes);

let backgroundJobs: Awaited<ReturnType<typeof startBackgroundJobs>> | undefined;

// Базовый health – для healthcheck'а docker и Caddy.
app.get("/health", async () => ({
  status: "ok",
  service: "club-api",
  ts: new Date().toISOString(),
}));

// Публичный ответ не раскрывает инфраструктуру.
app.get("/ready", async (_req, reply) => {
  const result = await buildSystemHealth();
  const ready = ["storage", "database"].every(id => result.checks.find(c => c.id === id)?.status === "ok");
  reply.header("Cache-Control", "no-store");
  return reply.code(ready ? 200 : 503).send({ status: ready ? "ok" : "degraded" });
});

// Остановка ждёт завершения принятых запросов и отключает cron.
let shuttingDown = false;
async function gracefulShutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info(`${signal} получен – плавная остановка`);
  const jobsStopped = backgroundJobs?.stop();
  try {
    await app.close(); // дождаться завершения активных запросов и закрыть сервер
  } catch (e) {
    app.log.error(e, "ошибка при app.close()");
  }
  const completed = await jobsStopped;
  process.exit(completed === false ? 1 : 0);
}
process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => void gracefulShutdown("SIGINT"));

try {
  await restoreAdminRevocations();
  backgroundJobs = await startBackgroundJobs(app.log);
  await app.listen({ host: env.API_HOST, port: env.API_PORT });
  app.log.info(`club-api слушает :${env.API_PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
