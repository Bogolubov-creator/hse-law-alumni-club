/**
 * Обновляет enrollment (и недостающие программы) в зеркальном сиде
 * по живым листингам hse.ru: актуальный набор + onlyActual=0.
 *
 * Не затирает rich-поля (modules/teachers/cover) у уже известных slug/hse_id.
 * Запуск: pnpm --filter @club/scripts refresh-dpo-enrollment
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectHseDpoCards,
  HSE_DPO_ACTUAL_URL,
  HSE_DPO_ALL_URL,
  slugifyRu,
  type ProgramSeed,
} from "@club/shared";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT_TS = path.join(ROOT, "packages/shared/src/dpo-mirror-catalog.generated.ts");
const OUT_BOT = path.join(ROOT, "apps/web/public/content/bot-catalog.json");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const DOC_PK = "Удостоверение о повышении квалификации НИУ ВШЭ";
const DOC_PP = "Диплом о профессиональной переподготовке НИУ ВШЭ";

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" } });
  if (!res.ok) throw new Error(`hse.ru: HTTP ${res.status} (${url})`);
  return res.text();
}

function parseGenerated(ts: string): ProgramSeed[] {
  const m = /export const DPO_MIRROR_PROGRAMS: ProgramSeed\[\] = (\[[\s\S]*\]);\s*$/.exec(ts.trim());
  if (!m) throw new Error("Не разобрал DPO_MIRROR_PROGRAMS");
  return JSON.parse(m[1]!) as ProgramSeed[];
}

function serialize(programs: ProgramSeed[]): string {
  const body = JSON.stringify(programs, null, 2);
  return `/* eslint-disable */
/**
 * Автогенерация: scripts/src/import-dpo-mirror-catalog.ts (+ refresh-dpo-enrollment-from-hse).
 * Источник контента – itspecR/dpo-pravo-hse; enrollment – живой hse.ru
 * (orgUnit=22753 и onlyActual=0).
 * Не редактировать вручную – перезапустите import-dpo / refresh-dpo-enrollment.
 */
import type { ProgramSeed } from "./seeds.js";

export const DPO_MIRROR_PROGRAMS: ProgramSeed[] = ${body};
`;
}

async function main() {
  const actual = await collectHseDpoCards(HSE_DPO_ACTUAL_URL, fetchPage);
  const all = await collectHseDpoCards(HSE_DPO_ALL_URL, fetchPage);
  if (actual.length < 3 || all.length < actual.length) {
    throw new Error(`Подозрительные счётчики: actual=${actual.length}, all=${all.length}`);
  }
  const actualIds = new Set(actual.map((c) => c.hseId));
  console.log(`hse.ru: актуальных ${actual.length}, всего ${all.length}`);

  const existing = parseGenerated(await readFile(OUT_TS, "utf8"));
  const byHse = new Map(existing.filter((p) => p.hse_id).map((p) => [p.hse_id!, p]));
  const slugs = new Set(existing.map((p) => p.slug));

  const next: ProgramSeed[] = existing.map((p) => {
    const id = p.hse_id;
    if (!id) return p;
    if (!all.some((c) => c.hseId === id)) return { ...p, enrollment: "nonactual" as const };
    return { ...p, enrollment: actualIds.has(id) ? "actual" as const : "nonactual" as const };
  });

  let added = 0;
  for (const c of all) {
    if (byHse.has(c.hseId)) continue;
    let slug = slugifyRu(c.title.split(" / ")[0]!);
    if (!slug.includes(c.hseId)) slug = `${slug}-${c.hseId}`;
    while (slugs.has(slug)) slug = `${slug}-x`;
    slugs.add(slug);
    next.push({
      slug,
      title: c.title.split(" / ")[0]!.trim(),
      direction: c.category || "Право",
      format: c.format,
      duration: c.duration || "уточняется",
      price: c.priceKop,
      dates: c.start ? { start: c.start } : undefined,
      document: c.type === "ПП" ? DOC_PP : DOC_PK,
      enrollment: actualIds.has(c.hseId) ? "actual" : "nonactual",
      source_url: c.url,
      hse_id: c.hseId,
      cover: null,
    });
    added++;
    console.log(`  + ${c.hseId} ${c.title.slice(0, 60)} [${actualIds.has(c.hseId) ? "actual" : "nonactual"}]`);
  }

  next.sort((a, b) => a.title.localeCompare(b.title, "ru"));
  const act = next.filter((p) => p.enrollment !== "nonactual").length;
  const non = next.filter((p) => p.enrollment === "nonactual").length;

  await writeFile(OUT_TS, serialize(next), "utf8");
  await mkdir(path.dirname(OUT_BOT), { recursive: true });
  await writeFile(
    OUT_BOT,
    `${JSON.stringify({
      programs: next.map((p) => ({
        id: p.hse_id || p.slug,
        title: p.title,
        url: `/dpo/${p.slug}`,
        sphere: p.direction,
        type: p.document?.includes("переподготов") ? "ПП" : "ПК",
        format: p.format,
        formatLabel: p.format,
        price: typeof p.price === "number" ? Math.round(p.price / 100) : null,
        duration: p.duration || null,
        start: p.dates?.start ? `Старт: ${p.dates.start}` : null,
        startIso: null,
        keywords: [p.description, p.tagline].filter(Boolean),
      })),
    }, null, 2)}\n`,
    "utf8",
  );

  console.log(`Готово: ${next.length} программ (actual ${act}, nonactual ${non}, +${added} с hse.ru)`);
  console.log(`  ${path.relative(ROOT, OUT_TS)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
