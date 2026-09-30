import { z } from "zod";

// Позиция серверной корзины. Контакты заявки валидирует маршрут оформления.
export const cartItemSchema = z.object({
  type: z.enum(["dpo", "merch"]),
  ref_id: z.string().min(1),
  variant_sku: z.string().nullish(),
  // Количество ограничено, чтобы сумма в копейках оставалась безопасным целым числом.
  qty: z.number().int().positive().max(99).default(1),
});
