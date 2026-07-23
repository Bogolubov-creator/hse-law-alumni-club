import { describe, it, expect } from "vitest";
import { cartItemSchema } from "./order";

describe("cartItemSchema.qty — кап количества", () => {
  it("qty по умолчанию = 1", () => {
    const r = cartItemSchema.parse({ type: "merch", ref_id: "hoodie" });
    expect(r.qty).toBe(1);
  });

  it("принимает qty в допустимом диапазоне 1..99", () => {
    expect(cartItemSchema.parse({ type: "merch", ref_id: "x", qty: 1 }).qty).toBe(1);
    expect(cartItemSchema.parse({ type: "merch", ref_id: "x", qty: 99 }).qty).toBe(99);
  });

  it("отклоняет qty > 99 (защита от переполнения суммы)", () => {
    expect(cartItemSchema.safeParse({ type: "merch", ref_id: "x", qty: 100 }).success).toBe(false);
    expect(cartItemSchema.safeParse({ type: "merch", ref_id: "x", qty: 1e15 }).success).toBe(false);
  });

  it("отклоняет qty <= 0 и дробные", () => {
    expect(cartItemSchema.safeParse({ type: "merch", ref_id: "x", qty: 0 }).success).toBe(false);
    expect(cartItemSchema.safeParse({ type: "merch", ref_id: "x", qty: -3 }).success).toBe(false);
    expect(cartItemSchema.safeParse({ type: "merch", ref_id: "x", qty: 2.5 }).success).toBe(false);
  });
});
