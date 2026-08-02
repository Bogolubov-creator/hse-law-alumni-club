import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import jwt from "jsonwebtoken";

vi.mock("@directus/sdk", async () => await import("../test/fake-sdk.js"));
vi.mock("../lib/directus.js", async () => (await import("../test/fake-directus.js")).directusModuleMock);
vi.mock("../lib/push.js", () => ({ pushEnabled: () => true, pushToAll: vi.fn(), pushToAlumni: vi.fn() }));

const { db, resetDb } = await import("../test/fake-directus.js");
const { pushRoutes } = await import("./push.js");
const { registerErrorHandler } = await import("../lib/errors.js");
const { env } = await import("../env.js");

const A = "alumni-a";
const B = "alumni-b";
const ENDPOINT = "https://push.example.com/subscription/xyz";
const KEYS = { p256dh: "p256dh-ключ-достаточной-длины", auth: "auth-ключ" };

async function build(): Promise<FastifyInstance> {
  const app = Fastify();
  registerErrorHandler(app);
  await app.register(pushRoutes);
  return app;
}

const tokenFor = (id: string) => jwt.sign({ alumni_id: id, sub: `user-${id}`, ver: 0 }, env.AUTH_SECRET, { expiresIn: "7d" });

const subscribe = (app: FastifyInstance, who: string, keys = KEYS) =>
  app.inject({
    method: "POST", url: "/me/push/subscribe",
    headers: { authorization: `Bearer ${tokenFor(who)}` },
    payload: { endpoint: ENDPOINT, keys },
  });

beforeEach(() => {
  resetDb({
    alumni: [
      { id: A, fio: "Алиса", verification_status: "verified", token_version: 0 },
      { id: B, fio: "Борис", verification_status: "verified", token_version: 0 },
      { id: "alumni-pending", fio: "Пётр", verification_status: "pending", token_version: 0 },
    ],
    push_subs: [],
  });
});

describe("POST /me/push/subscribe", () => {
  it("первая подписка создаёт запись", async () => {
    const app = await build();
    const r = await subscribe(app, A);
    expect(r.statusCode).toBe(200);
    expect(db.push_subs).toHaveLength(1);
    expect(db.push_subs![0]!.alumni_id).toBe(A);
  });

  it("повторная подписка того же выпускника не плодит записи и обновляет ключи", async () => {
    const app = await build();
    await subscribe(app, A);
    const fresh = { p256dh: "новый-p256dh-ключ-длинный", auth: "новый-auth" };
    await subscribe(app, A, fresh);
    expect(db.push_subs).toHaveLength(1);
    expect(db.push_subs![0]!.keys).toEqual(fresh);
  });

  /**
   * Ключевой сценарий: общий компьютер. Раньше дедупликация шла только по
   * endpoint, поэтому запись оставалась за прежним выпускником – уведомления
   * о ЕГО заявках уходили на устройство нового пользователя, а новый их не получал.
   */
  it("на общем устройстве подписка переходит к текущему выпускнику", async () => {
    const app = await build();
    await subscribe(app, A);
    const r = await subscribe(app, B);
    expect(r.statusCode).toBe(200);
    expect(db.push_subs).toHaveLength(1);
    expect(db.push_subs![0]!.alumni_id).toBe(B);
  });

  it("переназначение фиксируется в аудите", async () => {
    const app = await build();
    await subscribe(app, A);
    await subscribe(app, B);
    expect((db.audit_log ?? []).some((e) => e.event === "push.sub.reassign")).toBe(true);
  });

  it("без токена – 401", async () => {
    const app = await build();
    const r = await app.inject({ method: "POST", url: "/me/push/subscribe", payload: { endpoint: ENDPOINT, keys: KEYS } });
    expect(r.statusCode).toBe(401);
    expect(db.push_subs).toHaveLength(0);
  });

  it("неверифицированному – 403", async () => {
    const app = await build();
    const r = await subscribe(app, "alumni-pending");
    expect(r.statusCode).toBe(403);
    expect(db.push_subs).toHaveLength(0);
  });
});

describe("POST /me/push/unsubscribe", () => {
  it("удаляет только свою подписку", async () => {
    const app = await build();
    await subscribe(app, A);
    // Борис пытается отписать чужой endpoint – своей записи у него нет.
    const r = await app.inject({
      method: "POST", url: "/me/push/unsubscribe",
      headers: { authorization: `Bearer ${tokenFor(B)}` },
      payload: { endpoint: ENDPOINT },
    });
    expect(r.statusCode).toBe(200);
    expect(db.push_subs).toHaveLength(1); // чужая подписка на месте
    expect(db.push_subs![0]!.alumni_id).toBe(A);
  });

  it("своя подписка снимается", async () => {
    const app = await build();
    await subscribe(app, A);
    await app.inject({
      method: "POST", url: "/me/push/unsubscribe",
      headers: { authorization: `Bearer ${tokenFor(A)}` },
      payload: { endpoint: ENDPOINT },
    });
    expect(db.push_subs).toHaveLength(0);
  });
});
