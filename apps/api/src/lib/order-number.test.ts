import { describe, it, expect } from "vitest";
import { isUniqueViolation } from "./order-number.js";

describe("isUniqueViolation – ретраить со следующим номером можно только коллизию", () => {
  it("Directus code RECORD_NOT_UNIQUE → true", () => {
    expect(isUniqueViolation({ errors: [{ extensions: { code: "RECORD_NOT_UNIQUE" } }] })).toBe(true);
  });
  it("текст постгрес-констрейнта (как в fake-directus) → true", () => {
    expect(isUniqueViolation(new Error("duplicate key value violates unique constraint (orders.number)"))).toBe(true);
  });
  it("таймаут/сеть → false (не ретраим, иначе дубль заявки)", () => {
    expect(isUniqueViolation(new Error("network timeout"))).toBe(false);
    expect(isUniqueViolation(new Error("ECONNRESET"))).toBe(false);
  });
  it("не-ошибка / undefined → false", () => {
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});
