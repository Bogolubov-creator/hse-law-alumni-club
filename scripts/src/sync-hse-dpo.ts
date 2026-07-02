/**
 * Живая синхронизация каталога ДПО с сайтом ВШЭ (факультет права, orgUnit 22753).
 * Standalone-запуск с хоста; та же логика работает внутри apps/api:
 * ночной cron (05:00) + кнопка «⟳ Обновить с hse.ru» в админке (POST /admin/dpo-sync).
 *
 * Правила:
 *  • карточка есть на hse.ru → upsert (по source_url/hseId, затем по названию);
 *    обновляются цена/формат/старт/длительность/документ; описание/модули/
 *    направление (ручная работа) не затираются;
 *  • управляемая синком программа пропала с сайта → archived;
 *  • ручные программы (без source_url) не трогаются;
 *  • < 3 карточек в парсе → отмена (защита от смены вёрстки hse.ru).
 *
 * Запуск: DIRECTUS_URL=http://localhost:8055 pnpm --filter @club/scripts exec tsx src/sync-hse-dpo.ts
 */
import { createDirectus, rest, staticToken, readItems, createItem, updateItem } from "@directus/sdk";
import { parseHseDpoCards, slugifyRu, normalizeTitle } from "@club/shared";

const URL = process.env.DIRECTUS_URL!;
const TOKEN = process.env.DIRECTUS_SERVICE_TOKEN!;
if (!URL || !TOKEN) throw new Error("DIRECTUS_URL / DIRECTUS_SERVICE_TOKEN required");

const SOURCE_URL = process.env.HSE_DPO_URL || "https://www.hse.ru/edu/dpo/?orgUnit=22753";
const NONACTUAL_URL = process.env.HSE_DPO_NONACTUAL_URL || SOURCE_URL + (SOURCE_URL.includes("?") ? "&" : "?") + "onlyNonactual=1";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const DOC_BY_TYPE = {
  "ПК": "Удостоверение о повышении квалификации НИУ ВШЭ",
  "ПП": "Диплом о профессиональной переподготовке НИУ ВШЭ",
} as const;

const client = createDirectus(URL).with(staticToken(TOKEN)).with(rest());

async function fetchList(url: string) {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" } });
  if (!res.ok) throw new Error(`hse.ru: HTTP ${res.status} (${url})`);
  return parseHseDpoCards(await res.text());
}
const actual = await fetchList(SOURCE_URL);
if (actual.length < 3) throw new Error(`Подозрительно мало карточек (${actual.length}) — синк отменён.`);
const nonactualList = await fetchList(NONACTUAL_URL).catch((e) => { console.error("неактуальный список недоступен:", e.message); return []; });
const seenIds = new Set(actual.map((c) => c.hseId));
const cards = [
  ...actual.map((c) => ({ ...c, enrollment: "actual" as const })),
  ...nonactualList.filter((c) => !seenIds.has(c.hseId)).map((c) => ({ ...c, enrollment: "nonactual" as const })),
];
console.log(`hse.ru: актуальных ${actual.length}, закрытых ${cards.length - actual.length}`);

const existing = (await client.request((readItems as any)("programs", {
  limit: -1, fields: ["id", "slug", "title", "status", "source_url"],
}))) as { id: string; slug: string; title: string; status: string; source_url: string | null }[];

const byHseId = new Map<string, (typeof existing)[number]>();
for (const r of existing) {
  const m = r.source_url && /\/dpo\/(\d+)/.exec(r.source_url);
  if (m) byHseId.set(m[1]!, r);
}
const byTitle = new Map(existing.map((r) => [normalizeTitle(r.title), r]));
const slugs = new Set(existing.map((r) => r.slug));

let created = 0, updated = 0, archived = 0;
const matched = new Set<string>();

for (const c of cards) {
  const match = byHseId.get(c.hseId) ?? byTitle.get(normalizeTitle(c.title));
  if (match) {
    matched.add(match.id);
    const patch: Record<string, unknown> = {
      price: c.priceKop, format: c.format, dates: c.start ? { start: c.start } : null,
      document: DOC_BY_TYPE[c.type], source_url: c.url, enrollment: c.enrollment, status: "published",
    };
    if (c.duration) patch.duration = c.duration;
    await client.request((updateItem as any)("programs", match.id, patch));
    updated++;
  } else {
    let slug = slugifyRu(c.title.split(" / ")[0]!);
    while (slugs.has(slug)) slug = `${slug}-${c.hseId.slice(-4)}`;
    slugs.add(slug);
    await client.request((createItem as any)("programs", {
      slug, title: c.title.split(" / ")[0]!.trim(), direction: c.category || "Право",
      format: c.format, duration: c.duration ?? "уточняется", price: c.priceKop,
      dates: c.start ? { start: c.start } : null, document: DOC_BY_TYPE[c.type],
      source_url: c.url, enrollment: c.enrollment, description: null, status: "published",
    }));
    created++;
  }
}

for (const r of existing) {
  if (r.source_url && !matched.has(r.id) && r.status !== "archived") {
    await client.request((updateItem as any)("programs", r.id, { status: "archived" }));
    archived++;
  }
}

console.log(`Синхронизация ДПО: +${created} создано, ${updated} обновлено, ${archived} в архив. На сайте: ${cards.length}.`);
process.exit(0);
