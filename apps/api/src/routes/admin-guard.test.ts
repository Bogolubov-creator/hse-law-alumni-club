import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import jwt from "jsonwebtoken";

vi.mock("@directus/sdk", async () => await import("../test/fake-sdk.js"));
vi.mock("../lib/directus.js", async () => (await import("../test/fake-directus.js")).directusModuleMock);

const { db, resetDb } = await import("../test/fake-directus.js");
const { adminRoutes } = await import("./admin.js");
const { registerErrorHandler } = await import("../lib/errors.js");
const { env } = await import("../env.js");

const EDITOR_ID = "user-editor";
const ADMIN_ID = "user-admin";
const ALUMNI_ID = "alumni-1";

/** Маршруты админки, которые обязаны быть закрыты гардом. */
const GUARDED = [
  { method: "GET" as const, url: "/admin/overview" },
  { method: "GET" as const, url: "/admin/orders" },
  { method: "GET" as const, url: "/admin/members" },
  { method: "GET" as const, url: "/admin/audit" },
];

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
  await app.register(adminRoutes);
  return app;
}

const adminSecret = () => env.ADMIN_AUTH_SECRET || env.AUTH_SECRET;

beforeEach(() => {
  resetDb({
    directus_users: [
      { id: EDITOR_ID, email: "office@example.com", status: "active", role: { name: "editor" } },
      { id: ADMIN_ID, email: "chief@example.com", status: "active", role: { name: "admin" } },
      { id: "user-outsider", email: "outsider@example.com", status: "active", role: { name: "alumni" } },
    ],
    alumni: [{ id: ALUMNI_ID, user_id: "user-1", fio: "Иван Петров", verification_status: "verified", token_version: 0, points_cached: 0, personal_discount: 0 }],
    orders: [], levels: [], audit_log: [], points_ledger: [],
  });
  stubDirectusLogin(() => true);
});

describe("POST /auth/admin-login", () => {
  it("роль вне списка админских → 403, токен не выдаётся", async () => {
    const app = await build();
    const r = await app.inject({ method: "POST", url: "/auth/admin-login", payload: { email: "outsider@example.com", password: "any" } });
    expect(r.statusCode).toBe(403);
    expect(r.json().token).toBeUndefined();
  });

  it("неверный пароль → 401", async () => {
    stubDirectusLogin(() => false);
    const app = await build();
    const r = await app.inject({ method: "POST", url: "/auth/admin-login", payload: { email: "office@example.com", password: "wrong" } });
    expect(r.statusCode).toBe(401);
  });

  it("роль editor → токен с областью admin", async () => {
    const app = await build();
    const r = await app.inject({ method: "POST", url: "/auth/admin-login", payload: { email: "office@example.com", password: "ok" } });
    expect(r.statusCode).toBe(200);
    const payload = jwt.verify(r.json().token, adminSecret()) as { scope: string; role: string };
    expect(payload.scope).toBe("admin");
    expect(payload.role).toBe("editor");
  });
});

describe("гарды админских маршрутов", () => {
  it.each(GUARDED)("$method $url без токена → 401", async ({ method, url }) => {
    const app = await build();
    const r = await app.inject({ method, url });
    expect(r.statusCode).toBe(401);
  });

  it.each(GUARDED)("$method $url с токеном выпускника → 401", async ({ method, url }) => {
    // Сессия ЛК подписана AUTH_SECRET и не содержит scope=admin.
    const memberToken = jwt.sign({ alumni_id: ALUMNI_ID, sub: "user-1", ver: 0 }, env.AUTH_SECRET, { expiresIn: "7d" });
    const app = await build();
    const r = await app.inject({ method, url, headers: { authorization: `Bearer ${memberToken}` } });
    expect(r.statusCode).toBe(401);
  });

  it("сервисный токен не открывает админку (он для cron-задач)", async () => {
    const app = await build();
    const r = await app.inject({ method: "GET", url: "/admin/overview", headers: { authorization: `Bearer ${env.DIRECTUS_SERVICE_TOKEN}` } });
    expect(r.statusCode).toBe(401);
  });

  it("токен, подписанный чужим секретом, не проходит", async () => {
    const forged = jwt.sign({ sub: EDITOR_ID, role: "editor", scope: "admin" }, "чужой-секрет-подлиннее-32-символов", { expiresIn: "12h" });
    const app = await build();
    const r = await app.inject({ method: "GET", url: "/admin/overview", headers: { authorization: `Bearer ${forged}` } });
    expect(r.statusCode).toBe(401);
  });

  it("истёкшая админ-сессия не проходит", async () => {
    const expired = jwt.sign({ sub: EDITOR_ID, role: "editor", scope: "admin" }, adminSecret(), { expiresIn: -10 });
    const app = await build();
    const r = await app.inject({ method: "GET", url: "/admin/overview", headers: { authorization: `Bearer ${expired}` } });
    expect(r.statusCode).toBe(401);
  });

  it("валидная админ-сессия пропускается", async () => {
    const token = jwt.sign({ sub: EDITOR_ID, role: "editor", scope: "admin" }, adminSecret(), { expiresIn: "12h" });
    const app = await build();
    const r = await app.inject({ method: "GET", url: "/admin/orders", headers: { authorization: `Bearer ${token}` } });
    expect(r.statusCode).toBe(200);
  });
});

