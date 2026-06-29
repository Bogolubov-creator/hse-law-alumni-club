import type { FastifyInstance } from "fastify";
import { readItems } from "@directus/sdk";
import { z } from "zod";
import { directus } from "../lib/directus.js";
import { addPoints, levelInfo, runDecay } from "../lib/engine.js";
import { isServiceToken, resolveAlumni } from "../lib/auth.js";

const pointsBody = z.object({
  alumni_id: z.string().min(1),
  reason: z.enum(["program", "event", "referral", "mentorship", "order", "decay", "manual", "achievement"]),
  delta: z.number().int().optional(),
  ref: z.string().nullish(),
  comment: z.string().nullish(),
  idempotency_key: z.string().nullish(),
});

export async function pointsRoutes(app: FastifyInstance) {
  // Начисление баллов — только сервисным токеном (админ/офис-операции).
  app.post("/points", async (req, reply) => {
    if (!isServiceToken(req)) return reply.code(401).send({ error: "Требуется сервисный токен" });
    const body = pointsBody.parse(req.body);
    const res = await addPoints(body.alumni_id, {
      reason: body.reason, delta: body.delta ?? undefined,
      ref: body.ref ?? null, comment: body.comment ?? null, idempotencyKey: body.idempotency_key ?? null,
    });
    return { ok: true, ...res };
  });

  // Ручной запуск decay (офис/ops). То же делает cron 1-го числа месяца.
  app.post("/decay/run", async (req, reply) => {
    if (!isServiceToken(req)) return reply.code(401).send({ error: "Требуется сервисный токен" });
    return runDecay();
  });

  // ЛК: уровень текущего выпускника (после верификации).
  app.get("/me/level", async (req, reply) => {
    const alumni = await resolveAlumni(req);
    if (!alumni) return reply.code(401).send({ error: "Не авторизован" });
    if (alumni.verification_status !== "verified")
      return reply.code(403).send({ error: "ЛК активируется после верификации учебным офисом" });
    return levelInfo(alumni.points_cached ?? 0, alumni.personal_discount ?? 0);
  });

  // ЛК: история баллов.
  app.get("/me/ledger", async (req, reply) => {
    const alumni = await resolveAlumni(req);
    if (!alumni) return reply.code(401).send({ error: "Не авторизован" });
    if (alumni.verification_status !== "verified")
      return reply.code(403).send({ error: "ЛК активируется после верификации учебным офисом" });
    const rows = await (directus as any).request(
      (readItems as any)("points_ledger", {
        filter: { alumni_id: { _eq: alumni.id } },
        sort: ["-created_at"], limit: 50,
        fields: ["id", "delta", "reason", "ref", "comment", "created_at"],
      }),
    );
    return rows;
  });
}
