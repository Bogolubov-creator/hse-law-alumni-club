import { z } from "zod";

export const cartItemSchema = z.object({
  type: z.enum(["dpo", "merch"]),
  ref_id: z.string().min(1),
  variant_sku: z.string().nullish(),
  qty: z.number().int().positive().max(99).default(1),
});
