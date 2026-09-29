import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import jwt from "jsonwebtoken";
import { readItems } from "../lib/data-commands.js";
import { authenticateNativeUser, createAlumniAuthUser, confirmAlumniAuthUser, resetAlumniPassword, findActiveAlumni } from "../lib/native-auth.js";
import { z } from "zod";
import { sanitizeInterests } from "@club/shared";
import { findUserByEmail, findAlumniByUser, findAlumniAuthUser, signSession } from "../lib/auth.js";
import { data } from "../lib/data.js";
import { env } from "../env.js";
import { validateInitData } from "../lib/telegram.js";
import { audit } from "../lib/audit.js";
import { loginLocked, registerLoginFail, registerLoginSuccess, ipLoginLocked, registerIpFail, registerIpSuccess, resetTokenUsed, markResetTokenUsed } from "../lib/security.js";
import { sendEmail, enqueueMail, notifyOfficeText, mailEnabled, EMAIL_CONFIRMATION_KIND } from "../lib/notify.js";
import { checkoutPool } from "../lib/checkout-store.js";

// Версия политики обработки ПДн (дата редакции) – фиксируется как доказательство согласия.
const PDN_POLICY_VERSION = "2026-07-02";
const CONFIRMATION_RESEND_COOLDOWN_MINUTES = 10;
const CONFIRMATION_RESEND_CACHE_LIMIT = 10_000;

async function queueConfirmationEmail(userId: string, email: string) {
  const token = jwt.sign({ sub: userId, purpose: "email-confirm" }, env.AUTH_SECRET, { expiresIn: "24h" });
  return enqueueMail({
    to: email,
    kind: EMAIL_CONFIRMATION_KIND,
    subject: "Подтвердите почту – Клуб выпускников факультета права",
    body: `Здравствуйте!\n\nВы подали заявку на вступление в клуб выпускников факультета права Вышки.\n` +
      `Подтвердите, что почта ваша – ссылка действует 24 часа:\n${env.PUBLIC_URL}/confirm?token=${encodeURIComponent(token)}\n\n` +
      `После подтверждения заявку проверит учебный офис.\n\nЕсли заявку подавали не вы – просто проигнорируйте письмо, аккаунт останется неактивным.`,
  });
}

