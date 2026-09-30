import { readItems, createItem, updateItem } from "../../db/data-commands.js";
import {
  collectHseDpoCards,
  HSE_DPO_ACTUAL_URL,
  HSE_DPO_ALL_URL,
  collectDpoSyncCards, planDpoSync,
  type TaggedCard, type ExistingDpoProgram,
} from "@club/shared";
import { data } from "../../db/data.js";

// Синхронизация сохраняет ручной контент и программы без source_url.

const ACTUAL_URL = process.env.HSE_DPO_URL || HSE_DPO_ACTUAL_URL;
const ALL_URL = process.env.HSE_DPO_ALL_URL || HSE_DPO_ALL_URL;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const di = data;

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
