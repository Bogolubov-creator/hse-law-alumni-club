import { afterEach, expect, it, vi } from "vitest";
vi.mock("@directus/sdk", async () => await import("../test/fake-sdk.js"));
vi.mock("./directus.js", async () => (await import("../test/fake-directus.js")).directusModuleMock);
vi.mock("./faq-events.js", () => ({ logFaqEvent: vi.fn() }));
const { directusModuleMock, resetDb } = await import("../test/fake-directus.js");
const { answerTelegramFaq } = await import("./site-faq-telegram.js");
afterEach(() => vi.restoreAllMocks());
it("обычный FAQ отвечает без чтения каталога", async () => {
  const spy = vi.spyOn(directusModuleMock.directus, "request");
  expect(await answerTelegramFaq("как вступить в клуб")).toContain("Подробнее");
  expect(spy).not.toHaveBeenCalled();
});
it("длительность даже вместе с FAQ читает каталог и сохраняет приоритет ответа", async () => {
  resetDb({ programs: [{ id: "1", slug: "law", title: "Право", status: "published", document: "Удостоверение", duration: "2 недели", price: 10000 }] });
  const spy = vi.spyOn(directusModuleMock.directus, "request");
  const answer = await answerTelegramFaq("как вступить в клуб и сколько длится обучение");
  expect(spy).toHaveBeenCalledTimes(1);
  expect(answer).toContain("2 недели");
});
