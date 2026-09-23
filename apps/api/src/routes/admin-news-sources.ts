import { env } from "../env.js";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { NEWS_SOURCES } from "@club/shared";
import { requireAdmin } from "../lib/auth.js";
import { checkoutPool } from "../lib/checkout-store.js";
import { refreshNewsSource, importNewsCandidate } from "../lib/news-sources.js";
import { audit } from "../lib/audit.js";
export async function adminNewsSourceRoutes(app: FastifyInstance) {
  app.get("/admin/news-sources", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const runs = (await checkoutPool().query("SELECT * FROM club_news_source_runs")).rows;
    const items = (await checkoutPool().query("SELECT * FROM club_news_inbox ORDER BY published_at DESC NULLS LAST, discovered_at DESC LIMIT 200")).rows;
    return { automatic: env.NEWS_SYNC_ENABLED === "true", sources: NEWS_SOURCES.map(s => ({...s, ...runs.find(r => r.source === s.id)})), items };
  });
  app.post("/admin/news-sources/:source/refresh", { config: { rateLimit: { max: 6, timeWindow: "1 minute" } } }, async (req, reply) => {
    const actor = requireAdmin(req, reply); if (!actor) return;
    const { source } = z.object({source:z.enum(["alumni","career","telegram"])}).parse(req.params);
    const result = await refreshNewsSource(source);
    audit("news.source.refresh", {actor:`admin:${actor.userId}`,subject:source,detail:result,req});
    return result;
  });
  app.post("/admin/news-sources/:id/import", async (req, reply) => {
    const actor = requireAdmin(req, reply); if (!actor) return;
    const { id } = z.object({id:z.string().regex(/^[a-f0-9]{64}$/)}).parse(req.params);
    const b = z.object({title:z.string().trim().min(3).max(240),excerpt:z.string().trim().max(2000).default("")}).parse(req.body);
    const result = await importNewsCandidate(id,b.title,b.excerpt);
    audit("news.source.import", {actor:`admin:${actor.userId}`,subject:`news:${result.id}`,req});
    return result;
  });
  app.patch("/admin/news-sources/:id", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const {id} = z.object({id:z.string().regex(/^[a-f0-9]{64}$/)}).parse(req.params);
    const {state} = z.object({state:z.enum(["new","dismissed"])}).parse(req.body);
    await checkoutPool().query("UPDATE club_news_inbox SET state=$2 WHERE id=$1 AND state<>'imported'",[id,state]);
    return {ok:true};
  });
}
