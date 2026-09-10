import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { recordPageView } from "../lib/pageviews.js";

/** Публичный маяк просмотра – только path, без cookies/ПДн на сервере. */
export async function pageviewRoutes(app: FastifyInstance) {
  app.post("/analytics/pageview", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req) => {
    const body = z.object({ path: z.string().min(1).max(200) }).parse(req.body);
    void recordPageView(body.path);
    return { ok: true };
  });
}
