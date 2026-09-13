import type { FastifyInstance } from "fastify";
import { readItems, createItem, updateItem, deleteItem } from "@directus/sdk";
import { z } from "zod";
import { directus } from "../lib/directus.js";
import { slugifyRu } from "@club/shared";
import { requireAdmin } from "../lib/auth.js";
import { syncDpoCatalog } from "../lib/hse-sync.js";
import { audit } from "../lib/audit.js";
const di = directus;
const slugify = slugifyRu;

export async function adminCatalogRoutes(app: FastifyInstance) {


  // Синхронизация каталога ДПО с hse.ru по запросу офиса (та же логика, что ночной cron).
  app.post("/admin/dpo-sync", { config: { rateLimit: { max: 3, timeWindow: "1 minute" } } }, async (req, reply) => {
    const ctx = requireAdmin(req, reply);
    if (!ctx) return;
    try {
      const r = await syncDpoCatalog();
      audit("catalog.dpo_sync", { actor: `admin:${ctx.userId}`, detail: { ...r }, req });
      return { ok: true, ...r };
    } catch (e) {
      req.log.error({ err: e }, "manual dpo sync failed");
      return reply.code(502).send({ error: (e as Error).message });
    }
  });


  const programBody = z.object({
    title: z.string().min(3),
    direction: z.string().min(2),
    format: z.enum(["online", "offline", "blended"]),
    duration: z.string().min(1),
    price: z.number().int().min(0), // копейки
    description: z.string().nullish(),
    cover: z.string().nullish(),
    start: z.string().nullish(), // человекочитаемая дата старта
    document: z.string().nullish(),
    status: z.enum(["draft", "published", "archived"]).default("published"),
  });


  app.get("/admin/programs", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return di.request(readItems("programs", {
      sort: ["title"], limit: -1,
      fields: ["id", "slug", "title", "direction", "format", "duration", "price", "status", "enrollment", "source_url", "dates", "document", "description", "cover"],
    }));
  });


  app.post("/admin/programs", async (req, reply) => {
    const ctx = requireAdmin(req, reply);
    if (!ctx) return;
    const b = programBody.parse(req.body);
    const slug = slugify(b.title);
    const dup = (await di.request(readItems("programs", { filter: { slug: { _eq: slug } }, limit: 1, fields: ["id"] }))) as any[];
    const row = {
      slug: dup.length ? `${slug}-${Date.now() % 10000}` : slug,
      title: b.title, direction: b.direction, format: b.format, duration: b.duration, price: b.price,
      description: b.description ?? null, cover: b.cover ?? null, document: b.document ?? null,
      dates: b.start ? { start: b.start } : null, status: b.status,
    };
    const created = (await di.request((createItem as any)("programs", row))) as any;
    audit("program.create", { actor: `admin:${ctx.userId}`, subject: `program:${created.id}`, detail: { title: b.title, price: b.price, status: b.status }, req });
    return { ok: true, id: created.id, slug: row.slug };
  });


  app.patch("/admin/programs/:id", async (req, reply) => {
    const ctx = requireAdmin(req, reply);
    if (!ctx) return;
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const b = programBody.partial().parse(req.body);
    const patch: Record<string, unknown> = { ...b };
    delete patch.start;
    if (b.start !== undefined) patch.dates = b.start ? { start: b.start } : null;
    await di.request((updateItem as any)("programs", id, patch));
    // Цена – деньги: правка фиксируется в журнале с прежним и новым значением.
    audit("program.patch", { actor: `admin:${ctx.userId}`, subject: `program:${id}`, detail: b, req });
    return { ok: true };
  });


  app.delete("/admin/programs/:id", async (req, reply) => {
    const ctx = requireAdmin(req, reply);
    if (!ctx) return;
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await di.request((deleteItem as any)("programs", id)); // заявки хранят снимок позиции – не рвутся
    audit("program.delete", { actor: `admin:${ctx.userId}`, subject: `program:${id}`, req });
    return { ok: true };
  });


  const productBody = z.object({
    title: z.string().min(3),
    category: z.string().min(2),
    price: z.number().int().min(0), // копейки
    stock: z.number().int().min(0).default(0),
    description: z.string().nullish(),
    variants_json: z.array(z.object({ sku: z.string().min(1), size: z.string().optional(), color: z.string().optional(), stock: z.number().int().min(0) })).nullish(),
    images: z.array(z.string()).nullish(), // пути/URL фото
    status: z.enum(["draft", "published", "archived"]).default("published"),
  });


  app.get("/admin/products", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return di.request(readItems("products", {
      sort: ["title"], limit: -1,
      fields: ["id", "slug", "title", "category", "price", "stock", "status", "variants_json", "description"],
    }));
  });


  app.post("/admin/products", async (req, reply) => {
    const ctx = requireAdmin(req, reply);
    if (!ctx) return;
    const b = productBody.parse(req.body);
    const slug = slugify(b.title);
    const dup = (await di.request(readItems("products", { filter: { slug: { _eq: slug } }, limit: 1, fields: ["id"] }))) as any[];
    const row = {
      slug: dup.length ? `${slug}-${Date.now() % 10000}` : slug,
      title: b.title, category: b.category, price: b.price, stock: b.stock,
      description: b.description ?? null, variants_json: b.variants_json ?? null, status: b.status,
    };
    const created = (await di.request((createItem as any)("products", row))) as any;
    audit("product.create", { actor: `admin:${ctx.userId}`, subject: `product:${created.id}`, detail: { title: b.title, price: b.price, stock: b.stock, status: b.status }, req });
    return { ok: true, id: created.id, slug: row.slug };
  });


  app.patch("/admin/products/:id", async (req, reply) => {
    const ctx = requireAdmin(req, reply);
    if (!ctx) return;
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const b = productBody.partial().parse(req.body);
    await di.request((updateItem as any)("products", id, b));
    audit("product.patch", { actor: `admin:${ctx.userId}`, subject: `product:${id}`, detail: b, req });
    return { ok: true };
  });


  app.delete("/admin/products/:id", async (req, reply) => {
    const ctx = requireAdmin(req, reply);
    if (!ctx) return;
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await di.request((deleteItem as any)("products", id));
    audit("product.delete", { actor: `admin:${ctx.userId}`, subject: `product:${id}`, req });
    return { ok: true };
  });
}
