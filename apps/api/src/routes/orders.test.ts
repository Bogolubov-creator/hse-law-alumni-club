import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import jwt from "jsonwebtoken";

vi.mock("@directus/sdk", async () => await import("../test/fake-sdk.js"));
vi.mock("../lib/directus.js", async () => (await import("../test/fake-directus.js")).directusModuleMock);
// Оплата в этих тестах выключена: проверяем сам контур заявки.
vi.mock("../lib/yookassa.js", () => ({
  paymentsEnabled: () => false,
  createPayment: vi.fn(),
  fetchPayment: vi.fn(),
}));

const { db, resetDb } = await import("../test/fake-directus.js");
const { ordersRoutes } = await import("./orders.js");
const { registerErrorHandler } = await import("../lib/errors.js");
const { env } = await import("../env.js");

const SESSION = "11111111-2222-4333-8444-555555555555";
const ALUMNI_ID = "alumni-1";
const CONTACTS = { contact_fio: "Иван Петров", contact_phone: "+79990000000", contact_email: "ivan@example.com", fulfillment: "pickup", consent_pdn: true };

async function build(): Promise<FastifyInstance> {
  const app = Fastify();
  registerErrorHandler(app);
  await app.register(ordersRoutes);
  return app;
}

function post(app: FastifyInstance, payload: Record<string, unknown>, headers: Record<string, string> = {}) {
  return app.inject({ method: "POST", url: "/orders", headers: { "x-cart-session": SESSION, ...headers }, payload });
}

const memberToken = () => jwt.sign({ alumni_id: ALUMNI_ID, sub: "user-1", ver: 0 }, env.AUTH_SECRET, { expiresIn: "7d" });

beforeEach(() => {
  resetDb({
    // Цена в каталоге — 690000 копеек; в корзине специально лежит другая.
    products: [{ id: "p1", slug: "robe", title: "Мантия выпускника", price: 690000, stock: 5, status: "published", variants_json: null }],
    programs: [{ id: "d1", slug: "ip-law", title: "Право ИС", price: 1200000, status: "published", enrollment: "actual", source_url: null }],
    carts: [{ id: "cart-1", session_token: SESSION, items_json: [{ type: "merch", ref_id: "robe", variant_sku: null, qty: 1, price: 1, title: "Мантия выпускника" }] }],
    orders: [],
    alumni: [{ id: ALUMNI_ID, user_id: "user-1", verification_status: "verified", token_version: 0, points_cached: 0, personal_discount: 10 }],
    audit_log: [],
  });
});

describe("POST /orders — предусловия", () => {
  it("без сессии корзины → 400", async () => {
    const app = await build();
    const r = await app.inject({ method: "POST", url: "/orders", payload: CONTACTS });
    expect(r.statusCode).toBe(400);
  });

  it("пустая корзина → 400, заявка не создаётся", async () => {
    db.carts![0]!.items_json = [];
    const app = await build();
    const r = await post(app, CONTACTS);
    expect(r.statusCode).toBe(400);
    expect(db.orders).toHaveLength(0);
  });

  it("без согласия на обработку ПДн → 400", async () => {
    const app = await build();
    const r = await post(app, { ...CONTACTS, consent_pdn: false });
    expect(r.statusCode).toBe(400);
    expect(db.orders).toHaveLength(0);
  });

  it("заполненный honeypot → 400", async () => {
    const app = await build();
    const r = await post(app, { ...CONTACTS, website: "http://spam" });
    expect(r.statusCode).toBe(400);
    expect(db.orders).toHaveLength(0);
  });

  it("битая почта в контактах → 400", async () => {
    const app = await build();
    const r = await post(app, { ...CONTACTS, contact_email: "не-почта" });
    expect(r.statusCode).toBe(400);
  });
});

