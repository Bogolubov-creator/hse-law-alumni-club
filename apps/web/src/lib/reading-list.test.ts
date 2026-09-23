// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseReading, toggleSaved, validItem } from "./reading-list.js";
const item = { kind: "change" as const, id: "tg-9", title: "Правовая справка", path: "/changes/tg-9", at: 1000 };
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
describe("Сохранённые материалы", () => {
  it("сохраняет, не дублирует и удаляет запись", () => {
    expect(toggleSaved(item)).toBe(true);
    expect(parseReading(localStorage.getItem("club-reading-v1")).saved).toEqual([item]);
    expect(toggleSaved(item)).toBe(true);
    expect(parseReading(localStorage.getItem("club-reading-v1")).saved).toEqual([]);
  });
  it("не допускает внешние адреса, чужие маршруты и пустые заголовки", () => {
    expect(validItem({ ...item, path: "https://evil.test" })).toBe(false);
    expect(validItem({ ...item, path: "/lk/profile" })).toBe(false);
    expect(validItem({ ...item, title: "" })).toBe(false);
    expect(parseReading(JSON.stringify({ saved: [item, item, { ...item, path: "javascript:alert(1)" }], recent: [], read: [] })).saved).toEqual([item]);
  });
  it("сбой записи и повреждённые данные не дают ложного успеха", () => {
    localStorage.setItem("club-reading-v1", "broken");
    expect(toggleSaved(item)).toBe(false);
    expect(localStorage.getItem("club-reading-v1")).toBe("broken");
    localStorage.clear();
    vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new Error("quota"); });
    expect(toggleSaved(item)).toBe(false);
  });
});
