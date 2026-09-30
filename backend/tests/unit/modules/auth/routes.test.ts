import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import jwt from "jsonwebtoken";
import { hashPassword, verifyPassword } from "@club/server-auth";
const initialHash = await hashPassword("correct-horse");

vi.mock("../../../../src/db/data.js", async () => (await import("../../../helpers/fake-data.js")).dataModuleMock);
// Проверяем маршрут и письмо, не DNS/SMTP внешнего сервера.
const { sendMailMock } = vi.hoisted(() => ({ sendMailMock: vi.fn() }));
vi.mock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail: sendMailMock }) } }));

const { db, resetDb } = await import("../../../helpers/fake-data.js");
const { authRoutes } = await import("../../../../src/modules/auth/routes.js");
const { registerErrorHandler } = await import("../../../../src/common/errors.js");
const { env } = await import("../../../../src/config/env.js");

const ALUMNI_ROLE = "role-alumni";
const USER_ID = "user-1";
const ALUMNI_ID = "alumni-1";

async function build(): Promise<FastifyInstance> {
  const app = Fastify();
  registerErrorHandler(app);
  await app.register(authRoutes);
  return app;
}

beforeEach(() => {
  vi.unstubAllEnvs();
  sendMailMock.mockReset().mockResolvedValue({ messageId: "test" });
  resetDb({
    directus_roles: [{ id: ALUMNI_ROLE, name: "alumni" }],
    directus_users: [{ id: USER_ID, email: "ivan@example.com", status: "active", password: initialHash, first_name: "Иван", last_name: "Петров", role: ALUMNI_ROLE }],
    alumni: [{ id: ALUMNI_ID, user_id: USER_ID, fio: "Иван Петров", cohort: "2020", verification_status: "verified", token_version: 0, points_cached: 0, personal_discount: 0 }],
  });
});

describe("POST /auth/login", () => {
  it("неверный пароль → 401 без подсказок", async () => {
    const app = await build();
    const r = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "ivan@example.com", password: "wrong" } });
    expect(r.statusCode).toBe(401);
    expect(r.json().error).toBe("Неверная почта или пароль");
  });

  it("нормализует регистр почты: Ivan@Example.com входит в тот же аккаунт", async () => {
    const app = await build();
    const r = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "Ivan@Example.com", password: "correct-horse" } });
    expect(r.statusCode).toBe(200);
  });

  it("в токене версия ревокации из профиля – старые сессии гаснут после сброса пароля", async () => {
    db.alumni![0]!.token_version = 3;
    const app = await build();
    const r = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "ivan@example.com", password: "correct-horse" } });
    expect(r.statusCode).toBe(200);
    const payload = jwt.verify(r.json().token, env.AUTH_SECRET) as { ver: number; alumni_id: string };
    expect(payload.ver).toBe(3);
    expect(payload.alumni_id).toBe(ALUMNI_ID);
  });

  it("неподтверждённая почта → 403 с понятным текстом, а не глухое 401", async () => {
    db.directus_users![0]!.status = "unverified";
    const app = await build();
    const r = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "ivan@example.com", password: "correct-horse" } });
    expect(r.statusCode).toBe(403);
    expect(r.json().error).toMatch(/не подтверждена/i);
  });

  it("аккаунт без профиля выпускника → 403 (в ЛК пускать нечего)", async () => {
    db.alumni = [];
    const app = await build();
    const r = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "ivan@example.com", password: "correct-horse" } });
    expect(r.statusCode).toBe(403);
  });

  it("после серии неудач аккаунт блокируется (429), даже с верным паролем", async () => {
    const app = await build();
    for (let i = 0; i < 10; i++) {
      await app.inject({ method: "POST", url: "/auth/login", payload: { email: "locked@example.com", password: "wrong" } });
    }
    const r = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "locked@example.com", password: "correct-horse" } });
    expect(r.statusCode).toBe(429);
  });
});

