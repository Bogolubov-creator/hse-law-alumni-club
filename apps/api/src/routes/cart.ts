import type { FastifyInstance, FastifyRequest } from "fastify";
import { readItems, createItem, updateItem } from "@directus/sdk";
import { z } from "zod";
import { cartItemSchema, addLine, setLineQty, summarizeCart, type StoredCartItem } from "@club/shared";
import { directus } from "../lib/directus.js";

const di = directus;

function session(req: FastifyRequest): string | null {
  const s = req.headers["x-cart-session"];
  return typeof s === "string" && z.string().uuid().safeParse(s).success ? s : null;
}

async function loadCart(token: string): Promise<{ id: string; items: StoredCartItem[] } | null> {
  const rows = (await di.request(readItems("carts", { filter: { session_token: { _eq: token } }, limit: 1, fields: ["id", "items_json"] }))) as any[];
  if (!rows.length) return null;
  return { id: rows[0].id, items: (rows[0].items_json as StoredCartItem[]) ?? [] };
}

async function saveCart(token: string, items: StoredCartItem[]) {
  const existing = await loadCart(token);
  if (existing) await di.request((updateItem as any)("carts", existing.id, { items_json: items, updated_at: new Date().toISOString() }));
  else await di.request((createItem as any)("carts", { session_token: token, items_json: items, updated_at: new Date().toISOString() }));
}

export async function lookup(type: "dpo" | "merch", slug: string): Promise<{ title: string; price: number; enrollment?: string | null } | null> {
  const collection = type === "dpo" ? "programs" : "products";
  const fields = type === "dpo" ? ["title", "price", "enrollment"] : ["title", "price"];
  const rows = (await di.request((readItems as any)(collection, { filter: { slug: { _eq: slug }, status: { _eq: "published" } }, limit: 1, fields }))) as any[];
  return rows[0] ? { title: rows[0].title, price: rows[0].price ?? 0, enrollment: rows[0].enrollment ?? null } : null;
}

export async function cartRoutes(app: FastifyInstance) {
  app.get("/cart", async (req, reply) => {
    const token = session(req);
    if (!token) return reply.code(400).send({ error: "Нет сессии корзины" });
    const cart = await loadCart(token);
    return summarizeCart(cart?.items ?? []);
  });

  app.post("/cart", { config: { rateLimit: { max: 40, timeWindow: "1 minute" } } }, async (req, reply) => {
    const token = session(req);
    if (!token) return reply.code(400).send({ error: "Нет сессии корзины" });
    const body = cartItemSchema.parse(req.body);
    const info = await lookup(body.type, body.ref_id);
    if (!info) return reply.code(404).send({ error: "Позиция не найдена" });
    // Набор закрыт — заявка не оформляется (программа в каталоге справочно).
    if (body.type === "dpo" && info.enrollment === "nonactual")
      return reply.code(400).send({ error: "Набор на эту программу закрыт" });
    const cart = await loadCart(token);
    const items = addLine(cart?.items ?? [], {
      type: body.type, ref_id: body.ref_id, variant_sku: body.variant_sku ?? null,
      qty: body.qty, price: info.price, title: info.title,
    });
    await saveCart(token, items);
    return summarizeCart(items);
  });

  app.patch("/cart", async (req, reply) => {
    const token = session(req);
    if (!token) return reply.code(400).send({ error: "Нет сессии корзины" });
    const body = z.object({ ref_id: z.string(), variant_sku: z.string().nullish(), qty: z.number().int().min(0) }).parse(req.body);
    const cart = await loadCart(token);
    const items = setLineQty(cart?.items ?? [], body.ref_id, body.variant_sku ?? null, body.qty);
    await saveCart(token, items);
    return summarizeCart(items);
  });

  app.delete("/cart", async (req, reply) => {
    const token = session(req);
    if (!token) return reply.code(400).send({ error: "Нет сессии корзины" });
    await saveCart(token, []);
    return summarizeCart([]);
  });
}
