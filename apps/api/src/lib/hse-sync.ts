import { readItems, createItem, updateItem } from "@directus/sdk";
import { parseHseDpoCards, slugifyRu, normalizeTitle, type HseDpoCard } from "@club/shared";
import { directus } from "./directus.js";

/**
 * Автосинхронизация каталога ДПО с сайтом ВШЭ (факультет права, orgUnit 22753).
 * Забираются ОБА листинга, как на hse.ru:
 *   • актуальный набор  …/edu/dpo/?orgUnit=22753            → enrollment=actual
 *   • неактуальные      …/edu/dpo/?onlyNonactual=1&orgUnit= → enrollment=nonactual
 * (программа в обоих списках считается актуальной).
 *
 * Контракт:
 *  • карточка есть на hse.ru → upsert (по source_url/hseId, затем по названию);
 *    обновляются цена/формат/старт/длительность/документ/enrollment; ручные
 *    описание/модули/направление не затираются;
 *  • управляемая синком программа пропала из обоих списков → archived;
 *  • ручные программы (без source_url) не трогаются;
 *  • пустой/битый парс актуального списка (< 3 карточек) → синк отменяется.
 */

const BASE_URL = process.env.HSE_DPO_URL || "https://www.hse.ru/edu/dpo/?orgUnit=22753";
const NONACTUAL_URL = process.env.HSE_DPO_NONACTUAL_URL
  || BASE_URL + (BASE_URL.includes("?") ? "&" : "?") + "onlyNonactual=1";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const DOC_BY_TYPE = {
  "ПК": "Удостоверение о повышении квалификации НИУ ВШЭ",
  "ПП": "Диплом о профессиональной переподготовке НИУ ВШЭ",
} as const;

const di = directus;

async function fetchList(url: string): Promise<HseDpoCard[]> {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" } });
  if (!res.ok) throw new Error(`hse.ru: HTTP ${res.status} (${url})`);
  return parseHseDpoCards(await res.text());
}

export type Enrollment = "actual" | "nonactual";
export type TaggedCard = HseDpoCard & { enrollment: Enrollment };

/** Оба листинга hse.ru; при дубле hseId актуальный статус приоритетнее. */
export async function fetchHseDpo(): Promise<TaggedCard[]> {
  const actual = await fetchList(BASE_URL);
  if (actual.length < 3) throw new Error(`hse.ru: подозрительно мало карточек (${actual.length}) – синк отменён, каталог не тронут`);
  // Неактуальный список вторичен: его сбой не должен ронять весь синк.
  let nonactual: HseDpoCard[] = [];
  try {
    nonactual = await fetchList(NONACTUAL_URL);
  } catch (e) {
    console.error("[dpo-sync] неактуальный список недоступен:", (e as Error).message);
  }
  const seen = new Set(actual.map((c) => c.hseId));
  return [
    ...actual.map((c) => ({ ...c, enrollment: "actual" as const })),
    ...nonactual.filter((c) => !seen.has(c.hseId)).map((c) => ({ ...c, enrollment: "nonactual" as const })),
  ];
}

export interface DpoSyncResult { created: number; updated: number; archived: number; actual: number; nonactual: number; total: number }

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
    if (match && !matchedIds.has(match.id)) {
      matchedIds.add(match.id);
      const patch: Record<string, unknown> = {
        price: c.priceKop,
        format: c.format,
        dates: c.start ? { start: c.start } : null,
        document: DOC_BY_TYPE[c.type],
        source_url: c.url,
        enrollment: c.enrollment,
        status: "published",
      };
      if (c.duration) patch.duration = c.duration; // нет на сайте – оставляем прежнюю
      await di.request((updateItem as any)("programs", match.id, patch));
      updated++;
    } else if (!match) {
      let slug = slugifyRu(c.title.split(" / ")[0]!);
      while (slugs.has(slug)) slug = `${slug}-${c.hseId.slice(-4)}`;
      slugs.add(slug);
      await di.request((createItem as any)("programs", {
        slug, title: c.title.split(" / ")[0]!.trim(),
        direction: c.category || "Право",
        format: c.format, duration: c.duration ?? "уточняется",
        price: c.priceKop, dates: c.start ? { start: c.start } : null,
        document: DOC_BY_TYPE[c.type], source_url: c.url,
        enrollment: c.enrollment,
        description: null, status: "published",
      }));
      created++;
    }
  }

  // В архив – только управляемые синком (source_url задан) и пропавшие из ОБОИХ списков.
  for (const r of existing) {
    if (r.source_url && !matchedIds.has(r.id) && r.status !== "archived") {
      await di.request((updateItem as any)("programs", r.id, { status: "archived" }));
      archived++;
    }
  }

  return {
    created, updated, archived,
    actual: cards.filter((c) => c.enrollment === "actual").length,
    nonactual: cards.filter((c) => c.enrollment === "nonactual").length,
    total: cards.length,
  };
}
