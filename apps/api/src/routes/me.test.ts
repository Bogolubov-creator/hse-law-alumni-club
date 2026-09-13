import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import jwt from "jsonwebtoken";
import { achievementProgress } from "@club/shared";

vi.mock("@directus/sdk", async () => import("../test/fake-sdk.js"));
vi.mock("../lib/directus.js", async () => (await import("../test/fake-directus.js")).directusModuleMock);

const { db, resetDb } = await import("../test/fake-directus.js");
const { directus } = await import("../lib/directus.js");
const { meRoutes } = await import("./me.js");
const { registerErrorHandler } = await import("../lib/errors.js");
const { env } = await import("../env.js");

beforeEach(() => {
  resetDb({
    alumni: [{ id: "member", verification_status: "verified", token_version: 0, points_cached: 500, personal_discount: 0 }],
    points_ledger: [
      { alumni_id: "member", reason: "program", delta: 100, created_at: "2020-01-01T00:00:00Z" },
      { alumni_id: "member", reason: "event", delta: 400, created_at: new Date().toISOString() },
      { alumni_id: "other", reason: "program", delta: 999, created_at: new Date().toISOString() },
    ],
  });
});
afterEach(() => vi.restoreAllMocks());

describe("GET /me", () => {
  it("сохраняет всю историю достижений, ограничивает график и не перечитывает профиль/ledger", async () => {
    const spy = vi.spyOn(directus, "request");
    const app = Fastify();
    registerErrorHandler(app);
    await app.register(meRoutes);
    try {
      const token = jwt.sign({ alumni_id: "member", ver: 0 }, env.AUTH_SECRET);
      const result = await app.inject({ url: "/me", headers: { authorization: `Bearer ${token}` } });
      expect(result.statusCode).toBe(200);
      expect(result.json().activity.reduce((sum: number, row: { points: number }) => sum + row.points, 0)).toBe(400);
      expect(result.json().achievements).toEqual(achievementProgress({
        programs_completed: 1, events_attended: 1, mentorship_count: 0,
        referrals_count: 0, orders_count: 0, points: 500, verified: 1,
        status_level: 3,
      }));
      expect(spy).toHaveBeenCalledTimes(3);
    } finally { await app.close(); }
  });

  it("отозванная сессия не получает профиль или статистику", async () => {
    db.alumni![0]!.token_version = 1;
    const spy = vi.spyOn(directus, "request");
    const app = Fastify();
    await app.register(meRoutes);
    try {
      const token = jwt.sign({ alumni_id: "member", ver: 0 }, env.AUTH_SECRET);
      expect((await app.inject({ url: "/me", headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(401);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally { await app.close(); }
  });
});
