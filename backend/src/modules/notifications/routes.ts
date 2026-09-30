import type { FastifyInstance } from "fastify";
import { readItems, createItem, updateItem, deleteItem } from "../../db/data-commands.js";
import { z } from "zod";
import { env } from "../../config/env.js";
import { data } from "../../db/data.js";
import { resolveAlumni } from "../auth/auth.js";
import { pushEnabled } from "./push.js";
import { audit } from "../../observability/audit.js";

const di = data;

export async function pushRoutes(app: FastifyInstance) {
  // Публичный VAPID-ключ (фронт подписывает браузер им).
  app.get("/push/vapid", async () => ({ enabled: pushEnabled(), key: env.VAPID_PUBLIC_KEY || null }));

  const subBody = z.object({
    endpoint: z.url().max(1000),
    keys: z.object({ p256dh: z.string().min(10), auth: z.string().min(5) }),
  });

  app.post("/me/push/subscribe", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const me = await resolveAlumni(req);
    if (!me) return reply.code(401).send({ error: "Не авторизован" });
    if (me.verification_status !== "verified") return reply.code(403).send({ error: "Доступно после верификации" });
    const b = subBody.parse(req.body);
    // Endpoint принадлежит последнему вошедшему участнику на этом устройстве.
    const dup = (await di.request((readItems as any)("push_subs", { filter: { endpoint: { _eq: b.endpoint } }, limit: 1, fields: ["id", "alumni_id"] }))) as any[];
    if (!dup.length) {
      await di.request((createItem as any)("push_subs", { alumni_id: me.id, endpoint: b.endpoint, keys: b.keys }));
    } else if (dup[0].alumni_id !== me.id) {
      await di.request((updateItem as any)("push_subs", dup[0].id, { alumni_id: me.id, keys: b.keys }));
      audit("push.sub.reassign", { actor: `alumni:${me.id}`, subject: `alumni:${dup[0].alumni_id}`, req });
    } else {
      // Тот же выпускник, тот же браузер – обновляем ключи (они меняются при переподписке).
      await di.request((updateItem as any)("push_subs", dup[0].id, { keys: b.keys }));
    }
    return { ok: true };
  });

  app.post("/me/push/unsubscribe", async (req, reply) => {
    const me = await resolveAlumni(req);
    if (!me) return reply.code(401).send({ error: "Не авторизован" });
    const { endpoint } = z.object({ endpoint: z.url().max(1000) }).parse(req.body);
    const rows = (await di.request((readItems as any)("push_subs", {
      filter: { endpoint: { _eq: endpoint }, alumni_id: { _eq: me.id } }, limit: 1, fields: ["id"],
    }))) as any[];
    if (rows[0]) await di.request((deleteItem as any)("push_subs", rows[0].id));
    return { ok: true };
  });
}
