import { computeMemberDiscount } from "./gamification.js";

// Чистая денежная математика заявки (копейки). Тестируема без Directus.
export interface PricedLine { price: number; qty: number }

export function computeOrderTotals(items: PricedLine[], discountPercent: number): { subtotal: number; discount: number; total: number } {
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const discount = Math.max(0, Math.min(100, discountPercent));
  const total = Math.max(0, subtotal - Math.round((subtotal * discount) / 100));
  return { subtotal, discount, total };
}

/** Справочная скидка применяется только верифицированному выпускнику. */
export function effectiveDiscount(verified: boolean, points: number, personalDiscount: number): number {
  return verified ? computeMemberDiscount(points, personalDiscount) : 0;
}

export function orderNumber(year: number, count: number, attempt = 0): string {
  return `ALU-${year}-${String(count + 1 + attempt).padStart(6, "0")}`;
}

/** Переоценка позиций по актуальному каталогу; нет в каталоге — оставляем снимок. */
export function repriceItems<T extends { type: "dpo" | "merch"; ref_id: string; price: number; title: string }>(
  items: T[],
  lookup: (type: "dpo" | "merch", ref: string) => { title: string; price: number } | null | undefined,
): T[] {
  return items.map((i) => {
    const info = lookup(i.type, i.ref_id);
    return info ? { ...i, price: info.price, title: info.title } : i;
  });
}
