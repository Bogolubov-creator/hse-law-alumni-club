import type { FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import { readItems, readUsers } from "@directus/sdk";
import { env } from "../env.js";
import { directus } from "./directus.js";

const di = directus;

function bearer(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  const m = h && /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1]! : null;
}

export function isServiceToken(req: FastifyRequest): boolean {
  return bearer(req) === env.DIRECTUS_SERVICE_TOKEN;
}

// Отдельный секрет для админ-токенов (если задан), иначе общий.
const adminSecret = (): string => env.ADMIN_AUTH_SECRET || env.AUTH_SECRET;

// Собственная сессия apps/api (Directus наружу не светим).
export function signSession(alumniId: string, userId: string): string {
  return jwt.sign({ alumni_id: alumniId, sub: userId }, env.AUTH_SECRET, { expiresIn: "7d" });
}
function verifySession(token: string): { alumni_id?: string; sub?: string } | null {
  try {
    return jwt.verify(token, env.AUTH_SECRET, { algorithms: ["HS256"] }) as { alumni_id?: string; sub?: string };
  } catch {
    return null;
  }
}

/** Валидация пары email/пароль через Directus (логин на стороне сервера). */
export async function directusCredsValid(email: string, password: string): Promise<boolean> {
  try {
    const r = await fetch(`${env.DIRECTUS_URL}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    return r.ok;
  } catch (e) {
    // Сетевой сбой (Directus недоступен) — не молча: оставляем след в логах.
    console.error("[auth] Directus /auth/login недоступен:", (e as Error).message);
    return false;
  }
}

export async function findUserByEmail(email: string): Promise<{ id: string; first_name?: string; last_name?: string } | null> {
  const rows = (await di.request(readUsers({ filter: { email: { _eq: email } }, limit: 1, fields: ["id", "first_name", "last_name"] }))) as any[];
  return rows[0] ?? null;
}

export async function findUserWithRole(email: string): Promise<{ id: string; role: string } | null> {
  const rows = (await di.request((readUsers as any)({ filter: { email: { _eq: email } }, limit: 1, fields: ["id", "role.name"] }))) as any[];
  if (!rows[0]) return null;
  return { id: rows[0].id, role: (rows[0].role?.name as string) ?? "" };
}

// ── Админ-сессия (роли editor/admin) ──────────────────────────
export interface AdminCtx { userId: string; role: string }
export function signAdmin(userId: string, role: string): string {
  return jwt.sign({ sub: userId, role, scope: "admin" }, adminSecret(), { expiresIn: "12h" });
}
export function resolveAdmin(req: FastifyRequest): AdminCtx | null {
  const token = bearer(req);
  if (!token || token === env.DIRECTUS_SERVICE_TOKEN) return null;
  try {
    const p = jwt.verify(token, adminSecret(), { algorithms: ["HS256"] }) as { scope?: string; sub?: string; role?: string };
    if (p?.scope !== "admin" || !p?.sub) return null;
    return { userId: p.sub, role: p.role ?? "" };
  } catch {
    return null;
  }
}

export interface AlumniCtx {
  id: string;
  fio: string | null;
  cohort: string | null;
  verification_status: string;
  personal_discount: number;
  points_cached: number;
  contacts_json: Record<string, string> | null;
  edu_program: string | null;
  edu_level: string | null;
  interests_json: string[] | null;
  podcast_sub_until: string | null;
}

export async function findAlumniByUser(userId: string): Promise<AlumniCtx | null> {
  const rows = (await di.request(
    readItems("alumni", {
      filter: { user_id: { _eq: userId } }, limit: 1,
      fields: ["id", "fio", "cohort", "verification_status", "personal_discount", "points_cached", "contacts_json", "edu_program", "edu_level", "interests_json", "podcast_sub_until"],
    }),
  )) as AlumniCtx[];
  return rows[0] ?? null;
}

/** Текущий выпускник по нашей сессии (Bearer JWT). */
export async function resolveAlumni(req: FastifyRequest): Promise<AlumniCtx | null> {
  const token = bearer(req);
  if (!token || token === env.DIRECTUS_SERVICE_TOKEN) return null;
  const payload = verifySession(token);
  if (!payload?.alumni_id) return null;
  const rows = (await di.request(
    readItems("alumni", {
      filter: { id: { _eq: payload.alumni_id } }, limit: 1,
      fields: ["id", "fio", "cohort", "verification_status", "personal_discount", "points_cached", "contacts_json", "edu_program", "edu_level", "interests_json", "podcast_sub_until"],
    }),
  )) as AlumniCtx[];
  return rows[0] ?? null;
}
