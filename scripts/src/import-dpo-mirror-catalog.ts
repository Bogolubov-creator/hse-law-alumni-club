/**
 * Импорт полного каталога ДПО из зеркала itspecR/dpo-pravo-hse.
 *
 * Тянет `.catalog-data.json` + `content/programs-index.json`, скачивает обложки
 * в `apps/web/public/assets/programs/`, генерирует:
 *  – `packages/shared/src/dpo-mirror-catalog.generated.ts`
 *  – `apps/web/public/content/bot-catalog.json`
 *
 * Идемпотентен: повторный запуск перезаписывает артефакты.
 * Запуск: `pnpm --filter @club/scripts import-dpo`
 * Опционально: `DPO_MIRROR_REPO=owner/repo` (по умолчанию itspecR/dpo-pravo-hse).
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mapHseFormat, slugifyRu, type ProgramSeed } from "@club/shared";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REPO = process.env.DPO_MIRROR_REPO || "itspecR/dpo-pravo-hse";
const RAW = `https://raw.githubusercontent.com/${REPO}/main`;
const UA = "alumni-club-dpo-import/1.0 (+https://github.com/itspecR)";

const DOC_PK = "Удостоверение о повышении квалификации НИУ ВШЭ";
const DOC_PP = "Диплом о профессиональной переподготовке НИУ ВШЭ";
const TEACHER_ABOUT_MAX = 480;

const OUT_TS = path.join(ROOT, "packages/shared/src/dpo-mirror-catalog.generated.ts");
const OUT_BOT = path.join(ROOT, "apps/web/public/content/bot-catalog.json");
const OUT_IMG = path.join(ROOT, "apps/web/public/assets/programs");
const OUT_THUMB = path.join(OUT_IMG, "thumbs");

type CatalogModule = { title?: string; hours?: number | null; topics?: string[] };
type CatalogTeacher = { name?: string; about?: string | null };
type CatalogProgram = {
  id: string | number;
  title: string;
  url?: string;
  type?: { shortTitle?: string; title?: string } | string;
  studyFormat?: { title?: string } | string;
  duration?: string | null;
  startDate?: number | null;
  discountPrice?: number | null;
  educationPricing?: number | null;
  tagline?: string | null;
  about?: string | null;
  audience?: { intro?: string | null; items?: string[] } | null;
  results?: string[] | null;
  advantages?: string[] | null;
  modules?: CatalogModule[] | null;
  teachers?: CatalogTeacher[] | null;
  image?: string | null;
  locked?: boolean;
  hours?: string | null;
};

type IndexProgram = { id: string | number; title?: string; url?: string; sphere?: string };

type BotProgramOut = {
  id: string;
  title: string;
  url: string;
  sphere: string;
  type: string;
  format: string;
  formatLabel: string;
  price: number | null;
  duration: string | null;
  start: string | null;
  startIso: string | null;
  keywords: string[];
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return (await res.json()) as T;
}

async function fetchBytes(url: string): Promise<Buffer | null> {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "image/*,*/*" } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

function typeShort(p: CatalogProgram): "ПК" | "ПП" {
  const raw = typeof p.type === "string" ? p.type : (p.type?.shortTitle || p.type?.title || "ПК");
  return /пп/i.test(String(raw)) ? "ПП" : "ПК";
}

function studyFormatTitle(p: CatalogProgram): string {
  if (!p.studyFormat) return "";
  return typeof p.studyFormat === "string" ? p.studyFormat : (p.studyFormat.title || "");
}

function formatStartMs(ms: number | null | undefined): string | undefined {
  if (ms == null || !Number.isFinite(ms)) return undefined;
  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).formatToParts(new Date(ms));
  const day = parts.find((x) => x.type === "day")?.value;
  const month = parts.find((x) => x.type === "month")?.value;
  const year = parts.find((x) => x.type === "year")?.value;
  if (!day || !month || !year) return undefined;
  return `${day} ${month} ${year}`;
}

