// Справочник интересов в юриспруденции — выбирается выпускником в профиле
// (и при будущей самостоятельной регистрации). Единый источник для web/api.

export const LEGAL_INTERESTS: readonly string[] = [
  "Корпоративное право",
  "M&A и сделки",
  "Гражданское право",
  "Публичное право",
  "Налоговое право",
  "Банкротство",
  "Разрешение споров",
  "Арбитраж и медиация",
  "Цифровое право и IT",
  "Интеллектуальная собственность",
  "Комплаенс и антикоррупция",
  "Международное право",
  "Уголовное право",
  "Трудовое право",
  "GR и публичная политика",
  "LegalTech",
] as const;

export const MAX_INTERESTS = 8; // разумный предел выбора

/** Отфильтровать произвольный ввод до валидных интересов из справочника. */
export function sanitizeInterests(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const set = new Set(LEGAL_INTERESTS);
  return [...new Set(input.filter((x): x is string => typeof x === "string" && set.has(x)))].slice(0, MAX_INTERESTS);
}