describe("POST /auth/register", () => {
  const form = {
    fio: "Мария Сидорова", email: "maria@example.com", password: "verystrongpass",
    cohort: "2021", edu_level: "магистратура", edu_program: "Юриспруденция", consent_pdn: true,
  };

  it("создаёт аккаунт и профиль со статусом pending", async () => {
    const app = await build();
    const r = await app.inject({ method: "POST", url: "/auth/register", payload: form });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ ok: true, pending: true, confirm_required: false });
    const created = db.alumni!.find((a) => a.fio === "Мария Сидорова");
    expect(created?.verification_status).toBe("pending");
    // 152-ФЗ: факт согласия фиксируется как доказательство
    expect(created?.consent_at).toBeTruthy();
    expect(created?.consent_version).toBeTruthy();
    expect(db.directus_users!.find((u) => u.email === "maria@example.com")?.status).toBe("active");
  });

  it("занятая почта → 409, второй аккаунт не создаётся", async () => {
    const app = await build();
    const r = await app.inject({ method: "POST", url: "/auth/register", payload: { ...form, email: "ivan@example.com" } });
    expect(r.statusCode).toBe(409);
    expect(db.directus_users!.filter((u) => u.email === "ivan@example.com")).toHaveLength(1);
  });

  it("без согласия на обработку ПДн → 400", async () => {
    const app = await build();
    const r = await app.inject({ method: "POST", url: "/auth/register", payload: { ...form, consent_pdn: false } });
    expect(r.statusCode).toBe(400);
    expect(db.alumni!.some((a) => a.fio === "Мария Сидорова")).toBe(false);
  });

  it("заполненный honeypot (бот) → 400", async () => {
    const app = await build();
    const r = await app.inject({ method: "POST", url: "/auth/register", payload: { ...form, website: "http://spam" } });
    expect(r.statusCode).toBe(400);
  });

  it("реферальный код привязывает пригласившего", async () => {
    db.alumni!.push({ id: "alumni-ref", fio: "Пригласивший", referral_code: "RC-abc123", token_version: 0 });
    const app = await build();
    await app.inject({ method: "POST", url: "/auth/register", payload: { ...form, ref: "RC-abc123" } });
    expect(db.alumni!.find((a) => a.fio === "Мария Сидорова")?.referred_by).toBe("alumni-ref");
  });

  it("с настроенным SMTP аккаунт неактивен до подтверждения почты", async () => {
    // env разбирается один раз при импорте модуля, поэтому vi.stubEnv тут не поможет –
    // подменяем разобранное значение (роут читает env.SMTP_HOST в момент запроса).
    const original = env.SMTP_HOST;
    (env as { SMTP_HOST: string }).SMTP_HOST = "smtp.example.com";
    try {
      const app = await build();
      const r = await app.inject({ method: "POST", url: "/auth/register", payload: form });
      expect(r.json()).toMatchObject({ confirm_required: true, confirmation_queued: true });
      expect(db.directus_users!.find((u) => u.email === "maria@example.com")?.status).toBe("unverified");
    } finally {
      (env as { SMTP_HOST: string }).SMTP_HOST = original;
    }
  });

  it("сбой SMTP сохраняет заявку и сообщает, что письмо не поставлено в очередь", async () => {
    const original = env.SMTP_HOST;
    (env as { SMTP_HOST: string }).SMTP_HOST = "smtp.example.com";
    sendMailMock.mockRejectedValue(new Error("SMTP unavailable"));
    try {
      const app = await build();
      const r = await app.inject({ method: "POST", url: "/auth/register", payload: form });
      expect(r.statusCode).toBe(200);
      expect(r.json()).toMatchObject({ confirm_required: true, confirmation_queued: false });
      expect(db.directus_users!.find((u) => u.email === "maria@example.com")?.status).toBe("unverified");
    } finally {
      (env as { SMTP_HOST: string }).SMTP_HOST = original;
    }
  });
});

describe("POST /auth/resend-confirmation", () => {
  it("отправляет новую ссылку только ожидающей заявке и не раскрывает наличие аккаунта", async () => {
    const original = env.SMTP_HOST;
    (env as { SMTP_HOST: string }).SMTP_HOST = "smtp.example.com";
    db.directus_users!.push({ id: "pending-1", email: "pending@example.com", status: "unverified", role: ALUMNI_ROLE });
    db.alumni!.push({ id: "alumni-pending", user_id: "pending-1", fio: "Ожидающий" });
    try {
      const app = await build();
      const pending = await app.inject({ method: "POST", url: "/auth/resend-confirmation", payload: { email: "Pending@Example.com" } });
      const active = await app.inject({ method: "POST", url: "/auth/resend-confirmation", payload: { email: "ivan@example.com" } });
      const missing = await app.inject({ method: "POST", url: "/auth/resend-confirmation", payload: { email: "missing@example.com" } });
      expect(pending.statusCode).toBe(200);
      expect(active.body).toBe(pending.body);
      expect(missing.body).toBe(pending.body);
      expect(sendMailMock).toHaveBeenCalledTimes(1);
      expect(sendMailMock).toHaveBeenCalledWith(expect.objectContaining({ to: "pending@example.com" }));
    } finally {
      (env as { SMTP_HOST: string }).SMTP_HOST = original;
    }
  });

  it("два одновременных запроса не отправляют два письма", async () => {
    const original = env.SMTP_HOST;
    (env as { SMTP_HOST: string }).SMTP_HOST = "smtp.example.com";
    db.directus_users!.push({ id: "pending-race", email: "race@example.com", status: "unverified", role: ALUMNI_ROLE });
    db.alumni!.push({ id: "alumni-race", user_id: "pending-race" });
    try {
      const app = await build();
      const payload = { email: "race@example.com" };
      const responses = await Promise.all([
        app.inject({ method: "POST", url: "/auth/resend-confirmation", payload }),
        app.inject({ method: "POST", url: "/auth/resend-confirmation", payload }),
      ]);
      expect(responses.every((response) => response.statusCode === 200)).toBe(true);
      expect(sendMailMock).toHaveBeenCalledTimes(1);
    } finally {
      (env as { SMTP_HOST: string }).SMTP_HOST = original;
    }
  });
});

