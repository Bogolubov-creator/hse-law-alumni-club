import { buildSystemHealth } from "../lib/system-health.js";
import type { FastifyInstance } from "fastify";
import { readItems } from "@directus/sdk";
import { z } from "zod";
import { directus } from "../lib/directus.js";
import { resolveAdmin, requireAdmin, requireFullAdmin } from "../lib/auth.js";
import { audit } from "../lib/audit.js";
import { pushToAll } from "../lib/push.js";
import { buildAdminOverview } from "../lib/admin-overview.js";
import { analyticsToCsv, buildAdminAnalytics, parseAnalyticsRange } from "../lib/admin-analytics.js";
const di = directus;

export async function adminOverviewRoutes(app: FastifyInstance) {


  app.get("/admin/system-health", { config: { rateLimit: { max: 12, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!requireAdmin(req, reply)) return reply;
    reply.header("Cache-Control", "no-store");
    return buildSystemHealth();
  });

  // Обзор: вся статистика сайта одним запросом.
  app.get("/admin/overview", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return buildAdminOverview();
  });


  /** Продуктовая аналитика за 7/30/90 дней – агрегаты без ПДн. */
  app.get("/admin/analytics", async (req, reply) => {
    if (!requireAdmin(req, reply)) return reply;
    const { range: raw } = z.object({ range: z.enum(["7d", "30d", "90d"]).default("30d") }).parse(req.query);
    return buildAdminAnalytics(parseAnalyticsRange(raw));
  });


  app.get("/admin/analytics/export.csv", async (req, reply) => {
    if (!requireAdmin(req, reply)) return reply;
    const { range: raw } = z.object({ range: z.enum(["7d", "30d", "90d"]).default("30d") }).parse(req.query);
    const range = parseAnalyticsRange(raw);
    const data = await buildAdminAnalytics(range);
    const ctx = resolveAdmin(req);
    if (ctx) audit("analytics.export", { actor: `admin:${ctx.userId}`, detail: { range }, req });
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="analytics-${range}-${new Date().toISOString().slice(0, 10)}.csv"`);
    return analyticsToCsv(data);
  });


  // Ручная пуш-рассылка всем подписанным устройствам (анонсы офиса).
  app.post("/admin/push/broadcast", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req, reply) => {
    // Рассылка уходит на все устройства сразу и не отзывается – только админ.
    const ctx = requireFullAdmin(req, reply);
    if (!ctx) return reply;
    const b = z.object({
      title: z.string().min(3).max(80),
      body: z.string().min(3).max(200),
      url: z.string().max(200).regex(/^\/[a-z0-9\-\/]*$/i, "Относительный путь, например /events").default("/"),
    }).parse(req.body);
    const subs = (await di.request((readItems as any)("push_subs", { fields: ["id"], limit: -1 }))) as any[];
    pushToAll({ title: b.title, body: b.body, url: b.url });
    audit("push.broadcast", { actor: `admin:${ctx.userId}`, detail: { title: b.title, subs: subs.length }, req });
    return { ok: true, subscribers: subs.length };
  });


  // ── Журнал безопасности: чтение аудит-лога ───────────────────────
  app.get("/admin/audit", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(500).default(300) }).parse(req.query);
    return di.request((readItems as any)("audit_log", {
      sort: ["-created_at"], limit,
      fields: ["id", "event", "actor", "subject", "detail", "ip", "created_at"],
    }));
  });
}
