import { collectHseDpoCards, type HseDpoCard } from "./hse-dpo.js";
import { slugifyRu, normalizeTitle } from "./slug.js";

const DOC_BY_TYPE = {
  "ПК": "Удостоверение о повышении квалификации НИУ ВШЭ",
  "ПП": "Диплом о профессиональной переподготовке НИУ ВШЭ",
} as const;

export type TaggedCard = HseDpoCard & { enrollment: "actual" | "nonactual" };
export type ExistingDpoProgram = { id: string; slug: string; title: string; status: string; source_url: string | null; duration: string | null; price: number; hse_id?: string | null };
export type DpoChange = { kind: "create"; data: Record<string, unknown> } | { kind: "update" | "archive"; id: string; data: Record<string, unknown> };

/** Проверяет полноту источника до любых изменений каталога. */
export async function collectDpoSyncCards(sources: { actual: string; all: string }, fetchPage: (url: string) => Promise<string>, collect = collectHseDpoCards): Promise<TaggedCard[]> {
  const actual = await collect(sources.actual, fetchPage);
  if (actual.length < 3) {
    throw new Error(`hse.ru: подозрительно мало актуальных карточек (${actual.length}) – синк отменён, каталог не тронут`);
  }
  // Архивировать можно только при доступности полного каталога.
  const all = await collect(sources.all, fetchPage);
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

/** Чистый план: сохраняет ручной контент, slug и порядок операций. */
export function planDpoSync(cards: TaggedCard[], existing: ExistingDpoProgram[]): DpoChange[] {
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

  const changes: DpoChange[] = [];
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
      changes.push({ kind: "update", id: match.id, data: patch });
    } else if (!match) {
      let slug = slugifyRu(c.title.split(" / ")[0]!);
      while (slugs.has(slug)) slug = `${slug}-${c.hseId.slice(-4)}`;
      slugs.add(slug);
      changes.push({ kind: "create", data: {
        slug, title: c.title.split(" / ")[0]!.trim(),
        direction: c.category || "Право",
        format: c.format, duration: c.duration ?? "уточняется",
        price: c.priceKop, dates: c.start ? { start: c.start } : null,
        document: DOC_BY_TYPE[c.type], source_url: c.url, hse_id: c.hseId,
        enrollment: c.enrollment,
        description: null, status: c.priceKop > 0 ? "published" : "draft",
      } });
    }
  }

  const managedIds = new Set([...byHseId.values()].map((row) => row.id));
  // В архив – только управляемые синком (source_url задан) и пропавшие из полного списка.
  for (const r of existing) {
    if (managedIds.has(r.id) && !matchedIds.has(r.id) && r.status !== "archived") {
      changes.push({ kind: "archive", id: r.id, data: { status: "archived" } });
    }
  }

  return changes;
}
