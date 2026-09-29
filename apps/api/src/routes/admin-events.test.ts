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

it("пагинация возвращает счётчики без чтения roster и имён", async () => {
  const { directusModuleMock } = await import("../test/fake-directus.js");
  const spy = vi.spyOn(directusModuleMock.directus, "request");
  const app = Fastify(); await app.register(eventsRoutes);
  const token = jwt.sign({ sub: "editor", scope: "admin", role: "editor", jti: "page-test" }, env.ADMIN_AUTH_SECRET || env.AUTH_SECRET, { expiresIn: "1h" });
  try {
    const res = await app.inject({ url: "/admin/events?page=2&limit=1", headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ items: [{ id: "e2", starts_at: "2026-02-01", rsvp_count: 1 }], page: 2, limit: 1, total: 3 });
    const reads = spy.mock.calls.map(([arg]) => arg).filter(arg => arg.kind === "readItems");
    expect(reads.some(arg => arg.collection === "alumni" || arg.collection === "event_rsvps")).toBe(false);
    expect(reads.find(arg => arg.collection === "events")?.query).toMatchObject({ limit: 1, offset: 1, sort: ["-starts_at", "id"] });
    const last = await app.inject({ url: "/admin/events?page=4&limit=1", headers: { authorization: `Bearer ${token}` } });
    expect(last.json()).toMatchObject({ items: [], total: 3 });
  } finally { spy.mockRestore(); await app.close(); }
});

it("roster требует входа, ограничен событием и различает пустое и отсутствующее событие", async () => {
  const app = Fastify(); await app.register(eventsRoutes);
  const token = jwt.sign({ sub: "editor", scope: "admin", role: "editor", jti: "roster-test" }, env.ADMIN_AUTH_SECRET || env.AUTH_SECRET, { expiresIn: "1h" });
  const headers = { authorization: `Bearer ${token}` };
  try {
    expect((await app.inject({ url: "/admin/events/e1/rsvps" })).statusCode).toBe(401);
    const result = await app.inject({ url: "/admin/events/e1/rsvps", headers });
    expect(result.statusCode).toBe(200);
    expect(result.json().map((r: any) => r.id)).toEqual(["r1", "r3"]);
    expect(result.json()[0]).toMatchObject({ fio: "Имя", attended: true });
    expect((await app.inject({ url: "/admin/events/empty/rsvps", headers })).json()).toEqual([]);
    expect((await app.inject({ url: "/admin/events/missing/rsvps", headers })).statusCode).toBe(404);
  } finally { await app.close(); }
});

it("отклоняет некорректные границы страницы", async () => {
  const { registerErrorHandler } = await import("../lib/errors.js");
  const app = Fastify(); registerErrorHandler(app); await app.register(eventsRoutes);
  const token = jwt.sign({ sub: "editor", scope: "admin", role: "editor", jti: "invalid-test" }, env.ADMIN_AUTH_SECRET || env.AUTH_SECRET, { expiresIn: "1h" });
  try {
    for (const query of ["page=0", "page=1.5", "limit=101", "limit=-1", "page=nope"]) {
      expect((await app.inject({ url: `/admin/events?${query}`, headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(400);
    }
  } finally { await app.close(); }
});
