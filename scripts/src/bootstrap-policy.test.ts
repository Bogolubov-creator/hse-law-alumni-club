import { test } from "node:test";
import assert from "node:assert/strict";
import { ensureInitialPolicy } from "./bootstrap-policy.js";

test("сбой после создания политики продолжает первичную настройку при повторе", async () => {
  let policy: { id: string } | undefined;
  let pending: string | undefined;
  let fail = true, created = 0, initialized = 0;
  const permissions = new Set<string>();
  let attached = false;
  const store = {
    findPolicy: async () => policy,
    findPending: async () => pending,
    startPending: async () => { pending = "marker"; return pending; },
    createPolicy: async () => {
      assert.equal(pending, "marker");
      created++;
      policy = { id: "policy" };
      return policy;
    },
    initializePolicy: async () => {
      initialized++;
      permissions.add("read");
      if (fail) throw new Error("Injected failure after policy creation");
      permissions.add("update");
      attached = true;
    },
    finishPending: async (id: string) => {
      assert.equal(id, pending);
      assert.equal(attached, true);
      pending = undefined;
    },
  };
  await assert.rejects(ensureInitialPolicy(store), /Injected failure/);
  assert.equal(pending, "marker");
  assert.equal(attached, false);
  fail = false;
  assert.deepEqual(await ensureInitialPolicy(store), { id: "policy" });
  assert.deepEqual([...permissions], ["read", "update"]);
  assert.equal(pending, undefined);
  assert.equal(created, 1);
  // После успеха оператор удалил право: следующий bootstrap его не возвращает.
  permissions.delete("update");
  await ensureInitialPolicy(store);
  assert.equal(initialized, 2);
  assert.deepEqual([...permissions], ["read"]);
});

test("существующая политика без pending сохраняет ручные настройки", async () => {
  const unexpectedWrite = async (): Promise<never> => { throw new Error("Unexpected policy write"); };
  const policy = { id: "manual-policy", description: "Operator setting" };
  assert.deepEqual(await ensureInitialPolicy({
    findPolicy: async () => policy,
    findPending: async () => undefined,
    startPending: unexpectedWrite,
    createPolicy: unexpectedWrite,
    initializePolicy: unexpectedWrite,
    finishPending: unexpectedWrite,
  }), policy);
});
