import { programsFromApi, type ClubProgramApi, type BotProgram } from "@club/shared";

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
