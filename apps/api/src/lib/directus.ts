import { createDirectus, rest, staticToken, readMe, readItems } from "@directus/sdk";
import { env } from "../env.js";

// Минимальная схема — коллекции добавляем по мере фаз.
export interface NewsRow {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string | null;
  published_at: string | null;
  status: string;
}
export interface PageRow {
  id: string;
  slug: string;
  title: string;
  status: string;
}
interface Schema {
  levels: { key: string; title: string; min_points: number; discount_percent: number }[];
  news: NewsRow[];
  pages: PageRow[];
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
