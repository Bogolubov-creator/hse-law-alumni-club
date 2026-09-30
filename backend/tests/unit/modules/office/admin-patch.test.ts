import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import jwt from "jsonwebtoken";

vi.mock("../../../../src/db/data.js", async () => (await import("../../../helpers/fake-data.js")).dataModuleMock);
vi.mock("../../../../src/db/checkout-store.js", async () => await import("../../../helpers/fake-checkout.js"));

const { db, resetDb } = await import("../../../helpers/fake-data.js");
const { adminCatalogRoutes } = await import("../../../../src/modules/catalog/admin-routes.js");
const { adminContentRoutes } = await import("../../../../src/modules/content/admin-routes.js");
const { adminPodcastsRoutes } = await import("../../../../src/modules/podcasts/admin-routes.js");
const { eventsRoutes } = await import("../../../../src/modules/events/routes.js");
const { registerErrorHandler } = await import("../../../../src/common/errors.js");
const { env } = await import("../../../../src/config/env.js");

let app: FastifyInstance;
beforeEach(async () => {
  resetDb({
    directus_users: [{ id: "editor", status: "active", role: { name: "editor" } }],
    programs: [{ id: "program", title: "Старая программа", status: "archived" }],
    products: [{ id: "product", title: "Старый товар", status: "draft", stock: 17 }],
    news: [{ id: "news", title: "Старая новость", status: "draft" }],
    timeline_items: [{ id: "timeline", title: "Старая история", status: "draft" }],
    podcasts: [{ id: "podcast", title: "Старый выпуск", status: "draft", is_free: true }],
    events: [{ id: "event", title: "Старое событие", status: "canceled", format: "online", points: 125 }],
    audit_log: [],
  });
  app = Fastify();
  registerErrorHandler(app);
  await app.register(adminCatalogRoutes);
  await app.register(adminContentRoutes);
  await app.register(adminPodcastsRoutes);
  await app.register(eventsRoutes);
});
afterEach(async () => { await app.close(); });

it("PATCH заголовка сохраняет статус, остаток и настройки вместо значений по умолчанию", async () => {
  const token = jwt.sign({ sub: "editor", scope: "admin", role: "editor", jti: "partial-update" }, env.ADMIN_AUTH_SECRET || env.AUTH_SECRET, { expiresIn: "1h" });
  const headers = { authorization: `Bearer ${token}` };
  const resources = [
    { url: "/admin/programs/program", collection: "programs" },
    { url: "/admin/products/product", collection: "products" },
    { url: "/admin/news/news", collection: "news" },
    { url: "/admin/timeline/timeline", collection: "timeline_items" },
    { url: "/admin/podcasts/podcast", collection: "podcasts" },
    { url: "/admin/events/event", collection: "events" },
  ];
  for (const { url, collection } of resources) {
    const original = { ...db[collection]![0] };
    const response = await app.inject({ method: "PATCH", url, headers, payload: { title: "Новое название" } });
    expect(response.statusCode, url).toBe(200);
    expect(db[collection]![0], url).toEqual({ ...original, title: "Новое название" });
  }
});
