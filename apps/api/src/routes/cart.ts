import type { FastifyInstance, FastifyRequest } from "fastify";
import { readItems, createItem, updateItem } from "@directus/sdk";
import { z } from "zod";
import { directus } from "../lib/directus.js";

const di = directus as any;

export interface CartItem {
  type: "dpo" | "merch";
  ref_id: string; // slug
  variant_sku?: string | null;
  qty: number;
  price: number; // копейки, снимок
  title: string;
}

function session(req: FastifyRequest): string | null {
  const s = req.headers["x-cart-session"];
  return typeof s === "string" && s.length ? s : null;
}

async function loadCart(token: string): Promise<{ id: string; items: CartItem[] } | null> {
  const rows = (await di.request((readItems as any)("carts", { filter: { session_token: { _eq: token } }, limit: 1, fields: ["id", "items_json"] }))) as any[];
  if (!rows.length) return null;
  return { id: rows[0].id, items: (rows[0].items_json as CartItem[]) ?? [] };
}

async function saveCart(token: string, items: CartItem[]) {
  const existing = await loadCart(token);
  if (existing) {
    await di.request((updateItem as any)("carts", existing.id, { items_json: items, updated_at: new Date().toISOString() }));
  } else {
    await di.request((createItem as any)("carts", { session_token: token, items_json: items, updated_at: new Date().toISOString() }));
  }
}

async function lookup(type: "dpo" | "merch", slug: string): Promise<{ title: string; price: number } | null> {
  const collection = type === "dpo" ? "programs" : "products";
  const rows = (await di.request((readItems as any)(collection, { filter: { slug: { _eq: slug }, status: { _eq: "published" } }, limit: 1, fields: ["title", "price"] }))) as any[];
  return rows[0] ? { title: rows[0].title, price: rows[0].price ?? 0 } : null;
}

const summarize = (items: CartItem[]) => ({
  items,
  count: items.reduce((s, i) => s + i.qty, 0),
  subtotal: items.reduce((s, i) => s + i.price * i.qty, 0),
});

const sameItem = (a: CartItem, type: string, ref: string, sku?: string | null) =>
  a.type === type && a.ref_id === ref && (a.variant_sku ?? null) === (sku ?? null);

export async function cartRoutes(app: FastifyInstance) {
  app.get("/cart", async (req, reply) => {
    const token = session(req);
    if (!token) return reply.code(400).send({ error: "Нет сессии корзины" });
    const cart = await loadCart(token);
    return summarize(cart?.items ?? []);
  });

  app.post("/cart", async (req, reply) => {
    const token = session(req);
    if (!token) return reply.code(400).send({ error: "Нет сессии корзины" });
    const body = z.object({
      type: z.enum(["dpo", "merch"]), ref_id: z.string().min(1),
      variant_sku: z.string().nullish(), qty: z.number().int().positive().default(1),
    }).parse(req.body);
    const info = await lookup(body.type, body.ref_id);
    if (!info) return reply.code(404).send({ error: "Позиция не найдена" });

    const cart = await loadCart(token);
    const items = cart?.items ?? [];
    const ex = items.find((i) => sameItem(i, body.type, body.ref_id, body.variant_sku));
    if (ex) ex.qty += body.qty;
    else items.push({ type: body.type, ref_id: body.ref_id, variant_sku: body.variant_sku ?? null, qty: body.qty, price: info.price, title: info.title });
    await saveCart(token, items);
    return summarize(items);
  });

  app.patch("/cart", async (req, reply) => {
    const token = session(req);
    if (!token) return reply.code(400).send({ error: "Нет сессии корзины" });
    const body = z.object({ ref_id: z.string(), variant_sku: z.string().nullish(), qty: z.number().int().min(0) }).parse(req.body);
    const cart = await loadCart(token);
    const matches = (i: CartItem) => i.ref_id === body.ref_id && (i.variant_sku ?? null) === (body.variant_sku ?? null);
    let items = cart?.items ?? [];
    items = body.qty === 0 ? items.filter((i) => !matches(i)) : items.map((i) => (matches(i) ? { ...i, qty: body.qty } : i));
    await saveCart(token, items);
    return summarize(items);
  });

  app.delete("/cart", async (req, reply) => {
    const token = session(req);
    if (!token) return reply.code(400).send({ error: "Нет сессии корзины" });
    await saveCart(token, []);
    return summarize([]);
  });
}
