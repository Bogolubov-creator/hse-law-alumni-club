/**
 * Синхронизация каталога ДПО с источником факультета права НИУ ВШЭ.
 *
 * Актуальный набор:   https://www.hse.ru/edu/dpo/?orgUnit=22753
 * Неактуальные:        https://www.hse.ru/edu/dpo/?onlyNonactual=1&orgUnit=22753
 *
 * Сейчас источник истины — зеркало `PROGRAMS_SEED` (@club/shared/seeds), заполненное
 * по актуальному набору. Точку fetch с hse.ru (парсинг листинга → маппинг в ProgramSeed)
 * следует подключить в `fetchHseDpo()` ниже — контракт синхронизации остаётся тем же:
 *   • программа из источника есть → upsert по slug (status=published);
 *   • программы нет в источнике → status=archived (уходит с витрины, но заявки сохраняются).
 *
 * Запуск: DIRECTUS_URL=http://localhost:8055 pnpm --filter @club/scripts exec tsx src/sync-hse-dpo.ts
 */
import { createDirectus, rest, staticToken, readItems, createItem, updateItem } from "@directus/sdk";
import { PROGRAMS_SEED, type ProgramSeed } from "@club/shared";

const URL = process.env.DIRECTUS_URL!;
const TOKEN = process.env.DIRECTUS_SERVICE_TOKEN!;
if (!URL || !TOKEN) throw new Error("DIRECTUS_URL / DIRECTUS_SERVICE_TOKEN required");

const client = createDirectus(URL).with(staticToken(TOKEN)).with(rest());

/** Источник актуального набора. Пока — зеркало PROGRAMS_SEED; здесь подключается парсер hse.ru. */
async function fetchHseDpo(): Promise<ProgramSeed[]> {
  return [...PROGRAMS_SEED];
}

const toRow = (p: ProgramSeed) => ({
  slug: p.slug, title: p.title, direction: p.direction, format: p.format, duration: p.duration, price: p.price,
  dates: p.dates ?? null, document: p.document ?? null, description: p.description ?? null,
  modules: p.modules ?? null, teachers: p.teachers ?? null, status: "published",
});

const source = await fetchHseDpo();
const sourceSlugs = new Set(source.map((p) => p.slug));

const existing = (await client.request((readItems as any)("programs", { fields: ["id", "slug", "status"], limit: -1 }))) as { id: string; slug: string; status: string }[];
const bySlug = new Map(existing.map((r) => [r.slug, r]));

let created = 0, updated = 0, archived = 0;
for (const p of source) {
  const row = toRow(p);
  const ex = bySlug.get(p.slug);
  if (ex) { await client.request((updateItem as any)("programs", ex.id, row)); updated++; }
  else { await client.request((createItem as any)("programs", row)); created++; }
}
// Программы, которых больше нет в источнике — в архив (с витрины уходят, заявки не рвутся).
for (const r of existing) {
  if (!sourceSlugs.has(r.slug) && r.status !== "archived") {
    await client.request((updateItem as any)("programs", r.id, { status: "archived" }));
    archived++;
  }
}
console.log(`Синхронизация ДПО: +${created} создано, ${updated} обновлено, ${archived} в архив. Всего в источнике: ${source.length}.`);
process.exit(0);
