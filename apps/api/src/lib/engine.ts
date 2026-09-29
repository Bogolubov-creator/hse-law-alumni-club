import { readItems, createItem, updateItem } from "@directus/sdk";
import {
  computeLevel, evaluateAchievements, decayDelta,
  POINT_RULES, LEVELS, type PointReason,
} from "@club/shared";
import { directus } from "./directus.js";
import { withLock } from "./mutex.js";

const di = directus; // типизированный клиент; касты остаются на записях/реляциях

export interface AddPointsInput {
  reason: PointReason;
  delta?: number;
  ref?: string | null;
  comment?: string | null;
  idempotencyKey?: string | null;
}

/**
 * Начисление баллов: запись в ledger (источник правды) + пересчёт кэша + достижения.
 * При заданном ключе идемпотентности операция сериализуется мьютексом: проверка
 * дубля и вставка – это read-then-write, и без лока двойной клик («Был на событии»,
 * повторная верификация приглашённого) успевал пройти проверку дважды и начислял
 * баллы два раза.
 */
export async function addPoints(alumniId: string, input: AddPointsInput) {
  if (!input.idempotencyKey) return addPointsUnlocked(alumniId, input);
  return withLock(`points:${input.idempotencyKey}`, () => addPointsUnlocked(alumniId, input));
}

async function addPointsUnlocked(alumniId: string, input: AddPointsInput) {
  const ruled = POINT_RULES.find((r) => r.reason === input.reason)?.points ?? 0;
  const delta = input.delta ?? ruled;

  // Идемпотентность (decay / вебхуки)
  if (input.idempotencyKey) {
    const dup = (await di.request(
      readItems("points_ledger", { filter: { idempotency_key: { _eq: input.idempotencyKey } }, limit: 1, fields: ["id"] }),
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
  // Достижения – не критичны: их сбой не должен валить уже зачисленные баллы.
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
    readItems("points_ledger", { filter: { alumni_id: { _eq: alumniId } }, limit: -1, fields: ["delta"] }),
  )) as { delta: number }[];
  const points = rows.reduce((s, r) => s + (r.delta || 0), 0);
  const level = computeLevel(points);
  await di.request((updateItem as any)("alumni", alumniId, { points_cached: points, level_cached: level.key }));
  return { points, level: level.key };
}

/** Статистика по уже прочитанным данным; история достижений не ограничена периодом графика. */
export function statsFromLedger(alumni: { points_cached?: number | null; verification_status?: string | null } | undefined, ledger: { reason: string }[]) {
  const counts = new Map<string, number>();
  for (const row of ledger) counts.set(row.reason, (counts.get(row.reason) ?? 0) + 1);
  const points = alumni?.points_cached ?? 0;
  return {
    programs_completed: counts.get("program") ?? 0, events_attended: counts.get("event") ?? 0,
    mentorship_count: counts.get("mentorship") ?? 0, referrals_count: counts.get("referral") ?? 0,
    orders_count: counts.get("order") ?? 0,
    points, verified: alumni?.verification_status === "verified" ? 1 : 0,
    status_level: LEVELS.findIndex((l) => l.key === computeLevel(points).key) + 1,
  };
}

/** Полная статистика выпускника (для прогресса достижений). */
export async function alumniStats(alumniId: string) {
  const ledger = (await di.request(
    readItems("points_ledger", { filter: { alumni_id: { _eq: alumniId } }, limit: -1, fields: ["reason"] }),
  )) as { reason: string }[];
  const rows = (await di.request(readItems("alumni", {
    filter: { id: { _eq: alumniId } }, limit: 1, fields: ["points_cached", "verification_status"],
  }))) as { points_cached: number; verification_status: string }[];
  return statsFromLedger(rows[0], ledger);
}

/** Выдать заслуженные достижения, которых ещё нет. */
export async function grantAchievements(alumniId: string) {
  // Полная статистика (включая verified/status_level) – иначе часть достижений не выдаётся.
  const stats = await alumniStats(alumniId);
  const earnedKeys = evaluateAchievements(stats);
  if (!earnedKeys.length) return;

  const defs = (await di.request(readItems("achievements", { filter: { key: { _in: earnedKeys } }, limit: -1, fields: ["id", "key"] }))) as any[];
  const existing = (await di.request(readItems("alumni_achievements", { filter: { alumni_id: { _eq: alumniId } }, limit: -1, fields: ["achievement_id"] }))) as any[];
  const have = new Set(existing.map((e) => e.achievement_id));
  for (const d of defs) {
    if (!have.has(d.id)) {
      await di.request((createItem as any)("alumni_achievements", { alumni_id: alumniId, achievement_id: d.id }));
    }
  }
}

export { levelInfo } from "@club/shared";

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
  const MIN_GAP_MS = 27 * 24 * 3600 * 1000; // не чаще раза в ~месяц
  let affected = 0;
  for (const a of stale) {
    try {
      // Баланс и дата последнего decay – из ledger (источник правды), а не из
      // возможно рассинхронизированного points_cached: списываем корректную сумму.
      const ledger = (await di.request(
        readItems("points_ledger", { filter: { alumni_id: { _eq: a.id } }, limit: -1, fields: ["delta", "reason", "created_at"] }),
      )) as { delta: number; reason: string; created_at: string | null }[];
      const balance = ledger.reduce((s, r) => s + (r.delta || 0), 0);
      // Защита от двойного списания: если decay уже был за последние 27 дней
      // (ручной /decay/run + cron на стыке месяцев), пропускаем. Ключ по месяцу
      // защищает лишь от повтора в том же календарном месяце.
      const lastDecayAt = ledger.reduce((max, r) => (r.reason === "decay" && r.created_at && r.created_at > max ? r.created_at : max), "");
      if (lastDecayAt && now.getTime() - new Date(lastDecayAt).getTime() < MIN_GAP_MS) continue;
      const delta = decayDelta(balance);
      if (delta >= 0) continue;
      const before = computeLevel(balance).key;
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
