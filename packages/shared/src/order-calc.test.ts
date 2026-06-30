import { describe, it, expect } from "vitest";
import { computeOrderTotals, effectiveDiscount, orderNumber, repriceItems } from "./order-calc";

describe("computeOrderTotals (копейки)", () => {
  it("сумма по нескольким позициям и количествам", () => {
    const r = computeOrderTotals([{ price: 4800000, qty: 1 }, { price: 420000, qty: 2 }], 0);
    expect(r.subtotal).toBe(5640000);
    expect(r.total).toBe(5640000);
  });
  it("скидка с округлением", () => {
    expect(computeOrderTotals([{ price: 999, qty: 1 }], 5).total).toBe(949); // 999 - round(49.95)=50
    expect(computeOrderTotals([{ price: 10000, qty: 1 }], 10).total).toBe(9000);
  });
  it("discount=0 → total==subtotal; total не отрицателен; пустой список → 0", () => {
    expect(computeOrderTotals([{ price: 5000, qty: 1 }], 0).total).toBe(5000);
    expect(computeOrderTotals([], 20)).toEqual({ subtotal: 0, discount: 20, total: 0 });
    expect(computeOrderTotals([{ price: 100, qty: 1 }], 200).total).toBe(0); // clamp 100%
  });
});

describe("effectiveDiscount (только верифицированным)", () => {
  it("неверифицированный/гость → 0", () => {
    expect(effectiveDiscount(false, 1000, 10)).toBe(0);
  });
  it("верифицированный → членская скидка (cap 25)", () => {
    expect(effectiveDiscount(true, 1000, 10)).toBe(25); // 20 + 10 → cap 25
    expect(effectiveDiscount(true, 0, 0)).toBe(5);
  });
});

describe("orderNumber", () => {
  it("формат и паддинг", () => {
    expect(orderNumber(2026, 0)).toBe("ALU-2026-000001");
    expect(orderNumber(2026, 41)).toBe("ALU-2026-000042");
  });
  it("смещение при повторе (гонка)", () => {
    expect(orderNumber(2026, 5, 1)).toBe("ALU-2026-000007");
  });
});

describe("repriceItems (анти-подмена цены)", () => {
  const items = [
    { type: "dpo" as const, ref_id: "a", price: 1, title: "X" },
    { type: "merch" as const, ref_id: "b", price: 1, title: "Y" },
  ];
  it("каталог переписывает подменённую клиентом цену", () => {
    const out = repriceItems(items, (t, r) => (r === "a" ? { title: "Программа", price: 4800000 } : { title: "Товар", price: 420000 }));
    expect(out[0]!.price).toBe(4800000);
    expect(out[0]!.title).toBe("Программа");
  });
  it("нет в каталоге → fallback на снимок", () => {
    const out = repriceItems(items, () => null);
    expect(out[0]!.price).toBe(1);
  });
});
