import type { FastifyInstance } from "fastify";
import { readItems, createItem, updateItem } from "@directus/sdk";
import { z } from "zod";
import { computeLevel } from "@club/shared";
import { directus } from "../lib/directus.js";
import { resolveAlumni } from "../lib/auth.js";

const di = directus;

/**
 * «Сообщество» ЛК: найти своих — однокурсники того же выпуска (cohort)
 * и/или той же образовательной программы (edu_program) + добавление в друзья.
 * Связь хранится в alumni_friends (pending → accepted); встречная заявка
 * автоматически принимает дружбу.
 */
export async function communityRoutes(app: FastifyInstance) {
  app.get("/me/classmates", async (req, reply) => {
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
        fields: ["id", "fio", "cohort", "edu_program", "edu_level", "points_cached", "interests_json"],
      }),
    )) as { id: string; fio: string | null; cohort: string | null; edu_program: string | null; edu_level: string | null; points_cached: number; interests_json: string[] | null }[];

    // Мои связи (в обе стороны) — чтобы отдать статус кнопки «В друзья».
    const links = (await di.request(
      (readItems as any)("alumni_friends", {
        filter: { _or: [{ alumni_id: { _eq: me.id } }, { friend_id: { _eq: me.id } }] },
        limit: -1, fields: ["alumni_id", "friend_id", "status"],
      }),
    )) as { alumni_id: string; friend_id: string; status: string }[];

    const statusFor = (otherId: string): "none" | "pending" | "incoming" | "accepted" => {
      const link = links.find(
        (l) => (l.alumni_id === me.id && l.friend_id === otherId) || (l.alumni_id === otherId && l.friend_id === me.id),
      );
      if (!link) return "none";
      if (link.status === "accepted") return "accepted";
      return link.alumni_id === me.id ? "pending" : "incoming";
    };

    return rows.map((r) => {
      const sameCohort = !!me.cohort && r.cohort === me.cohort;
      const sameProgram = !!me.edu_program && r.edu_program === me.edu_program;
      return {
        id: r.id, fio: r.fio, cohort: r.cohort, edu_program: r.edu_program, edu_level: r.edu_level,
        level_title: computeLevel(r.points_cached ?? 0).title,
        interests: r.interests_json ?? [],
        match: sameCohort && sameProgram ? "both" : sameCohort ? "cohort" : "program",
        friend_status: statusFor(r.id),
      };
    });
  });

  // Заявка в друзья. Идемпотентна; встречная pending-заявка становится accepted.
  app.post("/me/friends", async (req, reply) => {
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

    const existing = (await di.request(
      (readItems as any)("alumni_friends", {
        filter: {
          _or: [
            { _and: [{ alumni_id: { _eq: me.id } }, { friend_id: { _eq: body.alumni_id } }] },
            { _and: [{ alumni_id: { _eq: body.alumni_id } }, { friend_id: { _eq: me.id } }] },
          ],
        },
        limit: 1, fields: ["id", "alumni_id", "status"],
      }),
    )) as { id: string; alumni_id: string; status: string }[];

    const link = existing[0];
    if (link) {
      // Встречная pending-заявка → принимаем дружбу; свои повторы — no-op.
      if (link.status === "pending" && link.alumni_id === body.alumni_id) {
        await di.request((updateItem as any)("alumni_friends", link.id, { status: "accepted" }));
        return { status: "accepted" };
      }
      return { status: link.status === "accepted" ? "accepted" : "pending" };
    }

    await di.request((createItem as any)("alumni_friends", { alumni_id: me.id, friend_id: body.alumni_id, status: "pending" }));
    return { status: "pending" };
  });
}
