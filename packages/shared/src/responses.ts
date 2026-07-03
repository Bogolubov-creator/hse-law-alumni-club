import { z } from "zod";

// Zod-схемы ответов API — единый источник типов фронта (z.infer) + рантайм-валидация.

export const newsItemSchema = z.object({
  id: z.string(), slug: z.string(), title: z.string(),
  excerpt: z.string().nullable(), body: z.string().nullable(), published_at: z.string().nullable(),
});
export const newsListSchema = z.array(newsItemSchema);

// «История» на главной (редактируется в админ-панели)
export const timelineItemSchema = z.object({
  id: z.string(), year: z.string(), title: z.string(),
  text: z.string().nullable(), metric: z.string().nullable(), sort: z.number().nullable().optional(),
});
export const timelineSchema = z.array(timelineItemSchema);

// Подкасты клуба: audio_url отдаётся только активным подписчикам
export const PODCAST_SUB_PRICE_KOP = 399_900; // 3 999 ₽ / год
export const podcastItemSchema = z.object({
  id: z.string(), title: z.string(), description: z.string().nullable(),
  cover: z.string().nullable(), duration: z.string().nullable(),
  is_free: z.boolean().optional(), // пробный выпуск — слушается без подписки
  audio_url: z.string().nullable().optional(), // подписанная ссылка; null без доступа
});
export const podcastsResSchema = z.object({
  items: z.array(podcastItemSchema),
  subscribed: z.boolean(),
  sub_until: z.string().nullable(),
  price: z.number(), // копейки, в год
});

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
  enrollment: z.enum(["actual", "nonactual"]).nullable().optional(), // актуальный набор / набор закрыт
});
export const programsSchema = z.array(programSchema);
export const programModuleSchema = z.object({ title: z.string(), hours: z.number().optional(), points: z.array(z.string()).optional() });
export const programTeacherSchema = z.object({ name: z.string(), role: z.string().optional() });
export const programFullSchema = programSchema.extend({
  dates: z.object({ start: z.string() }).partial().nullable().optional(),
  modules: z.array(programModuleSchema).nullable().optional(),
  teachers: z.array(programTeacherSchema).nullable().optional(),
  description: z.string().nullable().optional(),
  document: z.string().nullable().optional(),
});

export const productVariantSchema = z.object({ sku: z.string(), size: z.string().optional(), color: z.string().optional(), stock: z.number() });
export const productSchema = z.object({
  id: z.string(), slug: z.string(), title: z.string(), category: z.string(), price: z.number(),
  variants_json: z.array(productVariantSchema).nullable(), stock: z.number(), description: z.string().nullable().optional(),
  images: z.array(z.string()).nullable().optional(), // пути/URL фото товара
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
export const achievementResSchema = z.object({
  key: z.string(), title: z.string(), description: z.string(), earned: z.boolean(),
  current: z.number(), target: z.number(),
  icon: z.string(), kind: z.string(), star: z.boolean(),
});
export const activityPointSchema = z.object({ month: z.string(), points: z.number() });
export const alumniBriefSchema = z.object({
  fio: z.string().nullable(), cohort: z.string().nullable(), verification_status: z.string(),
  contacts: z.record(z.string()).optional(), edu_program: z.string().nullable().optional(), edu_level: z.string().nullable().optional(),
  interests: z.array(z.string()).optional(),
});
// Однокурсник в «Сообществе» ЛК (тот же выпуск или та же ОП).
export const classmateSchema = z.object({
  id: z.string(), fio: z.string().nullable(), cohort: z.string().nullable(),
  edu_program: z.string().nullable().optional(), edu_level: z.string().nullable().optional(),
  level_title: z.string(), interests: z.array(z.string()),
  match: z.enum(["cohort", "program", "both"]),
  friend_status: z.enum(["none", "pending", "incoming", "accepted"]),
});
export const classmatesSchema = z.array(classmateSchema);
export const meSchema = z.object({
  alumni: alumniBriefSchema, level: levelInfoSchema, achievements: z.array(achievementResSchema), activity: z.array(activityPointSchema),
});
export const loginResponseSchema = z.object({ token: z.string(), alumni: alumniBriefSchema });
export const orderResultSchema = z.object({
  number: z.string(), status: z.string(), member_discount: z.number(), subtotal: z.number(), total_estimate: z.number(),
  notified: z.object({ channel: z.string(), ok: z.boolean(), blocked: z.boolean().optional() }),
  payment_url: z.string().optional(), // ссылка на оплату ЮKassa (если оплата подключена)
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
export type TimelineItem = z.infer<typeof timelineItemSchema>;
export type PodcastItem = z.infer<typeof podcastItemSchema>;
export type PodcastsRes = z.infer<typeof podcastsResSchema>;
export type HeroBlock = z.infer<typeof heroBlockSchema>;
export type CtaBlock = z.infer<typeof ctaBlockSchema>;
export type PageHome = z.infer<typeof pageHomeSchema>;
export type Program = z.infer<typeof programSchema>;
export type ProgramFull = z.infer<typeof programFullSchema>;
export type ProgramModule = z.infer<typeof programModuleSchema>;
export type ProgramTeacher = z.infer<typeof programTeacherSchema>;
export type ProductVariant = z.infer<typeof productVariantSchema>;
export type Product = z.infer<typeof productSchema>;
export type CartLine = z.infer<typeof cartLineSchema>;
export type CartSummary = z.infer<typeof cartSummarySchema>;
export type LevelInfo = z.infer<typeof levelInfoSchema>;
export type Achievement = z.infer<typeof achievementResSchema>;
export type ActivityPoint = z.infer<typeof activityPointSchema>;
export type AlumniBrief = z.infer<typeof alumniBriefSchema>;
export type Classmate = z.infer<typeof classmateSchema>;
export type Me = z.infer<typeof meSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type OrderResult = z.infer<typeof orderResultSchema>;
export type MyOrder = z.infer<typeof myOrderSchema>;
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;
