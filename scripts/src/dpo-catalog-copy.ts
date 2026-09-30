import type { ProgramSeed } from "@club/shared/seeds";

export function retainProgramCopy(incoming: ProgramSeed, previous?: ProgramSeed): ProgramSeed {
  if (!incoming.hse_id || previous?.hse_id !== incoming.hse_id) return incoming;
  return {
    ...incoming,
    description: previous.description ?? incoming.description,
    tagline: previous.tagline ?? incoming.tagline,
    audience: previous.audience ?? incoming.audience,
    results: previous.results ?? incoming.results,
    advantages: previous.advantages ?? incoming.advantages,
  };
}
