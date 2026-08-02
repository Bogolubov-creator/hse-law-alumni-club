import type { FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";
import { timingSafeEqual } from "node:crypto";
import { readItems, readUsers } from "@directus/sdk";
import { env } from "../env.js";
import { directus } from "./directus.js";

const di = directus;

function bearer(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  const m = h && /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1]! : null;
}

/** Сравнение секретов в постоянном времени (без утечки по длине/времени). */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function isServiceToken(req: FastifyRequest): boolean {
  const t = bearer(req);
  return !!t && safeEqual(t, env.DIRECTUS_SERVICE_TOKEN);
}

// Отдельный секрет для админ-токенов (если задан), иначе общий.
const adminSecret = (): string => env.ADMIN_AUTH_SECRET || env.AUTH_SECRET;

// Собственная сессия apps/api (Directus наружу не светим).
export function signSession(alumniId: string, userId: string, tokenVersion = 0): string {
  return jwt.sign({ alumni_id: alumniId, sub: userId, ver: tokenVersion }, env.AUTH_SECRET, { expiresIn: "7d" });
}
function verifySession(token: string): { alumni_id?: string; sub?: string; ver?: number } | null {
  try {
    return jwt.verify(token, env.AUTH_SECRET, { algorithms: ["HS256"] }) as { alumni_id?: string; sub?: string; ver?: number };
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
// Роли с доступом к админ-панели (совпадает с ADMIN_ROLES в routes/admin.ts).
const ADMIN_ROLE_NAMES = ["editor", "admin", "Administrator"];
export function signAdmin(userId: string, role: string): string {
  return jwt.sign({ sub: userId, role, scope: "admin" }, adminSecret(), { expiresIn: "12h" });
}
/** Актуальная роль аккаунта Directus по id (для ревокации доступа снятого админа). */
async function roleNameByUserId(userId: string): Promise<string | null> {
  const rows = (await di.request((readUsers as any)({ filter: { id: { _eq: userId } }, limit: 1, fields: ["role.name", "status"] }))) as any[];
  if (!rows[0] || rows[0].status !== "active") return null;
  return (rows[0].role?.name as string) ?? "";
}
/**
 * Контекст админа по JWT. Роль сверяется с Directus на КАЖДЫЙ запрос: у снятого
 * с должности (роль изменена/аккаунт деактивирован) доступ пропадает сразу, а не
 * живёт до истечения 12-часового токена (claim роли внутри JWT — только подсказка).
 */
export async function resolveAdmin(req: FastifyRequest): Promise<AdminCtx | null> {
  const token = bearer(req);
  if (!token || safeEqual(token, env.DIRECTUS_SERVICE_TOKEN)) return null;
  let sub: string;
  try {
    const p = jwt.verify(token, adminSecret(), { algorithms: ["HS256"] }) as { scope?: string; sub?: string };
    if (p?.scope !== "admin" || !p?.sub) return null;
    sub = p.sub;
  } catch {
    return null;
  }
  const role = await roleNameByUserId(sub);
  if (!role || !ADMIN_ROLE_NAMES.includes(role)) return null;
  return { userId: sub, role };
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
  avatar: string | null;
  referral_code: string | null;
}

export async function findAlumniByUser(userId: string): Promise<AlumniCtx | null> {
  const rows = (await di.request(
    readItems("alumni", {
      filter: { user_id: { _eq: userId } }, limit: 1,
      fields: ["id", "fio", "cohort", "verification_status", "personal_discount", "points_cached", "contacts_json", "edu_program", "edu_level", "interests_json", "podcast_sub_until", "avatar", "referral_code", "token_version"],
    }),
  )) as (AlumniCtx & { token_version?: number | null })[];
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
      fields: ["id", "fio", "cohort", "verification_status", "personal_discount", "points_cached", "contacts_json", "edu_program", "edu_level", "interests_json", "podcast_sub_until", "avatar", "referral_code", "token_version"],
    }),
  )) as (AlumniCtx & { token_version?: number | null })[];
  const alumni = rows[0];
  if (!alumni) return null;
  // Ревокация: сброс пароля поднимает token_version — старые JWT перестают действовать.
  if ((payload.ver ?? 0) !== (alumni.token_version ?? 0)) return null;
  return alumni;
}

/** Гард админ-маршрута: 401 если нет валидного admin-JWT, иначе контекст. */
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<AdminCtx | null> {
  const ctx = await resolveAdmin(req);
  if (!ctx) { reply.code(401).send({ error: "Требуется вход администратора" }); return null; }
  return ctx;
}
