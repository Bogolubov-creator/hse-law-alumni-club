import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { readItems, createItem, updateItem } from "@directus/sdk";
import { z } from "zod";
import { PODCAST_SUB_PRICE_KOP, orderNumber } from "@club/shared";
import { env } from "../env.js";
import { directus } from "../lib/directus.js";
import { lastOrderSeq } from "../lib/order-number.js";
import { resolveAlumni } from "../lib/auth.js";
import { notifyOffice } from "../lib/notify.js";
import { paymentsEnabled, createPayment, fetchPayment } from "../lib/yookassa.js";
import { audit } from "../lib/audit.js";

const di = directus;

export function subActive(until: string | null | undefined): boolean {
  return !!until && new Date(until).getTime() > Date.now();
}

// ── Подписанные ссылки на аудио ────────────────────────────────────
// Реальный audio_url наружу не отдаётся никогда. Клиент получает
// /api/podcasts/:id/audio?h=<holder>&exp=<unix>&sig=HMAC(id.holder.exp).
// holder = alumni-id подписчика (платный выпуск) либо "free" (пробный).
// Ссылка привязана к держателю: при отдаче платного аудио сервер повторно
// проверяет, что у этого выпускника ещё активна подписка → перепродажа
// ссылки бесполезна после истечения подписки или срока ссылки (аудит M3).
const AUDIO_LINK_TTL_SEC = 2 * 3600;

function audioSig(id: string, holder: string, exp: number): string {
  return createHmac("sha256", env.AUTH_SECRET).update(`${id}.${holder}.${exp}`).digest("hex");
}

export function signedAudioPath(id: string, holder: string): string {
  const exp = Math.floor(Date.now() / 1000) + AUDIO_LINK_TTL_SEC;
  return `/api/podcasts/${id}/audio?h=${encodeURIComponent(holder)}&exp=${exp}&sig=${audioSig(id, holder, exp)}`;
}

function verifyAudioSig(id: string, holder: string, exp: number, sig: string): boolean {
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  const expected = Buffer.from(audioSig(id, holder, exp), "hex");
  const got = Buffer.from(sig, "hex");
  return expected.length === got.length && timingSafeEqual(expected, got); // сравнение без утечки по времени
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
      fields: ["id", "title", "description", "cover", "duration", "is_free", "audio_url"],
    }))) as any[];
    return {
      // Реальный audio_url не покидает сервер: доступным выпускам выдаётся
      // подписанная истекающая ссылка на наш стрим-эндпоинт.
      items: rows.map((p) => ({
        id: p.id, title: p.title, description: p.description, cover: p.cover,
        duration: p.duration, is_free: !!p.is_free,
        audio_url: p.audio_url && (p.is_free || subscribed)
          ? signedAudioPath(p.id, p.is_free ? "free" : alumni!.id)
          : null,
      })),
      subscribed,
      sub_until: subscribed ? until : null,
      price: PODCAST_SUB_PRICE_KOP,
    };
  });

  // Отдача аудио по подписанной ссылке: проверка HMAC + срока, затем для
  // платного выпуска — повторная проверка активной подписки держателя (M3).
  app.get("/podcasts/:id/audio", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const q = z.object({ h: z.string().min(1).max(64), exp: z.coerce.number(), sig: z.string().regex(/^[0-9a-f]{64}$/) }).safeParse(req.query);
    if (!q.success || !verifyAudioSig(id, q.data.h, q.data.exp, q.data.sig))
      return reply.code(403).send({ error: "Ссылка недействительна или истекла" });
    const rows = (await di.request(readItems("podcasts", {
      filter: { id: { _eq: id }, status: { _eq: "published" } }, limit: 1, fields: ["audio_url", "is_free"],
    }))) as any[];
    const podcast = rows[0];
    if (!podcast?.audio_url) return reply.code(404).send({ error: "Выпуск не найден" });
    if (!podcast.is_free) {
      // Держатель ссылки должен быть выпускником с ещё активной подпиской.
      const a = (await di.request(readItems("alumni", { filter: { id: { _eq: q.data.h } }, limit: 1, fields: ["podcast_sub_until"] }))) as any[];
      if (!subActive(a[0]?.podcast_sub_until)) return reply.code(403).send({ error: "Подписка неактивна" });
    }
    return reply.redirect(podcast.audio_url, 302);
  });

  // Оформить годовую подписку: заявка + (если подключена) ссылка на оплату.
  app.post("/podcasts/subscribe", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req, reply) => {
    const alumni = await resolveAlumni(req);
    if (!alumni) return reply.code(401).send({ error: "Войдите в личный кабинет" });
    if (alumni.verification_status !== "verified") return reply.code(403).send({ error: "Доступно после верификации" });
    if (subActive(alumni.podcast_sub_until)) return reply.code(400).send({ error: "Подписка уже активна" });

    // Незакрытая заявка на подписку уже есть — возвращаем её, а не плодим новые.
    // Без этого каждый повторный клик создавал заявку и дёргал офис уведомлением.
    // ВНИМАНИЕ про NULL: `_nin` транслируется в SQL `NOT IN`, а `NULL NOT IN (…)`
    // не даёт совпадения. При выключенной оплате payment_status у новой заявки
    // как раз NULL — без явной ветки `_null` дедупликация не нашла бы её вовсе.
    const pending = (await di.request((readItems as any)("orders", {
      filter: {
        _and: [
          { alumni_id: { _eq: alumni.id } },
          { type: { _eq: "podcast" } },
          { status: { _in: ["new", "in_progress"] } },
          { _or: [{ payment_status: { _null: true } }, { payment_status: { _nin: ["succeeded", "canceled"] } }] },
        ],
      },
      sort: ["-created_at"], limit: 1, fields: ["number", "payment_id"],
    }))) as any[];
    if (pending[0]) {
      let payment_url: string | undefined;
      if (paymentsEnabled() && pending[0].payment_id) {
        const existing = await fetchPayment(pending[0].payment_id).catch(() => null);
        if (existing?.status === "pending") payment_url = existing.confirmation?.confirmation_url;
      }
      return { number: pending[0].number, payment_url, already: true };
    }

    const contacts = alumni.contacts_json ?? {};
    const year = new Date().getFullYear();
    const baseSeq = await lastOrderSeq(year);
    let number = "";
    let created = false;
    for (let attempt = 0; attempt < 6 && !created; attempt++) {
      number = orderNumber(year, baseSeq, attempt);
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
    audit("podcast.sub.request", { actor: `alumni:${alumni.id}`, subject: `order:${number}`, detail: { payment: !!payment_url }, req });
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
