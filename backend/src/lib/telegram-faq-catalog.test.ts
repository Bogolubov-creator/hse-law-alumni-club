import { afterEach, expect, it, vi } from "vitest";
vi.mock("./data.js", async () => (await import("../test/fake-data.js")).dataModuleMock);
vi.mock("./faq-events.js", () => ({ logFaqEvent: vi.fn() }));
const { dataModuleMock, resetDb } = await import("../test/fake-data.js");
const { answerTelegramFaq } = await import("./site-faq-telegram.js");
afterEach(() => vi.restoreAllMocks());
it("обычный FAQ отвечает без чтения каталога", async () => {
  const spy = vi.spyOn(dataModuleMock.data, "request");
  expect(await answerTelegramFaq("как вступить в клуб")).toContain("Подробнее");
  expect(spy).not.toHaveBeenCalled();
});
it("длительность даже вместе с FAQ читает каталог и сохраняет приоритет ответа", async () => {
  resetDb({ programs: [{ id: "1", slug: "law", title: "Право", status: "published", document: "Удостоверение", duration: "2 недели", price: 10000 }] });
  const spy = vi.spyOn(dataModuleMock.data, "request");
  const answer = await answerTelegramFaq("как вступить в клуб и сколько длится обучение");
  expect(spy).toHaveBeenCalledTimes(1);
  expect(answer).toContain("2 недели");
});
