import type { FastifyRequest } from "fastify";
import { createDirectus, rest, staticToken, readMe, readItems } from "@directus/sdk";
import { env } from "../env.js";
import { directus } from "./directus.js";

function bearer(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  const m = h && /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1]! : null;
}

/** Серверный/админский вызов (POST /points и т.п.). */
export function isServiceToken(req: FastifyRequest): boolean {
  return bearer(req) === env.DIRECTUS_SERVICE_TOKEN;
}

export interface AlumniCtx {
  id: string;
  user_id: string;
  verification_status: string;
  personal_discount: number;
  points_cached: number;
}

/** Текущий выпускник по Directus-токену пользователя (Bearer из веб-логина). */
export async function resolveAlumni(req: FastifyRequest): Promise<AlumniCtx | null> {
  const token = bearer(req);
  if (!token || token === env.DIRECTUS_SERVICE_TOKEN) return null;
  try {
    const userClient = createDirectus(env.DIRECTUS_URL).with(staticToken(token)).with(rest());
    const me = (await userClient.request(readMe({ fields: ["id"] }))) as any;
    if (!me?.id) return null;
    const rows = (await (directus as any).request(
      (readItems as any)("alumni", {
        filter: { user_id: { _eq: me.id } },
        limit: 1,
        fields: ["id", "user_id", "verification_status", "personal_discount", "points_cached"],
      }),
    )) as AlumniCtx[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}
