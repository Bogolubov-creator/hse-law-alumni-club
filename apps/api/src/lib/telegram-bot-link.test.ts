import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Паттерн как в тестах роутов: SDK заменяем дескрипторами, клиент Directus –
// in-memory фейком, чтобы проверять настоящую логику buildBotReply.
vi.mock("@directus/sdk", async () => await import("../test/fake-sdk.js"));
vi.mock("../lib/directus.js", async () => (await import("../test/fake-directus.js")).directusModuleMock);

const { db, resetDb } = await import("../test/fake-directus.js");
const { buildBotReply, handleTelegramUpdate } = await import("./telegram-bot.js");
const { makeTgLinkCode } = await import("./tg-link.js");

const ID = "3a7c9b12-4f0e-4d21-9c55-8ab301c2de44";
const OTHER_ID = "00000000-0000-4000-8000-000000000000";
const TG = "777";

const alumniRow = (over: Record<string, any>) => ({
  id: ID, fio: "Иван Петров", telegram_id: null,
  verification_status: "verified", points_cached: 0, personal_discount: 0,
  ...over,
});

/** audit() пишет fire-and-forget – даём микротаскам прокрутиться. */
const flushAudit = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
  resetDb({ alumni: [alumniRow({})], audit_log: [] });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildBotReply: привязка по /start l-<код>", () => {
  it("экранирует ФИО в ответе (parse_mode=HTML) и пишет аудит", async () => {
    resetDb({ alumni: [alumniRow({ fio: `<b>Иван "Хакер"</b> & Co` })], audit_log: [] });
    const reply = await buildBotReply("/start", makeTgLinkCode(ID), TG);
    expect(reply).toContain("&lt;b&gt;Иван &quot;Хакер&quot;&lt;/b&gt; &amp; Co");
    expect(reply).not.toContain(`<b>Иван`);
    expect(db.alumni![0]!.telegram_id).toBe(TG);
    await flushAudit();
    const link = db.audit_log!.filter((r) => r.event === "alumni.tg_link");
    expect(link).toHaveLength(1);
    expect(link[0]!.actor).toBe(`alumni:${ID}`);
    expect(link[0]!.detail).toMatchObject({ telegram_id: TG });
  });

  it("перепривязка снимает tgId с чужой записи и аудитит оба действия", async () => {
    resetDb({
      alumni: [alumniRow({}), alumniRow({ id: OTHER_ID, fio: "Борис", telegram_id: TG })],
      audit_log: [],
    });
    await buildBotReply("/start", makeTgLinkCode(ID), TG);
    expect(db.alumni!.find((r) => r.id === ID)!.telegram_id).toBe(TG);
    expect(db.alumni!.find((r) => r.id === OTHER_ID)!.telegram_id).toBeNull();
    await flushAudit();
    const events = db.audit_log!.map((r) => r.event);
    expect(events).toContain("alumni.tg_link");
    expect(events).toContain("alumni.tg_unlink_reassigned");
    const unlink = db.audit_log!.find((r) => r.event === "alumni.tg_unlink_reassigned")!;
    expect(unlink.subject).toBe(`alumni:${OTHER_ID}`);
  });

  it("невалидный код привязки не привязывает и не падает", async () => {
    const reply = await buildBotReply("/start", "l" + "x".repeat(42), TG);
    expect(reply).toContain("Клуб выпускников"); // обычное приветствие
    expect(db.alumni![0]!.telegram_id).toBeNull();
    await flushAudit();
    expect(db.audit_log!).toHaveLength(0);
  });
});

describe("handleTelegramUpdate: тип чата", () => {
  const update = (type: string) => ({
    update_id: 1,
    message: { message_id: 1, text: "/help", chat: { id: -100500, type }, from: { id: 42 } },
  });

  it("в групповом чате бот молчит – ни одного sendMessage", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await handleTelegramUpdate(update("group"), "token");
    await handleTelegramUpdate(update("supergroup"), "token");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("в личном чате отвечает", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }) as Response);
    vi.stubGlobal("fetch", fetchMock);
    await handleTelegramUpdate(update("private"), "token");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/sendMessage");
    expect(JSON.parse(String((init as any).body)).text).toContain("/points");
  });
});
