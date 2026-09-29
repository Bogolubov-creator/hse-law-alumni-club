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
  collectDpoSyncCards, planDpoSync,
  HSE_DPO_ACTUAL_URL,
  HSE_DPO_ALL_URL,
  type ExistingDpoProgram,
} from "@club/shared";

const URL = process.env.DIRECTUS_URL!;
const TOKEN = process.env.DIRECTUS_SERVICE_TOKEN!;
if (!URL || !TOKEN) throw new Error("DIRECTUS_URL / DIRECTUS_SERVICE_TOKEN required");

const ACTUAL_URL = process.env.HSE_DPO_URL || HSE_DPO_ACTUAL_URL;
const ALL_URL = process.env.HSE_DPO_ALL_URL || HSE_DPO_ALL_URL;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const client = createDirectus(URL).with(staticToken(TOKEN)).with(rest());

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" } });
  if (!res.ok) throw new Error(`hse.ru: HTTP ${res.status} (${url})`);
  return res.text();
}

const cards = await collectDpoSyncCards({ actual: ACTUAL_URL, all: ALL_URL }, fetchPage);
const existing = (await client.request(readItems("programs" as never, {
  limit: -1, fields: ["id", "slug", "title", "status", "source_url", "duration", "price", "hse_id"],
} as never))) as ExistingDpoProgram[];

let created = 0, updated = 0, archived = 0;
for (const change of planDpoSync(cards, existing)) {
  if (change.kind === "create") {
    await client.request(createItem("programs" as never, change.data as never));
    created++;
  } else {
    await client.request(updateItem("programs" as never, change.id, change.data as never));
    if (change.kind === "archive") archived++; else updated++;
  }
}

console.log(`Готово: +${created} / upd ${updated} / arch ${archived}; actual ${cards.filter((c) => c.enrollment === "actual").length} / total ${cards.length}`);
