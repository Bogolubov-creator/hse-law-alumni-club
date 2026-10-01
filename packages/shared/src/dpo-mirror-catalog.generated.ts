import catalog from "./dpo-catalog.json" with { type: "json" };
import type { ProgramSeed } from "./seeds.js";

export const DPO_MIRROR_PROGRAMS = catalog as ProgramSeed[];
