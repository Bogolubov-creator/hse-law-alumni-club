// Каталог ДПО факультета права НИУ ВШЭ (orgUnit=22753).
// Источники (как на материнском сайте и лендинге itspecR/dpo-pravo-hse):
//   • актуальный набор – https://www.hse.ru/edu/dpo/?orgUnit=22753
//   • весь каталог     – https://www.hse.ru/edu/dpo/?onlyActual=0&orgUnit=22753
// Данные в HTML: window.__INITIAL_STATE__ (пагинация pageSize≈20).
// HTML-карточки dpob-card оставлены как запасной парсер/фикстуры.

export const HSE_DPO_ORG_UNIT = "22753";
export const HSE_DPO_ACTUAL_URL = `https://www.hse.ru/edu/dpo/?orgUnit=${HSE_DPO_ORG_UNIT}`;
export const HSE_DPO_ALL_URL = `https://www.hse.ru/edu/dpo/?onlyActual=0&orgUnit=${HSE_DPO_ORG_UNIT}`;

export interface HseDpoCard {
  hseId: string; // числовой id программы на hse.ru
  url: string; // страница программы
  title: string;
  category: string; // «Право» и т. п.
  type: "ПК" | "ПП"; // повышение квалификации / профпереподготовка
  formatRaw: string; // как на сайте
  format: "online" | "offline" | "blended";
  start: string | null; // человекочитаемо: «6 июля 2026»
  duration: string | null; // «2 недели», «1,5 месяца» …
  priceKop: number; // копейки; 0 – цена не указана
}

export interface HseInitialStatePage {
  items: unknown[];
  total: number;
  pageSize: number;
}

const MONTHS_RU_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const MAX_PAGES = 20;

/** «06.07.2026» → «6 июля 2026». Невалидная дата – как есть. */
export function humanizeDate(ddmmyyyy: string): string {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(ddmmyyyy.trim());
  if (!m) return ddmmyyyy.trim();
  const month = MONTHS_RU_GEN[Number(m[2]) - 1];
  return month ? `${Number(m[1])} ${month} ${m[3]}` : ddmmyyyy.trim();
}

/** «Онлайн синхронный» / «Очный» / «Смешанный» / «Гибридный …» → канонический формат. */
export function mapHseFormat(raw: string): "online" | "offline" | "blended" {
  const s = raw.toLowerCase();
  if (s.startsWith("онлайн")) return "online";
  if (s.startsWith("очн")) return "offline";
  return "blended"; // смешанный, гибридный
}

/** «22 000 ₽» → 2200000 коп. Нечисловое – null. */
export function parseHsePrice(raw: string): number | null {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  return Number(digits) * 100;
}

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

/**
 * hse.ru вшивает каталог как JS-литерал (не JSON):
 *   window.__INITIAL_STATE__ = { items: [...], new Date(169…), __proto__: null … }
 * Приводим к JSON без eval – порт логики itspecR/dpo-pravo-hse/lib/hse-catalog.js.
 */
function quoteKeysOutsideStrings(src: string): string {
  const parts: string[] = [];
  let inString = false;
  let escaped = false;

  const trimTrailingComma = (): boolean => {
    let k = parts.length - 1;
    while (k >= 0 && parts[k]!.length === 1 && /\s/.test(parts[k]!)) k--;
    if (k >= 0 && parts[k] === ",") {
      parts.length = k;
      return true;
    }
    return false;
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (inString) {
      parts.push(ch);
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      parts.push(ch);
      continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_$]/.test(src[j]!)) j++;
      const word = src.slice(i, j);

      if (word === "new") {
        const dateMatch = /^\s*Date\s*\(\s*(\d+)\s*\)/.exec(src.slice(j));
        if (dateMatch) {
          parts.push(dateMatch[1]!);
          i = j + dateMatch[0].length - 1;
          continue;
        }
      }

      if (word === "__proto__") {
        const protoMatch = /^\s*:\s*null\b/.exec(src.slice(j));
        if (protoMatch) {
          let end = j + protoMatch[0].length;
          if (!trimTrailingComma()) {
            const afterComma = /^\s*,/.exec(src.slice(end));
            if (afterComma) end += afterComma[0].length;
          }
          i = end - 1;
          continue;
        }
      }

      let k = j;
      while (k < src.length && /\s/.test(src[k]!)) k++;
      if (src[k] === ":") {
        parts.push(`"${word}"`);
        i = j - 1;
        continue;
      }
      parts.push(word);
      i = j - 1;
      continue;
    }
    parts.push(ch);
  }
  return parts.join("");
}

/** Разбор window.__INITIAL_STATE__ из HTML листинга. */
export function parseHseInitialState(html: string): HseInitialStatePage {
  const m = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});\s*window\.__URQL_DATA__/);
  if (!m?.[1]) throw new Error("window.__INITIAL_STATE__ не найден – разметка hse.ru изменилась");
  const state = JSON.parse(quoteKeysOutsideStrings(m[1])) as {
    items?: unknown[];
    total?: number;
    pageSize?: number;
  };
  const items = Array.isArray(state.items) ? state.items : [];
  return {
    items,
    total: Number(state.total) || items.length,
    pageSize: Number(state.pageSize) || items.length || 20,
  };
}

