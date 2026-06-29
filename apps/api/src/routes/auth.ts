import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { directusCredsValid, findUserByEmail, findAlumniByUser, signSession } from "../lib/auth.js";

export async function authRoutes(app: FastifyInstance) {
  // Логин выпускника: креды проверяет Directus, сессию (JWT с alumni_id) выдаёт apps/api.
  app.post("/auth/login", async (req, reply) => {
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
