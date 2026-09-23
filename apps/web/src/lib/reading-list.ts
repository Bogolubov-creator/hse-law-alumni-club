import { useSyncExternalStore } from "react";

export type ReadingKind = "change" | "program" | "podcast" | "event";
export type ReadingItem = { kind: ReadingKind; id: string; title: string; path: string; at: number };
export const READING_LABELS: Record<ReadingKind, string> = { change: "Право", program: "ДПО", podcast: "Подкасты", event: "События" };
const PREFIX: Record<ReadingKind, string> = { change: "/changes/", program: "/dpo/", podcast: "/podcasts/", event: "/events/" };
const KEY = "club-reading-v1";
const EVENT = "club:reading-changed";
export type ReadingData = { saved: ReadingItem[]; recent: ReadingItem[]; read: string[] };
const empty = (): ReadingData => ({ saved: [], recent: [], read: [] });
export function validItem(value: unknown): value is ReadingItem {
  if (!value || typeof value !== "object") return false;
  const i = value as ReadingItem;
  return Object.hasOwn(PREFIX, i.kind) && typeof i.id === "string" && /^[\w-]{1,200}$/.test(i.id)
    && typeof i.title === "string" && i.title.trim().length > 0 && i.title.length <= 1000
    && i.path === PREFIX[i.kind] + i.id && Number.isFinite(i.at) && i.at > 0;
}
export function parseReading(raw: string | null): ReadingData {
  if (!raw) return empty();
  const data = JSON.parse(raw);
  if (!data || !Array.isArray(data.saved) || !Array.isArray(data.recent) || !Array.isArray(data.read)) throw new Error("invalid_reading_data");
  const clean = (items: unknown[], limit: number) => [...new Map(items.filter(validItem).map(i => [i.path, i])).values()].slice(0, limit);
  return { saved: clean(data.saved, 200), recent: clean(data.recent, 12), read: data.read.filter((v: unknown) => typeof v === "string" && /^\/changes\/[\w-]{1,200}$/.test(v)).slice(0, 500) };
}
function snapshot() { try { return localStorage.getItem(KEY) || ""; } catch { return "!unavailable"; } }
function subscribe(callback: () => void) {
  const storage = (event: StorageEvent) => { if (event.key === KEY || event.key === null) callback(); };
  window.addEventListener(EVENT, callback); window.addEventListener("storage", storage);
  return () => { window.removeEventListener(EVENT, callback); window.removeEventListener("storage", storage); };
}
export function useReading() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => "");
  try { return { ...parseReading(raw), unavailable: false }; } catch { return { ...empty(), unavailable: true }; }
}
export function updateReading(change: (data: ReadingData) => ReadingData): boolean {
  try { const data = change(parseReading(localStorage.getItem(KEY))); localStorage.setItem(KEY, JSON.stringify(data)); window.dispatchEvent(new Event(EVENT)); return true; }
  catch { return false; }
}
export function toggleSaved(item: ReadingItem): boolean {
  if (!validItem(item)) return false;
  return updateReading(data => {
    const exists = data.saved.some(i => i.path === item.path);
    if (!exists && data.saved.length >= 200) throw new Error("saved_limit");
    return { ...data, saved: exists ? data.saved.filter(i => i.path !== item.path) : [item, ...data.saved] };
  });
}
export function rememberReading(item: ReadingItem): boolean {
  if (!validItem(item)) return false;
  return updateReading(data => ({ ...data, recent: [item, ...data.recent.filter(i => i.path !== item.path)].slice(0, 12) }));
}
