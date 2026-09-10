import type { BotProgram } from "./types.js";

/** Сырая программа клуба с GET /api/programs. */
export type ClubProgramApi = {
  id: string;
  slug: string;
  title: string;
  direction?: string | null;
  format?: string | null;
  duration?: string | null;
  price?: number | null; // копейки
  document?: string | null;
  dates?: { start?: string | null } | null;
  description?: string | null;
  modules?: Array<{ title?: string } | string> | null;
};

function mapFormat(raw: string | null | undefined): string {
  const f = String(raw || "").toLowerCase();
  if (/онлайн|online|дистанц/.test(f)) return "online";
  if (/смешан|mixed|гибрид/.test(f)) return "mixed";
  if (/очн|offline|офлайн/.test(f)) return "offline";
  return f || "offline";
}

function mapType(document: string | null | undefined, title: string): string {
  const d = `${document || ""} ${title}`.toLowerCase();
  if (/переподготов/.test(d)) return "ПП";
  if (/повышен|удостоверен|квалификац/.test(d)) return "ПК";
  return "";
}

/** Цены API в копейках → рубли для бота. */
export function programToBot(p: ClubProgramApi): BotProgram {
  const keywords: string[] = [];
  if (p.description) keywords.push(p.description);
  if (Array.isArray(p.modules)) {
    for (const m of p.modules) {
      if (typeof m === "string") keywords.push(m);
      else if (m?.title) keywords.push(m.title);
    }
  }
  const rub = typeof p.price === "number" ? Math.round(p.price / 100) : null;
  return {
    id: p.id,
    title: p.title,
    url: `/dpo/${p.slug}`,
    sphere: p.direction || "Программы ДПО",
    type: mapType(p.document, p.title),
    format: mapFormat(p.format),
    formatLabel: p.format || undefined,
    price: rub,
    duration: p.duration || null,
    start: p.dates?.start ? `Старт: ${p.dates.start}` : null,
    startIso: null,
    keywords,
  };
}

export function programsFromApi(list: ClubProgramApi[]): BotProgram[] {
  return list.map(programToBot);
}

export async function loadBotCatalog(fetchImpl: typeof fetch = fetch): Promise<BotProgram[]> {
  try {
    const res = await fetchImpl("/api/programs");
    if (res.ok) {
      const data = (await res.json()) as ClubProgramApi[] | { items?: ClubProgramApi[] };
      const list = Array.isArray(data) ? data : data.items ?? [];
      if (list.length) return programsFromApi(list);
    }
  } catch {
    /* fallback below */
  }
  const fallback = await fetchImpl("/content/bot-catalog.json");
  if (!fallback.ok) throw new Error("catalog unavailable");
  const json = (await fallback.json()) as { programs: BotProgram[] };
  return json.programs ?? [];
}
