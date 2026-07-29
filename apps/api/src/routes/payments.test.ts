import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import jwt from "jsonwebtoken";

vi.mock("@directus/sdk", async () => await import("../test/fake-sdk.js"));
vi.mock("../lib/directus.js", async () => (await import("../test/fake-directus.js")).directusModuleMock);

// ЮKassa наружу не ходит: подменяем клиент, чтобы задавать ответы платёжного API.
const yk = vi.hoisted(() => ({
  paymentsEnabled: vi.fn(() => true),
  createPayment: vi.fn(async () => ({ id: "pay-new", status: "pending", confirmation: { confirmation_url: "https://yookassa.test/pay/new" } })),
  fetchPayment: vi.fn(async () => ({ id: "pay-1", status: "succeeded", amount: { value: "1000.00", currency: "RUB" }, metadata: { order_number: "ALU-2026-000001" } })),
}));
vi.mock("../lib/yookassa.js", () => yk);

const { db, resetDb } = await import("../test/fake-directus.js");
const { paymentsRoutes } = await import("./payments.js");
const { registerErrorHandler } = await import("../lib/errors.js");
const { env } = await import("../env.js");

const YOOKASSA_IP = "185.71.76.1";  // из официальных подсетей
const RANDOM_IP = "203.0.113.7";    // чужой адрес
const ORDER = "ALU-2026-000001";
const ALUMNI_ID = "alumni-1";

async function build(): Promise<FastifyInstance> {
  // trustProxy: 1 — как в проде: req.ip берётся из X-Forwarded-For, поставленного Caddy.
  const app = Fastify({ trustProxy: 1 });
  registerErrorHandler(app);
  await app.register(paymentsRoutes);
  return app;
}

