import { describe, it, expect } from "vitest";
import { analyticsToCsv, parseAnalyticsRange, rangeSince, type AdminAnalytics } from "./admin-analytics.js";

describe("admin-analytics helpers", () => {
  it("parseAnalyticsRange defaults to 30d", () => {
    expect(parseAnalyticsRange("7d")).toBe("7d");
    expect(parseAnalyticsRange("90d")).toBe("90d");
    expect(parseAnalyticsRange("nope")).toBe("30d");
    expect(parseAnalyticsRange(undefined)).toBe("30d");
  });

  it("rangeSince считает окно от now", () => {
    const now = Date.parse("2026-09-09T12:00:00.000Z");
    expect(rangeSince("7d", now)).toBe("2026-09-02T12:00:00.000Z");
    expect(rangeSince("30d", now)).toBe("2026-08-10T12:00:00.000Z");
  });

  it("analyticsToCsv – BOM и плоские строки без формул", () => {
    const sample: AdminAnalytics = {
      range: "30d",
      since: "2026-08-10T00:00:00.000Z",
      generated_at: "2026-09-09T00:00:00.000Z",
      pulse: {
        joins: 2, verified_in_range: 1, registers: 2, orders_created: 3, orders_new: 1, orders_paid: 1,
        rsvps: 4, podcast_plays: 5, achievements_granted: 2, friendships_new: 0, push_subs_new: 1,
        referrals_ledger: 1, referrals_alumni: 1, login_ok: 10, login_fail: 2, login_locked: 0,
        support_open: 1, support_created: 2,
      },
      snapshot: { alumni_count: 10, alumni_verified: 8, verified_ratio: 80 },
      orders: {
        by_type: [{ key: "dpo", count: 2 }, { key: "=cmd", count: 1 }],
        by_status: [{ key: "new", count: 1 }],
        paid_sum_kop: 10000,
      },
      community: {
        points_by_reason: [{ key: "event", count: 3 }],
        achievements_top: [{ achievement_id: "a1", key: "first_step", title: "Первый шаг", count: 2 }],
      },
      engagement: {
        events_top: [{ event_id: "e1", title: "Встреча", rsvps: 4, attended: 2 }],
        podcasts_top: [{ podcast_id: "p1", title: "Выпуск 1", plays: 5, listeners: 3 }],
      },
      support: {
        open: 1, created_in_range: 2,
        by_status: [{ status: "open", count: 1 }],
        by_topic: [{ topic: "вход", count: 1 }],
      },
    };
    const csv = analyticsToCsv(sample);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("pulse");
    expect(csv).toContain("joins");
    expect(csv).toContain("'=cmd"); // CSV-инъекция обезврежена
  });
});
