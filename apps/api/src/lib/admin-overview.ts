import { readItems } from "@directus/sdk";
import { directus } from "./directus.js";
import { count, groupCount, sum } from "./agg.js";

type CountGroup = Record<string, unknown> & { count: number };

function total(groups: CountGroup[], field?: string, value?: string): number {
  return groups.reduce((n, group) => n + (!field || group[field] === value ? group.count : 0), 0);
}

/** Счётчики обзора: БД возвращает группы, а не строки заказов и участников. */
export async function buildAdminOverview(now = new Date().toISOString()) {
  const [orders, alumni, points_total, podcast_subscribers, programs,
    products_count, news_count, friends, podcasts_count, push_subs_count, events] = await Promise.all([
    groupCount("orders", ["status", "payment_status"]),
    groupCount("alumni", ["verification_status"]),
    sum("alumni", "points_cached"),
    count("alumni", { podcast_sub_until: { _gte: now } }),
    groupCount("programs", ["enrollment"], { status: { _eq: "published" } }),
    count("products", { status: { _eq: "published" } }),
    count("news", { status: { _eq: "published" } }),
    groupCount("alumni_friends", ["status"], { status: { _in: ["accepted", "pending"] } }),
    count("podcasts", { status: { _eq: "published" } }),
    count("push_subs"),
    directus.request((readItems as any)("events", {
      filter: { status: { _eq: "published" }, starts_at: { _gte: now } },
      sort: ["starts_at"], limit: 1, fields: ["id", "title", "starts_at"],
    })) as Promise<Array<{ id: string; title: string; starts_at: string }>>,
  ]);
  const next = events[0];
  const programs_total = total(programs);
  return {
    new_orders: total(orders, "status", "new"),
    orders_count: total(orders),
    orders_paid: total(orders, "payment_status", "succeeded"),
    pending_verifications: total(alumni, "verification_status", "pending"),
    alumni_count: total(alumni),
    alumni_verified: total(alumni, "verification_status", "verified"),
    points_total,
    // Как на витрине, null-enrollment тоже входит в актуальный набор.
    programs_actual: programs_total - total(programs, "enrollment", "nonactual"),
    programs_total, products_count, news_count,
    friendships: total(friends, "status", "accepted"),
    friend_requests: total(friends, "status", "pending"),
    podcasts_count, podcast_subscribers, push_subs_count,
    next_event: next ? {
      ...next,
      rsvps: await count("event_rsvps", { event_id: { _eq: next.id } }),
    } : null,
  };
}
