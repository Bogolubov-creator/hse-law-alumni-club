import type { FastifyInstance } from "fastify";
import { readItems, createItem, updateItem } from "@directus/sdk";
import { z } from "zod";
import { computeLevel } from "@club/shared";
import { directus } from "../lib/directus.js";
import { resolveAlumni } from "../lib/auth.js";
import { subActive } from "./podcasts.js";
import { pushToAlumni } from "../lib/push.js";

const di = directus;

/**
 * «Сообщество» ЛК: найти своих — однокурсники того же выпуска (cohort)
 * и/или той же образовательной программы (edu_program) + добавление в друзья.
 * Связь хранится в alumni_friends (pending → accepted); встречная заявка
 * автоматически принимает дружбу.
 */
export async function communityRoutes(app: FastifyInstance) {
  app.get("/me/classmates", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const me = await resolveAlumni(req);
    if (!me) return reply.code(401).send({ error: "Не авторизован" });
    if (me.verification_status !== "verified") return reply.code(403).send({ error: "Доступно после верификации" });

    const or: unknown[] = [];
    if (me.cohort) or.push({ cohort: { _eq: me.cohort } });
    if (me.edu_program) or.push({ edu_program: { _eq: me.edu_program } });
    if (!or.length) return [];

    const rows = (await di.request(
      (readItems as any)("alumni", {
        filter: { _and: [{ verification_status: { _eq: "verified" } }, { id: { _neq: me.id } }, { _or: or }] },
        limit: 100,
        fields: ["id", "fio", "cohort", "edu_program", "edu_level", "points_cached", "interests_json", "avatar"],
      }),
    )) as { id: string; fio: string | null; cohort: string | null; edu_program: string | null; edu_level: string | null; points_cached: number; interests_json: string[] | null; avatar: string | null }[];

    // Мои связи (в обе стороны) — чтобы отдать статус кнопки «В друзья».
    const links = (await di.request(
      (readItems as any)("alumni_friends", {
        filter: { _or: [{ alumni_id: { _eq: me.id } }, { friend_id: { _eq: me.id } }] },
        limit: -1, fields: ["alumni_id", "friend_id", "status"],
      }),
    )) as { alumni_id: string; friend_id: string; status: string }[];

    const statusFor = (otherId: string): "none" | "pending" | "incoming" | "accepted" => {
      // Пара может иметь две строки (гонка встречных заявок) — accepted и incoming в приоритете.
      const pair = links.filter(
        (l) => (l.alumni_id === me.id && l.friend_id === otherId) || (l.alumni_id === otherId && l.friend_id === me.id),
      );
      if (!pair.length) return "none";
      if (pair.some((l) => l.status === "accepted")) return "accepted";
      if (pair.some((l) => l.alumni_id === otherId)) return "incoming";
      return "pending";
    };

    return rows.map((r) => {
      const sameCohort = !!me.cohort && r.cohort === me.cohort;
      const sameProgram = !!me.edu_program && r.edu_program === me.edu_program;
      return {
        id: r.id, fio: r.fio, cohort: r.cohort, edu_program: r.edu_program, edu_level: r.edu_level,
        level_title: computeLevel(r.points_cached ?? 0).title,
        interests: r.interests_json ?? [],
        avatar: r.avatar,
        match: sameCohort && sameProgram ? "both" : sameCohort ? "cohort" : "program",
        friend_status: statusFor(r.id),
      };
    });
  });

  // «События» для блока вверху ЛК: агрегируются из существующих данных,
  // отдельной коллекции уведомлений нет (нечему рассинхронизироваться).
  app.get("/me/events", async (req, reply) => {
    const me = await resolveAlumni(req);
    if (!me) return reply.code(401).send({ error: "Не авторизован" });
    if (me.verification_status !== "verified") return reply.code(403).send({ error: "Доступно после верификации" });

    const monthAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const events: Record<string, unknown>[] = [];

    // Входящие заявки в друзья (pending, адресованы мне) — самое важное, сверху.
    const incoming = (await di.request((readItems as any)("alumni_friends", {
      filter: { friend_id: { _eq: me.id }, status: { _eq: "pending" } },
      limit: 20, fields: ["alumni_id", "created_at"], sort: ["-created_at"],
    }))) as { alumni_id: string; created_at: string | null }[];

    // Мои заявки, которые приняли (за месяц).
    const acceptedMine = (await di.request((readItems as any)("alumni_friends", {
      filter: { alumni_id: { _eq: me.id }, status: { _eq: "accepted" }, created_at: { _gte: monthAgo } },
      limit: 20, fields: ["friend_id", "created_at"], sort: ["-created_at"],
    }))) as { friend_id: string; created_at: string | null }[];

    // Имена участников одним запросом.
    const ids = [...new Set([...incoming.map((l) => l.alumni_id), ...acceptedMine.map((l) => l.friend_id)])];
    const names = new Map<string, string | null>();
    if (ids.length) {
      const rows = (await di.request((readItems as any)("alumni", { filter: { id: { _in: ids } }, limit: -1, fields: ["id", "fio"] }))) as any[];
      for (const r of rows) names.set(r.id, r.fio);
    }
    for (const l of incoming) events.push({ kind: "friend_request", from_id: l.alumni_id, from_fio: names.get(l.alumni_id) ?? null, created_at: l.created_at });
    for (const l of acceptedMine) events.push({ kind: "friend_accepted", by_fio: names.get(l.friend_id) ?? null, created_at: l.created_at });

    // Мои заявки со сдвинутым статусом (за месяц; new не показываем — это не событие).
    const orders = (await di.request((readItems as any)("orders", {
      filter: { alumni_id: { _eq: me.id }, status: { _neq: "new" }, created_at: { _gte: monthAgo } },
      limit: 10, fields: ["number", "status", "payment_status", "created_at"], sort: ["-created_at"],
    }))) as any[];
    for (const o of orders) events.push({ kind: "order_status", number: o.number, status: o.status, paid: o.payment_status === "succeeded", created_at: o.created_at });

    // Подписка на подкасты: активна и истекает в ближайшие 14 дней.
    if (subActive(me.podcast_sub_until)) {
      const daysLeft = Math.ceil((new Date(me.podcast_sub_until!).getTime() - Date.now()) / 86400000);
      if (daysLeft <= 14) events.push({ kind: "podcast_expiring", days_left: daysLeft, until: me.podcast_sub_until });
    }

    return events;
  });

  // Заявка в друзья. Идемпотентна; встречная pending-заявка становится accepted.
  app.post("/me/friends", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const me = await resolveAlumni(req);
    if (!me) return reply.code(401).send({ error: "Не авторизован" });
    if (me.verification_status !== "verified") return reply.code(403).send({ error: "Доступно после верификации" });
    const body = z.object({ alumni_id: z.string().uuid() }).parse(req.body);
    if (body.alumni_id === me.id) return reply.code(400).send({ error: "Нельзя добавить в друзья себя" });

    const target = (await di.request(
      readItems("alumni", { filter: { id: { _eq: body.alumni_id } }, limit: 1, fields: ["id", "verification_status"] }),
    )) as { id: string; verification_status: string }[];
    if (!target[0] || target[0].verification_status !== "verified")
      return reply.code(404).send({ error: "Выпускник не найден" });

    // Все связи пары в обе стороны (limit -1): гонка встречных заявок могла
    // создать две pending-строки — встречную принимаем в приоритете.
    const existing = (await di.request(
      (readItems as any)("alumni_friends", {
        filter: {
          _or: [
            { _and: [{ alumni_id: { _eq: me.id } }, { friend_id: { _eq: body.alumni_id } }] },
            { _and: [{ alumni_id: { _eq: body.alumni_id } }, { friend_id: { _eq: me.id } }] },
          ],
        },
        limit: -1, fields: ["id", "alumni_id", "status"],
      }),
    )) as { id: string; alumni_id: string; status: string }[];

    if (existing.some((l) => l.status === "accepted")) return { status: "accepted" };
    const incoming = existing.find((l) => l.status === "pending" && l.alumni_id === body.alumni_id);
    if (incoming) {
      await di.request((updateItem as any)("alumni_friends", incoming.id, { status: "accepted" }));
      pushToAlumni(body.alumni_id, { title: "Заявка принята 🤝", body: `${me.fio ?? "Выпускник"} принял(а) вашу заявку в друзья`, url: "/lk" });
      return { status: "accepted" };
    }
    if (existing.length) return { status: "pending" }; // моя заявка уже отправлена

    await di.request((createItem as any)("alumni_friends", { alumni_id: me.id, friend_id: body.alumni_id, status: "pending" }));
    pushToAlumni(body.alumni_id, { title: "Заявка в друзья", body: `${me.fio ?? "Выпускник"} хочет добавить вас в друзья`, url: "/lk" });
    return { status: "pending" };
  });
}
