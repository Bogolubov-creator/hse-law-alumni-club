import { readItems, createItem, updateItem } from "@directus/sdk";
import {
  computeLevel, computeMemberDiscount, evaluateAchievements, decayDelta,
  POINT_RULES, LEVELS, type PointReason,
} from "@club/shared";
import { directus } from "./directus.js";

const di = directus as any; // коллекции движка типизируем свободно

export interface AddPointsInput {
  reason: PointReason;
  delta?: number;
  ref?: string | null;
  comment?: string | null;
  idempotencyKey?: string | null;
}

/** Начисление баллов: запись в ledger (источник правды) + пересчёт кэша + достижения. */
export async function addPoints(alumniId: string, input: AddPointsInput) {
  const ruled = POINT_RULES.find((r) => r.reason === input.reason)?.points ?? 0;
  const delta = input.delta ?? ruled;

  // Идемпотентность (decay / вебхуки)
  if (input.idempotencyKey) {
    const dup = (await di.request(
      (readItems as any)("points_ledger", { filter: { idempotency_key: { _eq: input.idempotencyKey } }, limit: 1, fields: ["id"] }),
    )) as any[];
    if (dup.length) return recompute(alumniId);
  }

  await di.request((createItem as any)("points_ledger", {
    alumni_id: alumniId, delta, reason: input.reason,
    ref: input.ref ?? null, comment: input.comment ?? null,
    idempotency_key: input.idempotencyKey ?? null,
  }));

  if (input.reason !== "decay") {
    await di.request((updateItem as any)("alumni", alumniId, { last_activity_at: new Date().toISOString() }));
  }
  const res = await recompute(alumniId);
  // Достижения — не критичны: их сбой не должен валить уже зачисленные баллы.
  try {
    await grantAchievements(alumniId);
  } catch (e) {
    console.error(`[grantAchievements] не удалось для ${alumniId}:`, (e as Error).message);
  }
  return res;
}

/** Пересчёт points_cached/level_cached из ledger (агрегат). */
export async function recompute(alumniId: string) {
  const rows = (await di.request(
    (readItems as any)("points_ledger", { filter: { alumni_id: { _eq: alumniId } }, limit: -1, fields: ["delta"] }),
  )) as { delta: number }[];
  const points = rows.reduce((s, r) => s + (r.delta || 0), 0);
  const level = computeLevel(points);
  await di.request((updateItem as any)("alumni", alumniId, { points_cached: points, level_cached: level.key }));
  return { points, level: level.key };
}

async function counts(alumniId: string) {
  const rows = (await di.request(
    (readItems as any)("points_ledger", { filter: { alumni_id: { _eq: alumniId } }, limit: -1, fields: ["reason"] }),
  )) as { reason: string }[];
  const by = (r: string) => rows.filter((x) => x.reason === r).length;
  return { programs_completed: by("program"), events_attended: by("event"), mentorship_count: by("mentorship") };
}

/** Выдать заслуженные достижения, которых ещё нет. */
export async function grantAchievements(alumniId: string) {
  const alumni = (await di.request((readItems as any)("alumni", { filter: { id: { _eq: alumniId } }, limit: 1, fields: ["points_cached"] }))) as any[];
  const points = alumni[0]?.points_cached ?? 0;
  const stats = { ...(await counts(alumniId)), points };
  const earnedKeys = evaluateAchievements(stats);
  if (!earnedKeys.length) return;

  const defs = (await di.request((readItems as any)("achievements", { filter: { key: { _in: earnedKeys } }, limit: -1, fields: ["id", "key"] }))) as any[];
  const existing = (await di.request((readItems as any)("alumni_achievements", { filter: { alumni_id: { _eq: alumniId } }, limit: -1, fields: ["achievement_id"] }))) as any[];
  const have = new Set(existing.map((e) => e.achievement_id));
  for (const d of defs) {
    if (!have.has(d.id)) {
      await di.request((createItem as any)("alumni_achievements", { alumni_id: alumniId, achievement_id: d.id }));
    }
  }
}

export function levelInfo(points: number, personalDiscount = 0) {
  const level = computeLevel(points);
  const idx = LEVELS.findIndex((l) => l.key === level.key);
  const next = LEVELS[idx + 1] ?? null;
  return {
    points,
    level: level.key,
    level_title: level.title,
    discount: computeMemberDiscount(points, personalDiscount),
    next_level: next?.title ?? null,
    to_next: next ? Math.max(0, next.min_points - points) : 0,
  };
}

/** Cron-decay: −15% за месяц неактивности; идемпотентно по месяцу. */
export async function runDecay(now = new Date()) {
  const cutoff = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString();
  const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const stale = (await di.request(
    (readItems as any)("alumni", {
      filter: { _or: [{ last_activity_at: { _lte: cutoff } }, { last_activity_at: { _null: true } }] },
      limit: -1, fields: ["id", "points_cached", "level_cached"],
    }),
  )) as any[];
  let affected = 0;
  for (const a of stale) {
    try {
      const delta = decayDelta(a.points_cached ?? 0);
      if (delta >= 0) continue;
      const before = computeLevel(a.points_cached ?? 0).key;
      const res = await addPoints(a.id, { reason: "decay", delta, idempotencyKey: `decay-${a.id}-${ym}`, comment: "Ежемесячный decay за неактивность" });
      affected++;
      if (res.level !== before) console.log(`[decay] alumni ${a.id} просел: ${before} → ${res.level}`);
    } catch (e) {
      console.error(`[decay] сбой для ${a.id}:`, (e as Error).message); // не прерываем пакет
    }
  }
  console.log(`[decay] ${ym}: обработано ${affected}`);
  return { month: ym, affected };
}
