import { describe, expect, it } from "vitest";
import { BOT_FAQ, reply } from "@club/shared";
import { formatHelpReply } from "./telegram-bot-text.js";

describe("telegram FAQ bridge", () => {
  it("help упоминает свободный текст", () => {
    expect(formatHelpReply("http://localhost:5274")).toMatch(/вопрос текстом/i);
  });

  it("FAQ join совпадает с сайтом", () => {
    const r = reply("как вступить в клуб", { programs: [], ...BOT_FAQ });
    expect(r.kind).toBe("answer");
    if (r.kind === "answer") expect(r.answer.id).toBe("join");
  });
});
