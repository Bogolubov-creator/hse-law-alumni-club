import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { formatRub, securePaymentUrl } from "@club/shared";
import { resolveAlumni } from "../auth/auth.js";
import { paymentsEnabled, createPayment, fetchPayment } from "./yookassa.js";
import { audit } from "../../observability/audit.js";
import { isYookassaIp } from "../auth/security.js";
import { env } from "../../config/env.js";
import { sendEmail } from "../notifications/notify.js";
import { applyVerifiedPayment, prepareOrderPayment, recordCreatedPayment } from "./payment-store.js";



export async function paymentsRoutes(app: FastifyInstance) {
  app.get("/payments/config", async () => ({ enabled: paymentsEnabled() }));

  // Создать (или переиспользовать) платёж по своей заявке → ссылка на оплату.
  app.post("/orders/:number/pay", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!paymentsEnabled()) return reply.code(503).send({ error: "Оплата на сайте пока не подключена" });
    const { number } = z.object({ number: z.string().min(1) }).parse(req.params);

    // Повторная оплата доступна владельцу; гостевой платёж создаётся при оформлении.
    const alumni = await resolveAlumni(req);
    if (!alumni) return reply.code(403).send({ error: "Оплата доступна владельцу заявки" });
    const order = await prepareOrderPayment(number, alumni.id);

    // Уже есть незавершённый платёж – вернуть его ссылку, не плодить дубли.
    if (order.payment_id) {
      const existing = await fetchPayment(order.payment_id);
      await recordCreatedPayment(number, existing);
      if (existing.status === "pending" && existing.confirmation?.confirmation_url) {
        const url = securePaymentUrl(existing.confirmation.confirmation_url);
        if (!url) return reply.code(502).send({ error: "ЮKassa не вернула защищённую ссылку на оплату" });
        return { payment_url: url };
      }
      return reply.code(409).send({ error: existing.status === "canceled"
        ? "Предыдущий платёж отменён. Обратитесь в учебный офис для новой заявки."
        : "Платёж уже обрабатывается. Проверьте статус заявки позже." });
    }

    const payment = await createPayment({
      amountKop: order.total_estimate,
      description: `Заявка ${order.number} · Клуб выпускников факультета права Вышки`,
      orderNumber: order.number,
      customerEmail: order.contact_email || undefined,
    });
    await recordCreatedPayment(number, payment);
    const url = securePaymentUrl(payment.confirmation?.confirmation_url);
    if (!url) return reply.code(502).send({ error: "ЮKassa не вернула защищённую ссылку на оплату" });
    return { payment_url: url };
  });

  // Webhook уведомлений ЮKassa. Телу не доверяем – статус перепроверяем
  // прямым запросом к API ЮKassa по payment.id (рекомендация ЮKassa).
  app.post("/payments/yookassa/webhook", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!paymentsEnabled()) return reply.code(503).send({ ok: false });
    // В production проверяется подсеть отправителя, затем статус в API ЮKassa.
    const ip = req.ip.replace(/^::ffff:/, "");
    const isLocal = env.APP_ENV !== "production" &&
      (ip === "127.0.0.1" || ip === "::1" || /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(ip));
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
      verified = await fetchPayment(body.data.object.id); // Статус подтверждается запросом к API ЮKassa.
    } catch (e) {
      req.log.error({ err: e }, "yookassa verify failed");
      return reply.code(502).send({ ok: false });
    }

    const orderNumber = verified.metadata?.order_number;
    if (!orderNumber) return { ok: true }; // Несвязанный платёж не меняет заявки.

    const { outcome, order } = await applyVerifiedPayment(verified);
    if (!order) return { ok: true };
    if (outcome === "review") {
      audit("payment.review", { actor: "yookassa", subject: `order:${orderNumber}`, detail: { payment_id: verified.id }, req });
      req.log.error({ orderNumber }, "payment requires reconciliation");
    } else if (outcome === "succeeded") {
      audit("payment.succeeded", { actor: "yookassa", subject: `order:${orderNumber}`, detail: { payment_id: verified.id, amount: verified.amount }, req });
      // Письмо об успешной оплате (fire-and-forget).
      if (order.contact_email && order.contact_email !== "-") {
        const isPodcast = order.type === "podcast";
        void sendEmail(
          order.contact_email,
          `Оплата получена – заявка ${orderNumber}`,
          `Здравствуйте, ${order.contact_fio}!\n\nОплата по заявке ${orderNumber} на сумму ${formatRub(order.total_estimate)} ₽ прошла успешно.` +
            (isPodcast ? "\nПодписка на подкасты клуба активирована на год – приятного прослушивания!" : "\nЗаявка передана учебному офису в работу.") +
            "\n\n– Клуб выпускников факультета права Вышки",
        ).catch((e) => req.log.error({ err: e, orderNumber }, "payment email failed"));
      }
      req.log.info({ orderNumber }, "yookassa payment succeeded");
    } else if (outcome === "canceled") {
      audit("payment.canceled", { actor: "yookassa", subject: `order:${orderNumber}`, detail: { payment_id: verified.id }, req });
    }
    return { ok: true };
  });
}
