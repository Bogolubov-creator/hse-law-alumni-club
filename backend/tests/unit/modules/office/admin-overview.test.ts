import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../src/db/data.js", async () => (await import("../../../helpers/fake-data.js")).dataModuleMock);

const { resetDb } = await import("../../../helpers/fake-data.js");
const { data } = await import("../../../../src/db/data.js");
const { buildAdminOverview } = await import("../../../../src/modules/office/admin-overview.js");
const now = "2026-09-13T12:00:00.000Z";

beforeEach(() => resetDb());
afterEach(() => vi.restoreAllMocks());

describe("обзор админки", () => {
  it("сохраняет независимые счётчики, null-статусы и границы дат за 12 обращений", async () => {
    resetDb({
      orders: [
        { status: "new", payment_status: "succeeded" },
        { status: "new", payment_status: null },
        { status: "new", payment_status: null },
        { status: "done", payment_status: "succeeded" },
        { status: null, payment_status: "succeeded" },
        { status: "expired", payment_status: "canceled" },
      ],
      alumni: [
        { verification_status: "verified", points_cached: 100, podcast_sub_until: now },
        { verification_status: "verified", points_cached: -20, podcast_sub_until: "2026-09-13T11:59:59.000Z" },
        { verification_status: "pending", points_cached: 0, podcast_sub_until: null },
        { verification_status: "rejected", points_cached: null, podcast_sub_until: "2026-10-01T00:00:00.000Z" },
        { verification_status: null, points_cached: 10 },
      ],
      programs: [
        { status: "published", enrollment: "actual" }, { status: "published", enrollment: "nonactual" },
        { status: "published", enrollment: null }, { status: "draft", enrollment: "actual" },
      ],
      products: [{ status: "published" }, { status: "draft" }],
      news: [{ status: "published" }, { status: "archived" }],
      alumni_friends: [{ status: "accepted" }, { status: "accepted" }, { status: "pending" }, { status: null }],
      podcasts: [{ status: "published" }, { status: "draft" }],
      push_subs: [{ id: "p1" }],
      events: [
        { id: "later", title: "Позже", starts_at: "2026-10-01T00:00:00.000Z", status: "published" },
        { id: "draft", title: "Черновик", starts_at: now, status: "draft" },
        { id: "past", title: "Прошедшее", starts_at: "2026-09-12T00:00:00.000Z", status: "published" },
        { id: "next", title: "Встреча", starts_at: now, status: "published" },
      ],
      event_rsvps: [{ event_id: "next" }, { event_id: "next" }, { event_id: "later" }],
    });
    const spy = vi.spyOn(data, "request");
    expect(await buildAdminOverview(now)).toEqual({
      new_orders: 3, orders_count: 6, orders_paid: 3,
      pending_verifications: 1, alumni_count: 5, alumni_verified: 2, points_total: 90,
      programs_actual: 2, programs_total: 3, products_count: 1, news_count: 1,
      friendships: 2, friend_requests: 1, podcasts_count: 1, podcast_subscribers: 2, push_subs_count: 1,
      next_event: { id: "next", title: "Встреча", starts_at: now, rsvps: 2 },
    });
    expect(spy).toHaveBeenCalledTimes(12);
    const commands = spy.mock.calls.map(([command]) => command);
    expect(commands.filter(c => c.kind === "readItems")).toHaveLength(1);
    const grouped = commands.filter(command => command.groupBy?.length);
    expect(grouped).toHaveLength(4);
    for (const command of grouped) expect(command.query?.limit).toBe(-1);
  });

  it("пустая база возвращает нули и не запрашивает участников отсутствующего события", async () => {
    const spy = vi.spyOn(data, "request");
    const result = await buildAdminOverview(now);
    expect(result.next_event).toBeNull();
    for (const [key, value] of Object.entries(result)) if (key !== "next_event") expect(value, key).toBe(0);
    expect(spy).toHaveBeenCalledTimes(11);
  });
});
