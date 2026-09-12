import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify from "fastify";
import jwt from "jsonwebtoken";

vi.mock("../lib/checkout-store.js", async () => await import("../test/fake-checkout.js"));
vi.mock("@directus/sdk", async () => await import("../test/fake-sdk.js"));
vi.mock("../lib/directus.js", async () => (await import("../test/fake-directus.js")).directusModuleMock);

const { resetDb } = await import("../test/fake-directus.js");
const { adminRoutes } = await import("./admin.js");
const { registerErrorHandler } = await import("../lib/errors.js");
const { env } = await import("../env.js");

const EDITOR_ID = "user-editor";
const now = Date.now();
const iso = (daysAgo: number) => new Date(now - daysAgo * 86400000).toISOString();

function token() {
  return jwt.sign({ sub: EDITOR_ID, scope: "admin", role: "editor", jti: "t1" }, env.ADMIN_AUTH_SECRET || env.AUTH_SECRET, { expiresIn: "1h" });
}

beforeEach(() => {
  resetDb({
    directus_users: [{ id: EDITOR_ID, email: "office@example.com", status: "active", role: { name: "editor" } }],
    alumni: [
      { id: "a1", fio: "А", joined_at: iso(3), verified_at: iso(2), verification_status: "verified", referred_by: "a0", points_cached: 100 },
      { id: "a2", fio: "Б", joined_at: iso(40), verified_at: null, verification_status: "pending", referred_by: null, points_cached: 0 },
    ],
    orders: [
      {
        id: "o1", type: "dpo", status: "new", payment_status: null, total_estimate: 500000, created_at: iso(1),
        items_json: [{ type: "dpo", ref_id: "ip", title: "Право ИС", qty: 1 }],
      },
      {
        id: "o2", type: "merch", status: "done", payment_status: "succeeded", total_estimate: 350000, created_at: iso(5),
        items_json: [{ type: "merch", ref_id: "robe", title: "Мантия", qty: 1 }],
      },
      {
        id: "o3", type: "dpo", status: "new", payment_status: null, total_estimate: 800000, created_at: iso(2),
        items_json: [
          { type: "dpo", ref_id: "ip", title: "Право ИС", qty: 1 },
          { type: "dpo", ref_id: "tax", title: "Налоги", qty: 1 },
        ],
      },
    ],
    event_rsvps: [
      { id: "r1", event_id: "e1", alumni_id: "a1", attended: true, created_at: iso(2) },
      { id: "r2", event_id: "e1", alumni_id: "a2", attended: false, created_at: iso(2) },
    ],
    events: [{ id: "e1", title: "Встреча выпуска", starts_at: iso(-10), status: "published" }],
    podcast_plays: [{ id: "pp1", podcast_id: "p1", alumni_id: "a1", created_at: iso(1) }],
    podcasts: [{ id: "p1", title: "Выпуск 1" }],
    alumni_achievements: [{ id: "aa1", alumni_id: "a1", achievement_id: "ach1", earned_at: iso(1) }],
    achievements: [{ id: "ach1", key: "first_step", title: "Первый шаг" }],
    points_ledger: [
      { id: "pl1", alumni_id: "a1", reason: "event", delta: 60, created_at: iso(1) },
      { id: "pl2", alumni_id: "a1", reason: "referral", delta: 80, created_at: iso(2) },
    ],
    alumni_friends: [],
    push_subs: [{ id: "ps1", created_at: iso(4) }],
    audit_log: [
      { id: "l1", event: "login.ok", created_at: iso(1) },
      { id: "l2", event: "login.fail", created_at: iso(1) },
      { id: "l3", event: "register", created_at: iso(3) },
    ],
    levels: [],
  });
});

describe("GET /admin/analytics", () => {
  it("без токена → 401", async () => {
    const app = Fastify();
    registerErrorHandler(app);
    await app.register(adminRoutes);
    const r = await app.inject({ method: "GET", url: "/admin/analytics" });
    expect(r.statusCode).toBe(401);
  });

  it("отдаёт пульс и разрезы за 30d", async () => {
    const app = Fastify();
    registerErrorHandler(app);
    await app.register(adminRoutes);
    const r = await app.inject({ method: "GET", url: "/admin/analytics?range=30d", headers: { authorization: `Bearer ${token()}` } });
    expect(r.statusCode).toBe(200);
    const j = r.json();
    expect(j.range).toBe("30d");
    expect(j.pulse.joins).toBe(1); // a1 within 30d, a2 is 40d ago
    expect(j.pulse.orders_created).toBe(3);
    expect(j.orders.by_type.some((x: { key: string; count: number }) => x.key === "dpo" && x.count === 2)).toBe(true);
    expect(j.orders.programs_top[0]).toMatchObject({ ref_id: "ip", qty: 2, orders: 2 });
    expect(j.engagement.events_top[0]?.rsvps).toBe(2);
    expect(j.community.achievements_top[0]?.key).toBe("first_step");
    expect(j.pulse.login_ok).toBe(1);
  });

  it("CSV выгрузка с BOM", async () => {
    const app = Fastify();
    registerErrorHandler(app);
    await app.register(adminRoutes);
    const r = await app.inject({ method: "GET", url: "/admin/analytics/export.csv?range=7d", headers: { authorization: `Bearer ${token()}` } });
    expect(r.statusCode).toBe(200);
    expect(r.headers["content-type"]).toMatch(/text\/csv/);
    expect(r.body.charCodeAt(0)).toBe(0xfeff);
    expect(r.body).toContain("pulse");
  });
});
