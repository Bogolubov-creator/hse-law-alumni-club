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

export const LEVELS: readonly LevelDef[] = [
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

export const POINT_RULES: readonly PointRuleDef[] = [
  { reason: "program", points: 100, description: "Завершение программы ДПО" },
  { reason: "event", points: 60, description: "Участие в событии клуба" },
  { reason: "referral", points: 80, description: "Приглашённый выпускник верифицирован" },
  { reason: "mentorship", points: 120, description: "Менторство младшего потока" },
];

export interface AchievementDef {
  key: string;
  title: string;
  description: string;
  icon: string; // символ/буква на «ромбе» бейджа (как в Claude Design)
  kind: string; // подпись прогресса, напр. «мероприятия»
  rule_json: { type: string; gte: number };
  sort: number;
  star?: boolean; // «следующее» достижение — оранжевая подсветка
  demo?: number; // временное значение для метрик, которые ещё не трекаются (соцсети/лайки)
}

// Набор и оформление достижений повторяют «Дашборд ЛК.dc.html» (Claude Design).
export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { key: "first_step", title: "Первый шаг", description: "Посетите своё первое мероприятие клуба — встречу, лекцию или нетворкинг.", icon: "1", kind: "мероприятия", rule_json: { type: "events_attended", gte: 1 }, sort: 1 },
  { key: "office_seal", title: "Печать офиса", description: "Пройдите верификацию профиля у учебного офиса и подтвердите свой выпуск.", icon: "✓", kind: "статус", rule_json: { type: "verified", gte: 1 }, sort: 2 },
  { key: "on_radar", title: "На радаре", description: "Подпишитесь на все соцсети факультета права, чтобы ничего не пропускать.", icon: "@", kind: "соцсети", rule_json: { type: "socials", gte: 1 }, sort: 3, demo: 1 },
  { key: "on_wave", title: "На волне", description: "Наберите 50 лайков под постами факультета за один месяц.", icon: "♥", kind: "лайки за месяц", rule_json: { type: "likes_month", gte: 50 }, sort: 4, demo: 38 },
  { key: "club_voice", title: "Голос клуба", description: "Оставьте 10 комментариев в соцсетях факультета за один месяц.", icon: "✎", kind: "комментарии за месяц", rule_json: { type: "comments_month", gte: 10 }, sort: 5, demo: 7 },
  { key: "regular", title: "Завсегдатай", description: "Посетите 5 мероприятий клуба. Вы уже на полпути — продолжайте!", icon: "5", kind: "мероприятия", rule_json: { type: "events_attended", gte: 5 }, sort: 6, star: true },
  { key: "eternal_student", title: "Вечный студент", description: "Пройдите 3 программы ДПО со скидкой выпускника.", icon: "Д", kind: "программы ДПО", rule_json: { type: "programs_completed", gte: 3 }, sort: 7 },
  { key: "insider", title: "Свой человек", description: "Посетите 10 мероприятий клуба и станьте его постоянным лицом.", icon: "10", kind: "мероприятия", rule_json: { type: "events_attended", gte: 10 }, sort: 8 },
  { key: "connector", title: "Проводник", description: "Пригласите 3 выпускников вступить в клуб по вашей рекомендации.", icon: "+", kind: "приглашения", rule_json: { type: "referrals_count", gte: 3 }, sort: 9 },
  { key: "legend", title: "Легенда выпуска", description: "Достигните высшего уровня статуса — «Амбассадор».", icon: "★", kind: "уровень статуса", rule_json: { type: "status_level", gte: 4 }, sort: 10 },
];

export interface AchievementProgressItem {
  key: string; title: string; description: string; icon: string; kind: string;
  current: number; target: number; earned: boolean; star: boolean;
}

/** Прогресс по каждому достижению для данной статистики (для «Правил и прогресса»). */
export function achievementProgress(stats: AchievementStats): AchievementProgressItem[] {
  const s = stats as Record<string, number | undefined>;
  return ACHIEVEMENTS.map((a) => {
    const target = a.rule_json.gte;
    const raw = (a.rule_json.type in s ? s[a.rule_json.type] : a.demo) ?? 0;
    return {
      key: a.key, title: a.title, description: a.description, icon: a.icon, kind: a.kind,
      current: Math.min(raw, target), target, earned: raw >= target, star: a.star ?? false,
    };
  });
}

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

export const DECAY_RATE = 0.15; // −15% за месяц неактивности

/** Дельта decay для записи в ledger: отрицательная, округлённая. */
export function decayDelta(points: number): number {
  return -Math.round(Math.max(0, points) * DECAY_RATE) || 0; // || 0 убирает -0
}

export interface AchievementStats {
  programs_completed?: number;
  events_attended?: number;
  mentorship_count?: number;
  referrals_count?: number;
  points?: number;
  verified?: number; // 1 если верифицирован учебным офисом
  status_level?: number; // порядковый номер уровня (1..4)
}

/** Ключи достижений, заслуженных при данной статистике (по rule_json). */
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

/** Сводка уровня по баллам: ключ/название уровня, скидка, прогресс до следующего. */
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
