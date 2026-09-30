import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import jwt from "jsonwebtoken";
import { hashPassword } from "@club/server-auth";
const officeHash = await hashPassword("ok");
const outsiderHash = await hashPassword("any");

vi.mock("../../../../src/db/checkout-store.js", async () => await import("../../../helpers/fake-checkout.js"));
vi.mock("../../../../src/db/data.js", async () => (await import("../../../helpers/fake-data.js")).dataModuleMock);

const { db, resetDb } = await import("../../../helpers/fake-data.js");
const { adminRoutes } = await import("../../../../src/modules/office/routes.js");
const { registerErrorHandler } = await import("../../../../src/common/errors.js");
const { env } = await import("../../../../src/config/env.js");

const EDITOR_ID = "user-editor";
const ADMIN_ID = "user-admin";
const ALUMNI_ID = "alumni-1";

/** Маршруты админки, которые обязаны быть закрыты гардом. */
const GUARDED = [
  { method: "GET" as const, url: "/admin/news-sources" },
  { method: "POST" as const, url: "/admin/news-sources/telegram/refresh" },
  { method: "POST" as const, url: "/admin/news-sources/" + "a".repeat(64) + "/import" },
  { method: "PATCH" as const, url: "/admin/news-sources/" + "a".repeat(64) },
  { method: "GET" as const, url: "/admin/overview" },
  { method: "GET" as const, url: "/admin/system-health" },
  { method: "GET" as const, url: "/admin/orders" },
  { method: "GET" as const, url: "/admin/members" },
  { method: "GET" as const, url: "/admin/audit" },
  { method: "GET" as const, url: "/admin/analytics" },
  { method: "GET" as const, url: "/admin/analytics/export.csv" },
];

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
      { id: EDITOR_ID, email: "office@example.com", status: "active", password: officeHash, role: { name: "editor" } },
      { id: ADMIN_ID, email: "chief@example.com", status: "active", password: officeHash, role: { name: "admin" } },
      { id: "user-outsider", email: "outsider@example.com", status: "active", password: outsiderHash, role: { name: "alumni" } },
    ],
    alumni: [{ id: ALUMNI_ID, user_id: "user-1", fio: "Иван Петров", verification_status: "verified", token_version: 0, points_cached: 0, personal_discount: 0 }],
    orders: [], levels: [], audit_log: [], points_ledger: [],
  });
});

describe("POST /auth/admin-login", () => {
  it("роль вне списка админских → 403, токен не выдаётся", async () => {
    const app = await build();
    const r = await app.inject({ method: "POST", url: "/auth/admin-login", payload: { email: "outsider@example.com", password: "any" } });
    expect(r.statusCode).toBe(403);
    expect(r.json().token).toBeUndefined();
  });

  it("неверный пароль → 401", async () => {
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
    const r = await app.inject({ method: "GET", url: "/admin/overview", headers: { authorization: `Bearer ${env.POINTS_SERVICE_TOKEN}` } });
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

  it.each(["suspended", "archived", "unverified"])("выданная сессия перестаёт работать при status=%s", async status => {
    const token = jwt.sign({ sub: ADMIN_ID, role: "admin", scope: "admin" }, adminSecret(), { expiresIn: "12h" });
    db.directus_users!.find(user => user.id === ADMIN_ID)!.status = status;
    const app = await build();
    expect((await app.inject({ url: "/admin/orders", headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(401);
    await app.close();
  });

  it("понижение admin до editor сразу закрывает финансовую операцию", async () => {
    const token = jwt.sign({ sub: ADMIN_ID, role: "admin", scope: "admin" }, adminSecret(), { expiresIn: "12h" });
    db.directus_users!.find(user => user.id === ADMIN_ID)!.role = { name: "editor" };
    const app = await build();
    const headers = { authorization: `Bearer ${token}` };
    expect((await app.inject({ url: "/admin/orders", headers })).statusCode).toBe(200);
    expect((await app.inject({ method: "PATCH", url: `/admin/members/${ALUMNI_ID}`, headers, payload: { personal_discount: 10 } })).statusCode).toBe(403);
    expect(db.alumni![0]!.personal_discount).toBe(0);
    await app.close();
  });

  it("удалённый пользователь или роль alumni не сохраняют старые права", async () => {
    const token = jwt.sign({ sub: ADMIN_ID, role: "admin", scope: "admin" }, adminSecret(), { expiresIn: "12h" });
    const app = await build();
    const headers = { authorization: `Bearer ${token}` };
    db.directus_users!.find(user => user.id === ADMIN_ID)!.role = { name: "alumni" };
    expect((await app.inject({ url: "/admin/orders", headers })).statusCode).toBe(401);
    db.directus_users = db.directus_users!.filter(user => user.id !== ADMIN_ID);
    expect((await app.inject({ url: "/admin/orders", headers })).statusCode).toBe(401);
    await app.close();
  });

  it("при сбое БД старый JWT не открывает админку", async () => {
    const { authStore } = await import("../../../../src/modules/auth/native-auth-store.js");
    const spy = vi.spyOn(authStore, "findUser").mockRejectedValueOnce(new Error("Database unavailable"));
    const token = jwt.sign({ sub: ADMIN_ID, role: "admin", scope: "admin" }, adminSecret(), { expiresIn: "12h" });
    const app = await build();
    try {
      expect((await app.inject({ url: "/admin/orders", headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(401);
    } finally { spy.mockRestore(); await app.close(); }
  });

  it("операторский сброс гасит старое поколение staff JWT, новый вход использует текущее", async () => {
    const token = jwt.sign({ sub: EDITOR_ID, role: "editor", scope: "admin" }, adminSecret(), { expiresIn: "12h" });
    db.club_staff_sessions = [{ user_id: EDITOR_ID, token_version: 1 }];
    const app = await build();
    expect((await app.inject({ url: "/admin/orders", headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(401);
    const login = await app.inject({ method: "POST", url: "/auth/admin-login", payload: { email: "office@example.com", password: "ok" } });
    expect(login.statusCode).toBe(200);
    expect((jwt.verify(login.json().token, adminSecret()) as { ver: number }).ver).toBe(1);
    expect((await app.inject({ url: "/admin/orders", headers: { authorization: `Bearer ${login.json().token}` } })).statusCode).toBe(200);
    await app.close();
  });
});

describe("PATCH /admin/members/:id – изменение данных выпускника", () => {
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
