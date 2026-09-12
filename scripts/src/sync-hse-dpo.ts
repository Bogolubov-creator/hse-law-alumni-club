/**
 * CLI-синхронизация каталога ДПО с hse.ru (факультет права).
 * Предпочтительно – кнопка в админке / cron в apps/api (та же логика в hse-sync.ts).
 *
 * Маршруты:
 *   • актуальный – …/edu/dpo/?orgUnit=22753
 *   • весь каталог – …/edu/dpo/?onlyActual=0&orgUnit=22753
 *
 * Запуск: DIRECTUS_URL=… DIRECTUS_SERVICE_TOKEN=… pnpm --filter @club/scripts exec tsx src/sync-hse-dpo.ts
 */
import { createDirectus, rest, staticToken, readItems, createItem, updateItem } from "@directus/sdk";
import {
  collectHseDpoCards,
  HSE_DPO_ACTUAL_URL,
  HSE_DPO_ALL_URL,
  slugifyRu,
  normalizeTitle,
  type HseDpoCard,
} from "@club/shared";

const URL = process.env.DIRECTUS_URL!;
const TOKEN = process.env.DIRECTUS_SERVICE_TOKEN!;
if (!URL || !TOKEN) throw new Error("DIRECTUS_URL / DIRECTUS_SERVICE_TOKEN required");

const ACTUAL_URL = process.env.HSE_DPO_URL || HSE_DPO_ACTUAL_URL;
const ALL_URL = process.env.HSE_DPO_ALL_URL || HSE_DPO_ALL_URL;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const DOC_BY_TYPE = {
  "ПК": "Удостоверение о повышении квалификации НИУ ВШЭ",
  "ПП": "Диплом о профессиональной переподготовке НИУ ВШЭ",
} as const;

const client = createDirectus(URL).with(staticToken(TOKEN)).with(rest());

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" } });
  if (!res.ok) throw new Error(`hse.ru: HTTP ${res.status} (${url})`);
  return res.text();
}

type Tagged = HseDpoCard & { enrollment: "actual" | "nonactual" };

const actual = await collectHseDpoCards(ACTUAL_URL, fetchPage);
if (actual.length < 3) throw new Error(`Подозрительно мало актуальных карточек (${actual.length}) – синк отменён.`);
const all = await collectHseDpoCards(ALL_URL, fetchPage);
if (all.length < actual.length) {
  throw new Error(`Полный каталог (${all.length}) меньше актуального (${actual.length}) – синк отменён.`);
}

const actualIds = new Set(actual.map((c) => c.hseId));
const byId = new Map<string, Tagged>();
for (const c of all) {
  byId.set(c.hseId, { ...c, enrollment: actualIds.has(c.hseId) ? "actual" : "nonactual" });
}
for (const c of actual) {
  if (!byId.has(c.hseId)) byId.set(c.hseId, { ...c, enrollment: "actual" });
}
const cards = [...byId.values()];
console.log(`hse.ru: актуальных ${actual.length}, всего ${all.length}, к синку ${cards.length}`);

const existing = (await client.request(readItems("programs" as never, {
  limit: -1, fields: ["id", "slug", "title", "status", "source_url", "duration", "price", "hse_id"],
} as never))) as {
  id: string; slug: string; title: string; status: string;
  source_url: string | null; duration: string | null; price: number; hse_id?: string | null;
}[];

const byHseId = new Map<string, (typeof existing)[number]>();
for (const r of existing) {
  if (r.hse_id && /^\d+$/.test(r.hse_id)) byHseId.set(r.hse_id, r);
  const m = r.source_url && /^https:\/\/(?:www\.)?hse\.ru\/edu\/dpo\/(\d+)/.exec(r.source_url);
  if (m) byHseId.set(m[1]!, r);
}
const byTitle = new Map(
  existing
    .filter((r) => !!r.source_url && /^https:\/\/(?:www\.)?hse\.ru\/edu\/dpo\/\d+/.test(r.source_url))
    .map((r) => [normalizeTitle(r.title), r]),
);
const slugs = new Set(existing.map((r) => r.slug));
const matchedIds = new Set<string>();
let created = 0, updated = 0, archived = 0;

for (const c of cards) {
  const match = byHseId.get(c.hseId) ?? byTitle.get(normalizeTitle(c.title));
  if (match && !matchedIds.has(match.id)) {
    matchedIds.add(match.id);
    const patch: Record<string, unknown> = {
      ...(c.priceKop > 0 ? { price: c.priceKop } : {}),
      format: c.format,
      ...(c.start ? { dates: { start: c.start } } : {}),
      document: DOC_BY_TYPE[c.type],
      source_url: c.url,
      hse_id: c.hseId,
      enrollment: c.enrollment,
      status: c.priceKop > 0 || match.price > 0 ? "published" : "draft",
    };
    if (c.duration) patch.duration = c.duration;
    await client.request(updateItem("programs" as never, match.id, patch as never));
    updated++;
  } else if (!match) {
    let slug = slugifyRu(c.title.split(" / ")[0]!);
    while (slugs.has(slug)) slug = `${slug}-${c.hseId.slice(-4)}`;
    slugs.add(slug);
    await client.request(createItem("programs" as never, {
      slug, title: c.title.split(" / ")[0]!.trim(),
      direction: c.category || "Право",
      format: c.format, duration: c.duration ?? "уточняется",
      price: c.priceKop, dates: c.start ? { start: c.start } : null,
      document: DOC_BY_TYPE[c.type], source_url: c.url, hse_id: c.hseId,
      enrollment: c.enrollment,
      description: null, status: c.priceKop > 0 ? "published" : "draft",
    } as never));
    created++;
  }
}

for (const r of existing) {
  if ([...byHseId.values()].some((m) => m.id === r.id) && !matchedIds.has(r.id) && r.status !== "archived") {
    await client.request(updateItem("programs" as never, r.id, { status: "archived" } as never));
    archived++;
  }
}

console.log(`Готово: +${created} / upd ${updated} / arch ${archived}; actual ${cards.filter((c) => c.enrollment === "actual").length} / total ${cards.length}`);
