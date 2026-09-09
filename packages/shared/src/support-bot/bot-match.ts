/**
 * Подбор программ для бота поддержки.
 * Порт js/bot-match.js из SergeyBuzanov/dpo-pravo-hse (без IIFE, ESM).
 */
import type { BotProgram, ParsedQuery, SearchResult } from "./types.js";

const ENDINGS = [
  "ниями", "ениям", "ования", "ование", "ением", "ения", "ение",
  "ями", "ами", "ого", "ому", "ыми", "ими", "ей", "ов", "ев",
  "ый", "ий", "ая", "яя", "ое", "ее", "ые", "ие", "ых", "их",
  "ой", "ом", "ам", "ах", "ям", "ях", "ы", "и", "а", "я", "о", "е", "у", "ю", "ь",
];

const MIN_STEM = 4;

export function normalize(word: string): string {
  return String(word || "").toLowerCase().replace(/ё/g, "е");
}

export function stem(word: string): string {
  const w = normalize(word);
  for (const end of ENDINGS) {
    if (w.length - end.length >= MIN_STEM && w.slice(-end.length) === end) {
      return w.slice(0, w.length - end.length);
    }
  }
  return w;
}

export function sameStem(a: string, b: string): boolean {
  if (a === b) return true;
  const shorter = a.length < b.length ? a : b;
  if (shorter.length < MIN_STEM) return false;
  if (Math.abs(a.length - b.length) < 2) return false;
  return a.indexOf(b) === 0 || b.indexOf(a) === 0;
}

const FORMATS: [RegExp, string][] = [
  [/онлайн|дистанц|удал/, "online"],
  [/очн|офлайн|аудитор/, "offline"],
  [/смешан/, "mixed"],
  [/гибрид/, "hybrid"],
];

const STOP_WORDS = [
  "программа", "курс", "обучение", "формат", "подобрать",
  "какой", "нужен", "документ", "старт", "стоит", "цена",
];
const STOP_STEMS = STOP_WORDS.map(stem);

function consumeWord(str: string, index: number, len: number): string {
  let start = index;
  let end = index + len;
  while (start > 0 && /[а-яa-z0-9]/i.test(str[start - 1]!)) start--;
  while (end < str.length && /[а-яa-z0-9]/i.test(str[end]!)) end++;
  return `${str.slice(0, start)} ${str.slice(end)}`;
}

const DURATION_TAIL_RE = /^\s*(месяц|недел|год|лет(?=$|[^а-яё])|час|дн)/;

export function parseQuery(query: string): ParsedQuery {
  const text = normalize(query);
  const out: ParsedQuery = { stems: [], priceMax: null, priceMin: null, format: null, type: null };
  if (!text.trim()) return out;

  let remaining = text;

  const price = remaining.match(/(?<![а-яa-z])(до|дешевле|не дороже|не больше|за|от|дороже)\s+(\d[\d\s]*)\s*(тыс\w*|руб\w*|₽)?/);
  if (price && price.index !== undefined) {
    let value = parseInt(price[2]!.replace(/\s/g, ""), 10);
    const hasMoneyUnit = !!price[3];
    const tail = remaining.slice(price.index + price[0].length, price.index + price[0].length + 12);
    const isDuration = DURATION_TAIL_RE.test(tail);
    const tooSmall = !hasMoneyUnit && value < 1000;
    if (!isDuration && !tooSmall) {
      if (hasMoneyUnit && /тыс/.test(price[3]!)) value *= 1000;
      if (/^не\s/.test(price[1]!)) out.priceMax = value;
      else if (/от|дороже/.test(price[1]!)) out.priceMin = value;
      else out.priceMax = value;
      const matchedLen = price[0].replace(/\s+$/, "").length;
      remaining = consumeWord(remaining, price.index, matchedLen);
    }
  }

  for (const [re, code] of FORMATS) {
    const fm = remaining.match(re);
    if (fm && fm.index !== undefined) {
      out.format = code;
      remaining = consumeWord(remaining, fm.index, fm[0].length);
      break;
    }
  }

  if (/переподготовк|новая профессия/.test(remaining)) {
    const pp = remaining.match(/переподготовк[а-яa-z]*|новая профессия/);
    if (pp && pp.index !== undefined) {
      out.type = "ПП";
      remaining = consumeWord(remaining, pp.index, pp[0].length);
    }
  } else if (/повышение квалификац/.test(remaining)) {
    const pk = remaining.match(/повышение квалификац[а-яa-z]*/);
    if (pk && pk.index !== undefined) {
      out.type = "ПК";
      remaining = consumeWord(remaining, pk.index, pk[0].length);
    }
  } else {
    const abbr = remaining.match(/(^|[^а-яa-z0-9])(пп|пк)(?=$|[^а-яa-z0-9])/);
    if (abbr && abbr.index !== undefined) {
      out.type = abbr[2] === "пп" ? "ПП" : "ПК";
      remaining = consumeWord(remaining, abbr.index + abbr[1]!.length, abbr[2]!.length);
    }
  }

  out.stems = remaining
    .replace(/[^а-яa-z0-9\s]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !/^\d+$/.test(w))
    .map(stem)
    .filter((s) => !STOP_STEMS.some((stopStem) => sameStem(s, stopStem)));

  return out;
}

function hits(stems: string[], text: string): number {
  const words = normalize(text).replace(/[^а-яa-z0-9\s]/gi, " ").split(/\s+/).map(stem);
  let n = 0;
  for (const s of stems) {
    if (words.some((w) => sameStem(s, w))) n++;
  }
  return n;
}

function byStart(a: BotProgram, b: BotProgram): number {
  const aHas = !!(a.startIso || a.start);
  const bHas = !!(b.startIso || b.start);
  if (aHas !== bHas) return aHas ? -1 : 1;
  if (a.startIso && b.startIso) {
    if (a.startIso < b.startIso) return -1;
    if (a.startIso > b.startIso) return 1;
  }
  return 0;
}

export function search(query: string, programs: BotProgram[]): SearchResult {
  const list = Array.isArray(programs) ? programs.slice() : [];
  const q = parseQuery(query);
  if (!q.stems.length && q.priceMax === null && q.priceMin === null && !q.format && !q.type) {
    return { reason: "empty", programs: [] };
  }

  const filtered = list.filter((p) => {
    if (q.format && p.format !== q.format) return false;
    if (q.type && p.type !== q.type) return false;
    if (q.priceMax !== null && !(typeof p.price === "number" && p.price <= q.priceMax)) return false;
    if (q.priceMin !== null && !(typeof p.price === "number" && p.price >= q.priceMin)) return false;
    return true;
  });

  const scored = filtered
    .map((p) => {
      const inTitle = hits(q.stems, p.title);
      const inWords = hits(q.stems, (p.keywords || []).join(" "));
      const inSphere = hits(q.stems, p.sphere || "");
      return { p, score: inTitle * 3 + inWords * 2 + inSphere, inTitle };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => {
      const aTier = a.inTitle > 0 ? 1 : 0;
      const bTier = b.inTitle > 0 ? 1 : 0;
      if (aTier !== bTier) return bTier - aTier;
      return b.score - a.score;
    });

  if (scored.length) {
    return {
      reason: scored[0]!.inTitle > 0 ? "title" : "keywords",
      programs: scored.map((row) => row.p),
    };
  }

  const hasRestriction = !!q.format || !!q.type || q.priceMax !== null || q.priceMin !== null;
  if (hasRestriction && filtered.length) {
    return { reason: "filter", programs: filtered };
  }
  return { reason: "none", programs: list.slice().sort(byStart).slice(0, 3) };
}
