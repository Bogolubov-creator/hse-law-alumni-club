import { readItems } from "@directus/sdk";
import { directus } from "./directus.js";
import { count, groupCount, sum } from "./agg.js";
import { env } from "../env.js";
import { checkoutPool } from "./checkout-store.js";

export type AnalyticsRange = "7d" | "30d" | "90d";

export const ANALYTICS_RANGES: readonly AnalyticsRange[] = ["7d", "30d", "90d"];

const RANGE_DAYS: Record<AnalyticsRange, number> = { "7d": 7, "30d": 30, "90d": 90 };

export function parseAnalyticsRange(raw: unknown): AnalyticsRange {
  if (raw === "7d" || raw === "90d" || raw === "30d") return raw;
  return "30d";
}

export function rangeSince(range: AnalyticsRange, now = Date.now()): string {
  return new Date(now - RANGE_DAYS[range] * 86400000).toISOString();
}

function sinceFilter(field: string, since: string) {
  return { [field]: { _gte: since } };
}

async function supportStats(since: string): Promise<{
  open: number | null;
  created_in_range: number | null;
  by_status: Array<{ status: string; count: number }>;
  by_topic: Array<{ topic: string; count: number }>;
}> {
  if (!env.CHECKOUT_DATABASE_URL) {
    return { open: null, created_in_range: null, by_status: [], by_topic: [] };
  }
  try {
    const pool = checkoutPool();
    const [openR, rangeR, statusR, topicR] = await Promise.all([
      pool.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM club_support_tickets WHERE expires_at>now() AND status='open'",
      ),
      pool.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM club_support_tickets WHERE expires_at>now() AND created_at >= $1::timestamptz",
        [since],
      ),
      pool.query<{ status: string; n: number }>(
        "SELECT status, count(*)::int AS n FROM club_support_tickets WHERE expires_at>now() AND created_at >= $1::timestamptz GROUP BY status ORDER BY n DESC",
        [since],
      ),
      pool.query<{ topic: string; n: number }>(
        "SELECT coalesce(topic,'(без темы)') AS topic, count(*)::int AS n FROM club_support_tickets WHERE expires_at>now() AND created_at >= $1::timestamptz GROUP BY 1 ORDER BY n DESC LIMIT 12",
        [since],
      ),
    ]);
    return {
      open: openR.rows[0]?.n ?? 0,
      created_in_range: rangeR.rows[0]?.n ?? 0,
      by_status: statusR.rows.map((r) => ({ status: r.status, count: r.n })),
      by_topic: topicR.rows.map((r) => ({ topic: r.topic, count: r.n })),
    };
  } catch {
    return { open: null, created_in_range: null, by_status: [], by_topic: [] };
  }
}

