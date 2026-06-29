import type { FastifyInstance } from "fastify";
import { readItems, updateItem } from "@directus/sdk";
import { z } from "zod";
import { ACHIEVEMENTS } from "@club/shared";
import { directus } from "../lib/directus.js";
import { levelInfo } from "../lib/engine.js";
import { resolveAlumni } from "../lib/auth.js";

const di = directus as any;
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
  // Сводка ЛК (профиль + уровень + достижения + активность). Только для верифицированных.
  app.get("/me", async (req, reply) => {
    const a = await resolveAlumni(req);
    if (!a) return reply.code(401).send({ error: "Не авторизован" });
    if (a.verification_status !== "verified")
      return reply.code(403).send({ error: "ЛК активируется после верификации учебным офисом" });

    const earnedRows = (await di.request(
      (readItems as any)("alumni_achievements", { filter: { alumni_id: { _eq: a.id } }, fields: ["achievement_id.key"], limit: -1 }),
    )) as any[];
    const earned = new Set(earnedRows.map((e) => e.achievement_id?.key));

    const ledger = (await di.request(
      (readItems as any)("points_ledger", { filter: { alumni_id: { _eq: a.id } }, fields: ["delta", "created_at"], limit: -1 }),
    )) as { delta: number; created_at: string }[];

    return {
      alumni: { fio: a.fio, cohort: a.cohort, verification_status: a.verification_status, contacts: a.contacts_json ?? {} },
      level: levelInfo(a.points_cached ?? 0, a.personal_discount ?? 0),
      achievements: ACHIEVEMENTS.map((x) => ({ key: x.key, title: x.title, description: x.description, earned: earned.has(x.key) })),
      activity: lastSixMonths(ledger),
    };
  });

  // Сохранение профиля выпускником (ФИО + контакты).
  app.patch("/me/profile", async (req, reply) => {
    const a = await resolveAlumni(req);
    if (!a) return reply.code(401).send({ error: "Не авторизован" });
    if (a.verification_status !== "verified") return reply.code(403).send({ error: "ЛК активируется после верификации" });
    const body = z.object({
      fio: z.string().min(2).optional(),
      contacts: z.record(z.string()).optional(),
    }).parse(req.body);
    const patch: Record<string, unknown> = {};
    if (body.fio) patch.fio = body.fio;
    if (body.contacts) patch.contacts_json = body.contacts;
    if (Object.keys(patch).length) await di.request((updateItem as any)("alumni", a.id, patch));
    return { ok: true };
  });
}
