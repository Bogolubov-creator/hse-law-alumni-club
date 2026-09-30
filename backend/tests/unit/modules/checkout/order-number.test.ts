import { describe, it, expect } from "vitest";
import { isUniqueViolation } from "../../../../src/modules/checkout/order-number.js";

describe("isUniqueViolation – ретраить со следующим номером можно только коллизию", () => {
  it("коллизия PostgreSQL распознаётся независимо от текста ошибки", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation(Object.assign(new Error("Номер занят"), { code: "23505" }))).toBe(true);
  });
  it("текст без SQLSTATE и другие ограничения не разрешают повтор", () => {
    expect(isUniqueViolation(new Error("timeout while checking duplicate key"))).toBe(false);
    expect(isUniqueViolation({ code: "23503", message: "unique constraint" })).toBe(false);
    expect(isUniqueViolation({ errors: [{ extensions: { code: "RECORD_NOT_UNIQUE" } }] })).toBe(false);
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
