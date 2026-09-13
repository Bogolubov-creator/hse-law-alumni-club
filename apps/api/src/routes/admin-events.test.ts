import { beforeEach, expect, it, vi } from "vitest";
import Fastify from "fastify";
import jwt from "jsonwebtoken";
vi.mock("@directus/sdk", async () => await import("../test/fake-sdk.js"));
vi.mock("../lib/directus.js", async () => (await import("../test/fake-directus.js")).directusModuleMock);
vi.mock("../lib/checkout-store.js", async () => await import("../test/fake-checkout.js"));
const { resetDb } = await import("../test/fake-directus.js");
const { eventsRoutes } = await import("./events.js");
const { env } = await import("../env.js");
beforeEach(() => resetDb({
  directus_users: [{ id: "editor", status: "active", role: { name: "editor" } }],
  events: [{ id: "e1", starts_at: "2026-01-01" }, { id: "e2", starts_at: "2026-02-01" }, { id: "empty", starts_at: "2026-03-01" }],
  alumni: [{ id: "a1", fio: "Имя" }],
  event_rsvps: [{ id: "r1", event_id: "e1", alumni_id: "a1", attended: true }, { id: "r2", event_id: "e2", alumni_id: "missing", attended: false }, { id: "r3", event_id: "e1", alumni_id: "a1", attended: false }],
}));
it("сохраняет порядок событий, полные roster, отметки и пустые списки", async () => {
  const app = Fastify(); await app.register(eventsRoutes);
  try {
    const unauthorized = await app.inject({ url: "/admin/events" });
    expect(unauthorized.statusCode).toBe(401);
    const token = jwt.sign({ sub: "editor", scope: "admin", role: "editor", jti: "event-test" }, env.ADMIN_AUTH_SECRET || env.AUTH_SECRET, { expiresIn: "1h" });
    const res = await app.inject({ url: "/admin/events", headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    const rows = res.json(); expect(rows.map((r: any) => r.id)).toEqual(["empty", "e2", "e1"]);
    expect(rows[0].rsvps).toEqual([]);
    expect(rows[1].rsvps).toEqual([{ id: "r2", alumni_id: "missing", fio: "–", attended: false }]);
    expect(rows[2].rsvps).toEqual([{ id: "r1", alumni_id: "a1", fio: "Имя", attended: true }, { id: "r3", alumni_id: "a1", fio: "Имя", attended: false }]);
  } finally { await app.close(); }
});
