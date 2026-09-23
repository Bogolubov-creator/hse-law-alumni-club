import type { FastifyInstance } from "fastify";
import { readItems, updateItem } from "@directus/sdk";
import { z } from "zod";
import { directus } from "../lib/directus.js";
import { requireAdmin, requireFullAdmin } from "../lib/auth.js";
import { addPoints } from "../lib/engine.js";
import { extendPodcastSub, subActive } from "./podcasts.js";
import { audit } from "../lib/audit.js";
import { sendEmail } from "../lib/notify.js";
import { anonymizeAlumni } from "../lib/anonymize.js";
import { readUsers } from "@directus/sdk";
import { env } from "../env.js";
import { count, groupCount } from "../lib/agg.js";
import { alumniEmail } from "../lib/alumni-email.js";
const di = directus;

export async function adminMembersRoutes(app: FastifyInstance) {


  app.get("/admin/members", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const qp = z.object({
      q: z.string().max(100).optional(),
      status: z.enum(["pending", "verified", "rejected"]).optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }).parse(req.query);
    const q = (qp.q ?? "").trim();
    const and: unknown[] = [];
    if (qp.status) and.push({ verification_status: { _eq: qp.status } });
    if (q) and.push({ _or: [{ fio: { _icontains: q } }, { cohort: { _icontains: q } }, { edu_program: { _icontains: q } }] });
    const filter = and.length ? { _and: and } : undefined;
    const listOpts = filter ? { filter } : {};

    // Страница + total (агрегат count, не скан). Дубли и друзья считаем только по
    // показанным участникам – без полного скана alumni на каждый заход (масштаб).
    const pageRows = (await di.request((readItems as any)("alumni", {
      ...listOpts, sort: ["-points_cached", "id"], limit: qp.limit, offset: (qp.page - 1) * qp.limit,
      fields: ["id", "user_id", "fio", "cohort", "status", "verification_status", "points_cached", "level_cached", "personal_discount", "podcast_sub_until", "edu_level", "edu_program", "interests_json", "contacts_json", "joined_at", "avatar"],
    }))) as any[];
    const pageIds = pageRows.map((m) => m.id);
    const pageFios = [...new Set(pageRows.map((m) => m.fio).filter(Boolean))];

    const [total, links, dupGroups] = await Promise.all([
      count("alumni", filter),
      pageIds.length
        ? di.request((readItems as any)("alumni_friends", {
            filter: { _and: [{ status: { _eq: "accepted" } }, { _or: [{ alumni_id: { _in: pageIds } }, { friend_id: { _in: pageIds } }] }] },
            limit: -1, fields: ["alumni_id", "friend_id"],
          }))
        : Promise.resolve([]),
      // Возможные дубли: одинаковые ФИО+выпуск среди показанных, обезличенных исключаем.
      pageFios.length
        ? groupCount("alumni", ["fio", "cohort"], { _and: [{ fio: { _in: pageFios } }, { status: { _neq: "alumni_left" } }] })
        : Promise.resolve([]),
    ]) as [number, any[], Array<Record<string, unknown> & { count: number }>];

    const friendsOf = new Map<string, number>();
    for (const l of links) {
      friendsOf.set(l.alumni_id, (friendsOf.get(l.alumni_id) ?? 0) + 1);
      friendsOf.set(l.friend_id, (friendsOf.get(l.friend_id) ?? 0) + 1);
    }
    const dupKey = (fio: string | null, cohort: string | null) => `${(fio ?? "").trim().toLowerCase()}|${cohort ?? ""}`;
    const dupCount = new Map<string, number>();
    for (const g of dupGroups) { const k = dupKey(g.fio as string, g.cohort as string); dupCount.set(k, (dupCount.get(k) ?? 0) + g.count); }

    const userIds = pageRows.map((m) => m.user_id).filter(Boolean);
    const emails = new Map<string, string>();
    if (userIds.length) {
      const users = (await di.request((readUsers as any)({ filter: { id: { _in: userIds } }, limit: -1, fields: ["id", "email"] }))) as any[];
      for (const u of users) emails.set(u.id, u.email);
    }
    return {
      items: pageRows.map((m) => ({
        ...m,
        email: (m.user_id && emails.get(m.user_id)) || m.contacts_json?.email || null,
        friends_count: friendsOf.get(m.id) ?? 0,
        podcast_active: subActive(m.podcast_sub_until),
        duplicate: (dupCount.get(dupKey(m.fio, m.cohort)) ?? 0) > 1,
      })),
      total,
      page: qp.page,
      page_size: qp.limit,
    };
  });


  // Продление подписки на подкасты решением офиса (например, оплата по счёту).
  app.post("/admin/members/:id/podcast-sub", async (req, reply) => {
    // Выдача платной подписки – операция с деньгами, только админ.
    const ctx = requireFullAdmin(req, reply);
    if (!ctx) return reply;
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const until = await extendPodcastSub(id, 12);
    audit("podcast.sub.grant", { actor: `admin:${ctx.userId}`, subject: `alumni:${id}`, detail: { until }, req });
    return { ok: true, until };
  });


  app.patch("/admin/members/:id", async (req, reply) => {
    // Верификация и персональная скидка – только админ.
    const ctx = requireFullAdmin(req, reply);
    if (!ctx) return reply;
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z.object({
      verification_status: z.enum(["pending", "verified", "rejected"]).optional(),
      personal_discount: z.number().int().min(0).max(10).optional(),
    }).parse(req.body);
    const patch: Record<string, unknown> = { ...body };
    if (body.verification_status === "verified") patch.verified_at = new Date().toISOString();
    await di.request((updateItem as any)("alumni", id, patch));
    audit("member.patch", { actor: `admin:${ctx.userId}`, subject: `alumni:${id}`, detail: body, req });
    // Письмо о решении по верификации (fire-and-forget).
    if (body.verification_status === "verified" || body.verification_status === "rejected") {
      void (async () => {
        const email = await alumniEmail(id);
        if (!email) return;
        if (body.verification_status === "verified") {
          await sendEmail(email, "Кабинет выпускника активирован 🎓",
            "Поздравляем! Учебный офис подтвердил ваш выпуск – личный кабинет клуба активирован.\n\nВас ждут: скидка выпускника на программы ДПО, сообщество однокурсников, подкасты и мерч.\nВойти: " + env.PUBLIC_URL + "/lk\n\n– Клуб выпускников факультета права Вышки");
        } else {
          await sendEmail(email, "По вашей заявке на вступление",
            "К сожалению, учебный офис не смог подтвердить данные вашей заявки. Если считаете это ошибкой – ответьте на письмо или свяжитесь с офисом.\n\n– Клуб выпускников факультета права Вышки");
        }
      })().catch((e) => req.log.error({ err: e }, "verification email failed"));
    }

    // Рефералка: при верификации приглашённого – +80 баллов рефереру (идемпотентно).
    if (body.verification_status === "verified") {
      const rows = (await di.request(readItems("alumni", { filter: { id: { _eq: id } }, limit: 1, fields: ["referred_by"] }))) as any[];
      const referrer = rows[0]?.referred_by;
      if (referrer) {
        await addPoints(referrer, { reason: "referral", ref: id, comment: "Приглашённый выпускник верифицирован", idempotencyKey: `referral-${id}` });
      }
    }
    return { ok: true };
  });


  // Ручное начисление баллов офисом.
  app.post("/admin/members/:id/points", async (req, reply) => {
    // Баллы конвертируются в скидку – только админ.
    const ctx = requireFullAdmin(req, reply);
    if (!ctx) return reply;
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z.object({
      reason: z.enum(["program", "event", "referral", "mentorship", "manual"]).default("manual"),
      delta: z.number().int().min(-2000).max(2000), // разумный предел ручной корректировки
      comment: z.string().optional(),
    }).parse(req.body);
    const res = await addPoints(id, { reason: body.reason, delta: body.delta, comment: body.comment ?? "Ручное начисление офисом" });
    // Баллы → уровень → скидка: ручная корректировка обязана оставлять след.
    audit("member.points", { actor: `admin:${ctx.userId}`, subject: `alumni:${id}`, detail: { delta: body.delta, reason: body.reason, comment: body.comment ?? null }, req });
    return { ok: true, ...res };
  });


  // 152-ФЗ: офис исполняет запрос на удаление/стирание ПДн участника (без разработчика).
  // Обезличивает профиль и заявки, удаляет аккаунт входа. Необратимо.
  app.post("/admin/members/:id/anonymize", async (req, reply) => {
    // Необратимое стирание ПДн – только админ.
    const ctx = requireFullAdmin(req, reply);
    if (!ctx) return reply;
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const ok = await anonymizeAlumni(id);
    if (!ok) return reply.code(404).send({ error: "Участник не найден" });
    audit("admin.member.anonymize", { actor: `admin:${ctx.userId}`, subject: `alumni:${id}`, req });
    return { ok: true };
  });
}