describe("PATCH /admin/members/:id — изменение данных выпускника", () => {
  // Операции с ПДн и деньгами требуют роль admin: у editor только контент витрин.
  const adminAuth = () => ({ authorization: `Bearer ${jwt.sign({ sub: ADMIN_ID, role: "admin", scope: "admin" }, adminSecret(), { expiresIn: "12h" })}` });
  const editorAuth = () => ({ authorization: `Bearer ${jwt.sign({ sub: EDITOR_ID, role: "editor", scope: "admin" }, adminSecret(), { expiresIn: "12h" })}` });

  it("без токена скидку выставить нельзя", async () => {
    const app = await build();
    const r = await app.inject({ method: "PATCH", url: `/admin/members/${ALUMNI_ID}`, payload: { personal_discount: 10 } });
    expect(r.statusCode).toBe(401);
    expect(db.alumni![0]!.personal_discount).toBe(0);
  });

  it("персональная скидка ограничена сверху", async () => {
    const app = await build();
    const r = await app.inject({ method: "PATCH", url: `/admin/members/${ALUMNI_ID}`, payload: { personal_discount: 99 }, headers: adminAuth() });
    expect(r.statusCode).toBe(400);
    expect(db.alumni![0]!.personal_discount).toBe(0);
  });

  it("верификация проставляет дату verified_at", async () => {
    const app = await build();
    const r = await app.inject({ method: "PATCH", url: `/admin/members/${ALUMNI_ID}`, payload: { verification_status: "verified" }, headers: adminAuth() });
    expect(r.statusCode).toBe(200);
    expect(db.alumni![0]!.verified_at).toBeTruthy();
  });

  it("действие админа попадает в аудит", async () => {
    const app = await build();
    await app.inject({ method: "PATCH", url: `/admin/members/${ALUMNI_ID}`, payload: { personal_discount: 5 }, headers: adminAuth() });
    expect(db.audit_log!.some((e) => String(e.actor).includes(ADMIN_ID))).toBe(true);
  });

  it("редактору скидку выставить нельзя – 403", async () => {
    const app = await build();
    const r = await app.inject({ method: "PATCH", url: `/admin/members/${ALUMNI_ID}`, payload: { personal_discount: 5 }, headers: editorAuth() });
    expect(r.statusCode).toBe(403);
    expect(db.alumni![0]!.personal_discount).toBe(0);
  });
});

describe("разграничение ролей: editor против admin", () => {
  const editorAuth = () => ({ authorization: `Bearer ${jwt.sign({ sub: EDITOR_ID, role: "editor", scope: "admin" }, adminSecret(), { expiresIn: "12h" })}` });
  const adminAuth = () => ({ authorization: `Bearer ${jwt.sign({ sub: ADMIN_ID, role: "admin", scope: "admin" }, adminSecret(), { expiresIn: "12h" })}` });

  // ПДн, деньги и необратимые действия: редактор не должен пройти.
  const FULL_ONLY = [
    { method: "GET" as const, url: "/admin/orders/export.csv" },
    { method: "POST" as const, url: `/admin/members/${ALUMNI_ID}/points`, payload: { delta: 100 } },
    { method: "POST" as const, url: `/admin/members/${ALUMNI_ID}/anonymize` },
    { method: "POST" as const, url: `/admin/members/${ALUMNI_ID}/podcast-sub` },
    { method: "POST" as const, url: "/admin/push/broadcast", payload: { title: "Тема", body: "Текст" } },
  ];

  for (const r of FULL_ONLY) {
    it(`${r.method} ${r.url} – редактору 403`, async () => {
      const app = await build();
      const res = await app.inject({ method: r.method, url: r.url, payload: (r as any).payload, headers: editorAuth() });
      expect(res.statusCode).toBe(403);
    });
  }

  it("контент витрин редактору по-прежнему доступен", async () => {
    const app = await build();
    const res = await app.inject({ method: "GET", url: "/admin/news", headers: editorAuth() });
    expect(res.statusCode).toBe(200);
  });

  it("выгрузка заявок админу доступна", async () => {
    const app = await build();
    const res = await app.inject({ method: "GET", url: "/admin/orders/export.csv", headers: adminAuth() });
    expect(res.statusCode).toBe(200);
  });
});

describe("выход из админ-панели гасит сессию", () => {
  it("после /auth/admin-logout тот же токен больше не работает", async () => {
    const app = await build();
    const login = await app.inject({ method: "POST", url: "/auth/admin-login", payload: { email: "office@example.com", password: "ok" } });
    const token = login.json().token as string;
    const auth = { authorization: `Bearer ${token}` };

    expect((await app.inject({ method: "GET", url: "/admin/overview", headers: auth })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/auth/admin-logout", headers: auth })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/admin/overview", headers: auth })).statusCode).toBe(401);
  });
});