/** Уведомление ЮKassa: тело + адрес отправителя. */
function webhook(app: FastifyInstance, ip: string, paymentId = "pay-1") {
  return app.inject({
    method: "POST", url: "/payments/yookassa/webhook",
    headers: { "x-forwarded-for": ip },
    payload: { event: "payment.succeeded", object: { id: paymentId } },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  yk.paymentsEnabled.mockReturnValue(true);
  yk.fetchPayment.mockResolvedValue({ id: "pay-1", status: "succeeded", amount: { value: "1000.00", currency: "RUB" }, metadata: { order_number: ORDER } } as any);
  resetDb({
    orders: [{ id: "order-1", number: ORDER, alumni_id: ALUMNI_ID, type: "podcast", status: "new", payment_status: null, total_estimate: 100000, contact_email: "ivan@example.com", contact_fio: "Иван" }],
    alumni: [{ id: ALUMNI_ID, user_id: "user-1", verification_status: "verified", token_version: 0, podcast_sub_until: null, points_cached: 0, personal_discount: 0 }],
    audit_log: [],
  });
});

describe("вебхук ЮKassa: кто может его вызвать", () => {
  it("уведомление с постороннего адреса отклоняется и не меняет заявку", async () => {
    const app = await build();
    const r = await webhook(app, RANDOM_IP);
    expect(r.statusCode).toBe(403);
    expect(db.orders![0]!.payment_status).toBeNull();
    expect(db.audit_log!.some((e) => e.event === "payment.webhook.badip")).toBe(true);
  });

  it("уведомление из подсети ЮKassa принимается", async () => {
    const app = await build();
    const r = await webhook(app, YOOKASSA_IP);
    expect(r.statusCode).toBe(200);
  });

  it("при выключенной оплате вебхук закрыт (503)", async () => {
    yk.paymentsEnabled.mockReturnValue(false);
    const app = await build();
    const r = await webhook(app, YOOKASSA_IP);
    expect(r.statusCode).toBe(503);
  });
});

describe("вебхук ЮKassa: телу не доверяем", () => {
  it("статус берётся из API ЮKassa, а не из тела: отменённый платёж не оплачивает заявку", async () => {
    yk.fetchPayment.mockResolvedValue({ id: "pay-1", status: "canceled", metadata: { order_number: ORDER } } as any);
    const app = await build();
    // тело говорит payment.succeeded, а API — canceled
    const r = await webhook(app, YOOKASSA_IP);
    expect(r.statusCode).toBe(200);
    expect(db.orders![0]!.payment_status).toBe("canceled");
    expect(db.orders![0]!.status).toBe("new");
    expect(db.alumni![0]!.podcast_sub_until).toBeNull();
  });

  it("успешная оплата отмечает заявку и продлевает подписку", async () => {
    const app = await build();
    await webhook(app, YOOKASSA_IP);
    expect(db.orders![0]!.payment_status).toBe("succeeded");
    expect(db.orders![0]!.status).toBe("confirmed");
    expect(db.orders![0]!.paid_at).toBeTruthy();
    expect(db.alumni![0]!.podcast_sub_until).toBeTruthy();
    expect(db.audit_log!.some((e) => e.event === "payment.succeeded")).toBe(true);
  });

  it("повторная доставка того же уведомления не продлевает подписку дважды", async () => {
    const app = await build();
    await webhook(app, YOOKASSA_IP);
    const after1 = db.alumni![0]!.podcast_sub_until;
    await webhook(app, YOOKASSA_IP);
    expect(db.alumni![0]!.podcast_sub_until).toBe(after1);
    expect(db.audit_log!.filter((e) => e.event === "payment.succeeded")).toHaveLength(1);
  });

  it("две одновременные доставки не задваивают подписку (мьютекс по заявке)", async () => {
    const app = await build();
    await Promise.all([webhook(app, YOOKASSA_IP), webhook(app, YOOKASSA_IP)]);
    expect(db.audit_log!.filter((e) => e.event === "payment.succeeded")).toHaveLength(1);
  });

  it("платёж не про нашу заявку подтверждается приёмом, но ничего не меняет", async () => {
    yk.fetchPayment.mockResolvedValue({ id: "pay-x", status: "succeeded", metadata: {} } as any);
    const app = await build();
    const r = await webhook(app, YOOKASSA_IP, "pay-x");
    expect(r.statusCode).toBe(200);
    expect(db.orders![0]!.payment_status).toBeNull();
  });

  it("сбой проверки в API ЮKassa → 502, заявка не трогается (уведомление повторят)", async () => {
    yk.fetchPayment.mockRejectedValue(new Error("ЮKassa fetch payment: HTTP 500"));
    const app = await build();
    const r = await webhook(app, YOOKASSA_IP);
    expect(r.statusCode).toBe(502);
    expect(db.orders![0]!.payment_status).toBeNull();
  });
});

describe("POST /orders/:number/pay — ссылка на оплату", () => {
  const memberToken = () => jwt.sign({ alumni_id: ALUMNI_ID, sub: "user-1", ver: 0 }, env.AUTH_SECRET, { expiresIn: "7d" });

  it("без авторизации платить нельзя", async () => {
    const app = await build();
    const r = await app.inject({ method: "POST", url: `/orders/${ORDER}/pay` });
    expect(r.statusCode).toBe(403);
  });

  it("чужую заявку оплатить нельзя", async () => {
    const otherToken = jwt.sign({ alumni_id: "alumni-2", sub: "user-2", ver: 0 }, env.AUTH_SECRET, { expiresIn: "7d" });
    db.alumni!.push({ id: "alumni-2", user_id: "user-2", verification_status: "verified", token_version: 0, points_cached: 0, personal_discount: 0 });
    const app = await build();
    const r = await app.inject({ method: "POST", url: `/orders/${ORDER}/pay`, headers: { authorization: `Bearer ${otherToken}` } });
    expect(r.statusCode).toBe(403);
    expect(yk.createPayment).not.toHaveBeenCalled();
  });

  it("владелец получает ссылку на оплату", async () => {
    const app = await build();
    const r = await app.inject({ method: "POST", url: `/orders/${ORDER}/pay`, headers: { authorization: `Bearer ${memberToken()}` } });
    expect(r.statusCode).toBe(200);
    expect(r.json().payment_url).toContain("https://");
    // сумма берётся из заявки на сервере, а не из запроса клиента
    expect(yk.createPayment).toHaveBeenCalledWith(expect.objectContaining({ amountKop: 100000, orderNumber: ORDER }));
  });

  it("уже оплаченную заявку повторно оплатить нельзя", async () => {
    db.orders![0]!.payment_status = "succeeded";
    const app = await build();
    const r = await app.inject({ method: "POST", url: `/orders/${ORDER}/pay`, headers: { authorization: `Bearer ${memberToken()}` } });
    expect(r.statusCode).toBe(400);
    expect(yk.createPayment).not.toHaveBeenCalled();
  });

  it("отменённую заявку оплатить нельзя", async () => {
    db.orders![0]!.status = "canceled";
    const app = await build();
    const r = await app.inject({ method: "POST", url: `/orders/${ORDER}/pay`, headers: { authorization: `Bearer ${memberToken()}` } });
    expect(r.statusCode).toBe(400);
  });

  it("несуществующая заявка → 404", async () => {
    const app = await build();
    const r = await app.inject({ method: "POST", url: "/orders/ALU-2026-999999/pay", headers: { authorization: `Bearer ${memberToken()}` } });
    expect(r.statusCode).toBe(404);
  });
});
