import domain from "./domain-data.json" with { type: "json" };

export type LevelKey = "graduate" | "friend" | "expert" | "ambassador";

export interface LevelDef {
  key: LevelKey;
  title: string;
  min_points: number;
  discount_percent: number;
  sort: number;
}

export const LEVELS: readonly LevelDef[] = domain.levels as readonly LevelDef[];

export type PointReason =
  | "program"
  | "event"
  | "referral"
  | "mentorship"
  | "order"
  | "decay"
  | "manual"
  | "achievement";

export interface PointRuleDef {
  reason: PointReason;
  points: number;
  description: string;
}

export const POINT_RULES: readonly PointRuleDef[] = domain.point_rules as readonly PointRuleDef[];

export interface AchievementDef {
  key: string;
  title: string;
  description: string;
  icon: string;
  kind: string; // подпись прогресса, напр. «мероприятия»
  rule_json: { type: string; gte: number };
  sort: number;
  star?: boolean; // «следующее» достижение – оранжевая подсветка
}

export const ACHIEVEMENTS: readonly AchievementDef[] = domain.achievements as readonly AchievementDef[];

export interface AchievementProgressItem {
  key: string; title: string; description: string; icon: string; kind: string;
  current: number; target: number; earned: boolean; star: boolean;
}

export function achievementProgress(stats: AchievementStats): AchievementProgressItem[] {
  const s = stats as Record<string, number | undefined>;
  return ACHIEVEMENTS.map((a) => {
    const target = a.rule_json.gte;
    const raw = s[a.rule_json.type] ?? 0;
    return {
      key: a.key, title: a.title, description: a.description, icon: a.icon, kind: a.kind,
      current: Math.min(raw, target), target, earned: raw >= target, star: a.star ?? false,
    };
  });
}

export function computeLevel(points: number): LevelDef {
  let current = LEVELS[0]!;
  for (const lvl of LEVELS) {
    if (points >= lvl.min_points) current = lvl;
  }
  return current;
}

export const PERSONAL_DISCOUNT_MAX = domain.limits.personal_discount_max;
export const MEMBER_DISCOUNT_CAP = domain.limits.member_discount_cap;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function computeMemberDiscount(points: number, personalDiscount = 0): number {
  const base = computeLevel(points).discount_percent;
  const personal = clamp(personalDiscount, 0, PERSONAL_DISCOUNT_MAX);
  return clamp(base + personal, 0, MEMBER_DISCOUNT_CAP);
}

export const DECAY_RATE = domain.limits.decay_rate;

export function decayDelta(points: number): number {
  return -Math.round(Math.max(0, points) * DECAY_RATE) || 0; // || 0 убирает -0
}

export interface AchievementStats {
  telegram_subscribed?: number;
  telegram_reactions?: number;
  programs_completed?: number;
  events_attended?: number;
  mentorship_count?: number;
  referrals_count?: number;
  orders_count?: number; // заказы мерча (ledger reason = order)
  points?: number;
  verified?: number; // 1 если верифицирован учебным офисом
  status_level?: number; // порядковый номер уровня (1..4)
}

export function evaluateAchievements(stats: AchievementStats): string[] {
  const earned: string[] = [];
  for (const a of ACHIEVEMENTS) {
    const rule = a.rule_json as { type?: string; gte?: number };
    if (!rule?.type || typeof rule.gte !== "number") continue;
    const value = (stats as Record<string, number | undefined>)[rule.type] ?? 0;
    if (value >= rule.gte) earned.push(a.key);
  }
  return earned;
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
