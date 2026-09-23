import type { FastifyInstance } from "fastify";
import { readItems, createItem, updateItem, deleteItem } from "@directus/sdk";
import { z } from "zod";
import { directus } from "../lib/directus.js";
import { slugifyRu } from "@club/shared";
import { requireAdmin } from "../lib/auth.js";
import { audit } from "../lib/audit.js";
const di = directus;
const slugify = slugifyRu;

export async function adminContentRoutes(app: FastifyInstance) {


  // ── Новости: пишутся и публикуются из админ-панели ──────────────
  const newsBody = z.object({
    title: z.string().min(3),
    excerpt: z.string().nullish(),
    body: z.string().nullish(),
    status: z.enum(["draft", "published"]).default("published"),
  });


  app.get("/admin/news", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return di.request(readItems("news", { sort: ["-published_at"], limit: -1, fields: ["id", "slug", "title", "excerpt", "body", "published_at", "status", "source_url"] }));
  });


  app.post("/admin/news", async (req, reply) => {
    const ctx = requireAdmin(req, reply);
    if (!ctx) return;
    const b = newsBody.parse(req.body);
    const slug = slugify(b.title);
    const dup = (await di.request(readItems("news", { filter: { slug: { _eq: slug } }, limit: 1, fields: ["id"] }))) as any[];
    const created = (await di.request((createItem as any)("news", {
      slug: dup.length ? `${slug}-${Date.now() % 10000}` : slug,
      title: b.title, excerpt: b.excerpt ?? null, body: b.body ?? null,
      status: b.status, published_at: new Date().toISOString(),
    }))) as any;
    audit("news.create", { actor: `admin:${ctx.userId}`, subject: `news:${created.id}`, detail: { title: b.title, status: b.status }, req });
    return { ok: true, id: created.id };
  });


  app.patch("/admin/news/:id", async (req, reply) => {
    const ctx = requireAdmin(req, reply);
    if (!ctx) return;
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const b = newsBody.partial().parse(req.body);
    await di.request((updateItem as any)("news", id, b));
    audit("news.patch", { actor: `admin:${ctx.userId}`, subject: `news:${id}`, detail: b, req });
    return { ok: true };
  });


  app.delete("/admin/news/:id", async (req, reply) => {
    const ctx = requireAdmin(req, reply);
    if (!ctx) return;
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await di.request((deleteItem as any)("news", id));
    audit("news.delete", { actor: `admin:${ctx.userId}`, subject: `news:${id}`, req });
    return { ok: true };
  });


  // ── «История» на главной ─────────────────────────────────────────
  const timelineBody = z.object({
    year: z.string().min(4).max(4),
    title: z.string().min(2),
    text: z.string().nullish(),
    metric: z.string().nullish(),
    sort: z.number().int().optional(),
    status: z.enum(["draft", "published"]).default("published"),
  });


  app.get("/admin/timeline", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return di.request(readItems("timeline_items", { sort: ["sort"], limit: -1, fields: ["id", "year", "title", "text", "metric", "sort", "status"] }));
  });


  app.post("/admin/timeline", async (req, reply) => {
    const ctx = requireAdmin(req, reply);
    if (!ctx) return;
    const b = timelineBody.parse(req.body);
    const all = (await di.request(readItems("timeline_items", { fields: ["sort"], limit: -1 }))) as any[];
    const created = (await di.request((createItem as any)("timeline_items", {
      ...b, text: b.text ?? null, metric: b.metric ?? null,
      sort: b.sort ?? Math.max(0, ...all.map((t) => t.sort || 0)) + 1,
    }))) as any;
    audit("timeline.create", { actor: `admin:${ctx.userId}`, subject: `timeline:${created.id}`, detail: { year: b.year, title: b.title }, req });
    return { ok: true, id: created.id };
  });


  app.patch("/admin/timeline/:id", async (req, reply) => {
    const ctx = requireAdmin(req, reply);
    if (!ctx) return;
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const b = timelineBody.partial().parse(req.body);
    await di.request((updateItem as any)("timeline_items", id, b));
    audit("timeline.patch", { actor: `admin:${ctx.userId}`, subject: `timeline:${id}`, detail: b, req });
    return { ok: true };
  });


  app.delete("/admin/timeline/:id", async (req, reply) => {
    const ctx = requireAdmin(req, reply);
    if (!ctx) return;
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await di.request((deleteItem as any)("timeline_items", id));
    audit("timeline.delete", { actor: `admin:${ctx.userId}`, subject: `timeline:${id}`, req });
    return { ok: true };
  });


  // ── Наполнение страниц: hero и CTA главной (M2A-блоки) ──────────
  const pageBlocks = async (slug: string) => {
    const rows = (await di.request((readItems as any)("pages", {
      filter: { slug: { _eq: slug } }, limit: 1,
      fields: ["id", "slug", "title", "blocks.collection", "blocks.item:block_hero.*", "blocks.item:block_cta.*"],
    }))) as any[];
    return rows[0] ?? null;
  };


  app.get("/admin/pages/:slug", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { slug } = z.object({ slug: z.string().min(1) }).parse(req.params);
    const page = await pageBlocks(slug);
    if (!page) return reply.code(404).send({ error: "Страница не найдена" });
    const blocks: Record<string, unknown> = {};
    for (const b of page.blocks ?? []) {
      if (b?.collection && b?.item) blocks[String(b.collection).replace("block_", "")] = b.item;
    }
    return { slug: page.slug, title: page.title, blocks };
  });


  const heroBody = z.object({
    badge: z.string().optional(), title_pre: z.string().optional(), title_accent: z.string().optional(),
    subtitle: z.string().optional(), cta_primary: z.string().optional(), cta_secondary: z.string().optional(),
    history_eyebrow: z.string().max(80).optional(), history_title: z.string().max(200).optional(), history_hint: z.string().max(200).optional(),
    marquee: z.array(z.string().max(60)).max(20).optional(),
  });

  const ctaBody = z.object({ title: z.string().optional(), text: z.string().optional(), button: z.string().optional() });


  app.patch("/admin/pages/:slug", async (req, reply) => {
    const ctx = requireAdmin(req, reply);
    if (!ctx) return;
    const { slug } = z.object({ slug: z.string().min(1) }).parse(req.params);
    const body = z.object({ hero: heroBody.optional(), cta: ctaBody.optional() }).parse(req.body);
    const page = await pageBlocks(slug);
    if (!page) return reply.code(404).send({ error: "Страница не найдена" });
    for (const b of page.blocks ?? []) {
      if (body.hero && b?.collection === "block_hero" && b.item?.id) {
        await di.request((updateItem as any)("block_hero", b.item.id, body.hero));
      }
      if (body.cta && b?.collection === "block_cta" && b.item?.id) {
        await di.request((updateItem as any)("block_cta", b.item.id, body.cta));
      }
    }
    audit("page.patch", { actor: `admin:${ctx.userId}`, subject: `page:${slug}`, detail: { hero: !!body.hero, cta: !!body.cta }, req });
    return { ok: true };
  });
}
