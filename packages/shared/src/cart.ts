// Чистые редьюсеры корзины (тестируемы без Directus). Хранимый снимок позиции.
export interface StoredCartItem {
  type: "dpo" | "merch";
  ref_id: string;
  variant_sku?: string | null;
  qty: number;
  price: number; // копейки (снимок)
  title: string;
}

export const sameLine = (a: StoredCartItem, type: string, ref: string, sku?: string | null): boolean =>
  a.type === type && a.ref_id === ref && (a.variant_sku ?? null) === (sku ?? null);

/**
 * Добавить позицию: если такая (type+ref+variant) уже есть — увеличить qty, иначе добавить.
 * ДПО — это заявка на одно место: qty всегда 1, повторное добавление не увеличивает.
 */
export function addLine(items: StoredCartItem[], line: StoredCartItem): StoredCartItem[] {
  const ex = items.find((i) => sameLine(i, line.type, line.ref_id, line.variant_sku));
  if (line.type === "dpo") {
    if (ex) return items; // уже в заявке — одно место
    return [...items, { ...line, qty: 1 }];
  }
  if (ex) return items.map((i) => (i === ex ? { ...i, qty: i.qty + line.qty } : i));
  return [...items, line];
}

/** Установить количество позиции; qty<=0 — удалить. */
export function setLineQty(items: StoredCartItem[], ref: string, sku: string | null | undefined, qty: number): StoredCartItem[] {
  const matches = (i: StoredCartItem) => i.ref_id === ref && (i.variant_sku ?? null) === (sku ?? null);
  return qty <= 0 ? items.filter((i) => !matches(i)) : items.map((i) => (matches(i) ? { ...i, qty } : i));
}

export function summarizeCart(items: StoredCartItem[]): { items: StoredCartItem[]; count: number; subtotal: number } {
  return {
    items,
    count: items.reduce((s, i) => s + i.qty, 0),
    subtotal: items.reduce((s, i) => s + i.price * i.qty, 0),
  };
}
