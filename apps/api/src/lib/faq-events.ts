import { env } from "../env.js";
import { checkoutPool } from "./checkout-store.js";

export type FaqEventKind = "gap" | "none";
export type FaqEventChannel = "site" | "telegram";

/** Append-only счётчик FAQ-gap / unmatched – без текста вопроса (ПДн). */
export async function logFaqEvent(input: {
  kind: FaqEventKind;
  gapId?: string | null;
  channel: FaqEventChannel;
}): Promise<void> {
  if (!env.CHECKOUT_DATABASE_URL) return;
  try {
    await checkoutPool().query(
      `INSERT INTO club_faq_events(kind, gap_id, channel) VALUES($1,$2,$3)`,
      [input.kind, input.gapId ?? null, input.channel],
    );
  } catch {
    /* таблица ещё не накачена / стенд без PG */
  }
}

export async function faqGapStats(sinceIso: string): Promise<{
  gap_hits: number;
  none_hits: number;
  by_gap: Array<{ gap_id: string; count: number }>;
  by_channel: Array<{ channel: string; count: number }>;
}> {
  if (!env.CHECKOUT_DATABASE_URL) {
    return { gap_hits: 0, none_hits: 0, by_gap: [], by_channel: [] };
  }
  try {
    const pool = checkoutPool();
    const [gapR, noneR, byGap, byCh] = await Promise.all([
      pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM club_faq_events WHERE kind='gap' AND created_at >= $1::timestamptz`,
        [sinceIso],
      ),
      pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM club_faq_events WHERE kind='none' AND created_at >= $1::timestamptz`,
        [sinceIso],
      ),
      pool.query<{ gap_id: string; n: number }>(
        `SELECT coalesce(gap_id,'(без id)') AS gap_id, count(*)::int AS n
         FROM club_faq_events WHERE kind='gap' AND created_at >= $1::timestamptz
         GROUP BY 1 ORDER BY n DESC LIMIT 20`,
        [sinceIso],
      ),
      pool.query<{ channel: string; n: number }>(
        `SELECT channel, count(*)::int AS n FROM club_faq_events
         WHERE created_at >= $1::timestamptz GROUP BY channel ORDER BY n DESC`,
        [sinceIso],
      ),
    ]);
    return {
      gap_hits: gapR.rows[0]?.n ?? 0,
      none_hits: noneR.rows[0]?.n ?? 0,
      by_gap: byGap.rows.map((r) => ({ gap_id: r.gap_id, count: r.n })),
      by_channel: byCh.rows.map((r) => ({ channel: r.channel, count: r.n })),
    };
  } catch {
    return { gap_hits: 0, none_hits: 0, by_gap: [], by_channel: [] };
  }
}