describe("POST /orders — цена и наличие", () => {
  it("цена берётся из каталога, а не из корзины (защита от подмены)", async () => {
    const app = await build();
    const r = await post(app, CONTACTS);
    expect(r.statusCode).toBe(200);
    // В корзине лежала цена 1 копейка — в заявку она попасть не должна.
    expect(r.json().subtotal).toBe(690000);
    expect(db.orders![0]!.subtotal).toBe(690000);
  });

  it("позиция, снятая с публикации, блокирует заявку с объяснением", async () => {
    db.products![0]!.status = "draft";
    const app = await build();
    const r = await post(app, CONTACTS);
    expect(r.statusCode).toBe(409);
    expect(r.json().unavailable).toContain("Мантия выпускника");
    expect(db.orders).toHaveLength(0);
  });

  it("программа ДПО с маркетплейса hse.ru в заявку не оформляется", async () => {
    db.programs![0]!.source_url = "https://hse.ru/edu/dpo/ip-law";
    db.carts![0]!.items_json = [{ type: "dpo", ref_id: "ip-law", variant_sku: null, qty: 1, price: 1200000, title: "Право ИС" }];
    const app = await build();
    const r = await post(app, CONTACTS);
    expect(r.statusCode).toBe(409);
    expect(db.orders).toHaveLength(0);
  });

  it("закрытый набор ДПО в заявку не оформляется", async () => {
    db.programs![0]!.enrollment = "nonactual";
    db.carts![0]!.items_json = [{ type: "dpo", ref_id: "ip-law", variant_sku: null, qty: 1, price: 1200000, title: "Право ИС" }];
    const app = await build();
    const r = await post(app, CONTACTS);
    expect(r.statusCode).toBe(409);
  });

  it("заказ больше остатка склада → 409 с указанием доступного количества", async () => {
    db.carts![0]!.items_json = [{ type: "merch", ref_id: "robe", variant_sku: null, qty: 99, price: 690000, title: "Мантия выпускника" }];
    const app = await build();
    const r = await post(app, CONTACTS);
    expect(r.statusCode).toBe(409);
    expect(String(r.json().error)).toContain("в наличии 5");
    expect(db.orders).toHaveLength(0);
  });
});

describe("POST /orders — скидка выпускника", () => {
  it("гость платит полную цену", async () => {
    const app = await build();
    const r = await post(app, CONTACTS);
    expect(r.json().member_discount).toBe(0);
    expect(r.json().total_estimate).toBe(690000);
  });

  it("верифицированный выпускник получает скидку уровня плюс персональную", async () => {
    const app = await build();
    const r = await post(app, CONTACTS, { authorization: `Bearer ${memberToken()}` });
    // 5% базовой скидки уровня «выпускник» (0 баллов) + 10% персональной от офиса
    expect(r.json().member_discount).toBe(15);
    expect(db.orders![0]!.alumni_id).toBe(ALUMNI_ID);
  });

  it("скидка уменьшает сумму по ДПО", async () => {
    db.carts![0]!.items_json = [{ type: "dpo", ref_id: "ip-law", variant_sku: null, qty: 1, price: 1200000, title: "Право ИС" }];
    const app = await build();
    const r = await post(app, CONTACTS, { authorization: `Bearer ${memberToken()}` });
    expect(r.json().subtotal).toBe(1200000);
    expect(r.json().total_estimate).toBe(1200000 * 0.85);
  });

  it("на мерч скидка выпускника не распространяется: процент показан, сумма прежняя", async () => {
    const app = await build();
    const r = await post(app, CONTACTS, { authorization: `Bearer ${memberToken()}` });
    expect(r.json().member_discount).toBe(15);
    expect(r.json().total_estimate).toBe(690000); // база скидки — только ДПО
  });

  it("непроверенному выпускнику скидка не даётся", async () => {
    db.alumni![0]!.verification_status = "pending";
    const app = await build();
    const r = await post(app, CONTACTS, { authorization: `Bearer ${memberToken()}` });
    expect(r.json().member_discount).toBe(0);
  });

  it("подделанная сессия (чужая подпись) не даёт скидку выпускника", async () => {
    const forged = jwt.sign({ alumni_id: ALUMNI_ID, sub: "user-1", ver: 0 }, "чужой-секрет-подлиннее-32-символов", { expiresIn: "7d" });
    const app = await build();
    const r = await post(app, CONTACTS, { authorization: `Bearer ${forged}` });
    expect(r.json().member_discount).toBe(0);
    expect(db.orders![0]!.alumni_id).toBeNull();
  });

  it("сессия со старой версией токена (после сброса пароля) не даёт скидку", async () => {
    db.alumni![0]!.token_version = 5;
    const app = await build();
    const r = await post(app, CONTACTS, { authorization: `Bearer ${memberToken()}` });
    expect(r.json().member_discount).toBe(0);
  });
});

describe("POST /orders — создание заявки", () => {
  it("выдаёт номер, чистит корзину и пишет аудит", async () => {
    const app = await build();
    const r = await post(app, CONTACTS);
    expect(r.json().number).toMatch(/^ALU-\d{4}-\d{6}$/);
    expect(db.orders![0]!.status).toBe("new");
    expect(db.carts![0]!.items_json).toEqual([]);
    expect(db.audit_log!.some((e) => e.event === "order.created")).toBe(true);
  });

  it("номер не повторяется, если такой уже занят (гонка при оформлении)", async () => {
    const year = new Date().getFullYear();
    db.orders!.push({ id: "seed", number: `ALU-${year}-000001`, status: "new" });
    const app = await build();
    const r = await post(app, CONTACTS);
    expect(r.statusCode).toBe(200);
    expect(r.json().number).not.toBe(`ALU-${year}-000001`);
    expect(new Set(db.orders!.map((o) => o.number)).size).toBe(db.orders!.length);
  });
});
