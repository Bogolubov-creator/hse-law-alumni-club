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
 * Потолок количества по одной позиции. Тот же, что в cartItemSchema, но здесь он
 * ограничивает НАКОПЛЕННОЕ значение: схема проверяет только одно тело запроса,
 * а повторные добавления по 99 суммировались без предела (99 → 198 → 297 …).
 */
export const MAX_LINE_QTY = 99;
/** Потолок числа разных позиций в корзине: items_json не должен расти безгранично. */
export const MAX_CART_LINES = 30;

/**
 * Добавить позицию: если такая (type+ref+variant) уже есть — увеличить qty, иначе добавить.
 * ДПО — это заявка на одно место: qty всегда 1, повторное добавление не увеличивает.
 * Количество по позиции ограничено MAX_LINE_QTY, число позиций — MAX_CART_LINES.
 */
export function addLine(items: StoredCartItem[], line: StoredCartItem): StoredCartItem[] {
  const ex = items.find((i) => sameLine(i, line.type, line.ref_id, line.variant_sku));
  if (line.type === "dpo") {
    if (ex) return items; // уже в заявке — одно место
    if (items.length >= MAX_CART_LINES) return items;
    return [...items, { ...line, qty: 1 }];
  }
  if (ex) return items.map((i) => (i === ex ? { ...i, qty: Math.min(MAX_LINE_QTY, i.qty + line.qty) } : i));
  if (items.length >= MAX_CART_LINES) return items;
  return [...items, { ...line, qty: Math.min(MAX_LINE_QTY, line.qty) }];
}

/** Установить количество позиции; qty<=0 — удалить. ДПО — всегда 1 место (канон). */
export function setLineQty(items: StoredCartItem[], ref: string, sku: string | null | undefined, qty: number): StoredCartItem[] {
  const matches = (i: StoredCartItem) => i.ref_id === ref && (i.variant_sku ?? null) === (sku ?? null);
  if (qty <= 0) return items.filter((i) => !matches(i));
  return items.map((i) => (matches(i) ? { ...i, qty: i.type === "dpo" ? 1 : Math.min(MAX_LINE_QTY, qty) } : i));
}

/** Достигнут ли потолок позиций (для честного ответа роутом, а не тихого игнора). */
export function cartLineLimitReached(items: StoredCartItem[], line: { type: string; ref_id: string; variant_sku?: string | null }): boolean {
  const ex = items.find((i) => sameLine(i, line.type, line.ref_id, line.variant_sku));
  return !ex && items.length >= MAX_CART_LINES;
}

export function summarizeCart(items: StoredCartItem[]): { items: StoredCartItem[]; count: number; subtotal: number } {
  return {
    items,
    count: items.reduce((s, i) => s + i.qty, 0),
    subtotal: items.reduce((s, i) => s + i.price * i.qty, 0),
  };
}
