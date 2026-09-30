export interface ChangeSegment { text: string; url?: string }
export interface ChangeBlock { heading: boolean; segments: ChangeSegment[] }
export interface LawChange {
  id: string; title: string; kind: string; number: string; date: string; published: string;
  url: string; topic: string; effectiveDate: null; entryType: "act" | "digest";
  summary: string; blocks: ChangeBlock[]; sourcePublishedAt: string | null;
}
export interface ChangesSnapshot {
  version: 2; mode: "archive" | "channel"; periodFrom: string; periodTo: string;
  checkedAt: string | null; lastSuccessAt: string | null; lastPostAt: string | null;
  syncStatus: "archive" | "ok" | "unavailable"; items: LawChange[];
}
export const CHANNEL = "LegisDigest";
export const SOURCE_HOSTS = new Set(["publication.pravo.gov.ru", "pravo.gov.ru", "rg.ru", "www.rg.ru", "pnp.ru", "www.pnp.ru", "consultant.ru", "www.consultant.ru", "sozd.duma.gov.ru", "duma.gov.ru", "government.ru", "kremlin.ru", "cbr.ru", "www.cbr.ru"]);
export function safeSourceUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 3000) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || !SOURCE_HOSTS.has(url.hostname)) return null;
    return url.href;
  } catch { return null; }
}
export const validDate = (value: unknown): value is string => typeof value === "string"
  && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString().slice(0, 10) === value;
export const validInstant = (value: unknown): value is string => typeof value === "string"
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  && validDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
const record = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("Некорректный объект материалов");
  return v as Record<string, unknown>;
};
function string(v: unknown, max = 3000): string {
  if (typeof v !== "string" || v.length > max) throw new Error("Некорректный текст материалов");
  return v;
}
/** Общая проверка сборщика и браузера; только публичные поля. */
export function parseChanges(value: unknown): ChangesSnapshot {
  const data = record(value);
  if ((data.version !== 1 && data.version !== 2) || !["archive", "channel"].includes(String(data.mode))
    || !validDate(data.periodFrom) || !validDate(data.periodTo) || data.periodFrom > data.periodTo
    || !Array.isArray(data.items) || data.items.length > 10000) throw new Error("Некорректный архив изменений");
  const ids = new Set<string>();
  const items: LawChange[] = data.items.map(value => {
    const item = record(value);
    const entryType = data.version === 1 ? "act" : item.entryType;
    const id = string(item.id, 40);
    if (ids.has(id) || !validDate(item.date) || !validDate(item.published)
      || item.published < String(data.periodFrom) || item.published > String(data.periodTo)
      || item.effectiveDate !== null) throw new Error("Некорректные реквизиты записи");
    ids.add(id);
    if (entryType === "act") {
      if (!/^\d{16}$/.test(id) || item.url !== `https://publication.pravo.gov.ru/document/${id}`) throw new Error("Некорректная ссылка акта");
    } else if (entryType === "digest") {
      if (!/^tg-[1-9]\d{0,11}$/.test(id) || item.url !== `https://t.me/${CHANNEL}/${id.slice(3)}`
        || !validInstant(item.sourcePublishedAt) || item.published !== item.sourcePublishedAt.slice(0, 10)) throw new Error("Некорректная ссылка или дата сообщения");
    } else throw new Error("Неизвестный тип записи");
    const blocks: ChangeBlock[] = [];
    if (entryType === "digest") {
      if (!Array.isArray(item.blocks) || !item.blocks.length || item.blocks.length > 120) throw new Error("Нет текста сообщения");
      for (const raw of item.blocks) {
        const block = record(raw);
        if (typeof block.heading !== "boolean" || !Array.isArray(block.segments) || !block.segments.length || block.segments.length > 100) throw new Error("Некорректный абзац");
        const segments = block.segments.map(value => {
          const segment = record(value); const text = string(segment.text, 10000);
          if (segment.url !== undefined && !safeSourceUrl(segment.url)) throw new Error("Недопустимая ссылка в сообщении");
          return segment.url === undefined ? { text } : { text, url: safeSourceUrl(segment.url)! };
        });
        blocks.push({ heading: block.heading, segments });
      }
      if (blocks.flatMap(b => b.segments).reduce((sum, s) => sum + s.text.length, 0) > 20000) throw new Error("Слишком длинное сообщение");
    }
    const title = string(item.title); if (!title.trim()) throw new Error("Нет названия материала");
    return { id, title, kind: string(item.kind), number: string(item.number), date: item.date,
      published: item.published, topic: string(item.topic), url: string(item.url), effectiveDate: null,
      entryType, summary: entryType === "digest" ? string(item.summary, 1000) : "", blocks,
      sourcePublishedAt: entryType === "digest" ? String(item.sourcePublishedAt) : null };
  });
  const checkedAt = data.version === 1 ? null : data.checkedAt;
  const lastSuccessAt = data.version === 1 ? null : data.lastSuccessAt;
  const lastPostAt = data.version === 1 ? null : data.lastPostAt;
  const syncStatus = data.version === 1 ? "archive" : data.syncStatus;
  if (![checkedAt, lastSuccessAt, lastPostAt].every(v => v === null || validInstant(v))
    || !["archive", "ok", "unavailable"].includes(String(syncStatus))
    || (syncStatus === "ok" && (!lastSuccessAt || !checkedAt || !lastPostAt))
    || (lastSuccessAt && checkedAt && Date.parse(String(lastSuccessAt)) > Date.parse(String(checkedAt)))) throw new Error("Некорректный статус обновления");
  return { version: 2, mode: data.mode as ChangesSnapshot["mode"], periodFrom: data.periodFrom, periodTo: data.periodTo,
    checkedAt: checkedAt as string | null, lastSuccessAt: lastSuccessAt as string | null, lastPostAt: lastPostAt as string | null,
    syncStatus: syncStatus as ChangesSnapshot["syncStatus"], items };
}
