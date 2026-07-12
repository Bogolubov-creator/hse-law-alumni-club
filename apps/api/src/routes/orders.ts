import type { FastifyInstance, FastifyRequest } from "fastify";
import { readItems, createItem, updateItem } from "@directus/sdk";
import { z } from "zod";
import { effectiveDiscount, computeOrderTotals, orderNumber, repriceItems } from "@club/shared";
import { directus } from "../lib/directus.js";
import { resolveAlumni } from "../lib/auth.js";
import { notifyOffice, confirmApplicant } from "../lib/notify.js";
import { paymentsEnabled, createPayment } from "../lib/yookassa.js";
import { audit } from "../lib/audit.js";
import { lookup, cartSession } from "./cart.js";
import { lastOrderSeq } from "../lib/order-number.js";

const di = directus;




const createOrderBody = z.object({
  contact_fio: z.string().min(2).max(200),
  contact_phone: z.string().min(5).max(40),
  contact_email: z.string().email().max(200),
  fulfillment: z.enum(["pickup", "delivery"]),
  address: z.string().max(500).nullish(),
  comment: z.string().max(2000).nullish(),
  consent_pdn: z.literal(true, { errorMap: () => ({ message: "Требуется согласие на обработку ПДн" }) }),
  // Honeypot: скрытое поле, которое видят только боты. Заполнено → отказ.
  website: z.string().max(0).optional(),
});

