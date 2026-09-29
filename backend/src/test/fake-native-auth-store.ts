import { db, resetDb, type Row } from "./fake-data.js";
import type { AuthRecord, AuthIdentity, AuthTransaction } from "../lib/native-auth-store.js";

function table(name: string) { return db[name] ??= []; }

/** Явная фикстура связанных аккаунтов для HTTP-сценариев кабинета. */
export function resetAuthDb(seed: Record<string, Row[]>): void {
  const roles = [...(seed.directus_roles ?? [])];
  const roleId = roles.find(role => role.name === "alumni")?.id ?? "fixture-alumni-role";
  if (!roles.some(role => role.id === roleId)) roles.push({ id: roleId, name: "alumni" });
  const users = [...(seed.directus_users ?? [])];
  const alumni = (seed.alumni ?? []).map(profile => {
    const userId = profile.user_id === undefined ? `u-${profile.id}` : profile.user_id;
    if (userId && !users.some(user => user.id === userId)) {
      users.push({ id: userId, role: roleId, status: "active", provider: "default" });
    }
    return { ...profile, user_id: userId };
  });
  resetDb({ ...seed, directus_roles: roles, directus_users: users, alumni });
}
async function findUser(identity: AuthIdentity): Promise<AuthRecord | null> {
  const rows = table("directus_users").filter(u => "id" in identity ? u.id === identity.id : u.email?.toLowerCase() === identity.email.toLowerCase().trim());
  if (rows.length !== 1) return null;
  const u = rows[0]!;
  const role = typeof u.role === "object" ? u.role : table("directus_roles").find(r => r.id === u.role);
  const alumni = table("alumni").find(a => a.user_id === u.id);
  return { id: u.id, email: u.email ?? null, password: u.password ?? null, role: typeof u.role === "string" ? u.role : role?.id ?? null,
    roleName: role?.name ?? null, status: u.status, provider: u.provider ?? "default", tfa_secret: u.tfa_secret ?? null,
    first_name: u.first_name ?? null, last_name: u.last_name ?? null,
    staff_version: table("club_staff_sessions").find(s => s.user_id === u.id)?.token_version ?? 0,
    alumni_id: alumni?.id ?? null, alumni_version: alumni?.token_version ?? 0 };
}
const tx: AuthTransaction = {
  findUser,
  async profiles(userId) { return table("alumni").filter(a => a.user_id === userId).slice(0, 2).map(a => ({ id: a.id, token_version: a.token_version ?? null })); },
  async alumniRoleIds() { return table("directus_roles").filter(r => r.name === "alumni").map(r => r.id).slice(0, 2); },
  async lockEmail() {},
  async insertUser(user) { table("directus_users").push({ ...user }); },
  async insertProfile(profile) { table("alumni").push({ ...profile, status: "active", verification_status: "pending", points_cached: 0, level_cached: "graduate", personal_discount: 0, token_version: 0 }); },
  async activateUser(id) { Object.assign(table("directus_users").find(u => u.id === id)!, { status: "active" }); },
  async consumeReset(jti) {
    if (table("club_auth_revocations").some(r => r.token_key === `reset:${jti}`)) return false;
    table("club_auth_revocations").push({ token_key: `reset:${jti}` });
    return true;
  },
  async writePassword(id, hash) { table("directus_users").find(u => u.id === id)!.password = hash; },
  async incrementVersion(id) { const a = table("alumni").find(a => a.id === id)!; a.token_version = (a.token_version ?? 0) + 1; },
};
let tail = Promise.resolve();
// Подменяется только SQL-хранилище. Роли, пароли и переходы состояния проверяет production-модуль.
export const authStore = {
  findUser,
  async transaction<T>(run: (transaction: AuthTransaction) => Promise<T>): Promise<T> {
    const previous = tail;
    let release!: () => void;
    tail = new Promise<void>(resolve => { release = resolve; });
    await previous;
    const names = ["directus_users", "alumni", "club_auth_revocations"];
    const snapshot = Object.fromEntries(names.map(name => [name, structuredClone(table(name))]));
    try { return await run(tx); }
    catch (error) { for (const name of names) db[name] = snapshot[name]!; throw error; }
    finally { release(); }
  },
};
