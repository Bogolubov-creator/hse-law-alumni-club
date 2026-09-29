import { expect, it } from "vitest";
import { programToBot } from "./catalog.js";
it("сохраняет копейки, даты и дополнительные ключевые слова web-канала", () => {
  expect(programToBot({ id: "1", slug: "law", title: "Право", format: "онлайн", price: 123456, document: "Удостоверение", dates: { start: "октябрь" }, description: "Описание", modules: ["Модуль", { title: "Практика" }] })).toMatchObject({ price: 1235, format: "online", type: "ПК", start: "Старт: октябрь", keywords: ["Описание", "Модуль", "Практика"], url: "/dpo/law" });
});
it("программа без необязательных полей подходит обоим каналам", () => {
  expect(programToBot({ id: "2", slug: "law", title: "Переподготовка", price: null })).toMatchObject({ type: "ПП", format: "offline", price: null, duration: null, start: null, keywords: [] });
});
