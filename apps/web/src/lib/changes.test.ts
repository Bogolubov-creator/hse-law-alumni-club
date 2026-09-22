import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseChanges, selectChanges } from "./changes.js";

const archive = () => JSON.parse(readFileSync(new URL("../../public/data/changes.json", import.meta.url), "utf8"));
describe("Архив изменений", () => {
  it("принимает реквизиты, отбрасывает посторонние поля", () => {
    const raw = archive(); raw.items[0].draft = "Не публиковать";
    const data = parseChanges(raw);
    expect(data.items).toHaveLength(65);
    expect(data.items[0]).not.toHaveProperty("draft");
  });
  it.each(["https://example.com/document/0001202607040029", "javascript:alert(1)"])("отклоняет чужой адрес %s", url => {
    const raw = archive(); raw.items[0].url = url;
    expect(() => parseChanges(raw)).toThrow();
  });
  it("не принимает дубликаты, невозможные даты и неподтверждённое вступление в силу", () => {
    const raw = archive(); raw.items.push(raw.items[0]); expect(() => parseChanges(raw)).toThrow();
    const dates = archive(); dates.items[0].date = "2026-02-31"; expect(() => parseChanges(dates)).toThrow();
    const effective = archive(); effective.items[0].effectiveDate = "2026-07-04"; expect(() => parseChanges(effective)).toThrow();
  });
  it("ищет по всему архиву и совмещает фильтры", () => {
    const data = parseChanges(archive());
    const found = selectChanges(data.items, new URLSearchParams({ q: "237-ФЗ", from: "2026-07-04", to: "2026-07-04" }));
    expect(found).toHaveLength(1);
    expect(found[0]!.title).toContain("акционерных обществах");
    expect(selectChanges(data.items, new URLSearchParams({ q: "237-ФЗ", to: "2026-07-03" }))).toHaveLength(0);
  });
});
