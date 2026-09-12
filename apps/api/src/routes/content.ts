import type { FastifyInstance } from "fastify";
import { readItems } from "@directus/sdk";
import { z } from "zod";
import { PRODUCTS_SEED, PROGRAMS_SEED } from "@club/shared";
import { directus } from "../lib/directus.js";
import { env } from "../env.js";

const NEWS_FIELDS = ["id", "slug", "title", "excerpt", "body", "published_at"] as const;
const listQuery = z.object({ limit: z.coerce.number().int().positive().max(100).optional() });

type ProgramSeedRow = (typeof PROGRAMS_SEED)[number];

function seedBySlug(): Map<string, ProgramSeedRow> {
  return new Map(PROGRAMS_SEED.map((p) => [p.slug, p]));
}

/** Пустые поля программы подставляем из сида по slug – как images у products. */
function mergeProgramSeed<T extends Record<string, unknown>>(row: T, seed: ProgramSeedRow | undefined): T {
  if (!seed) return row;
  const emptyArr = (v: unknown) => !Array.isArray(v) || v.length === 0;
  const emptyStr = (v: unknown) => v == null || v === "";
  return {
    ...row,
    description: emptyStr(row.description) ? (seed.description ?? null) : row.description,
    cover: emptyStr(row.cover) ? (seed.cover ?? null) : row.cover,
    modules: emptyArr(row.modules) ? (seed.modules ?? null) : row.modules,
    teachers: emptyArr(row.teachers) ? (seed.teachers ?? null) : row.teachers,
    tagline: emptyStr(row.tagline) ? (seed.tagline ?? null) : row.tagline,
    audience: emptyArr(row.audience) ? (seed.audience ?? null) : row.audience,
    results: emptyArr(row.results) ? (seed.results ?? null) : row.results,
    advantages: emptyArr(row.advantages) ? (seed.advantages ?? null) : row.advantages,
    hse_id: emptyStr(row.hse_id) ? (seed.hse_id ?? null) : row.hse_id,
    source_url: emptyStr(row.source_url) ? (seed.source_url ?? null) : row.source_url,
  };
}
// Публичные чтения контента. Directus наружу не выставляем – только через apps/api.
export async function contentRoutes(app: FastifyInstance) {
  // robots.txt из API: абсолютный Sitemap из PUBLIC_URL (единый источник домена).
  // Приватка закрыта; отдаётся через Caddy по /robots.txt.
  app.get("/robots.txt", async (_req, reply) => {
    const base = env.PUBLIC_URL.replace(/\/$/, "");
    reply.header("content-type", "text/plain; charset=utf-8");
    return [
      "# Клуб выпускников факультета права Вышки",
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
        // Юридические страницы – публичны и индексируемы (низкий приоритет, редкие изменения).
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

  // Каталог ДПО. Пустые description/cover/modules/teachers – из сида по slug.
  app.get("/programs", async () => {
    const rows = (await directus.request(readItems("programs", {
      filter: { status: { _eq: "published" } }, sort: ["title"], limit: -1,
      fields: ["id", "slug", "title", "direction", "format", "duration", "price", "enrollment", "source_url", "dates", "document", "description", "cover", "tagline", "hse_id"],
    }))) as Record<string, unknown>[];
    const seeds = seedBySlug();
    return rows.map((row) => {
      const seed = seeds.get(String(row.slug));
      const emptyStr = (v: unknown) => v == null || v === "";
      return {
        ...row,
        description: emptyStr(row.description) ? (seed?.description ?? null) : row.description,
        cover: emptyStr(row.cover) ? (seed?.cover ?? null) : row.cover,
        tagline: emptyStr(row.tagline) ? (seed?.tagline ?? null) : row.tagline,
        source_url: emptyStr(row.source_url) ? (seed?.source_url ?? null) : row.source_url,
      };
    });
  });
  app.get("/programs/:slug", async (req, reply) => {
    const { slug } = z.object({ slug: z.string().min(1) }).parse(req.params);
    const rows = (await directus.request(readItems("programs", {
      filter: { slug: { _eq: slug }, status: { _eq: "published" } }, limit: 1,
      fields: ["id", "slug", "title", "direction", "format", "duration", "price", "dates", "modules", "teachers", "description", "document", "enrollment", "source_url", "cover", "tagline", "audience", "results", "advantages", "hse_id"],
    }))) as Record<string, unknown>[];
    if (!rows.length) return reply.code(404).send({ error: "Программа не найдена" });
    return mergeProgramSeed(rows[0]!, seedBySlug().get(slug));
  });

  // Каталог мерча. Пустые images подставляем из сида – на стенде худи когда-то
  // привязали вручную, а сид/V3 зеркало до этого не отдавали пути.
  app.get("/products", async () => {
    const rows = (await directus.request(readItems("products", {
      filter: { status: { _eq: "published" } }, sort: ["title"], limit: -1,
      fields: ["id", "slug", "title", "category", "price", "images", "variants_json", "stock", "description"],
    }))) as { slug: string; images: unknown }[];
    const seedImages = new Map(
      PRODUCTS_SEED.filter((p) => p.images?.length).map((p) => [p.slug, p.images as string[]]),
    );
    return rows.map((row) => {
      const cur = Array.isArray(row.images) ? row.images : [];
      if (cur.length) return row;
      const fallback = seedImages.get(row.slug);
      return fallback ? { ...row, images: fallback } : row;
    });
  });

  // «История» на главной – редактируется в админ-панели.
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