describe("POST /auth/confirm", () => {
  const pendingUser = { id: "user-2", email: "new@example.com", status: "unverified", role: ALUMNI_ROLE };

  beforeEach(() => { db.directus_users!.push({ ...pendingUser }); });

  it("валидная ссылка активирует аккаунт", async () => {
    const token = jwt.sign({ sub: "user-2", purpose: "email-confirm" }, env.AUTH_SECRET, { expiresIn: "24h" });
    const app = await build();
    const r = await app.inject({ method: "POST", url: "/auth/confirm", payload: { token } });
    expect(r.statusCode).toBe(200);
    expect(db.directus_users!.find((u) => u.id === "user-2")?.status).toBe("active");
  });

  it("старая ссылка не активирует заблокированного пользователя", async () => {
    db.directus_users!.find(u => u.id === "user-2")!.status = "suspended";
    const token = jwt.sign({ sub: "user-2", purpose: "email-confirm" }, env.AUTH_SECRET, { expiresIn: "24h" });
    const app = await build();
    expect((await app.inject({ method: "POST", url: "/auth/confirm", payload: { token } })).statusCode).toBe(400);
    expect(db.directus_users!.find(u => u.id === "user-2")!.status).toBe("suspended");
  });

  it("повторный переход по той же ссылке безопасен", async () => {
    const token = jwt.sign({ sub: "user-2", purpose: "email-confirm" }, env.AUTH_SECRET, { expiresIn: "24h" });
    const app = await build();
    await app.inject({ method: "POST", url: "/auth/confirm", payload: { token } });
    const r = await app.inject({ method: "POST", url: "/auth/confirm", payload: { token } });
    expect(r.json()).toMatchObject({ ok: true, already: true });
  });

  it("сессионный токен не подходит как подтверждающий (проверка purpose)", async () => {
    const session = jwt.sign({ alumni_id: ALUMNI_ID, sub: USER_ID, ver: 0 }, env.AUTH_SECRET, { expiresIn: "7d" });
    const app = await build();
    const r = await app.inject({ method: "POST", url: "/auth/confirm", payload: { token: session } });
    expect(r.statusCode).toBe(400);
    expect(db.directus_users!.find((u) => u.id === "user-2")?.status).toBe("unverified");
  });

  it("подпись чужим ключом отвергается", async () => {
    const forged = jwt.sign({ sub: "user-2", purpose: "email-confirm" }, "чужой-секрет-подлиннее-32-символов", { expiresIn: "24h" });
    const app = await build();
    const r = await app.inject({ method: "POST", url: "/auth/confirm", payload: { token: forged } });
    expect(r.statusCode).toBe(400);
  });

  it("истёкшая ссылка отвергается", async () => {
    const expired = jwt.sign({ sub: "user-2", purpose: "email-confirm" }, env.AUTH_SECRET, { expiresIn: -10 });
    const app = await build();
    const r = await app.inject({ method: "POST", url: "/auth/confirm", payload: { token: expired } });
    expect(r.statusCode).toBe(400);
  });
});

