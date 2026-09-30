import { createHash } from "node:crypto";

// Повтор запроса по одной заявке должен использовать тот же ключ ЮKassa.
export function orderIdempotenceKey(orderNumber: string): string {
  return createHash("sha256").update(`order:${orderNumber}`).digest("hex").slice(0, 36);
}
