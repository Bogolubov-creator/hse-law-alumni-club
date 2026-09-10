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
        programs_top: [{ ref_id: "ip", title: "Право ИС", qty: 3, orders: 2 }],
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
      series: {
        joins_by_day: [{ day: "2026-09-01", count: 2 }],
        orders_by_day: [{ day: "2026-09-02", count: 3 }],
      },
    };
    const csv = analyticsToCsv(sample);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("pulse");
    expect(csv).toContain("joins");
    expect(csv).toContain("joins_by_day");
    expect(csv).toContain("programs_top");
    expect(csv).toContain("'=cmd"); // CSV-инъекция обезврежена
  });

  it("bucketByDay заполняет нули в окне", async () => {
    const { bucketByDay } = await import("./admin-analytics.js");
    const now = Date.parse("2026-09-09T12:00:00.000Z");
    const series = bucketByDay(["2026-09-09T01:00:00.000Z", "2026-09-09T02:00:00.000Z", "2026-09-07T00:00:00.000Z"], "7d", now);
    expect(series).toHaveLength(7);
    expect(series.find((x) => x.day === "2026-09-09")?.count).toBe(2);
    expect(series.find((x) => x.day === "2026-09-08")?.count).toBe(0);
    expect(series.find((x) => x.day === "2026-09-07")?.count).toBe(1);
  });

  it("topProgramsFromItems агрегирует только dpo", async () => {
    const { topProgramsFromItems } = await import("./admin-analytics.js");
    const top = topProgramsFromItems([
      [
        { type: "dpo", ref_id: "ip", title: "Право ИС", qty: 1 },
        { type: "merch", ref_id: "robe", title: "Мантия", qty: 2 },
      ],
      [
        { type: "dpo", ref_id: "ip", title: "Право интеллектуальной собственности", qty: 2 },
        { type: "dpo", ref_id: "tax", title: "Налоги", qty: 1 },
      ],
      null,
      "noise",
    ]);
    expect(top[0]).toMatchObject({ ref_id: "ip", qty: 3, orders: 2 });
    expect(top[0]?.title).toContain("интеллектуальной");
    expect(top[1]).toMatchObject({ ref_id: "tax", qty: 1, orders: 1 });
    expect(top.every((x) => x.ref_id !== "robe")).toBe(true);
  });
});
