import type { FastifyInstance, FastifyRequest } from "fastify";
import { readItems, createItem, updateItem } from "@directus/sdk";
import { z } from "zod";
import { computeMemberDiscount } from "@club/shared";
import { directus } from "../lib/directus.js";
import { resolveAlumni } from "../lib/auth.js";
import { notifyOffice, confirmApplicant } from "../lib/notify.js";

const di = directus as any;
const rub = (kop: number) => (kop / 100).toLocaleString("ru-RU");

function session(req: FastifyRequest): string | null {
  const s = req.headers["x-cart-session"];
  return typeof s === "string" && s.length ? s : null;
}

const createOrderBody = z.object({
  contact_fio: z.string().min(2),
  contact_phone: z.string().min(5),
  contact_email: z.string().email(),
  fulfillment: z.enum(["pickup", "delivery"]),
  address: z.string().nullish(),
  comment: z.string().nullish(),
  consent_pdn: z.literal(true, { errorMap: () => ({ message: "Требуется согласие на обработку ПДн" }) }),
});

export async function ordersRoutes(app: FastifyInstance) {
  // Оформление заявки (без оплаты).
  app.post("/orders", async (req, reply) => {
    const token = session(req);
    if (!token) return reply.code(400).send({ error: "Нет сессии корзины" });
    const body = createOrderBody.parse(req.body);

    const cartRows = (await di.request((readItems as any)("carts", { filter: { session_token: { _eq: token } }, limit: 1, fields: ["id", "items_json"] }))) as any[];
    const items = (cartRows[0]?.items_json as any[]) ?? [];
    if (!items.length) return reply.code(400).send({ error: "Корзина пуста" });

    const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
    const alumni = await resolveAlumni(req);
    const discount = alumni && alumni.verification_status === "verified"
      ? computeMemberDiscount(alumni.points_cached ?? 0, alumni.personal_discount ?? 0) : 0;
    const discountAmount = Math.round((subtotal * discount) / 100);
    const total = subtotal - discountAmount;

    const types = [...new Set(items.map((i) => i.type))];
    const type = types.length > 1 ? "mixed" : types[0] === "dpo" ? "dpo" : "merch";

    const all = (await di.request((readItems as any)("orders", { fields: ["id"], limit: -1 }))) as any[];
    const number = `ALU-${new Date().getFullYear()}-${String(all.length + 1).padStart(6, "0")}`;

    await di.request((createItem as any)("orders", {
      number, alumni_id: alumni?.id ?? null, type, items_json: items,
      subtotal, member_discount: discount, total_estimate: total,
      contact_fio: body.contact_fio, contact_phone: body.contact_phone, contact_email: body.contact_email,
      fulfillment: body.fulfillment, address: body.address ?? null, comment: body.comment ?? null,
      consent_pdn: true, status: "new",
    }));

    // Очистить корзину
    if (cartRows[0]) await di.request((updateItem as any)("carts", cartRows[0].id, { items_json: [] }));

    const notice = {
      number, contact_fio: body.contact_fio, contact_phone: body.contact_phone, contact_email: body.contact_email,
      itemsSummary: items.map((i) => `${i.title}${i.variant_sku ? ` (${i.variant_sku})` : ""} ×${i.qty}`).join("; "),
      total_estimate: total, member_discount: discount,
    };
    const notified = await notifyOffice(notice);
    await confirmApplicant(notice);

    return { number, status: "new", member_discount: discount, subtotal, total_estimate: total, notified };
  });

  // Заявки выпускника.
  app.get("/me/orders", async (req, reply) => {
    const alumni = await resolveAlumni(req);
    if (!alumni) return reply.code(401).send({ error: "Не авторизован" });
    return di.request((readItems as any)("orders", {
      filter: { alumni_id: { _eq: alumni.id } }, sort: ["-created_at"], limit: 50,
      fields: ["number", "type", "status", "subtotal", "member_discount", "total_estimate", "created_at"],
    }));
  });
}
