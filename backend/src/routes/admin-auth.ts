import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { signAdmin, resolveAdmin, revokeAdmin } from "../lib/auth.js";
import { audit } from "../lib/audit.js";
import { loginLocked, registerLoginFail, registerLoginSuccess, ipLoginLocked, registerIpFail, registerIpSuccess } from "../lib/security.js";
import { authenticateNativeUser } from "../lib/native-auth.js";

export async function adminAuthRoutes(app: FastifyInstance) {

  app.post("/auth/admin-login", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req, reply) => {
    const parsed = z.object({ email: z.email(), password: z.string().min(1) }).parse(req.body);
    // Нормализация одинакова для регистрации и обоих способов входа.
    const email = parsed.email.toLowerCase().trim();
    const { password } = parsed;
    if (loginLocked(email) || ipLoginLocked(req.ip)) {
      audit("admin.login.locked", { actor: `email:${email}`, req });
      return reply.code(429).send({ error: "Слишком много неудачных попыток – попробуйте позже" });
    }
    const result = await authenticateNativeUser(email, password, "admin");
    if (result.status === "forbidden") return reply.code(403).send({ error: "Нет прав администратора" });
    if (result.status !== "ok") {
      registerLoginFail(email);
      registerIpFail(req.ip);
      audit("admin.login.fail", { actor: `email:${email}`, req });
      return reply.code(401).send({ error: "Неверная почта или пароль" });
    }
    const user = result.user;
    registerLoginSuccess(email);
    registerIpSuccess(req.ip);
    audit("admin.login.ok", { actor: `admin:${user.id}`, req });
    return { token: signAdmin(user.id, user.role, user.staff_version), role: user.role };
  });


  // Выход из панели: гасим конкретную сессию по jti. Без этого админ-токен жил
  // до истечения 12 ч, и «выход» был чисто клиентским – токен оставался годным.
  app.post("/auth/admin-logout", async (req, reply) => {
    const ctx = await resolveAdmin(req);
    if (!ctx) return reply.code(401).send({ error: "Требуется вход администратора" });
    if (ctx.jti) await revokeAdmin(ctx.jti);
    audit("admin.logout", { actor: `admin:${ctx.userId}`, req });
    return { ok: true };
  });
}
