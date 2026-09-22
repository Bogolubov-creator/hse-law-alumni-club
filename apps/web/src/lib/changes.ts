import { publicUrl } from "./public-url.js";

export interface LawChange {
  id: string;
  title: string;
  kind: string;
  number: string;
  date: string;
  published: string;
  url: string;
  topic: string;
  effectiveDate: string | null;
}
export interface ChangesSnapshot {
  version: 1;
  mode: "archive";
  periodFrom: string;
  periodTo: string;
  items: LawChange[];
}

const validDate = (value: unknown): value is string => typeof value === "string"
  && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString().slice(0, 10) === value;

/** Публичный архив содержит только реквизиты; черновики и AI-тексты не принимаются. */
export function parseChanges(value: unknown): ChangesSnapshot {
  const data = value as ChangesSnapshot | null;
  if (!data || data.version !== 1 || data.mode !== "archive" || !validDate(data.periodFrom)
    || !validDate(data.periodTo) || data.periodFrom > data.periodTo || !Array.isArray(data.items)
    || data.items.length > 10000) throw new Error("Некорректный архив изменений");
  const ids = new Set<string>();
  const items = data.items.map((item) => {
    if (!item || !/^\d{16}$/.test(item.id) || ids.has(item.id)
      || ![item.title, item.kind, item.number, item.topic].every(v => typeof v === "string" && v.length <= 3000)
      || !item.title.trim() || !validDate(item.date) || !validDate(item.published)
      || item.published < data.periodFrom || item.published > data.periodTo
      || item.effectiveDate !== null
      || item.url !== `https://publication.pravo.gov.ru/document/${item.id}`) {
      throw new Error("Некорректная запись архива");
    }
    ids.add(item.id);
    // Явный список полей не позволяет передать служебные данные в представление.
    return { id: item.id, title: item.title, kind: item.kind, number: item.number,
      topic: item.topic, date: item.date, published: item.published, url: item.url, effectiveDate: null };
  });
  return { version: 1, mode: "archive", periodFrom: data.periodFrom, periodTo: data.periodTo, items };
}

export async function loadChanges(signal?: AbortSignal): Promise<ChangesSnapshot> {
  const response = await fetch(publicUrl("data/changes.json"), { signal });
  if (!response.ok) throw new Error("Не удалось загрузить архив");
  return parseChanges(await response.json());
}

export function selectChanges(items: LawChange[], params: URLSearchParams): LawChange[] {
  const words = (params.get("q") || "").toLocaleLowerCase("ru").replace(/ё/g, "е").trim().split(/\s+/).filter(Boolean);
  const from = params.get("from") || "";
  const to = params.get("to") || "";
  return items.filter(item => {
    const haystack = `${item.title} ${item.number}`.toLocaleLowerCase("ru").replace(/ё/g, "е");
    return words.every(word => haystack.includes(word))
      && (!params.get("kind") || item.kind === params.get("kind"))
      && (!params.get("topic") || item.topic === params.get("topic"))
      && (!validDate(from) || item.published >= from)
      && (!validDate(to) || item.published <= to);
  }).sort((a, b) => (params.get("sort") === "oldest" ? 1 : -1)
    * (a.published.localeCompare(b.published) || a.id.localeCompare(b.id)));
}

export function changeDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}