function safeHseUrl(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  // Только https://*.hse.ru – без DOM URL (shared без lib DOM).
  if (!/^https:\/\/(?:[a-z0-9-]+\.)*hse\.ru(?:[/?#]|$)/i.test(s)) return null;
  return s;
}

function labelOf(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object" && value !== null) {
    const o = value as { shortTitle?: unknown; title?: unknown };
    return String(o.shortTitle || o.title || "").trim();
  }
  return "";
}

function humanizeStartMs(ms: number, withoutDay?: boolean): string | null {
  if (!Number.isFinite(ms)) return null;
  const opts: Intl.DateTimeFormatOptions = withoutDay
    ? { timeZone: "Europe/Moscow", month: "long", year: "numeric" }
    : { timeZone: "Europe/Moscow", day: "numeric", month: "long", year: "numeric" };
  return new Intl.DateTimeFormat("ru-RU", opts).format(new Date(ms));
}

/** Элемент __INITIAL_STATE__.items → карточка синка. Без названия/id – null. */
export function mapHseStateItem(raw: unknown): HseDpoCard | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const hseId = String(item.id ?? "").trim();
  if (!/^\d+$/.test(hseId)) return null;
  const title = String(item.title ?? "").trim();
  if (!title) return null;
  const url = safeHseUrl(item.url) || `https://www.hse.ru/edu/dpo/${hseId}`;
  const typeRaw = labelOf(item.type);
  const type: "ПК" | "ПП" = /пп/i.test(typeRaw) ? "ПП" : "ПК";
  const formatRaw = labelOf(item.studyFormat);
  const priceRub = item.discountPrice ?? item.educationPricing;
  const priceKop =
    typeof priceRub === "number" && Number.isFinite(priceRub) && priceRub >= 0
      ? Math.round(priceRub) * 100
      : 0;
  const startMs = typeof item.startDate === "number" ? item.startDate : Number(item.startDate);
  const start = Number.isFinite(startMs)
    ? humanizeStartMs(startMs, Boolean(item.isStartDateWithoutDay))
    : null;
  const duration = String(item.hours || item.duration || "").trim() || null;
  const category =
    labelOf(item.sphere) ||
    labelOf((item as { orgUnit?: unknown }).orgUnit) ||
    "Право";

  return {
    hseId,
    url,
    title,
    category,
    type,
    formatRaw,
    format: mapHseFormat(formatRaw || "Онлайн"),
    start,
    duration,
    priceKop,
  };
}

/** URL страницы листинга с page=N (1 – без параметра). */
export function hseDpoPageUrl(baseUrl: string, page: number): string {
  let url = baseUrl.replace(/([?&])page=\d+/g, "$1").replace(/[?&]$/, "");
  if (!/[?&]orgUnit=/.test(url)) {
    url += `${url.includes("?") ? "&" : "?"}orgUnit=${HSE_DPO_ORG_UNIT}`;
  }
  if (page > 1) url += `${url.includes("?") ? "&" : "?"}page=${page}`;
  return url;
}

/**
 * Собирает все страницы листинга из HTML-ответов.
 * `fetchPage(url)` должен вернуть HTML; пагинация – по total/pageSize.
 */
export async function collectHseDpoCards(
  baseUrl: string,
  fetchPage: (url: string) => Promise<string>,
): Promise<HseDpoCard[]> {
  const firstHtml = await fetchPage(hseDpoPageUrl(baseUrl, 1));
  const first = parseHseInitialState(firstHtml);
  const byId = new Map<string, HseDpoCard>();
  for (const raw of first.items) {
    const card = mapHseStateItem(raw);
    if (card) byId.set(card.hseId, card);
  }

  const total = first.total || byId.size;
  const pageSize = first.pageSize || byId.size || 20;
  const totalPages = Math.min(MAX_PAGES, Math.max(1, Math.ceil(total / pageSize)));

  for (let page = 2; page <= totalPages; page++) {
    const html = await fetchPage(hseDpoPageUrl(baseUrl, page));
    const state = parseHseInitialState(html);
    for (const raw of state.items) {
      const card = mapHseStateItem(raw);
      if (card) byId.set(card.hseId, card);
    }
  }

  return [...byId.values()];
}

/**
 * Разбор HTML листинга в карточки (dpob-card). Запасной путь / фикстуры тестов.
 * Карточки без названия или цены пропускаются.
 */
export function parseHseDpoCards(html: string): HseDpoCard[] {
  // Карточка тянется от заголовка до следующего заголовка (или конца списка).
  const chunks = html.split(/(?=<div class="dpob-card dpob-cards__item")/).slice(1);
  const out: HseDpoCard[] = [];
  for (const c of chunks) {
    const link = /href="(https:\/\/www\.hse\.ru\/edu\/dpo\/(\d+))"[^>]*class="dpob-card__title-inner"[^>]*>([\s\S]*?)<\/a>/.exec(c)
      ?? /href="(https:\/\/www\.hse\.ru\/edu\/dpo\/(\d+))"[^>]*title="([^"]+)"/.exec(c);
    if (!link) continue;
    const title = decode(link[3]!.replace(/<[^>]+>/g, ""));
    const priceRaw = /dpob-card__price">\s*<div>([^<]+)<\/div>/.exec(c)?.[1] ?? "";
    const priceKop = parseHsePrice(priceRaw);
    if (!title || priceKop === null) continue;

    const stat = (t: string) => new RegExp(`title="${t}"[^>]*>([^<]+)<`).exec(c)?.[1]?.trim() ?? null;
    const formatRaw = stat("Формат обучения") ?? "";
    const startRaw = stat("Дата начала");
    const type = /dpob-card__type-text">\s*<span>\s*ПП/.test(c) ? "ПП" as const : "ПК" as const;

    out.push({
      hseId: link[2]!,
      url: link[1]!,
      title,
      category: decode(/dpob-card__category">([^<]*)</.exec(c)?.[1] ?? ""),
      type,
      formatRaw,
      format: mapHseFormat(formatRaw),
      start: startRaw ? humanizeDate(startRaw) : null,
      duration: stat("Продолжительность"),
      priceKop,
    });
  }
  return out;
}