/** Продуктовая аналитика за окно – только уже существующие факты в БД. */
export async function buildAdminAnalytics(range: AnalyticsRange, now = Date.now()) {
  const since = rangeSince(range, now);
  const di = directus;

  const [
    joins,
    verified_in_range,
    alumni_count,
    alumni_verified,
    orders_created,
    orders_new,
    orders_paid,
    orders_paid_sum,
    rsvps,
    podcast_plays,
    login_ok,
    login_fail,
    login_locked,
    registers,
    referrals_ledger,
    referrals_alumni,
    achievements_granted,
    friendships_new,
    push_subs_new,
    orders_by_type,
    orders_by_status,
    points_by_reason,
    achievement_rows,
    events,
    rsvp_rows,
    plays_rows,
    podcasts,
    support,
  ] = await Promise.all([
    count("alumni", sinceFilter("joined_at", since)),
    count("alumni", { verification_status: { _eq: "verified" }, ...sinceFilter("verified_at", since) }),
    count("alumni"),
    count("alumni", { verification_status: { _eq: "verified" } }),
    count("orders", sinceFilter("created_at", since)),
    count("orders", { status: { _eq: "new" }, ...sinceFilter("created_at", since) }),
    count("orders", { payment_status: { _eq: "succeeded" }, ...sinceFilter("created_at", since) }),
    sum("orders", "total_estimate", { payment_status: { _eq: "succeeded" }, ...sinceFilter("created_at", since) }),
    count("event_rsvps", sinceFilter("created_at", since)),
    count("podcast_plays", sinceFilter("created_at", since)),
    count("audit_log", { event: { _eq: "login.ok" }, ...sinceFilter("created_at", since) }),
    count("audit_log", { event: { _eq: "login.fail" }, ...sinceFilter("created_at", since) }),
    count("audit_log", { event: { _eq: "login.locked" }, ...sinceFilter("created_at", since) }),
    count("audit_log", { event: { _eq: "register" }, ...sinceFilter("created_at", since) }),
    count("points_ledger", { reason: { _eq: "referral" }, ...sinceFilter("created_at", since) }),
    count("alumni", { referred_by: { _nnull: true }, ...sinceFilter("joined_at", since) }),
    count("alumni_achievements", sinceFilter("earned_at", since)),
    count("alumni_friends", { status: { _eq: "accepted" }, ...sinceFilter("created_at", since) }),
    count("push_subs", sinceFilter("created_at", since)),
    groupCount("orders", ["type"], sinceFilter("created_at", since)),
    groupCount("orders", ["status"], sinceFilter("created_at", since)),
    groupCount("points_ledger", ["reason"], sinceFilter("created_at", since)),
    di.request((readItems as any)("alumni_achievements", {
      filter: sinceFilter("earned_at", since),
      limit: -1,
      fields: ["achievement_id"],
    })) as Promise<any[]>,
    di.request((readItems as any)("events", {
      limit: -1,
      fields: ["id", "title", "starts_at", "status"],
      sort: ["-starts_at"],
    })) as Promise<any[]>,
    di.request((readItems as any)("event_rsvps", {
      filter: sinceFilter("created_at", since),
      limit: -1,
      fields: ["event_id", "attended"],
    })) as Promise<any[]>,
    di.request((readItems as any)("podcast_plays", {
      filter: sinceFilter("created_at", since),
      limit: -1,
      fields: ["podcast_id", "alumni_id"],
    })) as Promise<any[]>,
    di.request((readItems as any)("podcasts", {
      limit: -1,
      fields: ["id", "title"],
    })) as Promise<any[]>,
    supportStats(since),
  ]);

  const achievementIds = [...new Set(achievement_rows.map((r) => r.achievement_id).filter(Boolean))];
  const achievementDefs = achievementIds.length
    ? ((await di.request((readItems as any)("achievements", {
        filter: { id: { _in: achievementIds } },
        limit: -1,
        fields: ["id", "key", "title"],
      }))) as any[])
    : [];
  const achTitle = new Map(achievementDefs.map((a) => [a.id, { key: a.key as string, title: a.title as string }]));
  const achCount = new Map<string, number>();
  for (const r of achievement_rows) {
    const id = String(r.achievement_id ?? "");
    if (!id) continue;
    achCount.set(id, (achCount.get(id) ?? 0) + 1);
  }
  const achievements_top = [...achCount.entries()]
    .map(([id, n]) => ({
      achievement_id: id,
      key: achTitle.get(id)?.key ?? id,
      title: achTitle.get(id)?.title ?? id,
      count: n,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  const eventTitle = new Map(events.map((e) => [e.id, e.title as string]));
  const rsvpAgg = new Map<string, { rsvps: number; attended: number }>();
  for (const r of rsvp_rows) {
    const id = String(r.event_id ?? "");
    if (!id) continue;
    const cur = rsvpAgg.get(id) ?? { rsvps: 0, attended: 0 };
    cur.rsvps += 1;
    if (r.attended) cur.attended += 1;
    rsvpAgg.set(id, cur);
  }
  const events_top = [...rsvpAgg.entries()]
    .map(([id, v]) => ({
      event_id: id,
      title: eventTitle.get(id) ?? id,
      rsvps: v.rsvps,
      attended: v.attended,
    }))
    .sort((a, b) => b.rsvps - a.rsvps)
    .slice(0, 10);

  const podTitle = new Map(podcasts.map((p) => [p.id, p.title as string]));
  const playAgg = new Map<string, { plays: number; listeners: Set<string> }>();
  for (const p of plays_rows) {
    const id = String(p.podcast_id ?? "");
    if (!id) continue;
    const cur = playAgg.get(id) ?? { plays: 0, listeners: new Set<string>() };
    cur.plays += 1;
    cur.listeners.add(String(p.alumni_id ?? "guest"));
    playAgg.set(id, cur);
  }
  const podcasts_top = [...playAgg.entries()]
    .map(([id, v]) => ({
      podcast_id: id,
      title: podTitle.get(id) ?? id,
      plays: v.plays,
      listeners: v.listeners.size,
    }))
    .sort((a, b) => b.plays - a.plays)
    .slice(0, 10);

  const mapGroup = (rows: Array<Record<string, unknown> & { count: number }>, key: string) =>
    rows
      .map((r) => ({ key: String(r[key] ?? "(пусто)"), count: r.count }))
      .sort((a, b) => b.count - a.count);

  return {
    range,
    since,
    generated_at: new Date(now).toISOString(),
    pulse: {
      joins,
      verified_in_range,
      registers,
      orders_created,
      orders_new,
      orders_paid,
      rsvps,
      podcast_plays,
      achievements_granted,
      friendships_new,
      push_subs_new,
      referrals_ledger,
      referrals_alumni,
      login_ok,
      login_fail,
      login_locked,
      support_open: support.open,
      support_created: support.created_in_range,
    },
    snapshot: {
      alumni_count,
      alumni_verified,
      verified_ratio: alumni_count ? Math.round((alumni_verified / alumni_count) * 1000) / 10 : 0,
    },
    orders: {
      by_type: mapGroup(orders_by_type, "type"),
      by_status: mapGroup(orders_by_status, "status"),
      paid_sum_kop: orders_paid_sum,
    },
    community: {
      points_by_reason: mapGroup(points_by_reason, "reason"),
      achievements_top,
    },
    engagement: {
      events_top,
      podcasts_top,
    },
    support: {
      open: support.open,
      created_in_range: support.created_in_range,
      by_status: support.by_status,
      by_topic: support.by_topic,
    },
  };
}

export type AdminAnalytics = Awaited<ReturnType<typeof buildAdminAnalytics>>;

/** Плоский CSV без ПДн – секция / показатель / значение. */
export function analyticsToCsv(data: AdminAnalytics): string {
  const esc = (v: unknown) => {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines: string[] = [[esc("section"), esc("key"), esc("value")].join(";")];
  const row = (section: string, key: string, value: unknown) => {
    lines.push([esc(section), esc(key), esc(value)].join(";"));
  };
  row("meta", "range", data.range);
  row("meta", "since", data.since);
  row("meta", "generated_at", data.generated_at);
  for (const [k, v] of Object.entries(data.pulse)) row("pulse", k, v ?? "");
  for (const [k, v] of Object.entries(data.snapshot)) row("snapshot", k, v);
  row("orders", "paid_sum_kop", data.orders.paid_sum_kop);
  for (const x of data.orders.by_type) row("orders_by_type", x.key, x.count);
  for (const x of data.orders.by_status) row("orders_by_status", x.key, x.count);
  for (const x of data.community.points_by_reason) row("points_by_reason", x.key, x.count);
  for (const x of data.community.achievements_top) row("achievements", x.title, x.count);
  for (const x of data.engagement.events_top) row("events", x.title, `${x.rsvps}/${x.attended}`);
  for (const x of data.engagement.podcasts_top) row("podcasts", x.title, `${x.plays}/${x.listeners}`);
  row("support", "open", data.support.open ?? "");
  row("support", "created_in_range", data.support.created_in_range ?? "");
  for (const x of data.support.by_status) row("support_by_status", x.status, x.count);
  for (const x of data.support.by_topic) row("support_by_topic", x.topic, x.count);
  return "\uFEFF" + lines.join("\r\n");
}
