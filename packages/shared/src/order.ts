import { z } from "zod";

// Заявка (оплаты нет). Контакты + согласие на обработку ПДн обязательны.
export const cartItemSchema = z.object({
  type: z.enum(["dpo", "merch"]),
  ref_id: z.string().min(1),
  variant_sku: z.string().nullish(),
  // Кап количества на позицию: без верхней границы price*qty может выйти за
  // Number.MAX_SAFE_INTEGER (потеря точности) и уехать в абсурдную сумму ЮKassa.
  // 99 с запасом покрывает любой реальный заказ мерча/ДПО.
  qty: z.number().int().positive().max(99).default(1),
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
  address: z.string().nullish(),
  comment: z.string().nullish(),
  consent_pdn: z.literal(true, { errorMap: () => ({ message: "Требуется согласие на обработку ПДн" }) }),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
