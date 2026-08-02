import { describe, it, expect } from "vitest";
import { orderIdempotenceKey } from "./idempotency.js";

describe("orderIdempotenceKey – ключ идемпотентности платежа", () => {
  it("детерминирован: одинаковый номер → одинаковый ключ", () => {
    expect(orderIdempotenceKey("ALU-2026-000001")).toBe(orderIdempotenceKey("ALU-2026-000001"));
  });
  it("разные заявки → разные ключи", () => {
    expect(orderIdempotenceKey("ALU-2026-000001")).not.toBe(orderIdempotenceKey("ALU-2026-000002"));
  });
  it("формат: 36 hex-символов (лимит заголовка ЮKassa)", () => {
    const k = orderIdempotenceKey("ALU-2026-000001");
    expect(k).toHaveLength(36);
    expect(k).toMatch(/^[0-9a-f]{36}$/);
  });
});
