/**
 * Логика ответа бота – чистые функции без DOM.
 * Порт js/bot-reply.js из SergeyBuzanov/dpo-pravo-hse.
 */
import { parseQuery, sameStem, search, stem } from "./bot-match.js";
import type {
  BotFaqAnswer,
  BotFaqGap,
  BotProgram,
  BotReply,
  BotReplyData,
  SearchResult,
} from "./types.js";

export function tokenize(text: string): string[] {
  return String(text || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^а-яa-z0-9\s]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !/^\d+$/.test(w))
    .map(stem);
}

function tokenMatchesAny(token: string, qTokens: string[]): boolean {
  return qTokens.some((t) => sameStem(token, t));
}

export function triggerMatches(trigger: string, qTokens: string[]): boolean {
  const tTokens = tokenize(trigger);
  if (!tTokens.length) return false;
  return tTokens.every((t) => tokenMatchesAny(t, qTokens));
}

export function findByTriggers<T extends { triggers: string[] }>(qTokens: string[], list: T[]): T | null {
  for (const item of list) {
    for (const trigger of item.triggers) {
      if (triggerMatches(trigger, qTokens)) return item;
    }
  }
  return null;
}

function parseDurationItem(raw: string): { raw: string; num: string; root: string; days: number } | null {
  const m = /^(\d+(?:,\d+)?)\s+(\S+)/.exec(String(raw || "").trim());
  if (!m) return null;
  const word = m[2]!;
  const root = /^недел/.test(word) ? "недел" : /^месяц/.test(word) ? "месяц" : /^(год|лет)/.test(word) ? "год" : word;
  const scale = root === "недел" ? 7 : root === "месяц" ? 30 : root === "год" ? 365 : 1;
  return { raw: String(raw).trim(), num: m[1]!, root, days: parseFloat(m[1]!.replace(",", ".")) * scale };
}

function durationRange(programs: BotProgram[], type: string): string | null {
  const items = programs
    .filter((p) => p.type === type && p.duration)
    .map((p) => parseDurationItem(p.duration!))
    .filter((x): x is NonNullable<typeof x> => !!x);
  if (!items.length) return null;
  let min = items[0]!;
  let max = items[0]!;
  for (const it of items) {
    if (it.days < min.days) min = it;
    if (it.days > max.days) max = it;
  }
  if (min.raw === max.raw) return min.raw;
  if (min.root === max.root) return `${min.num} – ${max.raw}`;
  return `${min.raw} – ${max.raw}`;
}

export function durationText(programs: BotProgram[]): string {
  const pk = durationRange(programs, "ПК");
  const pp = durationRange(programs, "ПП");
  const lines: string[] = [];
  if (pk) lines.push(`Повышение квалификации: длительность обычно ${pk}.`);
  if (pp) lines.push(`Профессиональная переподготовка: длительность обычно ${pp}.`);
  return lines.join("\n");
}

export function upcoming(programs: BotProgram[], n: number): BotProgram[] {
  return programs
    .slice()
    .sort((a, b) => {
      const aHas = !!(a.startIso || a.start);
      const bHas = !!(b.startIso || b.start);
      if (aHas !== bHas) return aHas ? -1 : 1;
      if (a.startIso && b.startIso) return a.startIso < b.startIso ? -1 : a.startIso > b.startIso ? 1 : 0;
      return 0;
    })
    .slice(0, n);
}

