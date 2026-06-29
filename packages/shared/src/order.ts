import { z } from "zod";

// Заявка (оплаты нет). Контакты + согласие на обработку ПДн обязательны.
export const cartItemSchema = z.object({
  type: z.enum(["dpo", "merch"]),
  ref_id: z.string().min(1),
  variant_sku: z.string().optional(),
  qty: z.number().int().positive().default(1),
});
export type CartItem = z.infer<typeof cartItemSchema>;

export const orderStatus = z.enum(["new", "in_progress", "confirmed", "done", "canceled"]);
export type OrderStatus = z.infer<typeof orderStatus>;

export const createOrderSchema = z.object({
  items: z.array(cartItemSchema).min(1),
  contact_fio: z.string().min(2),
  contact_phone: z.string().min(5),
  contact_email: z.string().email(),
  fulfillment: z.enum(["pickup", "delivery"]),
  address: z.string().optional(),
  comment: z.string().optional(),
  consent_pdn: z.literal(true, { errorMap: () => ({ message: "Требуется согласие на обработку ПДн" }) }),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
