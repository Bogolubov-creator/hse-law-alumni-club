import type { FastifyInstance } from "fastify";
import { readItems, updateItem } from "@directus/sdk";
import { z } from "zod";
import { achievementProgress, sanitizeInterests } from "@club/shared";
import { directus } from "../lib/directus.js";
import { levelInfo, alumniStats } from "../lib/engine.js";
import { resolveAlumni } from "../lib/auth.js";
import { makeTgLinkCode } from "../lib/tg-link.js";
import { anonymizeAlumni } from "../lib/anonymize.js";
import { audit } from "../lib/audit.js";
import { env } from "../env.js";

const di = directus;
const MONTHS_RU = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

function lastSixMonths(ledger: { delta: number; created_at: string }[], now = new Date()) {
  const buckets: { key: string; m: string; points: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    buckets.push({ key: `${d.getUTCFullYear()}-${d.getUTCMonth()}`, m: MONTHS_RU[d.getUTCMonth()]!, points: 0 });
  }
  const idx = new Map(buckets.map((b) => [b.key, b]));
  for (const row of ledger) {
    if (!row.created_at || row.delta <= 0) continue;
    const d = new Date(row.created_at);
    const b = idx.get(`${d.getUTCFullYear()}-${d.getUTCMonth()}`);
    if (b) b.points += row.delta;
  }
  return buckets.map((b) => ({ month: b.m, points: b.points }));
}

