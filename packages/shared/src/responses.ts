import { z } from "zod";

// Zod-схемы ответов API — единый источник типов фронта (z.infer) + рантайм-валидация.

export const newsItemSchema = z.object({
  id: z.string(), slug: z.string(), title: z.string(),
  excerpt: z.string().nullable(), body: z.string().nullable(), published_at: z.string().nullable(),
});
export const newsListSchema = z.array(newsItemSchema);

export const heroBlockSchema = z.object({
  badge: z.string().optional(), title_pre: z.string().optional(), title_accent: z.string().optional(),
  subtitle: z.string().optional(), cta_primary: z.string().optional(), cta_secondary: z.string().optional(),
}).passthrough();
export const ctaBlockSchema = z.object({ title: z.string().optional(), text: z.string().optional(), button: z.string().optional() }).passthrough();
export const pageHomeSchema = z.object({
  slug: z.string(), title: z.string(),
  blocks: z.object({ hero: heroBlockSchema.optional(), cta: ctaBlockSchema.optional() }),
});

export const programSchema = z.object({
  id: z.string(), slug: z.string(), title: z.string(), direction: z.string(), format: z.string(), duration: z.string(), price: z.number(),
});
export const programsSchema = z.array(programSchema);
export const programFullSchema = programSchema.extend({
  dates: z.unknown().optional(), modules: z.unknown().optional(), teachers: z.unknown().optional(), description: z.string().nullable().optional(),
});

export const productVariantSchema = z.object({ sku: z.string(), size: z.string().optional(), color: z.string().optional(), stock: z.number() });
export const productSchema = z.object({
  id: z.string(), slug: z.string(), title: z.string(), category: z.string(), price: z.number(),
  variants_json: z.array(productVariantSchema).nullable(), stock: z.number(), description: z.string().nullable().optional(),
});
export const productsSchema = z.array(productSchema);

export const cartLineSchema = z.object({
  type: z.enum(["dpo", "merch"]), ref_id: z.string(), variant_sku: z.string().nullish(), qty: z.number(), price: z.number(), title: z.string(),
});
export const cartSummarySchema = z.object({ items: z.array(cartLineSchema), count: z.number(), subtotal: z.number() });

export const levelInfoSchema = z.object({
  points: z.number(), level: z.string(), level_title: z.string(), discount: z.number(),
  next_level: z.string().nullable(), to_next: z.number(),
});
export const achievementResSchema = z.object({ key: z.string(), title: z.string(), description: z.string(), earned: z.boolean() });
export const activityPointSchema = z.object({ month: z.string(), points: z.number() });
export const alumniBriefSchema = z.object({
  fio: z.string().nullable(), cohort: z.string().nullable(), verification_status: z.string(),
  contacts: z.record(z.string()).optional(), edu_program: z.string().nullable().optional(),
});
export const meSchema = z.object({
  alumni: alumniBriefSchema, level: levelInfoSchema, achievements: z.array(achievementResSchema), activity: z.array(activityPointSchema),
});
export const loginResponseSchema = z.object({ token: z.string(), alumni: alumniBriefSchema });
export const orderResultSchema = z.object({
  number: z.string(), status: z.string(), member_discount: z.number(), subtotal: z.number(), total_estimate: z.number(),
  notified: z.object({ channel: z.string(), ok: z.boolean(), blocked: z.boolean().optional() }),
});
export const myOrderSchema = z.object({
  number: z.string(), type: z.string(), status: z.string(), subtotal: z.number(), member_discount: z.number(), total_estimate: z.number(), created_at: z.string(),
});
export const myOrdersSchema = z.array(myOrderSchema);
export const ledgerEntrySchema = z.object({
  id: z.string(), delta: z.number(), reason: z.string(), ref: z.string().nullable(), comment: z.string().nullable(), created_at: z.string(),
});
export const ledgerListSchema = z.array(ledgerEntrySchema);

// Инференс типов из схем — единый источник для фронта.
export type NewsItem = z.infer<typeof newsItemSchema>;
export type HeroBlock = z.infer<typeof heroBlockSchema>;
export type CtaBlock = z.infer<typeof ctaBlockSchema>;
export type PageHome = z.infer<typeof pageHomeSchema>;
export type Program = z.infer<typeof programSchema>;
export type ProgramFull = z.infer<typeof programFullSchema>;
export type ProductVariant = z.infer<typeof productVariantSchema>;
export type Product = z.infer<typeof productSchema>;
export type CartLine = z.infer<typeof cartLineSchema>;
export type CartSummary = z.infer<typeof cartSummarySchema>;
export type LevelInfo = z.infer<typeof levelInfoSchema>;
export type Achievement = z.infer<typeof achievementResSchema>;
export type ActivityPoint = z.infer<typeof activityPointSchema>;
export type AlumniBrief = z.infer<typeof alumniBriefSchema>;
export type Me = z.infer<typeof meSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type OrderResult = z.infer<typeof orderResultSchema>;
export type MyOrder = z.infer<typeof myOrderSchema>;
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;
