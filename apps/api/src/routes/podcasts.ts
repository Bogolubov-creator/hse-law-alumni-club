import type { FastifyInstance } from "fastify";
import { readItems, createItem, updateItem } from "@directus/sdk";
import { PODCAST_SUB_PRICE_KOP, orderNumber } from "@club/shared";
import { directus } from "../lib/directus.js";
import { resolveAlumni } from "../lib/auth.js";
import { notifyOffice } from "../lib/notify.js";
import { paymentsEnabled, createPayment } from "../lib/yookassa.js";

const di = directus;

export function subActive(until: string | null | undefined): boolean {
  return !!until && new Date(until).getTime() > Date.now();
}

/**
 * Подкасты клуба. Список публичен (обложка/описание), но audio_url отдаётся
 * ТОЛЬКО активным подписчикам (подписка 3 999 ₽/год, alumni.podcast_sub_until).
 * Оформление подписки = заявка type=podcast (+онлайн-оплата ЮKassa при ключах);
 * подписку активирует оплата (webhook) или офис вручную из админ-панели.
 */
export async function podcastsRoutes(app: FastifyInstance) {
  app.get("/podcasts", async (req) => {
    const alumni = await resolveAlumni(req);
    const until = alumni?.podcast_sub_until ?? null;
    const subscribed = subActive(until);
    const rows = (await di.request(readItems("podcasts", {
      filter: { status: { _eq: "published" } }, sort: ["sort"], limit: -1,
      fields: ["id", "title", "description", "cover", "duration", "audio_url"],
    }))) as any[];
    return {
      items: rows.map((p) => ({ ...p, audio_url: subscribed ? p.audio_url : null })),
      subscribed,
      sub_until: subscribed ? until : null,
      price: PODCAST_SUB_PRICE_KOP,
    };
  });

  // Оформить годовую подписку: заявка + (если подключена) ссылка на оплату.
  app.post("/podcasts/subscribe", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req, reply) => {
    const alumni = await resolveAlumni(req);
    if (!alumni) return reply.code(401).send({ error: "Войдите в личный кабинет" });
    if (alumni.verification_status !== "verified") return reply.code(403).send({ error: "Доступно после верификации" });
    if (subActive(alumni.podcast_sub_until)) return reply.code(400).send({ error: "Подписка уже активна" });

    const contacts = alumni.contacts_json ?? {};
    const year = new Date().getFullYear();
    let number = "";
    let created = false;
    for (let attempt = 0; attempt < 6 && !created; attempt++) {
      const all = (await di.request(readItems("orders", { fields: ["id"], limit: -1 }))) as any[];
      number = orderNumber(year, all.length, attempt);
      try {
        await di.request((createItem as any)("orders", {
          number, alumni_id: alumni.id, type: "podcast",
          items_json: [{ type: "podcast", ref_id: "podcast-sub-year", qty: 1, price: PODCAST_SUB_PRICE_KOP, title: "Подписка на подкасты клуба · 1 год" }],
          subtotal: PODCAST_SUB_PRICE_KOP, member_discount: 0, total_estimate: PODCAST_SUB_PRICE_KOP,
          contact_fio: alumni.fio ?? "Выпускник", contact_phone: contacts.phone ?? "-", contact_email: contacts.email ?? "-",
          fulfillment: "pickup", consent_pdn: true, status: "new",
        }));
        created = true;
      } catch (e) {
        if (attempt === 5) { req.log.error({ err: e }, "podcast sub order failed"); return reply.code(500).send({ error: "Не удалось оформить подписку, попробуйте ещё раз" }); }
      }
    }

    await notifyOffice({
      number, contact_fio: alumni.fio ?? "Выпускник", contact_phone: contacts.phone ?? "-", contact_email: contacts.email ?? "-",
      itemsSummary: "Подписка на подкасты клуба · 1 год", total_estimate: PODCAST_SUB_PRICE_KOP, member_discount: 0,
    }).catch((e) => req.log.error({ err: e, number }, "notifyOffice threw"));

    let payment_url: string | undefined;
    if (paymentsEnabled()) {
      try {
        const payment = await createPayment({
          amountKop: PODCAST_SUB_PRICE_KOP,
          description: `Подписка на подкасты · заявка ${number}`,
          orderNumber: number,
          customerEmail: contacts.email,
        });
        payment_url = payment.confirmation?.confirmation_url;
        const rows = (await di.request(readItems("orders", { filter: { number: { _eq: number } }, limit: 1, fields: ["id"] }))) as any[];
        if (rows[0]) await di.request((updateItem as any)("orders", rows[0].id, { payment_id: payment.id, payment_status: payment.status }));
      } catch (e) {
        req.log.error({ err: e, number }, "yookassa podcast sub failed");
      }
    }
    return { number, payment_url };
  });
}

/** Продлить подписку выпускнику на N месяцев (оплата или решение офиса). */
export async function extendPodcastSub(alumniId: string, months = 12): Promise<string> {
  const rows = (await di.request(readItems("alumni", { filter: { id: { _eq: alumniId } }, limit: 1, fields: ["podcast_sub_until"] }))) as any[];
  const current = rows[0]?.podcast_sub_until ? new Date(rows[0].podcast_sub_until) : null;
  const base = current && current.getTime() > Date.now() ? current : new Date();
  base.setMonth(base.getMonth() + months);
  const until = base.toISOString();
  await di.request((updateItem as any)("alumni", alumniId, { podcast_sub_until: until }));
  return until;
}
