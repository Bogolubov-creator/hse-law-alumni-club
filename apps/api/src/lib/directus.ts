import { createDirectus, rest, staticToken, readMe, readItems } from "@directus/sdk";
import type { LevelKey, PointReason } from "@club/shared";
import { env } from "../env.js";

// Типизированная схема коллекций — компилятор ловит опечатки в именах полей.
export interface AlumniRow {
  id: string; user_id: string | null; fio: string | null; cohort: string | null;
  status: string; verification_status: string; points_cached: number; level_cached: LevelKey;
  personal_discount: number; contacts_json: Record<string, string> | null; edu_program: string | null; edu_level: string | null;
  interests_json: string[] | null;
  podcast_sub_until: string | null;
  referral_code: string | null; referred_by: string | null; last_activity_at: string | null;
  verified_at: string | null; joined_at: string | null; telegram_id: string | null;
}
export interface PointsLedgerRow {
  id: string; alumni_id: string; delta: number; reason: PointReason;
  ref: string | null; comment: string | null; idempotency_key: string | null; created_at: string;
}
export interface AlumniAchievementRow { id: string; alumni_id: string; achievement_id: string; earned_at: string | null }
export interface AlumniFriendRow { id: string; alumni_id: string; friend_id: string; status: "pending" | "accepted"; created_at: string }
export interface AchievementRow { id: string; key: string; title: string; description: string; rule_json: unknown; points_reward: number; sort: number }
export interface LevelRow { id: string; key: string; title: string; min_points: number; discount_percent: number; sort: number; color: string }
export interface ProgramRow {
  id: string; slug: string; title: string; direction: string; format: string; duration: string;
  price: number; dates: unknown; modules: unknown; teachers: unknown; description: string | null; document: string | null;
  source_url: string | null; enrollment: "actual" | "nonactual" | null; status: string;
}
export interface ProductRow {
  id: string; slug: string; title: string; category: string; price: number;
  images: unknown; variants_json: unknown; stock: number; description: string | null; status: string;
}
export interface CartRow { id: string; alumni_id: string | null; session_token: string; items_json: unknown; updated_at: string }
export interface OrderRow {
  id: string; number: string; alumni_id: string | null; type: string; items_json: unknown;
  subtotal: number; member_discount: number; total_estimate: number;
  contact_fio: string; contact_phone: string; contact_email: string;
  fulfillment: string; address: string | null; comment: string | null; consent_pdn: boolean; status: string; created_at: string;
  payment_id: string | null; payment_status: string | null; paid_at: string | null;
}
export interface NewsRow { id: string; slug: string; title: string; excerpt: string | null; body: string | null; published_at: string | null; status: string }
export interface TimelineItemRow { id: string; year: string; title: string; text: string | null; metric: string | null; sort: number; status: string }
export interface PodcastRow { id: string; title: string; description: string | null; cover: string | null; audio_url: string | null; duration: string | null; sort: number; status: string; created_at: string }
export interface PageRow { id: string; slug: string; title: string; status: string; sort: number; blocks: unknown }

interface Schema {
  alumni: AlumniRow[];
  points_ledger: PointsLedgerRow[];
  alumni_achievements: AlumniAchievementRow[];
  alumni_friends: AlumniFriendRow[];
  achievements: AchievementRow[];
  levels: LevelRow[];
  programs: ProgramRow[];
  products: ProductRow[];
  carts: CartRow[];
  orders: OrderRow[];
  news: NewsRow[];
  pages: PageRow[];
  timeline_items: TimelineItemRow[];
  podcasts: PodcastRow[];
}

export const directus = createDirectus<Schema>(env.DIRECTUS_URL)
  .with(staticToken(env.DIRECTUS_SERVICE_TOKEN))
  .with(rest());

/** Проверка: сервисный токен валиден и схема засеяна. */
export async function checkDirectus() {
  try {
    const me = await directus.request(readMe({ fields: ["id", "email"] }));
    const levels = await directus.request(readItems("levels", { limit: 4 }));
    return {
      ok: true,
      serviceUser: (me as any)?.email ?? null,
      levelsSeeded: Array.isArray(levels) ? levels.length : 0,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
