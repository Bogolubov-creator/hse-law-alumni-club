import { createHash } from "node:crypto";

/**
 * Детерминированный ключ идемпотентности по номеру заявки — для заголовка
 * Idempotence-Key ЮKassa: повтор запроса (ретрай/двойной клик) по той же заявке
 * не создаёт дубль платежа (ЮKassa вернёт тот же платёж). Env не требуется —
 * выделено отдельно, чтобы покрывать unit-тестами без загрузки конфигурации.
 */
export function orderIdempotenceKey(orderNumber: string): string {
  return createHash("sha256").update(`order:${orderNumber}`).digest("hex").slice(0, 36);
}
