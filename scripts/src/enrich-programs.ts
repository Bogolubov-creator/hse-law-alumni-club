// Разовая заливка обогащённых данных программ (modules/teachers/dates/description/document)
// в существующие строки Directus. ensureSeed вставляет только отсутствующие — этот скрипт обновляет.
import { createDirectus, rest, staticToken, readItems, updateItem } from "@directus/sdk";
import { PROGRAMS_SEED } from "@club/shared";

const URL = process.env.DIRECTUS_URL!;
const TOKEN = process.env.DIRECTUS_SERVICE_TOKEN!;
if (!URL || !TOKEN) throw new Error("DIRECTUS_URL / DIRECTUS_SERVICE_TOKEN required");

const client = createDirectus(URL).with(staticToken(TOKEN)).with(rest());

for (const p of PROGRAMS_SEED) {
  const rows = (await client.request((readItems as any)("programs", { filter: { slug: { _eq: p.slug } }, limit: 1, fields: ["id"] }))) as any[];
  if (!rows.length) { console.log(`  ! нет программы ${p.slug}`); continue; }
  await client.request((updateItem as any)("programs", rows[0].id, {
    dates: p.dates ?? null,
    modules: p.modules ?? null,
    teachers: p.teachers ?? null,
    description: p.description ?? null,
    document: p.document ?? null,
  }));
  console.log(`  ✓ обновлено ${p.slug}`);
}
console.log("Готово.");
process.exit(0);
