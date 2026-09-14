import { readItems, createItem, updateItem } from "@directus/sdk";
import {
  collectHseDpoCards,
  HSE_DPO_ACTUAL_URL,
  HSE_DPO_ALL_URL,
  collectDpoSyncCards, planDpoSync,
  type TaggedCard, type ExistingDpoProgram,
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
const di = directus;

async function fetchPageHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" } });
  if (!res.ok) throw new Error(`hse.ru: HTTP ${res.status} (${url})`);
  return res.text();
}

export async function fetchHseDpo(): Promise<TaggedCard[]> {
  return collectDpoSyncCards({ actual: ACTUAL_URL, all: ALL_URL }, fetchPageHtml, collectHseDpoCards);
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
  }))) as ExistingDpoProgram[];

  let created = 0, updated = 0, archived = 0;
  for (const change of planDpoSync(cards, existing)) {
    if (change.kind === "create") {
      await di.request((createItem as any)("programs", change.data));
      created++;
    } else {
      await di.request((updateItem as any)("programs", change.id, change.data));
      if (change.kind === "archive") archived++; else updated++;
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
