import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import jwt from "jsonwebtoken";

vi.mock("@directus/sdk", async () => await import("../test/fake-sdk.js"));
vi.mock("../lib/directus.js", async () => (await import("../test/fake-directus.js")).directusModuleMock);
vi.mock("../lib/notify.js", () => ({
  notifyOffice: vi.fn(async () => ({ channel: "test", ok: true })),
  notifyOfficeText: vi.fn(async () => undefined),
  sendEmail: vi.fn(async () => true),
  mailEnabled: () => false,
}));
vi.mock("../lib/yookassa.js", () => ({
  paymentsEnabled: () => false,
  createPayment: vi.fn(),
  fetchPayment: vi.fn(),
}));

const { db, resetDb } = await import("../test/fake-directus.js");
const { podcastsRoutes } = await import("./podcasts.js");
const { registerErrorHandler } = await import("../lib/errors.js");
const { env } = await import("../env.js");
const notify = await import("../lib/notify.js");

const ALUMNI = "alumni-1";
const token = () => jwt.sign({ alumni_id: ALUMNI, sub: "user-1", ver: 0 }, env.AUTH_SECRET, { expiresIn: "7d" });

async function build(): Promise<FastifyInstance> {
  const app = Fastify();
  registerErrorHandler(app);
  await app.register(podcastsRoutes);
  return app;
}

const subscribe = (app: FastifyInstance) =>
  app.inject({ method: "POST", url: "/podcasts/subscribe", headers: { authorization: `Bearer ${token()}` }, payload: {} });

beforeEach(() => {
  vi.clearAllMocks();
  resetDb({
    alumni: [{ id: ALUMNI, fio: "Иван", verification_status: "verified", token_version: 0, podcast_sub_until: null, contacts_json: { email: "ivan@example.com" } }],
    orders: [],
    podcasts: [],
  });
});

describe("POST /podcasts/subscribe — заявка не задваивается", () => {
  it("первый вызов создаёт заявку и зовёт офис", async () => {
    const app = await build();
    const r = await subscribe(app);
    expect(r.statusCode).toBe(200);
    expect(db.orders).toHaveLength(1);
    expect(db.orders![0]!.type).toBe("podcast");
    expect(notify.notifyOffice).toHaveBeenCalledTimes(1);
  });

  /**
   * Раньше каждый повторный клик создавал новую заявку и дёргал офис ещё раз.
   * Теперь возвращается уже существующая незакрытая заявка.
   */
  it("повторные вызовы возвращают ту же заявку и офис больше не дёргают", async () => {
    const app = await build();
    const first = await subscribe(app);
    const second = await subscribe(app);
    const third = await subscribe(app);

    expect(db.orders).toHaveLength(1);
    expect(second.json().number).toBe(first.json().number);
    expect(third.json().number).toBe(first.json().number);
    expect(second.json().already).toBe(true);
    expect(notify.notifyOffice).toHaveBeenCalledTimes(1);
  });

  it("после оплаты прежней заявки новая создаётся", async () => {
    const app = await build();
    await subscribe(app);
    db.orders![0]!.payment_status = "succeeded";
    db.orders![0]!.status = "confirmed";
    const r = await subscribe(app);
    expect(r.statusCode).toBe(200);
    expect(db.orders).toHaveLength(2);
  });

  it("отменённая заявка не блокирует новую", async () => {
    const app = await build();
    await subscribe(app);
    db.orders![0]!.payment_status = "canceled";
    db.orders![0]!.status = "canceled";
    const r = await subscribe(app);
    expect(db.orders).toHaveLength(2);
    expect(r.json().already).toBeUndefined();
  });

  it("активная подписка — 400, заявка не создаётся", async () => {
    const app = await build();
    db.alumni![0]!.podcast_sub_until = new Date(Date.now() + 86400000).toISOString();
    const r = await subscribe(app);
    expect(r.statusCode).toBe(400);
    expect(db.orders).toHaveLength(0);
  });

  it("без токена — 401", async () => {
    const app = await build();
    const r = await app.inject({ method: "POST", url: "/podcasts/subscribe", payload: {} });
    expect(r.statusCode).toBe(401);
    expect(db.orders).toHaveLength(0);
  });

  it("неверифицированному — 403", async () => {
    const app = await build();
    db.alumni![0]!.verification_status = "pending";
    const r = await subscribe(app);
    expect(r.statusCode).toBe(403);
    expect(db.orders).toHaveLength(0);
  });
});
