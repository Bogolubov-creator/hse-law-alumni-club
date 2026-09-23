import { env } from "../env.js";
import { checkoutPool } from "./checkout-store.js";

const MAX_PATH = 120;

/** Разрешённые префиксы канона (без /admin и API). */
const ALLOWED = [
  /^\/$/,
  /^\/dpo(\/[\w.-]+)?$/,
  /^\/merch(\/[\w.-]+)?$/,
  /^\/news(\/[\w.-]+)?$/,
  /^\/events(\/[\w.-]+)?$/,
  /^\/podcasts$/,
  /^\/cart$/,
  /^\/join$/,
  /^\/forgot$/,
  /^\/reset$/,
  /^\/confirm$/,
  /^\/lk(\/profile)?$/,
  /^\/support(\/consent)?$/,
  /^\/privacy$/,
  /^\/confidential$/,
  /^\/requisites$/,
];

/**
 * Нормализует pathname для агрегата: без query/hash, без /legacy|/v2 префиксов,
 * только allowlist. Иначе null (маяк молча отбрасывается).
 */
export function normalizePagePath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let path = raw.trim();
  if (!path.startsWith("/")) return null;
  path = path.split(/[?#]/)[0] ?? path;
  if (path.length > MAX_PATH) return null;
  if (path !== "/" && path.endsWith("/")) path = path.slice(0, -1);
  if (path.startsWith("/legacy")) path = path.slice("/legacy".length) || "/";
  if (path.startsWith("/v2")) path = path.slice("/v2".length) || "/";
  if (!ALLOWED.some((re) => re.test(path))) return null;
  return path;
}

/** UPSERT hits за UTC-день. Без ПДн. */
export async function recordPageView(pathRaw: unknown, now = Date.now()): Promise<boolean> {
  const path = normalizePagePath(pathRaw);
  if (!path || !env.CHECKOUT_DATABASE_URL) return false;
  const day = new Date(now).toISOString().slice(0, 10);
  try {
    await checkoutPool().query(
      `INSERT INTO club_page_views(day, path, hits) VALUES($1::date, $2, 1)
       ON CONFLICT (day, path) DO UPDATE SET hits = club_page_views.hits + 1`,
      [day, path],
    );
    return true;
  } catch {
    return false;
  }
}

export async function pageviewStats(sinceIso: string): Promise<{
  hits: number | null;
  by_day: Array<{ day: string; count: number }>;
  paths_top: Array<{ path: string; count: number }>;
}> {
  if (!env.CHECKOUT_DATABASE_URL) {
    return { hits: null, by_day: [], paths_top: [] };
  }
  try {
    const pool = checkoutPool();
    const [total, byDay, top] = await Promise.all([
      pool.query<{ n: number }>(
        `SELECT coalesce(sum(hits),0)::int AS n FROM club_page_views WHERE day >= $1::date`,
        [sinceIso.slice(0, 10)],
      ),
      pool.query<{ day: string; n: number }>(
        `SELECT day::text AS day, sum(hits)::int AS n FROM club_page_views
         WHERE day >= $1::date GROUP BY day ORDER BY day`,
        [sinceIso.slice(0, 10)],
      ),
      pool.query<{ path: string; n: number }>(
        `SELECT path, sum(hits)::int AS n FROM club_page_views
         WHERE day >= $1::date GROUP BY path ORDER BY n DESC LIMIT 12`,
        [sinceIso.slice(0, 10)],
      ),
    ]);
    return {
      hits: total.rows[0]?.n ?? 0,
      by_day: byDay.rows.map((r) => ({ day: r.day, count: r.n })),
      paths_top: top.rows.map((r) => ({ path: r.path, count: r.n })),
    };
  } catch {
    return { hits: null, by_day: [], paths_top: [] };
  }
}
