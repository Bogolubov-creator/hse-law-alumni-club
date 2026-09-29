import { z } from "zod";

// Позиция серверной корзины. Контакты заявки валидирует маршрут оформления.
export const cartItemSchema = z.object({
  type: z.enum(["dpo", "merch"]),
  ref_id: z.string().min(1),
  variant_sku: z.string().nullish(),
  // Кап количества на позицию: без верхней границы price*qty может выйти за
  // Number.MAX_SAFE_INTEGER (потеря точности) и уехать в абсурдную сумму ЮKassa.
  // 99 с запасом покрывает любой реальный заказ мерча/ДПО.
  qty: z.number().int().positive().max(99).default(1),
});
