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

  // Каталог ДПО.
  app.get("/programs", async () =>
    directus.request(readItems("programs", {
      filter: { status: { _eq: "published" } }, sort: ["title"], limit: -1,
      fields: ["id", "slug", "title", "direction", "format", "duration", "price"],
    })),
  );
  app.get("/programs/:slug", async (req, reply) => {
    const { slug } = z.object({ slug: z.string().min(1) }).parse(req.params);
    const rows = (await directus.request(readItems("programs", {
      filter: { slug: { _eq: slug }, status: { _eq: "published" } }, limit: 1,
      fields: ["id", "slug", "title", "direction", "format", "duration", "price", "dates", "modules", "teachers", "description"],
    }))) as any[];
    if (!rows.length) return reply.code(404).send({ error: "Программа не найдена" });
    return rows[0];
  });

  // Каталог мерча.
  app.get("/products", async () =>
    directus.request(readItems("products", {
      filter: { status: { _eq: "published" } }, sort: ["title"], limit: -1,
      fields: ["id", "slug", "title", "category", "price", "images", "variants_json", "stock", "description"],
    })),
  );

  app.get("/pages/:slug", async (req, reply) => {
    const { slug } = z.object({ slug: z.string().min(1) }).parse(req.params);
    const rows = (await directus.request(
      (readItems as any)("pages", {
        filter: { slug: { _eq: slug }, status: { _eq: "published" } },
        limit: 1,
        fields: [
          "id", "slug", "title", "status",
          "blocks.collection", "blocks.sort",
          "blocks.item:block_hero.*",
          "blocks.item:block_cta.*",
        ],
        deep: { blocks: { _sort: ["sort"] } },
      }),
    )) as any[];
    if (!rows.length) return reply.code(404).send({ error: "Страница не найдена" });
    const page = rows[0];
    // Свернуть M2A-блоки в { hero, cta } для удобства фронта.
    const blocks: Record<string, unknown> = {};
    for (const b of page.blocks ?? []) {
      if (b?.collection && b?.item) blocks[String(b.collection).replace("block_", "")] = b.item;
    }
    return { slug: page.slug, title: page.title, blocks };
  });
}
