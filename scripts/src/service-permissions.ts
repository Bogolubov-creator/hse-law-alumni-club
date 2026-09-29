import { isDeepStrictEqual } from "node:util";

export const SERVICE_PERMISSIONS_VERSION = "service-system-permissions:v1";
export type Permission = {
  id: number; policy: string; collection: string; action: string; fields: string[] | null;
  permissions: Record<string, unknown> | null; validation: Record<string, unknown> | null;
  presets: Record<string, unknown> | null;
};
export type PermissionPatch = Omit<Permission, "id" | "policy">;
export type PermissionContext = { policyId: string; alumniRoleId: string; serviceRoleId: string; serviceUserId: string };
export type PermissionSnapshot = PermissionContext & { version: string; permissions: Permission[] };
const systemCollections = new Set(["directus_users", "directus_roles"]);
const legacyKeys = [...systemCollections].flatMap(collection =>
  ["create", "read", "update", "delete"].map(action => `${collection}:${action}`));

export function serviceSystemPermissions(alumniRoleId: string): PermissionPatch[] {
  const alumniOnly = { role: { _eq: alumniRoleId } };
  const rule = (collection: string, action: string, fields: string[], permissions = {}, validation = {}, presets = {}): PermissionPatch =>
    ({ collection, action, fields, permissions, validation, presets });
  return [
    rule("directus_roles", "read", ["id", "name"]),
    rule("directus_users", "read", ["id", "email", "first_name", "last_name", "status", "role"]),
    rule("directus_users", "create", ["email", "password", "first_name", "last_name", "status", "role"], {},
      { _and: [alumniOnly, { status: { _in: ["active", "unverified"] } }] }, { role: alumniRoleId }),
    rule("directus_users", "update", ["email", "password", "first_name", "last_name", "status"], alumniOnly,
      { status: { _in: ["active", "unverified", "suspended"] } }),
    rule("directus_users", "delete", ["id"], alumniOnly),
  ];
}

const tuple = (row: Pick<Permission, "collection" | "action">) => `${row.collection}:${row.action}`;
const empty = (value: unknown) => value == null || isDeepStrictEqual(value, {});
const legacy = (row: Permission) => isDeepStrictEqual(row.fields, ["*"]) && empty(row.permissions) && empty(row.validation) && empty(row.presets);
const legacySchema = (rows: Permission[], policyId: string) => Array.isArray(rows) && rows.length === legacyKeys.length &&
  new Set(rows.map(tuple)).size === legacyKeys.length && new Set(rows.map(row => row.id)).size === rows.length &&
  rows.every(row => Number.isSafeInteger(row.id) && row.policy === policyId && legacyKeys.includes(tuple(row)) && legacy(row));
function body(row: Permission): PermissionPatch {
  return { collection: row.collection, action: row.action, fields: row.fields, permissions: row.permissions, validation: row.validation, presets: row.presets };
}

type PermissionStore = {
  completed(): Promise<boolean>;
  loadSnapshot(): Promise<PermissionSnapshot | undefined>;
  saveSnapshot(snapshot: PermissionSnapshot): Promise<void>;
  readPermissions(): Promise<Permission[]>;
  updatePermission(id: number, value: PermissionPatch): Promise<void>;
  deletePermission(id: number): Promise<void>;
  markCompleted(): Promise<void>;
};

/** Однократная миграция. Частичный сбой докатывается, ручные изменения требуют разбора. */
export async function migrateServicePermissions(store: PermissionStore, context: PermissionContext) {
  if (await store.completed()) return "unchanged";
  const current = await store.readPermissions();
  let snapshot = await store.loadSnapshot();
  if (!snapshot) {
    if (!legacySchema(current, context.policyId)) {
      throw new Error("Права сервиса отличаются от исходной схемы. Сохраните ручные ограничения и подготовьте отдельную миграцию.");
    }
    snapshot = { ...context, version: SERVICE_PERMISSIONS_VERSION, permissions: current };
    await store.saveSnapshot(snapshot);
  }
  if (snapshot.version !== SERVICE_PERMISSIONS_VERSION || Object.entries(context).some(([key, value]) => snapshot![key as keyof PermissionContext] !== value) ||
      !legacySchema(snapshot.permissions, context.policyId)) {
    throw new Error("Снимок прав не соответствует этой инсталляции или версии миграции.");
  }
  const desired = serviceSystemPermissions(context.alumniRoleId);
  const wanted = new Map(desired.map(row => [tuple(row), row]));
  const previous = new Map(snapshot.permissions.map(row => [row.id, row]));
  for (const row of current) {
    const before = previous.get(row.id);
    if (!before || row.policy !== context.policyId || tuple(row) !== tuple(before) ||
        (!isDeepStrictEqual(body(row), body(before)) && !isDeepStrictEqual(body(row), wanted.get(tuple(row))))) {
      throw new Error("После снимка права сервиса изменены вручную. Автоматическое продолжение остановлено.");
    }
  }
  for (const before of snapshot.permissions) {
    if (wanted.has(tuple(before)) && !current.some(row => row.id === before.id)) {
      throw new Error("Необходимое разрешение удалено после снимка. Автоматическое продолжение остановлено.");
    }
  }
  // Сначала убираем возможность менять роли, затем сужаем права на пользователей.
  for (const row of current) if (!wanted.has(tuple(row))) await store.deletePermission(row.id);
  for (const row of current) {
    const target = wanted.get(tuple(row));
    if (target && !isDeepStrictEqual(body(row), target)) await store.updatePermission(row.id, target);
  }
  const after = await store.readPermissions();
  if (after.length !== desired.length || new Set(after.map(tuple)).size !== desired.length || after.some(row =>
      row.policy !== context.policyId || !isDeepStrictEqual(body(row), wanted.get(tuple(row))))) {
    throw new Error("Проверка сохранённых разрешений не пройдена; маркер завершения не записан.");
  }
  await store.markCompleted();
  return "migrated";
}