export async function ordersRoutes(app: FastifyInstance) {
  // Оформление заявки. Жёсткий лимит: заявка триггерит уведомление офиса и
  // создание платежа ЮKassa — защищаем от флуда/DoS (аудит H1).
  app.post("/orders", { config: { rateLimit: { max: 6, timeWindow: "1 minute" } } }, async (req, reply) => {
    const token = cartSession(req);
    if (!token) return reply.code(400).send({ error: "Нет сессии корзины" });
    const body = createOrderBody.parse(req.body);

    const cartRows = (await di.request(readItems("carts", { filter: { session_token: { _eq: token } }, limit: 1, fields: ["id", "items_json"] }))) as any[];
    const items = (cartRows[0]?.items_json as any[]) ?? [];
    if (!items.length) return reply.code(400).send({ error: "Корзина пуста" });

    // Переоценка по каталогу (анти-подмена цены): собрать актуальные цены, затем чистые функции.
    // Позиция, ставшая недоступной, пока лежала в корзине (снята с публикации, удалена,
    // ДПО ушла на маркетплейс hse.ru или набор закрыт), в заявку не попадает — иначе
    // заказ уходит по устаревшей цене на то, что больше не продаётся.
    const priceMap = new Map<string, { title: string; price: number }>();
    const unavailableTitles = new Set<string>();
    for (const i of items) {
      const key = `${i.type}:${i.ref_id}`;
      if (priceMap.has(key)) continue;
      const info = await lookup(i.type, i.ref_id);
      if (!info || (i.type === "dpo" && (info.source_url || info.enrollment === "nonactual"))) {
        unavailableTitles.add(i.title || i.ref_id);
      } else {
        priceMap.set(key, info);
      }
    }
    // Ни одна позиция молча не выкидывается: если что-то стало недоступным (снято
    // с публикации, удалено, ДПО ушла на маркетплейс или набор закрыт) — заявку не
    // создаём и явно сообщаем пользователю, что убрать. Иначе «заказал, а его нет».
    if (unavailableTitles.size) {
      return reply.code(409).send({
        error: `Эти позиции больше недоступны: ${[...unavailableTitles].join(", ")}. Удалите их из корзины и оформите заказ заново.`,
        unavailable: [...unavailableTitles],
      });
    }
    const priced = repriceItems(items, (t, r) => priceMap.get(`${t}:${r}`));

    const alumni = await resolveAlumni(req);
    const discount = effectiveDiscount(
      !!alumni && alumni.verification_status === "verified",
      alumni?.points_cached ?? 0,
      alumni?.personal_discount ?? 0,
    );
    const { subtotal, total } = computeOrderTotals(priced, discount);

    const types = [...new Set(priced.map((i) => i.type))];
    const type = types.length > 1 ? "mixed" : types[0] === "dpo" ? "dpo" : "merch";

    const base = {
      alumni_id: alumni?.id ?? null, type, items_json: priced,
      subtotal, member_discount: discount, total_estimate: total,
      contact_fio: body.contact_fio, contact_phone: body.contact_phone, contact_email: body.contact_email,
      fulfillment: body.fulfillment, address: body.address ?? null, comment: body.comment ?? null,
      consent_pdn: true, status: "new",
    };

    // Уникальный номер с повтором при гонке (поле number уникально в БД).
    const year = new Date().getFullYear();
    const baseSeq = await lastOrderSeq(year);
    let number = "";
    let created = false;
    for (let attempt = 0; attempt < 6 && !created; attempt++) {
      number = orderNumber(year, baseSeq, attempt);
      try {
        await di.request((createItem as any)("orders", { ...base, number }));
        created = true;
      } catch (e) {
        if (attempt === 5) { req.log.error({ err: e }, "order create failed"); return reply.code(500).send({ error: "Не удалось создать заявку, попробуйте ещё раз" }); }
      }
    }

    // Точка коммита пройдена — заявка существует. Дальнейшие сбои НЕ выдаём за полный провал.
    try {
      if (cartRows[0]) await di.request((updateItem as any)("carts", cartRows[0].id, { items_json: [] }));
    } catch (e) {
      req.log.error({ err: e, number }, "order created but cart not cleared");
    }

    const notice = {
      number, contact_fio: body.contact_fio, contact_phone: body.contact_phone, contact_email: body.contact_email,
      itemsSummary: priced.map((i) => `${i.title}${i.variant_sku ? ` (${i.variant_sku})` : ""} ×${i.qty}`).join("; "),
      total_estimate: total, member_discount: discount,
    };
    const notified = await notifyOffice(notice).catch((e) => {
      req.log.error({ err: e, number }, "notifyOffice threw");
      return { channel: "none", ok: false, blocked: true };
    });
    await confirmApplicant(notice).catch((e) => req.log.error({ err: e, number }, "confirmApplicant threw"));

    // Оплата (ЮKassa) — если подключена: создаём платёж сразу, отдаём ссылку.
    // Сбой оплаты НЕ роняет заявку — офис свяжется, оплатить можно позже из ЛК.
    let payment_url: string | undefined;
    if (paymentsEnabled() && total > 0) {
      try {
        const payment = await createPayment({
          amountKop: total,
          description: `Заявка ${number} · Клуб выпускников факультета права НИУ ВШЭ`,
          orderNumber: number,
          customerEmail: body.contact_email,
        });
        payment_url = payment.confirmation?.confirmation_url;
        const created_order = (await di.request(readItems("orders", { filter: { number: { _eq: number } }, limit: 1, fields: ["id"] }))) as any[];
        if (created_order[0]) await di.request((updateItem as any)("orders", created_order[0].id, { payment_id: payment.id, payment_status: payment.status }));
      } catch (e) {
        req.log.error({ err: e, number }, "yookassa create on order failed");
      }
    }

    audit("order.created", { actor: alumni ? `alumni:${alumni.id}` : "guest", subject: `order:${number}`, detail: { total, discount, type }, req });
    return { number, status: "new", member_discount: discount, subtotal, total_estimate: total, notified, payment_url };
  });

  // Заявки выпускника.
  app.get("/me/orders", async (req, reply) => {
    const alumni = await resolveAlumni(req);
    if (!alumni) return reply.code(401).send({ error: "Не авторизован" });
    return di.request(readItems("orders", {
      filter: { alumni_id: { _eq: alumni.id } }, sort: ["-created_at"], limit: 50,
      fields: ["number", "type", "status", "subtotal", "member_discount", "total_estimate", "created_at"],
    }));
  });
}
