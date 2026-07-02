import { readItems, createItem, updateItem } from "@directus/sdk";
import { parseHseDpoCards, slugifyRu, normalizeTitle, type HseDpoCard } from "@club/shared";
import { directus } from "./directus.js";

/**
 * Автосинхронизация каталога ДПО с сайтом ВШЭ (факультет права, orgUnit 22753).
 *
 * Контракт:
 *  • карточка есть на hse.ru → upsert (сопоставление по source_url/hseId, затем
 *    по нормализованному названию) — обновляются цена/формат/старт/длительность/
 *    документ, статус published; ручные поля (описание, модули, направление)
 *    НЕ затираются;
 *  • управляемой синком программы (есть source_url) больше нет на сайте → archived;
 *  • программы, добавленные вручную в админке (без source_url), синк не трогает;
 *  • защита от пустого/битого парса: < 3 карточек → синк отменяется с ошибкой.
 */

const SOURCE_URL = process.env.HSE_DPO_URL || "https://www.hse.ru/edu/dpo/?orgUnit=22753";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const DOC_BY_TYPE = {
  "ПК": "Удостоверение о повышении квалификации НИУ ВШЭ",
  "ПП": "Диплом о профессиональной переподготовке НИУ ВШЭ",
} as const;

const di = directus;

export async function fetchHseDpo(): Promise<HseDpoCard[]> {
  const res = await fetch(SOURCE_URL, { headers: { "user-agent": UA, accept: "text/html" } });
  if (!res.ok) throw new Error(`hse.ru: HTTP ${res.status}`);
  const cards = parseHseDpoCards(await res.text());
  if (cards.length < 3) throw new Error(`hse.ru: подозрительно мало карточек (${cards.length}) — синк отменён, каталог не тронут`);
  return cards;
}

export interface DpoSyncResult { created: number; updated: number; archived: number; total: number }

export async function syncDpoCatalog(): Promise<DpoSyncResult> {
  const cards = await fetchHseDpo();

  const existing = (await di.request((readItems as any)("programs", {
    limit: -1, fields: ["id", "slug", "title", "status", "source_url", "duration"],
  }))) as { id: string; slug: string; title: string; status: string; source_url: string | null; duration: string | null }[];

  const byHseId = new Map<string, (typeof existing)[number]>();
  for (const r of existing) {
    const m = r.source_url && /\/dpo\/(\d+)/.exec(r.source_url);
    if (m) byHseId.set(m[1]!, r);
  }
  const byTitle = new Map(existing.map((r) => [normalizeTitle(r.title), r]));
  const slugs = new Set(existing.map((r) => r.slug));

  let created = 0, updated = 0, archived = 0;
  const matchedIds = new Set<string>();

  for (const c of cards) {
    const match = byHseId.get(c.hseId) ?? byTitle.get(normalizeTitle(c.title));
    if (match) {
      matchedIds.add(match.id);
      const patch: Record<string, unknown> = {
        price: c.priceKop,
        format: c.format,
        dates: c.start ? { start: c.start } : null,
        document: DOC_BY_TYPE[c.type],
        source_url: c.url,
        status: "published",
      };
      if (c.duration) patch.duration = c.duration; // нет на сайте — оставляем прежнюю
      await di.request((updateItem as any)("programs", match.id, patch));
      updated++;
    } else {
      let slug = slugifyRu(c.title.split(" / ")[0]!);
      while (slugs.has(slug)) slug = `${slug}-${c.hseId.slice(-4)}`;
      slugs.add(slug);
      await di.request((createItem as any)("programs", {
        slug, title: c.title.split(" / ")[0]!.trim(),
        direction: c.category || "Право",
        format: c.format, duration: c.duration ?? "уточняется",
        price: c.priceKop, dates: c.start ? { start: c.start } : null,
        document: DOC_BY_TYPE[c.type], source_url: c.url,
        description: null, status: "published",
      }));
      created++;
    }
  }

  // В архив — только управляемые синком (source_url задан) и пропавшие с сайта.
  for (const r of existing) {
    if (r.source_url && !matchedIds.has(r.id) && r.status !== "archived") {
      await di.request((updateItem as any)("programs", r.id, { status: "archived" }));
      archived++;
    }
  }

  return { created, updated, archived, total: cards.length };
}
