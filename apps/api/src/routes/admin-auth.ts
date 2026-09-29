import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { directusCredsValid, findUserWithRole, signAdmin, resolveAdmin, revokeAdmin } from "../lib/auth.js";
import { audit } from "../lib/audit.js";
import { loginLocked, registerLoginFail, registerLoginSuccess, ipLoginLocked, registerIpFail, registerIpSuccess } from "../lib/security.js";
const ADMIN_ROLES = ["editor", "admin", "Administrator"];

export async function adminAuthRoutes(app: FastifyInstance) {

  app.post("/auth/admin-login", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req, reply) => {
    const parsed = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
    // Email в нижний регистр (как register/forgot/login): findUserWithRole ищет _eq,
    // иначе «Office@Mail.ru» → user не найден → ложное 403 для валидного офиса.
    const email = parsed.email.toLowerCase().trim();
    const { password } = parsed;
    if (loginLocked(email) || ipLoginLocked(req.ip)) {
      audit("admin.login.locked", { actor: `email:${email}`, req });
      return reply.code(429).send({ error: "Слишком много неудачных попыток – попробуйте позже" });
    }
    if (!(await directusCredsValid(email, password))) {
      registerLoginFail(email);
      registerIpFail(req.ip);
      audit("admin.login.fail", { actor: `email:${email}`, req });
      return reply.code(401).send({ error: "Неверная почта или пароль" });
    }
    const user = await findUserWithRole(email);
    if (!user || !ADMIN_ROLES.includes(user.role)) return reply.code(403).send({ error: "Нет прав администратора" });
    registerLoginSuccess(email);
    registerIpSuccess(req.ip);
    audit("admin.login.ok", { actor: `admin:${user.id}`, req });
    return { token: signAdmin(user.id, user.role), role: user.role };
  });


  // Выход из панели: гасим конкретную сессию по jti. Без этого админ-токен жил
  // до истечения 12 ч, и «выход» был чисто клиентским – токен оставался годным.
  app.post("/auth/admin-logout", async (req, reply) => {
    const ctx = resolveAdmin(req);
    if (!ctx) return reply.code(401).send({ error: "Требуется вход администратора" });
    if (ctx.jti) await revokeAdmin(ctx.jti);
    audit("admin.logout", { actor: `admin:${ctx.userId}`, req });
    return { ok: true };
  });
}
