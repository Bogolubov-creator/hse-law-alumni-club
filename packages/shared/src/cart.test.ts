import { describe, it, expect } from "vitest";
import { addLine, setLineQty, summarizeCart, type StoredCartItem } from "./cart";

const line = (over: Partial<StoredCartItem> = {}): StoredCartItem => ({
  type: "dpo", ref_id: "prog", qty: 1, price: 1000, title: "Прог", ...over,
});

describe("addLine", () => {
  it("мерч: повторное добавление того же увеличивает qty, не дублирует", () => {
    let items: StoredCartItem[] = [];
    items = addLine(items, line({ type: "merch", ref_id: "m", variant_sku: "M" }));
    items = addLine(items, line({ type: "merch", ref_id: "m", variant_sku: "M", qty: 2 }));
    expect(items).toHaveLength(1);
    expect(items[0]!.qty).toBe(3);
  });
  it("ДПО: заявка на одно место – повторное добавление не увеличивает qty", () => {
    let items: StoredCartItem[] = [];
    items = addLine(items, line());
    items = addLine(items, line({ qty: 2 }));
    expect(items).toHaveLength(1);
    expect(items[0]!.qty).toBe(1);
  });
  it("variant_sku undefined и null – одна позиция", () => {
    let items = addLine([], line({ type: "merch", ref_id: "m", variant_sku: undefined }));
    items = addLine(items, line({ type: "merch", ref_id: "m", variant_sku: null }));
    expect(items).toHaveLength(1);
    expect(items[0]!.qty).toBe(2);
  });
  it("разные варианты – разные позиции", () => {
    let items = addLine([], line({ type: "merch", ref_id: "m", variant_sku: "M" }));
    items = addLine(items, line({ type: "merch", ref_id: "m", variant_sku: "L" }));
    expect(items).toHaveLength(2);
  });
  it("мерч: накопление qty не превышает кап 99 (обход per-request валидации)", () => {
    let items = addLine([], line({ type: "merch", ref_id: "m", variant_sku: "M", qty: 60 }));
    items = addLine(items, line({ type: "merch", ref_id: "m", variant_sku: "M", qty: 60 }));
    expect(items[0]!.qty).toBe(99);
  });
});

describe("setLineQty", () => {
  it("qty=0 удаляет позицию", () => {
    const items = [line({ ref_id: "a" }), line({ ref_id: "b" })];
    expect(setLineQty(items, "a", null, 0)).toHaveLength(1);
  });
  it("qty=N устанавливает точное значение (мерч)", () => {
    expect(setLineQty([line({ type: "merch", ref_id: "a" })], "a", null, 5)[0]!.qty).toBe(5);
  });
  it("ДПО: qty не поднимается выше 1 даже через прямой PATCH (канон «одно место»)", () => {
    expect(setLineQty([line({ ref_id: "a" })], "a", null, 5)[0]!.qty).toBe(1);
  });
  it("несовпадающий ref – без изменений", () => {
    const items = [line({ ref_id: "a" })];
    expect(setLineQty(items, "z", null, 9)).toEqual(items);
  });
  it("type различает одинаковый slug у ДПО и мерча – меняется только нужная строка", () => {
    const items = [line({ type: "dpo", ref_id: "x" }), line({ type: "merch", ref_id: "x" })];
    const out = setLineQty(items, "x", null, 4, "merch");
    expect(out.find((i) => i.type === "merch")!.qty).toBe(4);
    expect(out.find((i) => i.type === "dpo")!.qty).toBe(1);
  });
});

describe("summarizeCart", () => {
  it("count и subtotal по смешанным количествам", () => {
    const r = summarizeCart([line({ qty: 2, price: 1000 }), line({ ref_id: "b", qty: 3, price: 500 })]);
    expect(r.count).toBe(5);
    expect(r.subtotal).toBe(2 * 1000 + 3 * 500);
  });
});
