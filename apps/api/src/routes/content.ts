import type { FastifyInstance } from "fastify";
import { readItems } from "@directus/sdk";
import { z } from "zod";
import { directus } from "../lib/directus.js";

const NEWS_FIELDS = ["id", "slug", "title", "excerpt", "body", "published_at"] as const;
const listQuery = z.object({ limit: z.coerce.number().int().positive().max(100).optional() });

// Публичные чтения контента. Directus наружу не выставляем — только через apps/api.
export async function contentRoutes(app: FastifyInstance) {
  app.get("/news", async (req) => {
    const { limit } = listQuery.parse(req.query);
    return directus.request(
      readItems("news", {
        filter: { status: { _eq: "published" } },
        sort: ["-published_at"],
        limit: limit ?? -1,
        fields: [...NEWS_FIELDS],
      }),
    );
  });

  app.get("/news/:slug", async (req, reply) => {
    const { slug } = z.object({ slug: z.string().min(1) }).parse(req.params);
    const rows = await directus.request(
      readItems("news", {
        filter: { slug: { _eq: slug }, status: { _eq: "published" } },
        limit: 1,
        fields: [...NEWS_FIELDS],
      }),
    );
    if (!rows.length) return reply.code(404).send({ error: "Новость не найдена" });
    return rows[0];
  });

  app.get("/pages/:slug", async (req, reply) => {
    const { slug } = z.object({ slug: z.string().min(1) }).parse(req.params);
    const rows = await directus.request(
      readItems("pages", {
        filter: { slug: { _eq: slug }, status: { _eq: "published" } },
        limit: 1,
      }),
    );
    if (!rows.length) return reply.code(404).send({ error: "Страница не найдена" });
    return rows[0];
  });
}
