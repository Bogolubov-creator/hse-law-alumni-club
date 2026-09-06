import { describe, it, expect } from "vitest";
import {
  esc,
  parseCommand,
  formatPointsReply,
  formatCalendarReply,
  formatStartReply,
  formatHelpReply,
} from "./telegram-bot-text";

const URL = "http://localhost";

describe("esc", () => {
  it("экранирует все 4 спецсимвола HTML", () => {
    expect(esc(`&<>"`)).toBe("&amp;&lt;&gt;&quot;");
  });

  it("экранирует комбинации, амперсанд – первым (без двойного экранирования)", () => {
    expect(esc(`<a href="x?a=1&b=2">&`)).toBe("&lt;a href=&quot;x?a=1&amp;b=2&quot;&gt;&amp;");
  });

  it("обычный текст проходит без изменений", () => {
    expect(esc("Иван Петров")).toBe("Иван Петров");
  });
});

describe("parseCommand", () => {
  it("разбирает /start@bot с аргументом", () => {
    expect(parseCommand("/start@pravohse_alumni_bot SERGEY2026")).toEqual({ cmd: "/start", arg: "SERGEY2026" });
  });

  it("разбирает /points без аргументов", () => {
    expect(parseCommand("/points")).toEqual({ cmd: "/points", arg: "" });
  });

  it("игнорирует обычный текст", () => {
    expect(parseCommand("привет")).toEqual({ cmd: "", arg: "" });
  });
});

describe("formatPointsReply", () => {
  it("показывает уровень верифицированному выпускнику", () => {
    const text = formatPointsReply({ fio: "Сергей", verification_status: "verified", points_cached: 240, personal_discount: 0 }, URL);
    expect(text).toContain("Друг клуба");
    expect(text).toContain("240");
    expect(text).toContain("10%");
  });

  it("сообщает об ожидании верификации", () => {
    const text = formatPointsReply({ fio: "Алина", verification_status: "pending", points_cached: 0, personal_discount: 0 }, URL);
    expect(text).toContain("на проверке");
    expect(text).not.toContain("Уровень:");
  });

  it("отклонённому честно говорит об отказе, а не «на проверке»", () => {
    const text = formatPointsReply({ fio: "Олег", verification_status: "rejected", points_cached: 0, personal_discount: 0 }, URL);
    expect(text).toContain("Заявка отклонена");
    expect(text).toContain("учебный офис");
    expect(text).not.toContain("на проверке");
    expect(text).not.toContain("Уровень:");
  });

  it("экранирует HTML в ФИО", () => {
    const text = formatPointsReply({ fio: `<b>Иван "X"</b>`, verification_status: "verified", points_cached: 10, personal_discount: 0 }, URL);
    expect(text).toContain("&lt;b&gt;Иван &quot;X&quot;&lt;/b&gt;");
    expect(text).not.toContain(`<b>Иван`);
  });
});

describe("formatCalendarReply", () => {
  it("пустая афиша", () => {
    expect(formatCalendarReply([], URL)).toContain("Ближайших событий пока нет");
  });

  it("список событий", () => {
    const text = formatCalendarReply([{
      title: "Нетворкинг", starts_at: "2026-08-01T18:00:00.000Z",
      location: "ВШЭ", format: "offline", going: 3, my_rsvp: true,
    }], URL);
    expect(text).toContain("Нетворкинг");
    expect(text).toContain("вы идёте");
  });
});

describe("formatStartReply", () => {
  it("реферальная ссылка в /start", () => {
    const text = formatStartReply("SERGEY2026", false, URL);
    expect(text).toContain("ref=SERGEY2026");
    expect(text).toContain("Привязать Telegram");
  });
});

describe("formatHelpReply", () => {
  it("перечисляет команды", () => {
    const text = formatHelpReply(URL);
    expect(text).toContain("/points");
    expect(text).toContain("/calendar");
  });
});
