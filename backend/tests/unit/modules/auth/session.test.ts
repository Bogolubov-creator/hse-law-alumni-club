import { beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyRequest } from "fastify";
vi.mock("../../../../src/db/data.js", async () => (await import("../../../helpers/fake-data.js")).dataModuleMock);
const { db, resetDb } = await import("../../../helpers/fake-data.js");
const { authStore } = await import("../../../../src/modules/auth/native-auth-store.js");
const { signSession, resolveAlumni, isServiceToken } = await import("../../../../src/modules/auth/auth.js");
const { env } = await import("../../../../src/config/env.js");
beforeEach(() => resetDb({
  directus_roles: [{ id: "role-alumni", name: "alumni" }],
  directus_users: [{ id: "user-1", role: "role-alumni", status: "active", provider: "default" }],
  alumni: [{ id: "member", user_id: "user-1", token_version: 0, telegram_id: "42" }],
}));
async function status(token = signSession("member", "user-1")) {
  const app = Fastify();
  app.get("/probe", async (req, reply) => await resolveAlumni(req) ? { ok: true } : reply.code(401).send({ error: "denied" }));
  try { return (await app.inject({ url: "/probe", headers: { authorization: `Bearer ${token}` } })).statusCode; }
  finally { await app.close(); }
}
describe("Действующая сессия выпускника", () => {
  it("принадлежит связанному активному alumni", async () => { expect(await status()).toBe(200); });
  it.each(["suspended", "archived", "unverified"])("status=%s гасит старый JWT", async value => {
    db.directus_users![0]!.status = value;
    expect(await status()).toBe(401);
  });
  it.each(["service", "admin", "editor"])("роль %s не сохраняет доступ к бывшему профилю", async role => {
    db.directus_users![0]!.role = { name: role };
    expect(await status()).toBe(401);
  });
  it("удалённый аккаунт и недоступная БД не пропускаются", async () => {
    const spy = vi.spyOn(authStore, "findUser").mockRejectedValueOnce(new Error("Database unavailable"));
    expect(await status()).toBe(401); spy.mockRestore();
    db.directus_users = [];
    expect(await status()).toBe(401);
  });
  it("sub другого аккаунта не открывает профиль и повторная привязка отзывает старый JWT", async () => {
    expect(await status(signSession("member", "someone-else"))).toBe(401);
    db.alumni![0]!.user_id = "new-user";
    db.directus_users!.push({ id: "new-user", role: "role-alumni", status: "active" });
    expect(await status()).toBe(401);
    expect(await status(signSession("member", "new-user"))).toBe(200);
  });
  it("включение MFA или SSO не оставляет старую парольную сессию", async () => {
    db.directus_users![0]!.tfa_secret = "synthetic-mfa";
    expect(await status()).toBe(401);
    db.directus_users![0]!.tfa_secret = null; db.directus_users![0]!.provider = "external";
    expect(await status()).toBe(401);
  });
  it("старый непривязанный Telegram-профиль разрешён только своему telegram_id", async () => {
    db.alumni![0]!.user_id = null;
    expect(await status(signSession("member", "42"))).toBe(200);
    expect(await status(signSession("member", "99"))).toBe(401);
    db.alumni![0]!.telegram_id = null;
    expect(await status(signSession("member", "42"))).toBe(401);
  });
});
it("пустой сервисный секрет не включает доступ, заданный сравнивается целиком", () => {
  const previous = env.POINTS_SERVICE_TOKEN;
  const req = (authorization?: string) => ({ headers: { authorization } }) as FastifyRequest;
  try {
    env.POINTS_SERVICE_TOKEN = "";
    expect(isServiceToken(req())).toBe(false);
    expect(isServiceToken(req("Bearer "))).toBe(false);
    env.POINTS_SERVICE_TOKEN = "synthetic-points-key";
    expect(isServiceToken(req("Bearer synthetic-points-key"))).toBe(true);
    expect(isServiceToken(req("Bearer synthetic-points-ke"))).toBe(false);
  } finally { env.POINTS_SERVICE_TOKEN = previous; }
});
