// Парсер листинга ДПО hse.ru (карточки dpob-card) — чистая функция, тестируется на фикстуре.
// Источник: https://www.hse.ru/edu/dpo/?orgUnit=22753 (факультет права).

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
  priceKop: number; // копейки
}

const MONTHS_RU_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

/** «06.07.2026» → «6 июля 2026». Невалидная дата — как есть. */
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

/** «22 000 ₽» → 2200000 коп. Нечисловое — null. */
export function parseHsePrice(raw: string): number | null {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  return Number(digits) * 100;
}

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

/**
 * Разбор HTML листинга в карточки. Устойчив к пустым полям; карточки без
 * названия или цены пропускаются. Порядок полей внутри карточки не важен.
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
