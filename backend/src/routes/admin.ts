import { adminNewsSourceRoutes } from "./admin-news-sources.js";
import type { FastifyInstance } from "fastify";
import { adminAuthRoutes } from "./admin-auth.js";
import { adminOverviewRoutes } from "./admin-overview.js";
import { adminOrdersRoutes } from "./admin-orders.js";
import { adminMembersRoutes } from "./admin-members.js";
import { adminCatalogRoutes } from "./admin-catalog.js";
import { adminContentRoutes } from "./admin-content.js";
import { adminPodcastsRoutes } from "./admin-podcasts.js";

/** Регистрация доменов офиса; каждый маршрут сохраняет собственный гард доступа. */
export async function adminRoutes(app: FastifyInstance) {
  await adminAuthRoutes(app);
  await adminOverviewRoutes(app);
  await adminOrdersRoutes(app);
  await adminMembersRoutes(app);
  await adminCatalogRoutes(app);
  await adminContentRoutes(app);
  await adminNewsSourceRoutes(app);
  await adminPodcastsRoutes(app);
}
