import { publicUrl } from "./public-url.js";
import { parseChanges, validDate, type ChangesSnapshot, type LawChange } from "./changes-schema.js";
export { parseChanges, type ChangesSnapshot, type LawChange } from "./changes-schema.js";

export async function loadChanges(signal?: AbortSignal): Promise<ChangesSnapshot> {
  const response = await fetch(publicUrl("data/changes.json"), { signal, cache: "no-cache" });
  if (!response.ok) throw new Error("Не удалось загрузить архив");
  return parseChanges(await response.json());
}

export function selectChanges(items: LawChange[], params: URLSearchParams): LawChange[] {
  const words = (params.get("q") || "").toLocaleLowerCase("ru").replace(/ё/g, "е").trim().split(/\s+/).filter(Boolean);
  const from = params.get("from") || "";
  const to = params.get("to") || "";
  return items.filter(item => {
    const haystack = `${item.title} ${item.number} ${item.blocks.flatMap(b => b.segments.map(s => s.text)).join(" ")}`.toLocaleLowerCase("ru").replace(/ё/g, "е");
    return words.every(word => haystack.includes(word))
      && (!params.get("view") || params.get("view") === "all" || item.entryType === params.get("view"))
      && (!params.get("kind") || item.kind === params.get("kind"))
      && (!params.get("topic") || item.topic === params.get("topic"))
      && (!validDate(from) || item.published >= from)
      && (!validDate(to) || item.published <= to);
  }).sort((a, b) => (params.get("sort") === "oldest" ? 1 : -1)
    * ((a.sourcePublishedAt || a.published).localeCompare(b.sourcePublishedAt || b.published) || a.id.localeCompare(b.id, "en", { numeric: true })));
}

export function changeDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}

export function changeTime(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" }).format(new Date(value)) + " МСК";
}