export function priceRange(programs: BotProgram[]): { min: number; max: number } | null {
  const prices = programs.map((p) => p.price).filter((v): v is number => typeof v === "number");
  if (!prices.length) return null;
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

export function formatPrice(n: number): string {
  return `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ₽`;
}

export function sphereList(programs: BotProgram[]): string[] {
  const seen: Record<string, boolean> = {};
  const order: string[] = [];
  for (const p of programs) {
    if (p.sphere && !seen[p.sphere]) {
      seen[p.sphere] = true;
      order.push(p.sphere);
    }
  }
  return order;
}

export function pickBy(programs: BotProgram[], field: keyof BotProgram, value: string): BotProgram[] {
  return programs.filter((p) => p[field] === value);
}

export function introFor(reason: string, count: number): string {
  if (reason === "filter") return "Отобрала по вашим условиям:";
  return count === 1 ? "Нашла одну программу:" : "Вот что нашла:";
}

export function titleHit(qStems: string[], title: string): boolean {
  if (!qStems?.length) return false;
  const titleWords = tokenize(title);
  return qStems.some((s) => titleWords.some((w) => sameStem(s, w)));
}

type Classified = {
  primary?: { intro: string; programs: BotProgram[] };
  forExtra?: BotProgram[];
  weak?: BotProgram[];
};

export function classifySearch(found: SearchResult, qStems: string[]): Classified {
  if (found.reason === "empty" || found.reason === "none") return {};
  if (found.reason === "filter") {
    return { primary: { intro: introFor("filter", found.programs.length), programs: found.programs } };
  }
  const strong = found.programs.filter((p) => titleHit(qStems, p.title));
  if (strong.length) {
    return { primary: { intro: introFor(found.reason, strong.length), programs: strong }, forExtra: strong };
  }
  return { weak: found.programs };
}

function withExtra<T extends BotReply>(base: T, searchResult: Classified): T {
  if (searchResult?.forExtra?.length && (base.kind === "duration" || base.kind === "answer")) {
    return { ...base, extra: searchResult.forExtra.slice(0, 5) };
  }
  return base;
}

export function reply(query: string, data: BotReplyData): BotReply {
  const qTokens = tokenize(query);
  const found = search(query, data.programs);
  const qStems = parseQuery(query).stems;
  const searchResult = classifySearch(found, qStems);

  const durationHit = data.duration?.triggers.some((t) => triggerMatches(t, qTokens));
  if (durationHit) {
    const text = durationText(data.programs);
    if (text) return withExtra({ kind: "duration", text, anchor: data.duration!.anchor }, searchResult);
  }
  const answer = findByTriggers(qTokens, data.answers) as BotFaqAnswer | null;
  if (answer) return withExtra({ kind: "answer", answer }, searchResult);
  const gap = findByTriggers(qTokens, data.gaps) as BotFaqGap | null;
  if (gap) return { kind: "gap", gap };

  if (searchResult.primary) {
    return { kind: "programs", intro: searchResult.primary.intro, programs: searchResult.primary.programs.slice(0, 5) };
  }
  if (searchResult.weak?.length) {
    return { kind: "programs-weak", programs: searchResult.weak.slice(0, 5) };
  }
  return { kind: "none", programs: upcoming(data.programs, 3) };
}

type QueueItem = { onReady: (data: BotReplyData) => void; onFail: () => void };

export function createActionQueue() {
  let pending: QueueItem[] = [];
  let settled: boolean | null = null;
  return {
    isEmpty: () => pending.length === 0,
    status: () => settled,
    run: (onReady: QueueItem["onReady"], onFail: QueueItem["onFail"], data?: BotReplyData) => {
      if (settled === true) {
        onReady(data!);
        return "ran" as const;
      }
      if (settled === false) {
        onFail();
        return "failed" as const;
      }
      pending.push({ onReady, onFail });
      return "queued" as const;
    },
    resolve: (data: BotReplyData) => {
      settled = true;
      const queue = pending;
      pending = [];
      queue.forEach((item) => item.onReady(data));
      return queue.length;
    },
    reject: () => {
      settled = false;
      const queue = pending;
      pending = [];
      queue.forEach((item) => item.onFail());
      return queue.length;
    },
  };
}

const INTENT_TRIGGERS: Record<string, string[]> = {
  priceRange: ["сколько стоит", "цена"],
  upcomingStarts: ["ближайший старт", "когда старт"],
  pickProgram: ["подобрать программу"],
};
const INTENT_ORDER = ["priceRange", "upcomingStarts", "pickProgram"] as const;

export function detectIntent(query: string): (typeof INTENT_ORDER)[number] | null {
  const parsed = parseQuery(query);
  if (parsed.priceMax !== null || parsed.priceMin !== null || parsed.format || parsed.type) return null;
  const qTokens = tokenize(query);
  for (const key of INTENT_ORDER) {
    for (const trigger of INTENT_TRIGGERS[key]!) {
      if (triggerMatches(trigger, qTokens)) return key;
    }
  }
  return null;
}
