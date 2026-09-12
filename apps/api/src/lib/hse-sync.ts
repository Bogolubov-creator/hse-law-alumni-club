import { readItems, createItem, updateItem } from "@directus/sdk";
import {
  collectHseDpoCards,
  HSE_DPO_ACTUAL_URL,
  HSE_DPO_ALL_URL,
  slugifyRu,
  normalizeTitle,
  type HseDpoCard,
} from "@club/shared";
import { directus } from "./directus.js";

/**
 * Автосинхронизация каталога ДПО с сайтом ВШЭ (факультет права, orgUnit 22753).
 * Маршруты листинга – как на материнском hse.ru и лендинге ДПО:
 *   • актуальный набор  …/edu/dpo/?orgUnit=22753                 → enrollment=actual
 *   • весь каталог      …/edu/dpo/?onlyActual=0&orgUnit=22753    → база для nonactual
 * Неактуальные = программы из полного каталога, которых нет в актуальном.
 * Данные: window.__INITIAL_STATE__ + пагинация (pageSize≈20).
 *
 * Контракт:
 *  • карточка есть на hse.ru → upsert (по source_url/hseId, затем по названию);
 *    обновляются цена/формат/старт/длительность/документ/enrollment/hse_id;
 *    ручные описание/модули/направление не затираются;
 *  • управляемая синком программа пропала из полного списка → archived;
 *  • ручные программы (без source_url) не трогаются;
 *  • пустой/битый парс актуального списка (< 3 карточек) → синк отменяется.
 */

const ACTUAL_URL = process.env.HSE_DPO_URL || HSE_DPO_ACTUAL_URL;
const ALL_URL = process.env.HSE_DPO_ALL_URL || HSE_DPO_ALL_URL;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const DOC_BY_TYPE = {
  "ПК": "Удостоверение о повышении квалификации НИУ ВШЭ",
  "ПП": "Диплом о профессиональной переподготовке НИУ ВШЭ",
} as const;

const di = directus;

async function fetchPageHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" } });
  if (!res.ok) throw new Error(`hse.ru: HTTP ${res.status} (${url})`);
  return res.text();
}

export type Enrollment = "actual" | "nonactual";
export type TaggedCard = HseDpoCard & { enrollment: Enrollment };

/** Актуальный + полный листинг; enrollment из разницы множеств. */
export async function fetchHseDpo(): Promise<TaggedCard[]> {
  const actual = await collectHseDpoCards(ACTUAL_URL, fetchPageHtml);
  if (actual.length < 3) {
    throw new Error(`hse.ru: подозрительно мало актуальных карточек (${actual.length}) – синк отменён, каталог не тронут`);
  }
  // Архивировать можно только при доступности полного каталога.
  const all = await collectHseDpoCards(ALL_URL, fetchPageHtml);
  if (all.length < actual.length) {
    throw new Error(
      `hse.ru: полный каталог (${all.length}) меньше актуального (${actual.length}) – синк отменён`,
    );
  }

  const actualIds = new Set(actual.map((c) => c.hseId));
  const byId = new Map<string, TaggedCard>();
  for (const c of all) {
    byId.set(c.hseId, {
      ...c,
      enrollment: actualIds.has(c.hseId) ? "actual" : "nonactual",
    });
  }
  // На случай рассинхрона страниц: актуальные, которых нет в «полном», всё равно actual.
  for (const c of actual) {
    if (!byId.has(c.hseId)) byId.set(c.hseId, { ...c, enrollment: "actual" });
  }
  return [...byId.values()];
}

export interface DpoSyncResult {
  created: number;
  updated: number;
  archived: number;
  actual: number;
  nonactual: number;
  total: number;
  sources: { actual: string; all: string };
}

export async function syncDpoCatalog(): Promise<DpoSyncResult> {
  const cards = await fetchHseDpo();

  const existing = (await di.request((readItems as any)("programs", {
    limit: -1, fields: ["id", "slug", "title", "status", "source_url", "duration", "price", "hse_id"],
  }))) as {
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

  let created = 0, updated = 0, archived = 0;
  const matchedIds = new Set<string>();

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
        document: DOC_BY_TYPE[c.type], source_url: c.url, hse_id: c.hseId,
        enrollment: c.enrollment,
        description: null, status: c.priceKop > 0 ? "published" : "draft",
      }));
      created++;
    }
  }

  // В архив – только управляемые синком (source_url задан) и пропавшие из полного списка.
  for (const r of existing) {
    if ([...byHseId.values()].some((managed) => managed.id === r.id) && !matchedIds.has(r.id) && r.status !== "archived") {
      await di.request((updateItem as any)("programs", r.id, { status: "archived" }));
      archived++;
    }
  }

  return {
    created, updated, archived,
    actual: cards.filter((c) => c.enrollment === "actual").length,
    nonactual: cards.filter((c) => c.enrollment === "nonactual").length,
    total: cards.length,
    sources: { actual: ACTUAL_URL, all: ALL_URL },
  };
}