export async function meRoutes(app: FastifyInstance) {
  // Ссылка привязки Telegram-бота: t.me/<бот>?start=<подписанный код>.
  app.get("/me/tg-link", async (req, reply) => {
    const a = await resolveAlumni(req);
    if (!a) return reply.code(401).send({ error: "Не авторизован" });
    if (a.verification_status !== "verified") return reply.code(403).send({ error: "Доступно после верификации" });
    const rows = (await di.request((readItems as any)("alumni", { filter: { id: { _eq: a.id } }, limit: 1, fields: ["telegram_id"] }))) as any[];
    return {
      linked: !!rows[0]?.telegram_id,
      url: `https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=${makeTgLinkCode(a.id)}`,
    };
  });


  // Сводка ЛК (профиль + уровень + достижения + активность). Только для верифицированных.
  app.get("/me", async (req, reply) => {
    const a = await resolveAlumni(req);
    if (!a) return reply.code(401).send({ error: "Не авторизован" });
    if (a.verification_status !== "verified")
      return reply.code(403).send({ error: "ЛК активируется после верификации учебным офисом" });

    const ledger = (await di.request(
      readItems("points_ledger", { filter: { alumni_id: { _eq: a.id } }, fields: ["delta", "created_at"], limit: -1 }),
    )) as { delta: number; created_at: string }[];

    // Рефералка: сколько человек пришло по моей ссылке.
    const referred = (await di.request(
      (readItems as any)("alumni", { filter: { referred_by: { _eq: a.id } }, limit: -1, fields: ["verification_status"] }),
    )) as { verification_status: string }[];

    return {
      alumni: {
        fio: a.fio, cohort: a.cohort, verification_status: a.verification_status, contacts: a.contacts_json ?? {},
        edu_program: a.edu_program, edu_level: a.edu_level, interests: a.interests_json ?? [], avatar: a.avatar,
        referral_code: a.referral_code,
        referrals_verified: referred.filter((r) => r.verification_status === "verified").length,
        referrals_pending: referred.filter((r) => r.verification_status === "pending").length,
      },
      level: levelInfo(a.points_cached ?? 0, a.personal_discount ?? 0),
      achievements: achievementProgress(await alumniStats(a.id)),
      activity: lastSixMonths(ledger),
    };
  });

  // Сохранение профиля выпускником (ФИО + контакты + интересы).
  app.patch("/me/profile", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const a = await resolveAlumni(req);
    if (!a) return reply.code(401).send({ error: "Не авторизован" });
    if (a.verification_status !== "verified") return reply.code(403).send({ error: "ЛК активируется после верификации" });
    const body = z.object({
      fio: z.string().min(2).max(200).optional(),
      // Ограничиваем ключи и значения: контакты — трастовая граница API, не фронта.
      contacts: z.record(z.string().max(40), z.string().max(200)).refine((c) => Object.keys(c).length <= 12, "Слишком много контактов").optional(),
      interests: z.array(z.string().max(80)).max(30).optional(),
    }).parse(req.body);
    const patch: Record<string, unknown> = {};
    if (body.fio) patch.fio = body.fio;
    if (body.contacts) patch.contacts_json = body.contacts;
    if (body.interests) patch.interests_json = sanitizeInterests(body.interests); // только из справочника
    if (Object.keys(patch).length) await di.request((updateItem as any)("alumni", a.id, patch));
    return { ok: true };
  });

  // 152-ФЗ (ст. 14): право на доступ — выгрузка всех своих данных одним JSON.
  app.get("/me/export", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req, reply) => {
    const a = await resolveAlumni(req);
    if (!a) return reply.code(401).send({ error: "Не авторизован" });
    const [full, orders, ledger, friends, subs] = await Promise.all([
      di.request((readItems as any)("alumni", { filter: { id: { _eq: a.id } }, limit: 1,
        fields: ["fio", "cohort", "edu_level", "edu_program", "verification_status", "points_cached", "level_cached", "personal_discount", "interests_json", "contacts_json", "telegram_id", "referral_code", "consent_at", "consent_version", "joined_at"] })),
      di.request((readItems as any)("orders", { filter: { alumni_id: { _eq: a.id } }, limit: -1, sort: ["-created_at"],
        fields: ["number", "type", "status", "payment_status", "subtotal", "total_estimate", "items_json", "contact_fio", "contact_phone", "contact_email", "created_at"] })),
      di.request((readItems as any)("points_ledger", { filter: { alumni_id: { _eq: a.id } }, limit: -1, sort: ["-created_at"],
        fields: ["delta", "reason", "comment", "created_at"] })),
      di.request((readItems as any)("alumni_friends", { filter: { _or: [{ alumni_id: { _eq: a.id } }, { friend_id: { _eq: a.id } }] }, limit: -1, fields: ["alumni_id", "friend_id", "status", "created_at"] })),
      di.request((readItems as any)("push_subs", { filter: { alumni_id: { _eq: a.id } }, limit: -1, fields: ["endpoint", "created_at"] })),
    ]) as [any[], any[], any[], any[], any[]];
    audit("alumni.self_export", { actor: `alumni:${a.id}`, subject: `alumni:${a.id}`, req });
    reply.header("content-type", "application/json; charset=utf-8");
    reply.header("content-disposition", `attachment; filename="moi-dannye-kluba.json"`);
    return {
      exported_at: new Date().toISOString(),
      profile: full[0] ?? null,
      orders,
      points_ledger: ledger,
      friends,
      push_subscriptions: subs,
    };
  });

  // 152-ФЗ: самоудаление данных и выход из клуба (право на стирание/отзыв согласия).
  // Требует явного подтверждения телом. Необратимо: профиль обезличивается, аккаунт
  // входа удаляется, сессии гаснут. После — фронт чистит токен.
  app.post("/me/delete", { config: { rateLimit: { max: 3, timeWindow: "1 minute" } } }, async (req, reply) => {
    const a = await resolveAlumni(req);
    if (!a) return reply.code(401).send({ error: "Не авторизован" });
    const body = z.object({ confirm: z.literal("УДАЛИТЬ", { errorMap: () => ({ message: "Введите УДАЛИТЬ для подтверждения" }) }) }).parse(req.body);
    void body;
    await anonymizeAlumni(a.id);
    audit("alumni.self_delete", { actor: `alumni:${a.id}`, subject: `alumni:${a.id}`, req });
    return { ok: true };
  });
}
