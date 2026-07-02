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
import { runDecay } from "./lib/engine.js";
import { syncDpoCatalog } from "./lib/hse-sync.js";

const app = Fastify({ logger: true, trustProxy: true, bodyLimit: 256 * 1024 });

// Валидационные ошибки zod → 400 (не 500).
app.setErrorHandler((err, _req, reply) => {
  if (err instanceof ZodError) return reply.code(400).send({ error: "Некорректные данные", details: err.issues.map((i) => i.message) });
  app.log.error(err);
  const code = (err as { statusCode?: number }).statusCode;
  return reply.code(code && code < 500 ? code : 500).send({ error: "Внутренняя ошибка" });
});

// Заголовки безопасности (API всегда JSON и не встраивается во фрейм).
await app.register(helmet, {
  contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
  hsts: { maxAge: 15552000, includeSubDomains: true },
});
// Глобальный лимит запросов (на auth-роуты — жёстче, см. сами роуты).
await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
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
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