function startIsoFromMs(ms: number | null | undefined): string | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function slugFromIndexUrl(url: string | undefined, title: string, id: string): string {
  if (url) {
    const base = url.replace(/^programs\//, "").replace(/\.html?$/i, "").trim();
    if (base) return base;
  }
  const s = slugifyRu(title);
  return s.includes(id) ? s : `${s}-${id}`;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trimEnd()}…`;
}

function priceKop(p: CatalogProgram): number {
  const rub = p.educationPricing ?? p.discountPrice ?? 0;
  return Math.round(Number(rub) || 0) * 100;
}

function descriptionOf(p: CatalogProgram): string | undefined {
  // Tagline показывается отдельно под заголовком – в description кладём about.
  const about = (p.about || "").trim();
  const tagline = (p.tagline || "").trim();
  if (about) return about;
  return tagline || undefined;
}

function mapProgram(p: CatalogProgram, idx: IndexProgram | undefined): ProgramSeed {
  const id = String(p.id);
  const typ = typeShort(p);
  const formatRaw = studyFormatTitle(p);
  const imagePath = (p.image || "").trim();
  const ext = /\.webp$/i.test(imagePath) ? "webp" : imagePath ? "jpg" : null;
  const cover = ext ? `/assets/programs/${id}.${ext}` : null;
  const start = formatStartMs(p.startDate ?? null);
  const duration = (p.hours || p.duration || "").trim() || "уточняется";
  const audience = Array.isArray(p.audience?.items) ? p.audience!.items!.map(String).filter(Boolean) : undefined;
  const results = Array.isArray(p.results) ? p.results.map(String).filter(Boolean) : undefined;
  const advantages = Array.isArray(p.advantages) ? p.advantages.map(String).filter(Boolean) : undefined;

  const modules = (p.modules || [])
    .filter((m) => m?.title)
    .map((m) => ({
      title: String(m.title),
      hours: typeof m.hours === "number" && Number.isFinite(m.hours) ? m.hours : 0,
      points: Array.isArray(m.topics) ? m.topics.map(String).filter(Boolean) : [],
    }));

  const teachers = (p.teachers || [])
    .filter((t) => t?.name)
    .map((t) => ({
      name: String(t.name),
      role: truncate(String(t.about || "").trim() || "Преподаватель", TEACHER_ABOUT_MAX),
    }));

  const direction =
    (idx?.sphere || "").trim() ||
    (typeof p.type === "object" ? p.type?.title : "") ||
    typ;

  return {
    slug: slugFromIndexUrl(idx?.url, p.title, id),
    title: p.title,
    direction,
    format: mapHseFormat(formatRaw || "Онлайн"),
    duration,
    price: priceKop(p),
    dates: start ? { start } : undefined,
    document: typ === "ПП" ? DOC_PP : DOC_PK,
    description: descriptionOf(p),
    modules: modules.length ? modules : undefined,
    teachers: teachers.length ? teachers : undefined,
    enrollment: p.locked === true ? "nonactual" : "actual",
    cover,
    source_url: p.url || undefined,
    hse_id: id,
    tagline: (p.tagline || "").trim() || undefined,
    audience: audience?.length ? audience : undefined,
    results: results?.length ? results : undefined,
    advantages: advantages?.length ? advantages : undefined,
  };
}

function toBot(p: ProgramSeed): BotProgramOut {
  const keywords: string[] = [];
  if (p.description) keywords.push(p.description);
  if (p.tagline) keywords.push(p.tagline);
  for (const m of p.modules || []) {
    if (m.title) keywords.push(m.title);
    for (const pt of m.points || []) keywords.push(pt);
  }
  return {
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
    keywords,
  };
}

function serializePrograms(programs: ProgramSeed[]): string {
  // Стабильный JSON → TS, без лишних пробелов в ключе; кириллица как есть.
  const body = JSON.stringify(programs, null, 2)
    .replace(/\\\\/g, "\\")
    .replace(/\u2026/g, "…");
  return `/* eslint-disable */
/**
 * Автогенерация: scripts/src/import-dpo-mirror-catalog.ts
 * Источник – ${REPO} \`.catalog-data.json\` (+ programs-index.json).
 * Не редактировать вручную – перезапустите \`pnpm --filter @club/scripts import-dpo\`.
 */
import type { ProgramSeed } from "./seeds.js";

export const DPO_MIRROR_PROGRAMS: ProgramSeed[] = ${body};
`;
}

async function downloadImage(id: string, imageRel: string | null | undefined): Promise<string | null> {
  if (!imageRel) return null;
  const ext = /\.webp$/i.test(imageRel) ? "webp" : "jpg";
  const srcUrl = `${RAW}/${imageRel.replace(/^\//, "")}`;
  const buf = await fetchBytes(srcUrl);
  if (!buf) {
    console.warn(`  ! нет изображения ${srcUrl}`);
    return null;
  }
  const dest = path.join(OUT_IMG, `${id}.${ext}`);
  await writeFile(dest, buf);
  if (ext === "webp") {
    // Дублируем имя .webp рядом (уже webp) – требование идемпотентности выполнено.
    await writeFile(path.join(OUT_IMG, `${id}.webp`), buf);
  }

  // Опциональный thumb из images/programs/thumbs/{id}.jpg
  const thumbUrl = `${RAW}/images/programs/thumbs/${id}.jpg`;
  const thumb = await fetchBytes(thumbUrl);
  if (thumb) {
    await writeFile(path.join(OUT_THUMB, `${id}.jpg`), thumb);
  }
  return ext;
}

async function main() {
  console.log(`Источник: ${REPO}`);
  const catalog = await fetchJson<{ programs: CatalogProgram[]; count?: number }>(`${RAW}/.catalog-data.json`);
  const index = await fetchJson<{ programs: IndexProgram[] }>(`${RAW}/content/programs-index.json`);
  const byId = new Map(index.programs.map((p) => [String(p.id), p]));

  const list = catalog.programs || [];
  if (list.length < 3) throw new Error(`Подозрительно мало программ (${list.length}) – импорт отменён.`);

  await mkdir(OUT_IMG, { recursive: true });
  await mkdir(OUT_THUMB, { recursive: true });

  let images = 0;
  const seeds: ProgramSeed[] = [];
  for (const raw of list) {
    const id = String(raw.id);
    const idx = byId.get(id);
    const ext = await downloadImage(id, raw.image);
    if (ext) images++;
    const seed = mapProgram(raw, idx);
    // cover должен совпасть с реально скачанным расширением
    if (ext) seed.cover = `/assets/programs/${id}.${ext}`;
    else seed.cover = null;
    seeds.push(seed);
    console.log(`  · ${id} → ${seed.slug}${ext ? ` [${ext}]` : " [no-img]"}`);
  }

  seeds.sort((a, b) => a.title.localeCompare(b.title, "ru"));

  await writeFile(OUT_TS, serializePrograms(seeds), "utf8");
  await writeFile(OUT_BOT, `${JSON.stringify({ programs: seeds.map(toBot) }, null, 2)}\n`, "utf8");

  console.log(`Готово: ${seeds.length} программ, ${images} обложек.`);
  console.log(`  ${path.relative(ROOT, OUT_TS)}`);
  console.log(`  ${path.relative(ROOT, OUT_BOT)}`);
  console.log(`  ${path.relative(ROOT, OUT_IMG)}/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
