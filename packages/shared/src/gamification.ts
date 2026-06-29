// Геймификация — единый источник правды для api, bootstrap и web.
// Числа сверены с прототипом club-business-law.html и решением оркестратора 3.1.

export type LevelKey = "graduate" | "friend" | "expert" | "ambassador";

export interface LevelDef {
  key: LevelKey;
  title: string;
  min_points: number;
  discount_percent: number;
  sort: number;
}

export const LEVELS: LevelDef[] = [
  { key: "graduate", title: "Выпускник", min_points: 0, discount_percent: 5, sort: 1 },
  { key: "friend", title: "Друг клуба", min_points: 200, discount_percent: 10, sort: 2 },
  { key: "expert", title: "Знаток", min_points: 500, discount_percent: 15, sort: 3 },
  { key: "ambassador", title: "Амбассадор", min_points: 1000, discount_percent: 20, sort: 4 },
];

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

export const POINT_RULES: PointRuleDef[] = [
  { reason: "program", points: 100, description: "Завершение программы ДПО" },
  { reason: "event", points: 60, description: "Участие в событии клуба" },
  { reason: "referral", points: 80, description: "Приглашённый выпускник верифицирован" },
  { reason: "mentorship", points: 120, description: "Менторство младшего потока" },
];

export interface AchievementDef {
  key: string;
  title: string;
  description: string;
  rule_json: Record<string, unknown>;
  sort: number;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { key: "first_step", title: "Первый шаг", description: "Первая пройденная программа", rule_json: { type: "programs_completed", gte: 1 }, sort: 1 },
  { key: "networker", title: "Нетворкер", description: "Участие в событии клуба", rule_json: { type: "events_attended", gte: 1 }, sort: 2 },
  { key: "expert3", title: "Знаток", description: "Три завершённые программы", rule_json: { type: "programs_completed", gte: 3 }, sort: 3 },
  { key: "mentor", title: "Наставник", description: "Менторство младшего потока", rule_json: { type: "mentorship_count", gte: 1 }, sort: 4 },
  { key: "legend", title: "Легенда выпуска", description: "1000 баллов активности", rule_json: { type: "points", gte: 1000 }, sort: 5 },
];

/** Текущий уровень по сумме баллов. */
export function computeLevel(points: number): LevelDef {
  let current = LEVELS[0]!;
  for (const lvl of LEVELS) {
    if (points >= lvl.min_points) current = lvl;
  }
  return current;
}

export const PERSONAL_DISCOUNT_MAX = 10; // офис ставит 0–10%
export const MEMBER_DISCOUNT_CAP = 25; // потолок итоговой справочной скидки (решение 3.1)

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * Справочная членская скидка (оплаты в проекте нет).
 * min(база_уровня + clamp(personal, 0..10), 25), не ниже 0.
 */
export function computeMemberDiscount(points: number, personalDiscount = 0): number {
  const base = computeLevel(points).discount_percent;
  const personal = clamp(personalDiscount, 0, PERSONAL_DISCOUNT_MAX);
  return clamp(base + personal, 0, MEMBER_DISCOUNT_CAP);
}
