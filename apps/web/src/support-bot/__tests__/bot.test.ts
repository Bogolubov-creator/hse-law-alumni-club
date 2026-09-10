import { describe, it, expect } from "vitest";
import { parseQuery, search, stem } from "../bot-match.js";
import { detectIntent, findByTriggers, reply, triggerMatches, tokenize } from "../bot-reply.js";
import type { BotProgram, BotReplyData } from "../types.js";

const PROGRAMS: BotProgram[] = [
  {
    id: "1", title: "Актуальные вопросы налогового администрирования",
    url: "/dpo/tax", sphere: "Финансовое право", type: "ПК", format: "online",
    price: 22000, duration: "5 недель", start: "Старт: 5 октября", keywords: ["Налоговые споры", "Юристы"],
  },
  {
    id: "2", title: "Английское контрактное право",
    url: "/dpo/en", sphere: "Международное право", type: "ПК", format: "offline",
    price: 60000, duration: "3 месяца", start: null, keywords: ["Договорная работа", "Юристы"],
  },
  {
    id: "3", title: "Банкротство юридических лиц",
    url: "/dpo/bank", sphere: "Корпоративное и договорное право", type: "ПП", format: "mixed",
    price: 45000, duration: "6 месяцев", start: "Старт: 1 ноября", keywords: ["Несостоятельность", "Предприниматели"],
  },
];

describe("bot-match", () => {
  it("сводит словоформы", () => {
    const base = stem("налоги");
    expect(stem("налоговый").startsWith(base) || base.startsWith(stem("налоговый"))).toBe(true);
  });

  it("находит по названию", () => {
    const out = search("банкротство", PROGRAMS);
    expect(out.reason).toBe("title");
    expect(out.programs.map((p) => p.id)).toEqual(["3"]);
  });

  it("читает цену и формат", () => {
    const q = parseQuery("онлайн дешевле 30 тысяч");
    expect(q.priceMax).toBe(30000);
    expect(q.format).toBe("online");
  });
});

describe("bot-reply club+dpo", () => {
  const data: BotReplyData = {
    programs: PROGRAMS,
    answers: [
      {
        id: "join",
        triggers: ["как вступить", "вступить в клуб", "заявка"],
        text: "Подайте заявку – учебный офис сверит выпуск с реестром.",
        anchor: "/join",
      },
      {
        id: "podcast",
        triggers: ["подкаст", "подкасты", "правовая грамотность"],
        text: "Пробный выпуск открыт всем, остальные – по годовой подписке.",
        anchor: "/podcasts",
      },
    ],
    gaps: [{ id: "payment", triggers: ["как оплатить", "оплата"] }],
    duration: { id: "duration", triggers: ["сколько длится", "длительность"], anchor: "/dpo" },
  };

  it("отвечает на вступление", () => {
    const r = reply("как вступить в клуб", data);
    expect(r.kind).toBe("answer");
    if (r.kind === "answer") expect(r.answer.id).toBe("join");
  });

  it("отвечает про подкасты", () => {
    const r = reply("подкасты", data);
    expect(r.kind).toBe("answer");
    if (r.kind === "answer") expect(r.answer.id).toBe("podcast");
  });

  it("эскалирует gap оплаты", () => {
    const r = reply("как оплатить", data);
    expect(r.kind).toBe("gap");
  });

  it("detectIntent для цены", () => {
    expect(detectIntent("сколько стоит")).toBe("priceRange");
  });

  it("triggerMatches требует все слова", () => {
    const tokens = tokenize("как вступить в клуб");
    expect(triggerMatches("как вступить", tokens)).toBe(true);
    expect(findByTriggers(tokens, data.answers)?.id).toBe("join");
  });
});
