import type { FastifyInstance } from "fastify";
import { readItems } from "@directus/sdk";
import { z } from "zod";
import { directusCredsValid, findUserByEmail, findAlumniByUser, signSession } from "../lib/auth.js";
import { directus } from "../lib/directus.js";
import { env } from "../env.js";
import { validateInitData } from "../lib/telegram.js";

export async function authRoutes(app: FastifyInstance) {
  // Вход через Telegram Mini App (initData). BLOCKED без TELEGRAM_BOT_TOKEN.
  app.post("/auth/telegram", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!env.TELEGRAM_BOT_TOKEN) return reply.code(503).send({ error: "Telegram mini-app не настроен (нет TELEGRAM_BOT_TOKEN)" });
    const { initData } = z.object({ initData: z.string().min(1) }).parse(req.body);
    const v = validateInitData(initData, env.TELEGRAM_BOT_TOKEN, { maxAgeSec: 86400 });
    if (!v.ok) return reply.code(401).send({ error: "Невалидная подпись Telegram" });
    const tgId = String((v.user as any)?.id ?? "");
    const rows = (await directus.request(readItems("alumni", {
      filter: { telegram_id: { _eq: tgId } }, limit: 1,
      fields: ["id", "fio", "cohort", "verification_status"],
    }))) as any[];
    const alumni = rows[0];
    if (!alumni) return reply.code(404).send({ error: "Профиль выпускника не привязан к Telegram" });
    return { token: signSession(alumni.id, tgId), alumni: { fio: alumni.fio, cohort: alumni.cohort, verification_status: alumni.verification_status } };
  });

  // Логин выпускника: креды проверяет Directus, сессию (JWT с alumni_id) выдаёт apps/api.
  app.post("/auth/login", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req, reply) => {
    const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
    if (!(await directusCredsValid(email, password))) return reply.code(401).send({ error: "Неверная почта или пароль" });
    const user = await findUserByEmail(email);
    if (!user) return reply.code(401).send({ error: "Пользователь не найден" });
    const alumni = await findAlumniByUser(user.id);
    if (!alumni) return reply.code(403).send({ error: "Аккаунт не привязан к профилю выпускника" });
    const token = signSession(alumni.id, user.id);
    return { token, alumni: { fio: alumni.fio, cohort: alumni.cohort, verification_status: alumni.verification_status } };
  });
}
