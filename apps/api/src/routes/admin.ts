import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { readItems, createItem, updateItem, deleteItem } from "@directus/sdk";
import { z } from "zod";
import { directus } from "../lib/directus.js";
import { slugifyRu } from "@club/shared";
import { directusCredsValid, findUserWithRole, signAdmin, resolveAdmin } from "../lib/auth.js";
import { addPoints } from "../lib/engine.js";
import { syncDpoCatalog } from "../lib/hse-sync.js";

const di = directus;
const ADMIN_ROLES = ["editor", "admin", "Administrator"];

function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  const ctx = resolveAdmin(req);
  if (!ctx) { reply.code(401).send({ error: "Требуется вход администратора" }); return null; }
  return ctx;
}

export async function adminRoutes(app: FastifyInstance) {
  app.post("/auth/admin-login", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req, reply) => {
    const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
    if (!(await directusCredsValid(email, password))) return reply.code(401).send({ error: "Неверная почта или пароль" });
    const user = await findUserWithRole(email);
    if (!user || !ADMIN_ROLES.includes(user.role)) return reply.code(403).send({ error: "Нет прав администратора" });
    return { token: signAdmin(user.id, user.role), role: user.role };
  });

  app.get("/admin/overview", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const orders = (await di.request(readItems("orders", { fields: ["status"], limit: -1 }))) as any[];
    const alumni = (await di.request(readItems("alumni", { fields: ["verification_status"], limit: -1 }))) as any[];
    return {
      new_orders: orders.filter((o) => o.status === "new").length,
      orders_count: orders.length,
      pending_verifications: alumni.filter((a) => a.verification_status === "pending").length,
      alumni_count: alumni.length,
    };
  });

  app.get("/admin/orders", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return di.request(readItems("orders", {
      sort: ["-created_at"], limit: 100,
      fields: ["id", "number", "type", "contact_fio", "contact_phone", "contact_email", "fulfillment", "status", "subtotal", "total_estimate", "created_at", "items_json", "address", "comment"],
    }));
  });

  app.patch("/admin/orders/:id", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { status } = z.object({ status: z.enum(["new", "in_progress", "confirmed", "done", "canceled"]) }).parse(req.body);
    await di.request((updateItem as any)("orders", id, { status }));
    return { ok: true, status };
  });

  app.get("/admin/members", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return di.request(readItems("alumni", {
      sort: ["-points_cached"], limit: 200,
      fields: ["id", "fio", "cohort", "status", "verification_status", "points_cached", "level_cached", "personal_discount"],
    }));
  });

  app.patch("/admin/members/:id", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z.object({
      verification_status: z.enum(["pending", "verified", "rejected"]).optional(),
      personal_discount: z.number().int().min(0).max(10).optional(),
    }).parse(req.body);
    const patch: Record<string, unknown> = { ...body };
    if (body.verification_status === "verified") patch.verified_at = new Date().toISOString();
    await di.request((updateItem as any)("alumni", id, patch));

    // Рефералка: при верификации приглашённого — +80 баллов рефереру (идемпотентно).
    if (body.verification_status === "verified") {
      const rows = (await di.request(readItems("alumni", { filter: { id: { _eq: id } }, limit: 1, fields: ["referred_by"] }))) as any[];
      const referrer = rows[0]?.referred_by;
      if (referrer) {
        await addPoints(referrer, { reason: "referral", ref: id, comment: "Приглашённый выпускник верифицирован", idempotencyKey: `referral-${id}` });
      }
    }
    return { ok: true };
  });

  // ── Управление каталогом (программы ДПО и мерч) ──────────────────
  // Офис добавляет/правит/снимает с витрины/удаляет позиции без Directus Studio.

  const slugify = slugifyRu;

  // Синхронизация каталога ДПО с hse.ru по запросу офиса (та же логика, что ночной cron).
  app.post("/admin/dpo-sync", { config: { rateLimit: { max: 3, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    try {
      const r = await syncDpoCatalog();
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
    start: z.string().nullish(), // человекочитаемая дата старта
    document: z.string().nullish(),
    status: z.enum(["draft", "published", "archived"]).default("published"),
  });

  app.get("/admin/programs", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return di.request(readItems("programs", {
      sort: ["title"], limit: -1,
      fields: ["id", "slug", "title", "direction", "format", "duration", "price", "status", "dates", "document", "description"],
    }));
  });

  app.post("/admin/programs", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const b = programBody.parse(req.body);
    const slug = slugify(b.title);
    const dup = (await di.request(readItems("programs", { filter: { slug: { _eq: slug } }, limit: 1, fields: ["id"] }))) as any[];
    const row = {
      slug: dup.length ? `${slug}-${Date.now() % 10000}` : slug,
      title: b.title, direction: b.direction, format: b.format, duration: b.duration, price: b.price,
      description: b.description ?? null, document: b.document ?? null,
      dates: b.start ? { start: b.start } : null, status: b.status,
    };
    const created = (await di.request((createItem as any)("programs", row))) as any;
    return { ok: true, id: created.id, slug: row.slug };
  });

  app.patch("/admin/programs/:id", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const b = programBody.partial().parse(req.body);
    const patch: Record<string, unknown> = { ...b };
    delete patch.start;
    if (b.start !== undefined) patch.dates = b.start ? { start: b.start } : null;
    await di.request((updateItem as any)("programs", id, patch));
    return { ok: true };
  });

  app.delete("/admin/programs/:id", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await di.request((deleteItem as any)("programs", id)); // заявки хранят снимок позиции — не рвутся
    return { ok: true };
  });

  const productBody = z.object({
    title: z.string().min(3),
    category: z.string().min(2),
    price: z.number().int().min(0), // копейки
    stock: z.number().int().min(0).default(0),
    description: z.string().nullish(),
    variants_json: z.array(z.object({ sku: z.string().min(1), size: z.string().optional(), color: z.string().optional(), stock: z.number().int().min(0) })).nullish(),
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
    if (!requireAdmin(req, reply)) return;
    const b = productBody.parse(req.body);
    const slug = slugify(b.title);
    const dup = (await di.request(readItems("products", { filter: { slug: { _eq: slug } }, limit: 1, fields: ["id"] }))) as any[];
    const row = {
      slug: dup.length ? `${slug}-${Date.now() % 10000}` : slug,
      title: b.title, category: b.category, price: b.price, stock: b.stock,
      description: b.description ?? null, variants_json: b.variants_json ?? null, status: b.status,
    };
    const created = (await di.request((createItem as any)("products", row))) as any;
    return { ok: true, id: created.id, slug: row.slug };
  });

  app.patch("/admin/products/:id", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const b = productBody.partial().parse(req.body);
    await di.request((updateItem as any)("products", id, b));
    return { ok: true };
  });

  app.delete("/admin/products/:id", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await di.request((deleteItem as any)("products", id));
    return { ok: true };
  });

  // Ручное начисление баллов офисом.
  app.post("/admin/members/:id/points", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z.object({
      reason: z.enum(["program", "event", "referral", "mentorship", "manual"]).default("manual"),
      delta: z.number().int(),
      comment: z.string().optional(),
    }).parse(req.body);
    const res = await addPoints(id, { reason: body.reason, delta: body.delta, comment: body.comment ?? "Ручное начисление офисом" });
    return { ok: true, ...res };
  });
}
