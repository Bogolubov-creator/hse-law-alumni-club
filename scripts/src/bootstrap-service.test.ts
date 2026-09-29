import { test } from "node:test";
import assert from "node:assert/strict";
import { ensureServiceCredentials } from "./bootstrap-service.js";

const role = "service-role";
const token = "synthetic-service-token";
const existing = { id: "service-user", role, token, status: "active" };

test("повторный bootstrap сохраняет пароль, роль и токен", async () => {
  let writes = 0;
  let checked = false;
  let logins = 0;
  const store = {
    find: async () => existing,
    create: async () => { writes++; return { id: "new" }; },
    updatePassword: async () => { writes++; },
    legacyPasswordWorks: async () => { logins++; return false; },
    passwordChecked: async () => checked,
    markPasswordChecked: async () => { checked = true; },
  };
  assert.equal(await ensureServiceCredentials(store, role, token), "unchanged");
  assert.equal(await ensureServiceCredentials(store, role, token), "unchanged");
  assert.equal(writes, 0);
  assert.equal(logins, 1);
});

test("новый пароль случайный, а старый password=token исправляется один раз", async () => {
  let password = token;
  let rotations = 0;
  let checked = false;
  const store = {
    find: async () => existing,
    create: async () => { throw new Error("unexpected create"); },
    updatePassword: async (_id: string, value: string) => { password = value; rotations++; },
    legacyPasswordWorks: async () => password === token,
    passwordChecked: async () => checked,
    markPasswordChecked: async () => { checked = true; },
  };
  assert.equal(await ensureServiceCredentials(store, role, token), "legacy-password-rotated");
  assert.equal(password.length, 64);
  assert.notEqual(password, token);
  assert.equal(await ensureServiceCredentials(store, role, token), "unchanged");
  assert.equal(rotations, 1);
});

test("bootstrap не заменяет вручную изменённые credentials и права", async () => {
  for (const changed of [{ ...existing, token: "different" }, { ...existing, role: "other" }, { ...existing, status: "suspended" }]) {
    let writes = 0;
    await assert.rejects(ensureServiceCredentials({
      find: async () => changed,
      create: async () => { writes++; return { id: "new" }; },
      updatePassword: async () => { writes++; },
      legacyPasswordWorks: async () => { throw new Error("unexpected login"); },
      passwordChecked: async () => false,
      markPasswordChecked: async () => {},
    }, role, token));
    assert.equal(writes, 0);
  }
});

test("новый service создаётся без общего пароля с токеном", async () => {
  let created: { password: string; role: string; token: string } | undefined;
  assert.equal(await ensureServiceCredentials({
    find: async () => undefined,
    create: async credentials => { created = credentials; return { id: "new" }; },
    updatePassword: async () => { throw new Error("unexpected update"); },
    legacyPasswordWorks: async () => { throw new Error("unexpected login"); },
    passwordChecked: async () => false,
    markPasswordChecked: async () => {},
  }, role, token), "created");
  assert.equal(created?.role, role);
  assert.equal(created?.token, token);
  assert.equal(created?.password.length, 64);
  assert.notEqual(created?.password, token);
});
