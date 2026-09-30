import domain from "./domain-data.json" with { type: "json" };

export const LEGAL_INTERESTS: readonly string[] = domain.legal_interests;

export const MAX_INTERESTS = domain.limits.max_interests;

export function sanitizeInterests(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const set = new Set(LEGAL_INTERESTS);
  return [...new Set(input.filter((x): x is string => typeof x === "string" && set.has(x)))].slice(0, MAX_INTERESTS);
}
