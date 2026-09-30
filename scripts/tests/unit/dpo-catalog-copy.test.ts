import { test } from "node:test";
import assert from "node:assert/strict";
import type { ProgramSeed } from "@club/shared/seeds";
import { retainProgramCopy } from "../../src/dpo-catalog-copy.js";

const previous: ProgramSeed = {
  hse_id: "472681893", slug: "copyright", title: "Авторское право",
  direction: "Право", format: "online", duration: "4 недели", price: 100000,
  dates: { start: "1 сентября 2026" }, enrollment: "nonactual",
  description: "Охрана и использование авторских прав.", tagline: "Авторское право для юристов",
  advantages: [], audience: ["Юристы"], results: ["Анализ договоров"],
};
const incoming: ProgramSeed = {
  ...previous, price: 120000, dates: { start: "1 октября 2026" }, enrollment: "actual",
  description: "Описание источника", tagline: "Подпись источника",
  advantages: ["Преимущество источника"], audience: ["Слушатели"], results: ["Результат источника"],
};

test("импорт сохраняет редактуру и обновляет цену, дату и набор", () => {
  const result = retainProgramCopy(incoming, previous);
  assert.equal(result.description, previous.description);
  assert.equal(result.tagline, previous.tagline);
  assert.deepEqual(result.advantages, []);
  assert.deepEqual(result.audience, previous.audience);
  assert.deepEqual(result.results, previous.results);
  assert.equal(result.price, incoming.price);
  assert.deepEqual(result.dates, incoming.dates);
  assert.equal(result.enrollment, "actual");
  assert.equal(incoming.description, "Описание источника");
});

test("новая программа и другая программа не наследуют чужую редактуру", () => {
  assert.equal(retainProgramCopy(incoming), incoming);
  assert.equal(retainProgramCopy(incoming, { ...previous, hse_id: "856421092" }), incoming);
  assert.equal(retainProgramCopy({ ...incoming, hse_id: undefined }, previous).description, incoming.description);
});

test("отсутствующее описание дополняется из источника", () => {
  const result = retainProgramCopy(incoming, { ...previous, description: undefined });
  assert.equal(result.description, incoming.description);
  assert.deepEqual(result.advantages, []);
});
