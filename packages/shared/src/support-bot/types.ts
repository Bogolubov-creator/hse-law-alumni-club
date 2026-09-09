/** Программа в формате бота поддержки (как content/bot-catalog.json у ДПО). */
export type BotProgram = {
  id: string;
  title: string;
  url: string;
  sphere: string;
  type: string; // ПК | ПП | ""
  format: "online" | "offline" | "mixed" | "hybrid" | string;
  formatLabel?: string;
  price: number | null; // рубли
  duration: string | null;
  start: string | null;
  startIso?: string | null;
  keywords: string[];
};

export type BotFaqAnswer = {
  id: string;
  triggers: string[];
  text: string;
  anchor: string;
};

export type BotFaqGap = {
  id: string;
  triggers: string[];
};

export type BotFaqData = {
  answers: BotFaqAnswer[];
  duration?: { id: string; triggers: string[]; anchor: string; note?: string };
  gaps: BotFaqGap[];
};

export type BotReplyData = BotFaqData & { programs: BotProgram[] };

export type ParsedQuery = {
  stems: string[];
  priceMax: number | null;
  priceMin: number | null;
  format: string | null;
  type: string | null;
};

export type SearchResult = {
  reason: "empty" | "title" | "keywords" | "filter" | "none";
  programs: BotProgram[];
};

export type BotReply =
  | { kind: "duration"; text: string; anchor: string; extra?: BotProgram[] }
  | { kind: "answer"; answer: BotFaqAnswer; extra?: BotProgram[] }
  | { kind: "gap"; gap: BotFaqGap }
  | { kind: "programs"; intro: string; programs: BotProgram[] }
  | { kind: "programs-weak"; programs: BotProgram[] }
  | { kind: "none"; programs: BotProgram[] };
