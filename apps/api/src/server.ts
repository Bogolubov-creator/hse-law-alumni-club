import Fastify from "fastify";
import cors from "@fastify/cors";
import { env } from "./env.js";
import { checkDirectus } from "./lib/directus.js";

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

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
