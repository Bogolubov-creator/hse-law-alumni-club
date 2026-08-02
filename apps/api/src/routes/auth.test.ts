import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import jwt from "jsonwebtoken";

vi.mock("@directus/sdk", async () => await import("../test/fake-sdk.js"));
vi.mock("../lib/directus.js", async () => (await import("../test/fake-directus.js")).directusModuleMock);

const { db, resetDb } = await import("../test/fake-directus.js");
const { authRoutes } = await import("./auth.js");
const { registerErrorHandler } = await import("../lib/errors.js");
const { env } = await import("../env.js");

const ALUMNI_ROLE = "role-alumni";
const USER_ID = "user-1";
const ALUMNI_ID = "alumni-1";

/** Directus-логин, который роут дёргает через глобальный fetch. */
function stubDirectusLogin(valid: (email: string, password: string) => boolean) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
    if (String(url).endsWith("/auth/login")) {
      const body = JSON.parse(String(init?.body ?? "{}"));
      return { ok: valid(body.email, body.password) } as Response;
    }
    return { ok: true, json: async () => ({}) } as unknown as Response;
  }));
}

async function build(): Promise<FastifyInstance> {
  const app = Fastify();
  registerErrorHandler(app);
  await app.register(authRoutes);
  return app;
}

beforeEach(() => {
  vi.unstubAllEnvs();
  resetDb({
    directus_roles: [{ id: ALUMNI_ROLE, name: "alumni" }],
    directus_users: [{ id: USER_ID, email: "ivan@example.com", status: "active", first_name: "Иван", last_name: "Петров", role: ALUMNI_ROLE }],
    alumni: [{ id: ALUMNI_ID, user_id: USER_ID, fio: "Иван Петров", cohort: "2020", verification_status: "verified", token_version: 0, points_cached: 0, personal_discount: 0 }],
  });
  stubDirectusLogin((email, password) => email === "ivan@example.com" && password === "correct-horse");
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
    stubDirectusLogin(() => false); // Directus не пускает неактивного пользователя
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
      expect(r.json()).toMatchObject({ confirm_required: true });
      expect(db.directus_users!.find((u) => u.email === "maria@example.com")?.status).toBe("unverified");
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
  it("forgot отвечает одинаково для существующей и несуществующей почты", async () => {
    const app = await build();
    const known = await app.inject({ method: "POST", url: "/auth/forgot", payload: { email: "ivan@example.com" } });
    const unknown = await app.inject({ method: "POST", url: "/auth/forgot", payload: { email: "nobody@example.com" } });
    expect(known.statusCode).toBe(unknown.statusCode);
    expect(known.body).toBe(unknown.body);
  });

  it("сброс пароля поднимает token_version – выданные ранее сессии отзываются", async () => {
    const token = jwt.sign({ sub: USER_ID, purpose: "reset" }, env.AUTH_SECRET, { expiresIn: "30m" });
    const app = await build();
    const r = await app.inject({ method: "POST", url: "/auth/reset", payload: { token, password: "newstrongpass" } });
    expect(r.statusCode).toBe(200);
    expect(db.alumni![0]!.token_version).toBe(1);
    expect(db.directus_users![0]!.password).toBe("newstrongpass");
  });

  it("токен не того назначения не меняет пароль", async () => {
    const session = jwt.sign({ alumni_id: ALUMNI_ID, sub: USER_ID, ver: 0 }, env.AUTH_SECRET, { expiresIn: "7d" });
    const app = await build();
    const r = await app.inject({ method: "POST", url: "/auth/reset", payload: { token: session, password: "newstrongpass" } });
    expect(r.statusCode).toBe(400);
    expect(db.directus_users![0]!.password).toBeUndefined();
    expect(db.alumni![0]!.token_version).toBe(0);
  });
});
