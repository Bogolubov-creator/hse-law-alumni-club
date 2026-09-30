import { computeMemberDiscount } from "./gamification.js";

export interface PricedLine { type: "dpo" | "merch"; price: number; qty: number }

export function computeOrderTotals(
  items: PricedLine[],
  discountPercent: number,
): { subtotal: number; discount: number; discountAmount: number; total: number } {
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const discountBase = items.filter((i) => i.type === "dpo").reduce((s, i) => s + i.price * i.qty, 0);
  const discount = Math.max(0, Math.min(100, discountPercent));
  const discountAmount = Math.round((discountBase * discount) / 100);
  const total = Math.max(0, subtotal - discountAmount);
  return { subtotal, discount, discountAmount, total };
}

export function effectiveDiscount(verified: boolean, points: number, personalDiscount: number): number {
  return verified ? computeMemberDiscount(points, personalDiscount) : 0;
}

export function orderNumber(year: number, count: number, attempt = 0): string {
  return `ALU-${year}-${String(count + 1 + attempt).padStart(6, "0")}`;
}

// Исчезнувшая позиция сохраняет снимок; доступность проверяется при оформлении.
export function repriceItems<T extends { type: "dpo" | "merch"; ref_id: string; price: number; title: string }>(
  items: T[],
  lookup: (type: "dpo" | "merch", ref: string) => { title: string; price: number } | null | undefined,
): T[] {
  return items.map((i) => {
    const info = lookup(i.type, i.ref_id);
    return info ? { ...i, price: info.price, title: info.title } : i;
  });
}