describe("POST /auth/forgot и /auth/reset", () => {
  it.each(["Administrator", "admin", "editor", "service"])("публичное восстановление не отправляет письмо и не меняет пароль роли %s", async role => {
    const previousHost = env.SMTP_HOST;
    env.SMTP_HOST = "smtp.example.com";
    db.directus_roles!.push({ id: `role-${role}`, name: role });
    // Связанный профиль намеренно оставлен: решает текущая роль пользователя.
    db.directus_users![0]!.role = `role-${role}`;
    try {
      const app = await build();
      const known = await app.inject({ method: "POST", url: "/auth/forgot", payload: { email: "ivan@example.com" } });
      const unknown = await app.inject({ method: "POST", url: "/auth/forgot", payload: { email: "missing@example.com" } });
      expect(known.statusCode).toBe(200);
      expect(known.body).toBe(unknown.body);
      expect(sendMailMock).not.toHaveBeenCalled();
      const token = jwt.sign({ sub: USER_ID, purpose: "reset", jti: `former-alumni-${role}`, ver: 0 }, env.AUTH_SECRET, { expiresIn: "30m" });
      const reset = await app.inject({ method: "POST", url: "/auth/reset", payload: { token, password: "newstrongpass" } });
      expect(reset.statusCode).toBe(400);
      expect(db.directus_users![0]!.password).toBe(initialHash);
      expect(db.alumni![0]!.token_version).toBe(0);
      await app.close();
    } finally { env.SMTP_HOST = previousHost; }
  });

  it("письмо выпускнику позволяет сменить пароль", async () => {
    const previousHost = env.SMTP_HOST;
    env.SMTP_HOST = "smtp.example.com";
    try {
      const app = await build();
      const response = await app.inject({ method: "POST", url: "/auth/forgot", payload: { email: "ivan@example.com" } });
      expect(response.statusCode).toBe(200);
      expect(sendMailMock).toHaveBeenCalledTimes(1);
      const text = sendMailMock.mock.calls[0]![0].text as string;
      const url = new URL(text.match(/https?:\/\/\S+\/reset\?token=\S+/)![0]);
      const reset = await app.inject({ method: "POST", url: "/auth/reset", payload: { token: url.searchParams.get("token"), password: "newstrongpass" } });
      expect(reset.statusCode).toBe(200);
      expect(await verifyPassword(db.directus_users![0]!.password, "newstrongpass")).toBe(true);
      expect(db.directus_users![0]!.password).not.toBe("newstrongpass");
      await app.close();
    } finally { env.SMTP_HOST = previousHost; }
  });

  it("forgot отвечает одинаково для существующей и несуществующей почты", async () => {
    const app = await build();
    const known = await app.inject({ method: "POST", url: "/auth/forgot", payload: { email: "ivan@example.com" } });
    const unknown = await app.inject({ method: "POST", url: "/auth/forgot", payload: { email: "nobody@example.com" } });
    expect(known.statusCode).toBe(unknown.statusCode);
    expect(known.body).toBe(unknown.body);
  });

  it("сброс пароля поднимает token_version – выданные ранее сессии отзываются", async () => {
    const token = jwt.sign({ sub: USER_ID, purpose: "reset", jti: "reset-version-test" }, env.AUTH_SECRET, { expiresIn: "30m" });
    const app = await build();
    const r = await app.inject({ method: "POST", url: "/auth/reset", payload: { token, password: "newstrongpass" } });
    expect(r.statusCode).toBe(200);
    expect(db.alumni![0]!.token_version).toBe(1);
    expect(await verifyPassword(db.directus_users![0]!.password, "newstrongpass")).toBe(true);
      expect(db.directus_users![0]!.password).not.toBe("newstrongpass");
  });

  it("токен не того назначения не меняет пароль", async () => {
    const session = jwt.sign({ alumni_id: ALUMNI_ID, sub: USER_ID, ver: 0 }, env.AUTH_SECRET, { expiresIn: "7d" });
    const app = await build();
    const r = await app.inject({ method: "POST", url: "/auth/reset", payload: { token: session, password: "newstrongpass" } });
    expect(r.statusCode).toBe(400);
    expect(db.directus_users![0]!.password).toBe(initialHash);
    expect(db.alumni![0]!.token_version).toBe(0);
  });

  /**
   * Одноразовость ссылки. Раньше токен жил все 30 минут и позволял менять пароль
   * повторно: утёкшая ссылка (общий компьютер, пересланное письмо, история браузера)
   * давала захват аккаунта уже ПОСЛЕ того, как владелец пароль сменил.
   */
  it("ссылка сброса срабатывает один раз (jti гасится)", async () => {
    const app = await build();
    // Ссылку собираем той же формы, что уходит в письме (jti + поколение сессий),
    // но без вызова /auth/forgot – иначе тест полез бы в сеть за SMTP.
    const token = jwt.sign(
      { sub: USER_ID, purpose: "reset", jti: "одноразовый-ключ", ver: 0 },
      env.AUTH_SECRET, { expiresIn: "30m" },
    );
    const first = await app.inject({ method: "POST", url: "/auth/reset", payload: { token, password: "firstpass123" } });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({ method: "POST", url: "/auth/reset", payload: { token, password: "hijacked-pass" } });
    expect(second.statusCode).toBe(400);
    expect(second.json().error).toMatch(/уже использована/i);
    // Пароль остался от первого применения – перехват не прошёл.
    expect(await verifyPassword(db.directus_users![0]!.password, "firstpass123")).toBe(true);
      expect(db.directus_users![0]!.password).not.toBe("firstpass123");
  });

  it("ссылка, выпущенная до прошлого сброса, не срабатывает (переживает рестарт)", async () => {
    const app = await build();
    // ver=0 – поколение сессий на момент выпуска ссылки.
    const stale = jwt.sign({ sub: USER_ID, purpose: "reset", jti: "старый", ver: 0 }, env.AUTH_SECRET, { expiresIn: "30m" });
    // Кто-то уже сменил пароль: версия выросла, список jti в памяти неактуален.
    db.alumni![0]!.token_version = 1;

    const r = await app.inject({ method: "POST", url: "/auth/reset", payload: { token: stale, password: "hijacked-pass" } });
    expect(r.statusCode).toBe(400);
    expect(db.directus_users![0]!.password).toBe(initialHash);
    expect(db.alumni![0]!.token_version).toBe(1);
  });

  it("повторное применение фиксируется в аудите", async () => {
    const app = await build();
    const token = jwt.sign({ sub: USER_ID, purpose: "reset", jti: "повтор", ver: 0 }, env.AUTH_SECRET, { expiresIn: "30m" });
    await app.inject({ method: "POST", url: "/auth/reset", payload: { token, password: "firstpass123" } });
    await app.inject({ method: "POST", url: "/auth/reset", payload: { token, password: "secondpass123" } });
    expect((db.audit_log ?? []).some((e) => e.event === "password.reset.replay")).toBe(true);
  });

  /**
   * Без почтового канала письмо физически не уйдёт. Раньше роут всё равно отвечал
   * ok, и человек ждал ссылку, которой нет.
   */
  it("без настроенного SMTP восстановление честно отвечает 503", async () => {
    vi.stubEnv("SMTP_HOST", "");
    const app = await build();
    const r = await app.inject({ method: "POST", url: "/auth/forgot", payload: { email: "ivan@example.com" } });
    expect(r.statusCode).toBe(503);
    expect(r.json().error).toMatch(/почтовый канал не настроен/i);
  });

  it("ответ 503 одинаков для существующей и несуществующей почты", async () => {
    vi.stubEnv("SMTP_HOST", "");
    const app = await build();
    const known = await app.inject({ method: "POST", url: "/auth/forgot", payload: { email: "ivan@example.com" } });
    const unknown = await app.inject({ method: "POST", url: "/auth/forgot", payload: { email: "nobody@example.com" } });
    expect(known.body).toBe(unknown.body);
  });
});

