import type { FastifyInstance, FastifyRequest } from "fastify";
import { readItems, updateItem } from "@directus/sdk";
import { z } from "zod";
import { directus } from "../lib/directus.js";
import { resolveAlumni } from "../lib/auth.js";
import { paymentsEnabled, createPayment, fetchPayment } from "../lib/yookassa.js";
import { extendPodcastSub } from "./podcasts.js";
import { audit } from "../lib/audit.js";
import { isYookassaIp } from "../lib/security.js";

const di = directus;

function session(req: FastifyRequest): string | null {
  const s = req.headers["x-cart-session"];
  return typeof s === "string" && z.string().uuid().safeParse(s).success ? s : null;
}

/**
 * Оплата заявок через ЮKassa. Весь контур за фичефлагом paymentsEnabled():
 * без ключей магазина сайт работает в прежнем режиме «заявка без оплаты».
 */
export async function paymentsRoutes(app: FastifyInstance) {
  // Публичный флаг для фронта: показывать ли кнопку оплаты.
  app.get("/payments/config", async () => ({ enabled: paymentsEnabled() }));

  // Создать (или переиспользовать) платёж по своей заявке → ссылка на оплату.
  app.post("/orders/:number/pay", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!paymentsEnabled()) return reply.code(503).send({ error: "Оплата на сайте пока не подключена" });
    const { number } = z.object({ number: z.string().min(1) }).parse(req.params);

    const rows = (await di.request(readItems("orders", {
      filter: { number: { _eq: number } }, limit: 1,
      fields: ["id", "number", "alumni_id", "total_estimate", "status", "payment_id", "payment_status", "contact_email"],
    }))) as any[];
    const order = rows[0];
    if (!order) return reply.code(404).send({ error: "Заявка не найдена" });

    // Платить может владелец: авторизованный выпускник по alumni_id
    // или гость с той же корзинной сессией нам недоступен постфактум — поэтому
    // гостевые оплаты создаются только сразу при оформлении (см. orders.ts).
    const alumni = await resolveAlumni(req);
    if (!order.alumni_id || !alumni || alumni.id !== order.alumni_id)
      return reply.code(403).send({ error: "Оплата доступна владельцу заявки" });
    if (order.status === "canceled") return reply.code(400).send({ error: "Заявка отменена" });
    if (order.payment_status === "succeeded") return reply.code(400).send({ error: "Заявка уже оплачена" });

    // Уже есть незавершённый платёж — вернуть его ссылку, не плодить дубли.
    if (order.payment_id) {
      const existing = await fetchPayment(order.payment_id).catch(() => null);
      if (existing?.status === "pending" && existing.confirmation?.confirmation_url) {
        return { payment_url: existing.confirmation.confirmation_url };
      }
    }

    const payment = await createPayment({
      amountKop: order.total_estimate,
      description: `Заявка ${order.number} · Клуб выпускников факультета права НИУ ВШЭ`,
      orderNumber: order.number,
      customerEmail: order.contact_email || undefined,
    });
    await di.request((updateItem as any)("orders", order.id, { payment_id: payment.id, payment_status: payment.status }));
    const url = payment.confirmation?.confirmation_url;
    if (!url) return reply.code(502).send({ error: "ЮKassa не вернула ссылку на оплату" });
    return { payment_url: url };
  });

  // Webhook уведомлений ЮKassa. Телу не доверяем — статус перепроверяем
  // прямым запросом к API ЮKassa по payment.id (рекомендация ЮKassa).
  app.post("/payments/yookassa/webhook", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!paymentsEnabled()) return reply.code(503).send({ ok: false });
    // Слой 1: уведомления принимаем только с официальных подсетей ЮKassa
    // (слой 2 ниже — верификация статуса прямым запросом к API).
    // Локальная разработка (Docker-сеть/localhost) не блокируется.
    const ip = req.ip.replace(/^::ffff:/, "");
    const isLocal = ip === "127.0.0.1" || ip === "::1" || /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(ip);
    if (!isLocal && !isYookassaIp(ip)) {
      audit("payment.webhook.badip", { actor: `ip:${ip}`, req });
      return reply.code(403).send({ ok: false });
    }
    const body = z.object({
      event: z.string(),
      object: z.object({ id: z.string() }).passthrough(),
    }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ ok: false });

    let verified;
    try {
      verified = await fetchPayment(body.data.object.id); // источник правды — API, не тело вебхука
    } catch (e) {
      req.log.error({ err: e }, "yookassa verify failed");
      return reply.code(502).send({ ok: false });
    }

    const orderNumber = verified.metadata?.order_number;
    if (!orderNumber) return { ok: true }; // не наш платёж — молча подтверждаем приём

    const rows = (await di.request(readItems("orders", {
      filter: { number: { _eq: orderNumber } }, limit: 1, fields: ["id", "status", "payment_status", "type", "alumni_id"],
    }))) as any[];
    const order = rows[0];
    if (!order) return { ok: true };

    if (verified.status === "succeeded" && order.payment_status !== "succeeded") {
      await di.request((updateItem as any)("orders", order.id, {
        payment_id: verified.id, payment_status: "succeeded", paid_at: new Date().toISOString(),
        status: order.status === "new" ? "confirmed" : order.status, // оплаченная заявка минует ручное подтверждение
      }));
      // Оплата подписки на подкасты → сразу продлеваем на год.
      if (order.type === "podcast" && order.alumni_id) {
        await extendPodcastSub(order.alumni_id, 12).catch((e) => req.log.error({ err: e, orderNumber }, "podcast sub extend failed"));
      }
      audit("payment.succeeded", { actor: "yookassa", subject: `order:${orderNumber}`, detail: { payment_id: verified.id, amount: verified.amount }, req });
      req.log.info({ orderNumber }, "yookassa payment succeeded");
    } else if (verified.status === "canceled") {
      await di.request((updateItem as any)("orders", order.id, { payment_id: verified.id, payment_status: "canceled" }));
      audit("payment.canceled", { actor: "yookassa", subject: `order:${orderNumber}`, detail: { payment_id: verified.id }, req });
    }
    return { ok: true };
  });
}
