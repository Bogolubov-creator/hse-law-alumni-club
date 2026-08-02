import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import jwt from "jsonwebtoken";

vi.mock("@directus/sdk", async () => await import("../test/fake-sdk.js"));
vi.mock("../lib/directus.js", async () => (await import("../test/fake-directus.js")).directusModuleMock);
vi.mock("../lib/push.js", () => ({ pushEnabled: () => false, pushToAll: vi.fn(), pushToAlumni: vi.fn() }));

const { db, resetDb } = await import("../test/fake-directus.js");
const { communityRoutes } = await import("./community.js");
const { registerErrorHandler } = await import("../lib/errors.js");
const { env } = await import("../env.js");

const A = "aaaaaaaa-0000-4000-8000-000000000001"; // я
const B = "aaaaaaaa-0000-4000-8000-000000000002"; // однокурсник
const C = "aaaaaaaa-0000-4000-8000-000000000003"; // посторонний

async function build(): Promise<FastifyInstance> {
  const app = Fastify();
  registerErrorHandler(app);
  await app.register(communityRoutes);
  return app;
}

const auth = (id: string) => ({ authorization: `Bearer ${jwt.sign({ alumni_id: id, sub: `u-${id}`, ver: 0 }, env.AUTH_SECRET, { expiresIn: "7d" })}` });
const addFriend = (app: FastifyInstance, me: string, target: string) =>
  app.inject({ method: "POST", url: "/me/friends", headers: auth(me), payload: { alumni_id: target } });
const removeFriend = (app: FastifyInstance, me: string, target: string) =>
  app.inject({ method: "DELETE", url: `/me/friends/${target}`, headers: auth(me) });

const alumnus = (id: string, over: Record<string, unknown> = {}) => ({
  id, fio: `Выпускник ${id.slice(-1)}`, cohort: "2024", edu_program: "Юриспруденция",
  verification_status: "verified", token_version: 0, points_cached: 0, interests_json: [], avatar: null, ...over,
});

beforeEach(() => {
  resetDb({
    alumni: [alumnus(A), alumnus(B), alumnus(C)],
    alumni_friends: [],
    orders: [],
  });
});

describe("DELETE /me/friends/:id – отклонить, отозвать, удалить", () => {
  it("входящую заявку можно отклонить: связь исчезает", async () => {
    const app = await build();
    await addFriend(app, B, A); // Б позвал меня
    expect(db.alumni_friends).toHaveLength(1);

    const r = await removeFriend(app, A, B);
    expect(r.statusCode).toBe(200);
    expect(r.json().status).toBe("none");
    expect(db.alumni_friends).toHaveLength(0);
  });

  it("свою отправленную заявку можно отозвать", async () => {
    const app = await build();
    await addFriend(app, A, B);
    await removeFriend(app, A, B);
    expect(db.alumni_friends).toHaveLength(0);
  });

  it("принятую дружбу можно расторгнуть", async () => {
    const app = await build();
    await addFriend(app, A, B);
    await addFriend(app, B, A); // встречная заявка принимает дружбу
    expect(db.alumni_friends![0]!.status).toBe("accepted");

    await removeFriend(app, A, B);
    expect(db.alumni_friends).toHaveLength(0);
  });

  it("удаление идемпотентно: связи нет – это и есть нужное состояние", async () => {
    const app = await build();
    const r = await removeFriend(app, A, C);
    expect(r.statusCode).toBe(200);
    expect(r.json().status).toBe("none");
  });

  it("чужая пара не задевается", async () => {
    const app = await build();
    await addFriend(app, B, C); // дружат между собой
    await removeFriend(app, A, B); // я убираю свою (несуществующую) связь с Б
    expect(db.alumni_friends).toHaveLength(1);
  });

  it("гонка встречных заявок: обе строки пары убираются", async () => {
    const app = await build();
    // Две pending-строки в обе стороны – возможны при одновременных заявках.
    db.alumni_friends!.push({ id: "l1", alumni_id: A, friend_id: B, status: "pending" });
    db.alumni_friends!.push({ id: "l2", alumni_id: B, friend_id: A, status: "pending" });
    await removeFriend(app, A, B);
    expect(db.alumni_friends).toHaveLength(0);
  });

  it("действие попадает в аудит", async () => {
    const app = await build();
    await addFriend(app, B, A);
    await removeFriend(app, A, B);
    expect((db.audit_log ?? []).some((e) => e.event === "friend.decline")).toBe(true);
  });

  it("расторжение дружбы отличается в аудите от отклонения", async () => {
    const app = await build();
    await addFriend(app, A, B);
    await addFriend(app, B, A);
    await removeFriend(app, A, B);
    expect((db.audit_log ?? []).some((e) => e.event === "friend.remove")).toBe(true);
  });

  it("без токена – 401", async () => {
    const app = await build();
    const r = await app.inject({ method: "DELETE", url: `/me/friends/${B}` });
    expect(r.statusCode).toBe(401);
  });

  it("неверифицированному – 403", async () => {
    const app = await build();
    db.alumni![0]!.verification_status = "pending";
    const r = await removeFriend(app, A, B);
    expect(r.statusCode).toBe(403);
  });

  it("нечисловой/не-uuid идентификатор – 400", async () => {
    const app = await build();
    const r = await app.inject({ method: "DELETE", url: "/me/friends/не-uuid", headers: auth(A) });
    expect(r.statusCode).toBe(400);
  });
});

describe("POST /me/friends – прежнее поведение не сломано", () => {
  it("встречная заявка принимает дружбу", async () => {
    const app = await build();
    await addFriend(app, A, B);
    const r = await addFriend(app, B, A);
    expect(r.json().status).toBe("accepted");
  });

  it("себя добавить нельзя", async () => {
    const app = await build();
    const r = await addFriend(app, A, A);
    expect(r.statusCode).toBe(400);
  });

  it("неверифицированного выпускника не найти", async () => {
    const app = await build();
    db.alumni![1]!.verification_status = "pending";
    const r = await addFriend(app, A, B);
    expect(r.statusCode).toBe(404);
  });
});
