import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@directus/sdk", async () => await import("../test/fake-sdk.js"));
vi.mock("./directus.js", async () => (await import("../test/fake-directus.js")).directusModuleMock);
vi.mock("./site-faq-telegram.js", () => ({ answerTelegramFaq: vi.fn(async () => "Ответ FAQ") }));
const { db, resetDb, directusModuleMock } = await import("../test/fake-directus.js");
const { handleTelegramUpdate, buildBotReply, registerBotCommands } = await import("./telegram-bot.js");
vi.mock("./tg-link.js", () => ({ consumeTgLinkCode: vi.fn() }));
const { consumeTgLinkCode } = await import("./tg-link.js");
const { answerTelegramFaq } = await import("./site-faq-telegram.js");
const { BOT_COMMANDS } = await import("./telegram-bot-text.js");
const owner = "3a7c9b12-4f0e-4d21-9c55-8ab301c2de44";
const send = vi.fn(async () => new Response('{}', { status: 200 }));
const update = (text: string, type = "private") => ({ update_id: 1, message: { message_id: 1, text, chat: { id: 42, type }, from: { id: 42 } } });
beforeEach(() => { resetDb(); vi.clearAllMocks(); vi.stubGlobal("fetch", send); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it.each(["group", "supergroup", "channel"])("не читает профиль и не отвечает в %s", async type => {
  const read = vi.spyOn(directusModuleMock.directus, "request");
  for (const text of ["/points", "/start " + "l" + "x".repeat(32), "/calendar", "как вступить"]) await handleTelegramUpdate(update(text, type), "test-token");
  expect(read).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled(); expect(answerTelegramFaq).not.toHaveBeenCalled();
});
it("привязка экранирует имя после атомарного подтверждения", async () => {
  vi.mocked(consumeTgLinkCode).mockResolvedValueOnce({ fio: '<b>Иван & "тест"</b>' });
  const reply = await buildBotReply("/start", "l" + "x".repeat(32), "42");
  expect(reply).toContain("&lt;b&gt;Иван &amp; &quot;тест&quot;&lt;/b&gt;");
});
it("использованная ссылка не сообщает об успешной привязке", async () => {
  vi.mocked(consumeTgLinkCode).mockResolvedValueOnce(null);
  expect(await buildBotReply("/start", "l" + "x".repeat(32), "42")).toContain("истекла");
});
it("личные баллы берутся только по Telegram отправителя", async () => {
  resetDb({ alumni: [{ id: owner, telegram_id: "42", fio: "Свой", verification_status: "verified", points_cached: 240, personal_discount: 0 }, { id: "other", telegram_id: "99", fio: "Чужой", points_cached: 999 }] });
  await handleTelegramUpdate(update("/points"), "test-token");
  const body = JSON.parse((send.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
  expect(body.chat_id).toBe(42); expect(body.text).toContain("Свой"); expect(body.text).not.toContain("Чужой");
});
it("меню, переходы, FAQ и неизвестные команды отвечают", async () => {
  for (const cmd of ["/cabinet", "/dpo", "/support"]) expect(await buildBotReply(cmd, "", "42")).toContain('<a href=');
  await handleTelegramUpdate(update("вопрос про клуб"), "test-token");
  expect(answerTelegramFaq).toHaveBeenCalledWith("вопрос про клуб");
  await handleTelegramUpdate(update("/unknown"), "test-token");
  expect(JSON.stringify(send.mock.calls)).toContain("Не знаю такой команды");
  await registerBotCommands("test-token");
  expect(JSON.stringify(send.mock.calls)).toContain(JSON.stringify(BOT_COMMANDS).replace(/"/g, '\\"'));
});
it("игнорирует команду, адресованную другому боту", async () => {
  await handleTelegramUpdate(update("/help@other_bot"), "test-token"); expect(send).not.toHaveBeenCalled();
});
it("календарь отмечает только свои записи и скрывает прошедшее", async () => {
  resetDb({ alumni: [{ id: owner, telegram_id: "42" }], events: [
    { id: "next", title: "Встреча", status: "published", starts_at: "2099-01-01T15:00:00Z", format: "online" },
    { id: "old", title: "Прошедшее", status: "published", starts_at: "2000-01-01T15:00:00Z" },
  ], event_rsvps: [{ event_id: "next", alumni_id: owner }, { event_id: "next", alumni_id: "other" }] });
  const text = await buildBotReply("/calendar", "", "42");
  expect(text).toContain("вы идёте"); expect(text).toContain("2 чел."); expect(text).not.toContain("Прошедшее");
});

it("production добавляет кнопку запуска мини-приложения", async () => {
  const { env } = await import("../env.js");
  const previous = { APP_ENV: env.APP_ENV, PUBLIC_URL: env.PUBLIC_URL };
  try {
    Object.assign(env, { APP_ENV: "production", PUBLIC_URL: "https://club.test" });
    await registerBotCommands("test-token");
    expect(JSON.stringify(send.mock.calls)).toContain("setChatMenuButton");
    expect(JSON.stringify(send.mock.calls)).toContain("https://club.test/tg");
  } finally { Object.assign(env, previous); }
});
