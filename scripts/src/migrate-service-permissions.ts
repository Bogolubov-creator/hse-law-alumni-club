import { lstat, open, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { migrateServicePermissions, SERVICE_PERMISSIONS_VERSION, type PermissionSnapshot } from "./service-permissions.js";

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Не задана переменная ${name}`);
  return value;
};

async function run() {
  const url = required("DIRECTUS_URL").replace(/\/$/, "");
  const login = await fetch(`${url}/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: required("ADMIN_EMAIL"), password: required("ADMIN_PASSWORD") }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!login.ok) throw new Error(`Не удалось войти в Directus: HTTP ${login.status}`);
  const session = await login.json() as { data: { access_token: string; refresh_token?: string } };
  const api = async (path: string, method = "GET", body?: unknown): Promise<any> => {
    const response = await fetch(`${url}${path}`, {
      method, headers: { "content-type": "application/json", authorization: `Bearer ${session.data.access_token}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Ошибка миграции Directus: ${method} ${path.split("?")[0]}, HTTP ${response.status}`);
    return response.status === 204 ? null : (await response.json() as { data: unknown }).data;
  };
  const query = (filter: unknown, fields: string) => new URLSearchParams({ filter: JSON.stringify(filter), fields, limit: "-1" });
  const markerPath = `/items/club_bootstrap_state?${query({ key: { _eq: SERVICE_PERMISSIONS_VERSION } }, "id")}`;
  try {
    if ((await api(markerPath)).length) { console.log(`${SERVICE_PERMISSIONS_VERSION}: unchanged`); return; }
    const one = async (path: string, description: string) => {
      const rows = await api(path);
      if (rows.length !== 1) throw new Error(`Не найдена однозначная запись: ${description}`);
      return rows[0];
    };
    const alumni = await one(`/roles?${query({ name: { _eq: "alumni" } }, "id")}`, "роль alumni");
    const service = await one(`/roles?${query({ name: { _eq: "service" } }, "id,parent")}`, "роль service");
    const user = await one(`/users?${query({ email: { _eq: "service@club.example.com" } }, "id,role,status")}`, "сервисный аккаунт");
    const policy = await one(`/policies?${query({ name: { _eq: "Сервис (apps/api)" } }, "id,admin_access")}`, "сервисная политика");
    const access = await api(`/access?${query({ _or: [{ role: { _eq: service.id } }, { user: { _eq: user.id } }] }, "id,role,user,policy")}`);
    if (service.parent || user.role !== service.id || user.status !== "active" || policy.admin_access ||
        access.length !== 1 || access[0].role !== service.id || access[0].policy !== policy.id || access[0].user) {
      throw new Error("Дополнительные или наследуемые права сервиса требуют отдельного разбора. Миграция остановлена.");
    }
    const backupFile = required("SERVICE_PERMISSIONS_BACKUP_FILE");
    if (!isAbsolute(backupFile)) throw new Error("SERVICE_PERMISSIONS_BACKUP_FILE должен быть абсолютным путём вне репозитория");
    const repo = await realpath(fileURLToPath(new URL("../../", import.meta.url)));
    const destination = resolve(await realpath(dirname(backupFile)), backupFile.split("/").at(-1)!);
    const pathFromRepo = relative(repo, destination);
    if (!pathFromRepo.startsWith("../") && !isAbsolute(pathFromRepo)) throw new Error("Снимок прав должен храниться вне репозитория");
    const result = await migrateServicePermissions({
      completed: async () => (await api(markerPath)).length > 0,
      loadSnapshot: async () => {
        try {
          const stat = await lstat(destination);
          if (!stat.isFile() || (stat.mode & 0o077) !== 0) throw new Error("Снимок прав должен быть обычным файлом с правами 0600");
          return JSON.parse(await readFile(destination, "utf8")) as PermissionSnapshot;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
          throw error;
        }
      },
      saveSnapshot: async snapshot => {
        const file = await open(destination, "wx", 0o600);
        try { await file.writeFile(`${JSON.stringify(snapshot, null, 2)}\n`); await file.sync(); }
        finally { await file.close(); }
      },
      readPermissions: () => api(`/permissions?${query({ policy: { _eq: policy.id }, collection: { _in: ["directus_users", "directus_roles"] } }, "id,policy,collection,action,fields,permissions,validation,presets")}`),
      updatePermission: async (id, value) => { await api(`/permissions/${id}`, "PATCH", value); },
      deletePermission: async id => { await api(`/permissions/${id}`, "DELETE"); },
      markCompleted: async () => { await api("/items/club_bootstrap_state", "POST", { key: SERVICE_PERMISSIONS_VERSION }); },
    }, { policyId: policy.id, alumniRoleId: alumni.id, serviceRoleId: service.id, serviceUserId: user.id });
    console.log(`${SERVICE_PERMISSIONS_VERSION}: ${result}`);
  } finally {
    if (session.data.refresh_token) {
      await api("/auth/logout", "POST", { refresh_token: session.data.refresh_token });
    }
  }
}

await run();