export async function authRoutes(app: FastifyInstance) {
  // API одноинстансный: этот короткий локальный барьер закрывает гонку двух
  // одновременных запросов, а outbox ниже сохраняет ограничение после рестарта.
  const confirmationResends = new Map<string, number>();
  // Вход через Telegram Mini App (initData). BLOCKED без TELEGRAM_BOT_TOKEN.
  app.post("/auth/telegram", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!env.TELEGRAM_BOT_TOKEN) return reply.code(503).send({ error: "Telegram mini-app не настроен (нет TELEGRAM_BOT_TOKEN)" });
    const { initData } = z.object({ initData: z.string().min(1).max(16384) }).parse(req.body);
    const v = validateInitData(initData, env.TELEGRAM_BOT_TOKEN, { maxAgeSec: 86400 });
    if (!v.ok) return reply.code(401).send({ error: "Невалидная подпись Telegram" });
    const userId = (v.user as { id?: unknown } | null)?.id;
    if (typeof userId !== "number" || !Number.isSafeInteger(userId) || userId <= 0) return reply.code(401).send({ error: "Нет корректного пользователя Telegram" });
    const tgId = String(userId);
    const rows = (await data.request(readItems("alumni", {
      filter: { telegram_id: { _eq: tgId } }, limit: 1,
      // token_version обязателен: resolveAlumni сверяет его с версией в токене.
      // Без него в сессию всегда писался 0, и у любого, кто хоть раз сбрасывал
      // пароль (версия ≥1), вход через мини-апп молча переставал работать.
      fields: ["id", "fio", "cohort", "verification_status", "user_id", "token_version"],
    }))) as any[];
    const alumni = rows[0];
    if (!alumni) return reply.code(404).send({ error: "Профиль выпускника не привязан к Telegram" });
    if (alumni.user_id && !await findActiveAlumni(alumni.user_id)) return reply.code(403).send({ error: "Вход в профиль закрыт – обратитесь в учебный офис" });
    // sub – UUID аккаунта (как в обычном логине); для непривязанного профиля
    // остаётся telegram-id, чтобы сессия всё равно была идентифицируемой.
    return { token: signSession(alumni.id, (alumni as any).user_id ?? tgId, (alumni as any).token_version ?? 0), alumni: { fio: alumni.fio, cohort: alumni.cohort, verification_status: alumni.verification_status } };
  });

  // Вход выпускника: пароль и роль проверяются на сервере, сессия содержит alumni_id.
  app.post("/auth/login", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req, reply) => {
    const parsed = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
    // Регистрация/восстановление хранят email в нижнем регистре – логин должен
    // нормализовать так же, иначе «Ivan@Mail.ru» не найдёт «ivan@mail.ru» → ложное 401.
    const email = parsed.email.toLowerCase().trim();
    const { password } = parsed;
    // Блок по аккаунту (перебор пароля к одному email, в т.ч. с многих IP) И по IP
    // (password spraying: один IP по многим аккаунтам). Оба – поверх per-IP rate-limit.
    if (loginLocked(email) || ipLoginLocked(req.ip)) {
      audit("login.locked", { actor: `email:${email}`, req });
      return reply.code(429).send({ error: "Слишком много неудачных попыток – попробуйте позже" });
    }
    const result = await authenticateNativeUser(email, password, "alumni");
    if (result.status !== "ok") {
      registerLoginFail(email);
      registerIpFail(req.ip);
      audit("login.fail", { actor: `email:${email}`, req });
      if (result.status === "unverified") return reply.code(403).send({ error: "Почта не подтверждена – откройте ссылку из письма (проверьте папку «Спам»)" });
      if (result.status === "forbidden") return reply.code(403).send({ error: "Аккаунт не привязан к профилю выпускника" });
      return reply.code(401).send({ error: "Неверная почта или пароль" });
    }
    const user = result.user;
    const alumni = await findAlumniByUser(user.id);
    if (!alumni || alumni.id !== user.alumni_id) return reply.code(403).send({ error: "Аккаунт не привязан к профилю выпускника" });
    registerLoginSuccess(email);
    registerIpSuccess(req.ip);
    audit("login.ok", { actor: `alumni:${alumni.id}`, req });
    // Пароль и поколение прочитаны одним SQL-снимком: сброс во время проверки
    // старого пароля не должен выдавать сессию уже нового поколения.
    const token = signSession(user.alumni_id, user.id, user.alumni_version);
    return { token, alumni: { fio: alumni.fio, cohort: alumni.cohort, verification_status: alumni.verification_status } };
  });

  // ── Заявка на вступление в клуб ─────────────────────────────────
  // Создаёт аккаунт (роль alumni) + профиль выпускника со статусом pending;
  // офис подтверждает в готовой очереди верификации админ-панели.
  const registerBody = z.object({
    fio: z.string().min(2).max(200),
    email: z.string().email().max(200),
    password: z.string().min(8).max(100),
    cohort: z.string().regex(/^(19|20)\d{2}$/, "Год выпуска – 4 цифры"),
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
    if (existing) return reply.code(409).send({ error: "Аккаунт с этой почтой уже есть – войдите или восстановите пароль" });

    // В production SMTP обязателен; без него активный аккаунт допустим только локально.
    const confirmRequired = mailEnabled();

    // Рефералка: пришёл по ссылке однокурсника → привязываем пригласившего
    // (баллы рефереру начислятся автоматически при верификации офисом).
    let referredBy: string | null = null;
    if (b.ref) {
      const referrer = (await data.request(readItems("alumni", {
        filter: { referral_code: { _eq: b.ref } }, limit: 1, fields: ["id"],
      }))) as any[];
      referredBy = referrer[0]?.id ?? null;
    }

    const user = await createAlumniAuthUser({
      email, password: b.password,
      first_name: b.fio.split(" ")[0] ?? b.fio, last_name: b.fio.split(" ").slice(1).join(" ") || "-",
      status: confirmRequired ? "unverified" : "active",
      profile: {
        fio: b.fio.trim(), cohort: b.cohort,
        edu_level: b.edu_level, edu_program: b.edu_program.trim(),
        interests_json: sanitizeInterests(b.interests ?? []),
        referral_code: `RC-${randomBytes(4).toString("hex")}`,
        referred_by: referredBy,
        // Факт согласия: время и редакция политики.
        consent_at: new Date().toISOString(),
        consent_version: PDN_POLICY_VERSION,
      },
    });

    audit("register", { actor: `email:${email}`, detail: { cohort: b.cohort, edu_program: b.edu_program, confirm_required: confirmRequired }, req });

    if (confirmRequired) {
      const confirmation = await queueConfirmationEmail(user.id, email);
      // Офис зовём только после подтверждения почты – иначе очередь верификации
      // забивается заявками с чужих и несуществующих адресов.
      return { ok: true, pending: true, confirm_required: true, confirmation_queued: confirmation.sent || confirmation.id !== null };
    }

    // 152-ФЗ: не шлём ПДн заявителя в Telegram (зарубежный сервис). Офис смотрит анкету
    // в очереди верификации админ-панели (РФ, под доступом).
    await notifyOfficeText("🎓 Новая заявка на вступление в клуб – подтвердите в админ-панели (очередь верификации).");
    return { ok: true, pending: true, confirm_required: false };
  });

  // Повторная ссылка нужна после недоставки или истечения суток. Ответ одинаков
  // для несуществующего, активного и неподтверждённого адреса.
  app.post("/auth/resend-confirmation", { config: { rateLimit: { max: 3, timeWindow: "1 minute" } } }, async (req, reply) => {
    const { email: rawEmail } = z.object({ email: z.string().email().max(200) }).parse(req.body);
    if (!mailEnabled()) return reply.code(503).send({ error: "Почта временно недоступна – повторите позже" });
    const email = rawEmail.toLowerCase().trim();
    const response = { ok: true };
    const now = Date.now();
    if ((confirmationResends.get(email) ?? 0) > now) return response;
    if (confirmationResends.size >= CONFIRMATION_RESEND_CACHE_LIMIT) {
      for (const [address, until] of confirmationResends) if (until <= now) confirmationResends.delete(address);
      if (confirmationResends.size >= CONFIRMATION_RESEND_CACHE_LIMIT) {
        return reply.code(429).send({ error: "Слишком много запросов – попробуйте позже" });
      }
    }
    confirmationResends.set(email, now + CONFIRMATION_RESEND_COOLDOWN_MINUTES * 60_000);

    try {
      // Проверяем недавнюю очередь до поиска аккаунта: ответ остаётся одинаковым
      // для зарегистрированного и неизвестного адреса.
      if (env.CHECKOUT_DATABASE_URL) {
        const recent = await checkoutPool().query(
          `SELECT id FROM club_mail_outbox
           WHERE kind=$1 AND to_addr=$2
             AND created_at > now() - ($3::int * interval '1 minute')
           LIMIT 1`,
          [EMAIL_CONFIRMATION_KIND, email, CONFIRMATION_RESEND_COOLDOWN_MINUTES],
        );
        if (recent.rowCount) return response;
      }

      const user = await findAlumniAuthUser({ email });
      if (user?.status !== "unverified") return response;
      const alumni = (await data.request((readItems as any)("alumni", {
        filter: { user_id: { _eq: user.id } }, limit: 1, fields: ["id"],
      }))) as { id: string }[];
      if (!alumni[0]) return response;
      await queueConfirmationEmail(user.id, email);
      return response;
    } catch (error) {
      confirmationResends.delete(email);
      throw error;
    }
  });

  // Подтверждение почты по ссылке из письма. Одноразовость обеспечивает сам статус:
  // повторный переход по ссылке видит уже активного пользователя и просто говорит «готово».
  app.post("/auth/confirm", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const { token } = z.object({ token: z.string().min(10) }).parse(req.body);
    let payload: { sub?: string; purpose?: string };
    try {
      payload = jwt.verify(token, env.AUTH_SECRET, { algorithms: ["HS256"] }) as typeof payload;
    } catch {
      return reply.code(400).send({ error: "Ссылка недействительна или истекла – подайте заявку заново" });
    }
    if (payload.purpose !== "email-confirm" || !payload.sub) return reply.code(400).send({ error: "Ссылка недействительна" });

    const result = await confirmAlumniAuthUser(payload.sub);
    if (result === "invalid") return reply.code(400).send({ error: "Ссылка недействительна" });
    if (result === "already") return { ok: true, already: true };
    audit("email.confirm", { actor: `user:${payload.sub}`, req });
    // Теперь адрес доказан – зовём офис проверять выпуск.
    await notifyOfficeText("🎓 Новая заявка на вступление в клуб (почта подтверждена) – очередь верификации в админ-панели.");
    return { ok: true };
  });

  // ── Восстановление пароля ───────────────────────────────────────
  // Ответ всегда одинаковый (не раскрываем существование аккаунта).
  app.post("/auth/forgot", { config: { rateLimit: { max: 3, timeWindow: "1 minute" } } }, async (req, reply) => {
    const { email, next } = z.object({ email: z.string().email(), next: z.string().max(200).optional() }).parse(req.body);
    // Без SMTP письмо физически не уйдёт. Раньше роут всё равно отвечал ok –
    // человек ждал ссылку, которой нет. Отвечаем честно и одинаково для всех
    // адресов (проверка про канал, а не про аккаунт – существование не раскрывается).
    if (!mailEnabled()) {
      req.log.error("password.forgot: SMTP не настроен – восстановление пароля недоступно");
      return reply.code(503).send({ error: "Восстановление пароля временно недоступно: почтовый канал не настроен. Напишите в учебный офис." });
    }
    const user = await findAlumniAuthUser({ email: email.toLowerCase().trim() });
    if (user) {
      // Токен одноразовый: jti гасится после применения, а ver привязывает ссылку
      // к текущему поколению сессий выпускника (после сброса версия растёт).
      const linked = (await data.request((readItems as any)("alumni", { filter: { user_id: { _eq: user.id } }, limit: 1, fields: ["token_version"] }))) as any[];
      if (!linked[0]) return { ok: true };
      const token = jwt.sign(
        { sub: user.id, purpose: "reset", jti: randomBytes(16).toString("hex"), ver: linked[0]?.token_version ?? null },
        env.AUTH_SECRET,
        { expiresIn: "30m" },
      );
      // Разрешён только известный путь: произвольные адреса в письмо не попадают.
      const continuation = next === "/podcasts#podcast-subscription"
        ? `&next=${encodeURIComponent(next)}` : "";
      const url = `${env.PUBLIC_URL}/reset?token=${encodeURIComponent(token)}${continuation}`;
      audit("password.forgot", { actor: `email:${email}`, req });
      await sendEmail(
        email,
        "Восстановление пароля – Клуб выпускников факультета права Вышки",
        `Вы запросили восстановление пароля.\n\nСсылка действует 30 минут и срабатывает один раз:\n${url}\n\nЕсли это были не вы – просто проигнорируйте письмо.`,
      );
    }
    return { ok: true }; // одинаково для существующих и несуществующих
  });

  app.post("/auth/reset", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req, reply) => {
    const { token, password } = z.object({ token: z.string().min(10), password: z.string().min(8).max(100) }).parse(req.body);
    let payload: { sub?: string; purpose?: string; jti?: string; ver?: number | null };
    try {
      payload = jwt.verify(token, env.AUTH_SECRET, { algorithms: ["HS256"] }) as typeof payload;
    } catch {
      return reply.code(400).send({ error: "Ссылка недействительна или истекла – запросите новую" });
    }
    if (payload.purpose !== "reset" || !payload.sub) return reply.code(400).send({ error: "Ссылка недействительна" });
    // Роль проверяется повторно: старой ссылкой нельзя сбросить пароль после перевода в офис.
    if (!await findAlumniAuthUser({ id: payload.sub })) return reply.code(400).send({ error: "Ссылка недействительна" });
    // Одноразовость, слой 1: jti в списке использованных (переживает повтор в пределах процесса).
    if (payload.jti && resetTokenUsed(payload.jti)) {
      audit("password.reset.replay", { actor: `user:${payload.sub}`, req });
      return reply.code(400).send({ error: "Ссылка уже использована – запросите новую" });
    }
    if (!payload.jti) return reply.code(400).send({ error: "Ссылка недействительна" });
    const result = await resetAlumniPassword({ userId: payload.sub, password, jti: payload.jti, expectedVersion: payload.ver });
    if (result === "invalid") return reply.code(400).send({ error: "Ссылка недействительна" });
    if (result === "used") {
      audit("password.reset.replay", { actor: `user:${payload.sub}`, req });
      return reply.code(400).send({ error: "Ссылка уже использована – запросите новую" });
    }
    if (payload.jti) markResetTokenUsed(payload.jti);
    audit("password.reset", { actor: `user:${payload.sub}`, req });
    return { ok: true };
  });
}
