import Fastify from "fastify";
import cors from "@fastify/cors";
import cron from "node-cron";
import { env } from "./env.js";
import { checkDirectus } from "./lib/directus.js";
import { contentRoutes } from "./routes/content.js";
import { pointsRoutes } from "./routes/points.js";
import { authRoutes } from "./routes/auth.js";
import { meRoutes } from "./routes/me.js";
import { runDecay } from "./lib/engine.js";

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });
await app.register(contentRoutes);
await app.register(pointsRoutes);
await app.register(authRoutes);
await app.register(meRoutes);

// Cron-decay: 03:00 первого числа каждого месяца. Идемпотентно по месяцу.
cron.schedule("0 3 1 * *", () => {
  runDecay().catch((e) => app.log.error(e, "decay failed"));
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