describe("auth rate limits (@fastify/rate-limit)", () => {
  it("POST /auth/login: 6-й запрос с одного IP → 429 (max 5 / мин)", async () => {
    const app = Fastify();
    registerErrorHandler(app);
    await app.register(rateLimit);
    await app.register(authRoutes);
    for (let i = 0; i < 5; i++) {
      const r = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: `spray${i}@example.com`, password: "wrong" },
      });
      expect(r.statusCode).toBe(401);
    }
    const blocked = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "spray-final@example.com", password: "wrong" },
    });
    expect(blocked.statusCode).toBe(429);
    await app.close();
  });

  it("POST /auth/forgot: 4-й запрос → 429 (max 3 / мин), даже при 503 SMTP", async () => {
    vi.stubEnv("SMTP_HOST", "");
    const app = Fastify();
    registerErrorHandler(app);
    await app.register(rateLimit);
    await app.register(authRoutes);
    for (let i = 0; i < 3; i++) {
      expect((await app.inject({
        method: "POST",
        url: "/auth/forgot",
        payload: { email: `forgot${i}@example.com` },
      })).statusCode).toBe(503);
    }
    expect((await app.inject({
      method: "POST",
      url: "/auth/forgot",
      payload: { email: "forgot-final@example.com" },
    })).statusCode).toBe(429);
    await app.close();
  });
});
