import { test } from "node:test";
import assert from "node:assert/strict";
import { manageStaff, validateStaffInput, type StaffInput } from "../../src/manage-staff.js";

const input: StaffInput = { action: "create", email: "Office@Example.Test", role: "editor", password: "synthetic-staff-password" };
test("операторская команда принимает только явный режим, роль и сильный пароль", () => {
  assert.equal(validateStaffInput(input).email, "office@example.test");
  for (const change of [{ action: "upsert" }, { role: "alumni" }, { email: "bad" }, { password: "short" }, { password: "long-enough\npassword" }]) {
    assert.throws(() => validateStaffInput({ ...input, ...change } as StaffInput));
  }
});
test("невалидный ввод не обращается к БД", async () => {
  let calls = 0;
  await assert.rejects(manageStaff({ query: async () => { calls++; throw new Error("Unexpected SQL"); } }, { ...input, role: "service" } as unknown as StaffInput));
  assert.equal(calls, 0);
});
