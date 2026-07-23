import type { FastifyInstance } from "fastify";
import { readItems } from "@directus/sdk";
import { z } from "zod";
import { directus } from "../lib/directus.js";
import { env } from "../env.js";

const NEWS_FIELDS = ["id", "slug", "title", "excerpt", "body", "published_at"] as const;
const listQuery = z.object({ limit: z.coerce.number().int().positive().max(100).optional() });

// Публичные чтения контента. Directus наружу не выставляем — только через apps/api.
export async function contentRoutes(app: FastifyInstance) {
  // robots.txt из API: абсолютный Sitemap из PUBLIC_URL (единый источник домена).
  // Приватка закрыта; отдаётся через Caddy по /robots.txt.
  app.get("/robots.txt", async (_req, reply) => {
    const base = env.PUBLIC_URL.replace(/\/$/, "");
    reply.header("content-type", "text/plain; charset=utf-8");
    return [
      "# Клуб выпускников факультета права НИУ ВШЭ",
      "User-agent: *",
      "Allow: /",
      "# Личные и служебные разделы поисковикам не нужны",
      "Disallow: /lk",
      "Disallow: /admin",
      "Disallow: /cart",
      "Disallow: /api/",
      `Sitemap: ${base}/sitemap.xml`,
      "",
    ].join("\n");
  });

  // Sitemap для поисковиков: статические разделы + новости и программы из БД.
  // Отдаётся через Caddy по /sitemap.xml (см. Caddyfile). Кэш 1 час.
  let smCache: { at: number; xml: string } | null = null;
  app.get("/sitemap.xml", async (_req, reply) => {
    if (!smCache || Date.now() - smCache.at > 3_600_000) {
      const base = env.PUBLIC_URL.replace(/\/$/, "");
      const [news, programs] = await Promise.all([
        directus.request((readItems as any)("news", { filter: { status: { _eq: "published" } }, limit: -1, fields: ["slug", "published_at"] })),
        directus.request((readItems as any)("programs", { filter: { status: { _eq: "published" } }, limit: -1, fields: ["slug"] })),
      ]) as [any[], any[]];
      const urls: { loc: string; lastmod?: string; prio: string; freq: string }[] = [
        { loc: "/", prio: "1.0", freq: "weekly" },
        { loc: "/events", prio: "0.9", freq: "weekly" },
        { loc: "/dpo", prio: "0.9", freq: "weekly" },
        { loc: "/news", prio: "0.8", freq: "weekly" },
        { loc: "/join", prio: "0.8", freq: "monthly" },
        { loc: "/podcasts", prio: "0.7", freq: "weekly" },
        { loc: "/merch", prio: "0.7", freq: "monthly" },
        ...news.map((n) => ({ loc: `/news/${n.slug}`, lastmod: n.published_at?.slice(0, 10), prio: "0.6", freq: "monthly" })),
        ...programs.map((p2) => ({ loc: `/dpo/${p2.slug}`, prio: "0.6", freq: "monthly" })),
        // Юридические страницы — публичны и индексируемы (низкий приоритет, редкие изменения).
        { loc: "/privacy", prio: "0.3", freq: "yearly" },
        { loc: "/confidential", prio: "0.3", freq: "yearly" },
        { loc: "/requisites", prio: "0.3", freq: "yearly" },
      ];
      const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...urls.map((u) => `<url><loc>${base}${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}<changefreq>${u.freq}</changefreq><priority>${u.prio}</priority></url>`),
        "</urlset>",
      ].join("\n");
      smCache = { at: Date.now(), xml };
    }
    reply.header("content-type", "application/xml; charset=utf-8");
    return smCache.xml;
  });

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
      fields: ["id", "slug", "title", "direction", "format", "duration", "price", "enrollment", "source_url"],
    })),
  );
  app.get("/programs/:slug", async (req, reply) => {
    const { slug } = z.object({ slug: z.string().min(1) }).parse(req.params);
    const rows = (await directus.request(readItems("programs", {
      filter: { slug: { _eq: slug }, status: { _eq: "published" } }, limit: 1,
      fields: ["id", "slug", "title", "direction", "format", "duration", "price", "dates", "modules", "teachers", "description", "document", "enrollment", "source_url"],
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

  // «История» на главной — редактируется в админ-панели.
  app.get("/timeline", async () =>
    directus.request(readItems("timeline_items", {
      filter: { status: { _eq: "published" } }, sort: ["sort"], limit: -1,
      fields: ["id", "year", "title", "text", "metric", "sort"],
    })));

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
