import { test } from "node:test";
import assert from "node:assert/strict";
import { argon2id, hash } from "argon2";
import { hashPassword, verifyPassword } from "../dist/index.js";

test("пароль проверяется, а случайная соль не повторяется", async () => {
  const password = "synthetic-password-for-tests";
  const first = await hashPassword(password), second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword(first, password), true);
  assert.equal(await verifyPassword(first, "wrong-password"), false);
});

test("PHC-хеш прежних параметров проверяется без миграции", async () => {
  const encoded = await hash("synthetic-legacy-password", { type: argon2id, memoryCost: 4096, timeCost: 3, parallelism: 4 });
  const before = encoded;
  assert.equal(await verifyPassword(encoded, "synthetic-legacy-password"), true);
  assert.equal(encoded, before);
});

test("пустые и повреждённые хеши не разрешают вход", async () => {
  for (const encoded of [null, "", "plaintext", "$argon2id$invalid"]) {
    assert.equal(await verifyPassword(encoded, "synthetic-password"), false);
  }
});
