import { adminNewsSourceRoutes } from "../news/admin-routes.js";
import type { FastifyInstance } from "fastify";
import { adminAuthRoutes } from "../auth/admin-routes.js";
import { adminOverviewRoutes } from "./overview-routes.js";
import { adminOrdersRoutes } from "../checkout/admin-routes.js";
import { adminMembersRoutes } from "../members/admin-routes.js";
import { adminCatalogRoutes } from "../catalog/admin-routes.js";
import { adminContentRoutes } from "../content/admin-routes.js";
import { adminPodcastsRoutes } from "../podcasts/admin-routes.js";

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
