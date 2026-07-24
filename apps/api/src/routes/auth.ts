import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import jwt from "jsonwebtoken";
import { readItems, createItem, createUser, updateUser, updateItem, readRoles } from "@directus/sdk";
import { z } from "zod";
import { sanitizeInterests } from "@club/shared";
import { directusCredsValid, findUserByEmail, findAlumniByUser, signSession } from "../lib/auth.js";
import { directus } from "../lib/directus.js";
import { env } from "../env.js";
import { validateInitData } from "../lib/telegram.js";
import { audit } from "../lib/audit.js";
import { loginLocked, registerLoginFail, registerLoginSuccess, ipLoginLocked, registerIpFail, registerIpSuccess } from "../lib/security.js";
import { sendEmail, notifyOfficeText } from "../lib/notify.js";

// Версия политики обработки ПДн (дата редакции) — фиксируется как доказательство согласия.
const PDN_POLICY_VERSION = "2026-07-02";

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
    return { token: signSession(alumni.id, tgId, (alumni as any).token_version ?? 0), alumni: { fio: alumni.fio, cohort: alumni.cohort, verification_status: alumni.verification_status } };
  });

  // Логин выпускника: креды проверяет Directus, сессию (JWT с alumni_id) выдаёт apps/api.
  app.post("/auth/login", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req, reply) => {
    const parsed = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
    // Регистрация/восстановление хранят email в нижнем регистре — логин должен
    // нормализовать так же, иначе «Ivan@Mail.ru» не найдёт «ivan@mail.ru» → ложное 401.
    const email = parsed.email.toLowerCase().trim();
    const { password } = parsed;
    // Блок по аккаунту (перебор пароля к одному email, в т.ч. с многих IP) И по IP
    // (password spraying: один IP по многим аккаунтам). Оба — поверх per-IP rate-limit.
    if (loginLocked(email) || ipLoginLocked(req.ip)) {
      audit("login.locked", { actor: `email:${email}`, req });
      return reply.code(429).send({ error: "Слишком много неудачных попыток — попробуйте позже" });
    }
    if (!(await directusCredsValid(email, password))) {
      registerLoginFail(email);
      registerIpFail(req.ip);
      audit("login.fail", { actor: `email:${email}`, req });
      return reply.code(401).send({ error: "Неверная почта или пароль" });
    }
    const user = await findUserByEmail(email);
    if (!user) return reply.code(401).send({ error: "Пользователь не найден" });
    const alumni = await findAlumniByUser(user.id);
    if (!alumni) return reply.code(403).send({ error: "Аккаунт не привязан к профилю выпускника" });
    registerLoginSuccess(email);
    registerIpSuccess(req.ip);
    audit("login.ok", { actor: `alumni:${alumni.id}`, req });
    const token = signSession(alumni.id, user.id, (alumni as any).token_version ?? 0);
    return { token, alumni: { fio: alumni.fio, cohort: alumni.cohort, verification_status: alumni.verification_status } };
  });

  // ── Заявка на вступление в клуб ─────────────────────────────────
  // Создаёт аккаунт (роль alumni) + профиль выпускника со статусом pending;
  // офис подтверждает в готовой очереди верификации админ-панели.
  const registerBody = z.object({
    fio: z.string().min(2).max(200),
    email: z.string().email().max(200),
    password: z.string().min(8).max(100),
    cohort: z.string().regex(/^(19|20)\d{2}$/, "Год выпуска — 4 цифры"),
    edu_level: z.enum(["бакалавриат", "магистратура", "специалитет", "аспирантура"]),
    edu_program: z.string().min(2).max(200),
    interests: z.array(z.string()).optional(),
    ref: z.string().max(40).optional(), // реферальный код пригласившего (?ref= в /join)
    consent_pdn: z.literal(true, { errorMap: () => ({ message: "Требуется согласие на обработку ПДн" }) }),
    website: z.string().max(0).optional(), // honeypot для ботов
  });

  app.post("/auth/register", { config: { rateLimit: { max: 3, timeWindow: "1 minute" } } }, async (req, reply) => {
    const b = registerBody.parse(req.body);
    const email = b.email.toLowerCase().trim();

    const existing = await findUserByEmail(email);
    if (existing) return reply.code(409).send({ error: "Аккаунт с этой почтой уже есть — войдите или восстановите пароль" });

    const roles = (await directus.request((readRoles as any)({ filter: { name: { _eq: "alumni" } }, limit: 1, fields: ["id"] }))) as any[];
    if (!roles[0]) return reply.code(500).send({ error: "Роль выпускника не настроена — обратитесь в учебный офис" });

    const user = (await directus.request((createUser as any)({
      email, password: b.password, role: roles[0].id,
      first_name: b.fio.split(" ")[0] ?? b.fio, last_name: b.fio.split(" ").slice(1).join(" ") || "-",
      status: "active",
    }))) as any;

    // Рефералка: пришёл по ссылке однокурсника → привязываем пригласившего
    // (баллы рефереру начислятся автоматически при верификации офисом).
    let referredBy: string | null = null;
    if (b.ref) {
      const referrer = (await directus.request(readItems("alumni", {
        filter: { referral_code: { _eq: b.ref } }, limit: 1, fields: ["id"],
      }))) as any[];
      referredBy = referrer[0]?.id ?? null;
    }

    await directus.request((createItem as any)("alumni", {
      user_id: user.id, fio: b.fio.trim(), cohort: b.cohort,
      edu_level: b.edu_level, edu_program: b.edu_program.trim(),
      interests_json: sanitizeInterests(b.interests ?? []),
      status: "active", verification_status: "pending",
      points_cached: 0, level_cached: "graduate", personal_discount: 0,
      referral_code: `RC-${randomBytes(4).toString("hex")}`,
      referred_by: referredBy,
      // 152-ФЗ: фиксируем факт согласия (доказательство) — когда и какая редакция политики.
      consent_at: new Date().toISOString(),
      consent_version: PDN_POLICY_VERSION,
    }));

    audit("register", { actor: `email:${email}`, detail: { cohort: b.cohort, edu_program: b.edu_program }, req });
    // 152-ФЗ: не шлём ПДн заявителя в Telegram (зарубежный сервис). Офис смотрит анкету
    // в очереди верификации админ-панели (РФ, под доступом).
    await notifyOfficeText("🎓 Новая заявка на вступление в клуб — подтвердите в админ-панели (очередь верификации).");
    return { ok: true, pending: true };
  });

  // ── Восстановление пароля ───────────────────────────────────────
  // Ответ всегда одинаковый (не раскрываем существование аккаунта).
  app.post("/auth/forgot", { config: { rateLimit: { max: 3, timeWindow: "1 minute" } } }, async (req) => {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const user = await findUserByEmail(email.toLowerCase().trim());
    if (user) {
      const token = jwt.sign({ sub: user.id, purpose: "reset" }, env.AUTH_SECRET, { expiresIn: "30m" });
      const url = `${env.PUBLIC_URL}/reset?token=${encodeURIComponent(token)}`;
      audit("password.forgot", { actor: `email:${email}`, req });
      await sendEmail(
        email,
        "Восстановление пароля — Клуб выпускников факультета права",
        `Вы запросили восстановление пароля.\n\nСсылка действует 30 минут:\n${url}\n\nЕсли это были не вы — просто проигнорируйте письмо.`,
      );
    }
    return { ok: true }; // одинаково для существующих и несуществующих
  });

  app.post("/auth/reset", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req, reply) => {
    const { token, password } = z.object({ token: z.string().min(10), password: z.string().min(8).max(100) }).parse(req.body);
    let payload: { sub?: string; purpose?: string };
    try {
      payload = jwt.verify(token, env.AUTH_SECRET, { algorithms: ["HS256"] }) as typeof payload;
    } catch {
      return reply.code(400).send({ error: "Ссылка недействительна или истекла — запросите новую" });
    }
    if (payload.purpose !== "reset" || !payload.sub) return reply.code(400).send({ error: "Ссылка недействительна" });
    await directus.request((updateUser as any)(payload.sub, { password }));
    // Ревокация всех выданных JWT этого выпускника: старые сессии гаснут.
    const linked = (await directus.request((readItems as any)("alumni", { filter: { user_id: { _eq: payload.sub } }, limit: 1, fields: ["id", "token_version"] }))) as any[];
    if (linked[0]) await directus.request((updateItem as any)("alumni", linked[0].id, { token_version: (linked[0].token_version ?? 0) + 1 }));
    audit("password.reset", { actor: `user:${payload.sub}`, req });
    return { ok: true };
  });
}
