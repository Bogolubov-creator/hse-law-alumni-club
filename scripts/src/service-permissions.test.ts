import { test } from "node:test";
import assert from "node:assert/strict";
import { migrateServicePermissions, serviceSystemPermissions, type Permission, type PermissionSnapshot } from "./service-permissions.js";

const context = { policyId: "policy", alumniRoleId: "alumni-role", serviceRoleId: "service-role", serviceUserId: "service-user" };
function fixture() {
  let id = 0;
  const state = {
    rows: ["directus_users", "directus_roles"].flatMap(collection => ["create", "read", "update", "delete"].map(action => ({
      id: ++id, policy: context.policyId, collection, action, fields: ["*"], permissions: {}, validation: {}, presets: {},
    } as Permission))),
    snapshot: undefined as PermissionSnapshot | undefined,
    completed: false, writes: 0, failAfterWrite: 0,
  };
  const store = {
    completed: async () => state.completed,
    loadSnapshot: async () => state.snapshot,
    saveSnapshot: async (snapshot: PermissionSnapshot) => { state.snapshot = structuredClone(snapshot); },
    readPermissions: async () => structuredClone(state.rows),
    updatePermission: async (permissionId: number, body: Omit<Permission, "id" | "policy">) => {
      assert.ok(state.snapshot, "Снимок должен существовать до изменения");
      Object.assign(state.rows.find(row => row.id === permissionId)!, body);
      state.writes++;
      if (state.writes === state.failAfterWrite) throw new Error("Injected write failure");
    },
    deletePermission: async (permissionId: number) => {
      assert.ok(state.snapshot, "Снимок должен существовать до удаления");
      state.rows = state.rows.filter(row => row.id !== permissionId);
      state.writes++;
    },
    markCompleted: async () => { state.completed = true; },
  };
  return { state, store };
}

test("миграция сужает поля и ограничивает изменение пользователей ролью alumni", async () => {
  const { state, store } = fixture();
  assert.equal(await migrateServicePermissions(store, context), "migrated");
  assert.equal(state.snapshot?.permissions.length, 8);
  assert.equal(state.rows.length, 5);
  assert.equal(state.completed, true);
  assert.deepEqual(state.rows.filter(row => row.collection === "directus_roles").map(row => row.action), ["read"]);
  const read = state.rows.find(row => row.collection === "directus_users" && row.action === "read")!;
  assert.deepEqual(read.fields, ["id", "email", "first_name", "last_name", "status", "role"]);
  const create = state.rows.find(row => row.collection === "directus_users" && row.action === "create")!;
  assert.deepEqual(create.validation, { _and: [{ role: { _eq: context.alumniRoleId } }, { status: { _in: ["active", "unverified"] } }] });
  const update = state.rows.find(row => row.collection === "directus_users" && row.action === "update")!;
  assert.equal(update.fields!.includes("role"), false);
  for (const action of ["update", "delete"]) {
    assert.deepEqual(state.rows.find(row => row.collection === "directus_users" && row.action === action)?.permissions, { role: { _eq: context.alumniRoleId } });
  }
});

test("сбой после части записей докатывается по исходному снимку", async () => {
  const { state, store } = fixture();
  state.failAfterWrite = 4;
  await assert.rejects(migrateServicePermissions(store, context), /Injected write failure/);
  assert.equal(state.completed, false);
  const snapshot = structuredClone(state.snapshot);
  assert.equal(await migrateServicePermissions(store, context), "migrated");
  assert.deepEqual(state.snapshot, snapshot);
  assert.equal(state.rows.length, serviceSystemPermissions(context.alumniRoleId).length);
  assert.equal(state.completed, true);
});

test("завершённая миграция сохраняет последующие ручные изменения", async () => {
  const { state, store } = fixture();
  await migrateServicePermissions(store, context);
  state.rows = state.rows.filter(row => row.action !== "delete");
  const rows = structuredClone(state.rows), writes = state.writes;
  assert.equal(await migrateServicePermissions(store, context), "unchanged");
  assert.deepEqual(state.rows, rows);
  assert.equal(state.writes, writes);
});

test("нестандартные исходные права не перезаписываются", async () => {
  const { state, store } = fixture();
  state.rows[0]!.fields = ["email"];
  await assert.rejects(migrateServicePermissions(store, context), /отличаются от исходной/);
  assert.equal(state.writes, 0);
  assert.equal(state.snapshot, undefined);
});

test("ошибка сохранения снимка не допускает ни одной записи прав", async () => {
  const { state, store } = fixture();
  store.saveSnapshot = async () => { throw new Error("Disk full"); };
  await assert.rejects(migrateServicePermissions(store, context), /Disk full/);
  assert.equal(state.writes, 0);
  assert.equal(state.completed, false);
});

test("маркер завершения не пишется при расхождении read-back", async () => {
  const { state, store } = fixture();
  store.updatePermission = async () => {};
  await assert.rejects(migrateServicePermissions(store, context), /Проверка сохранённых разрешений/);
  assert.equal(state.completed, false);
});

test("чужой снимок и ручное изменение после сбоя останавливают продолжение", async () => {
  for (const changeContext of [true, false]) {
    const { state, store } = fixture();
    state.failAfterWrite = 4;
    await assert.rejects(migrateServicePermissions(store, context), /Injected write failure/);
    if (changeContext) state.snapshot!.policyId = "different-policy";
    else state.rows[0]!.fields = ["email"];
    const writes = state.writes;
    await assert.rejects(migrateServicePermissions(store, context), /не соответствует|изменены вручную/);
    assert.equal(state.writes, writes);
    assert.equal(state.completed, false);
  }
});
