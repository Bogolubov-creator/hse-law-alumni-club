import { randomUUID } from "node:crypto";
import { hashPassword, verifyPassword } from "@club/server-auth";
import { authStore, type AuthRecord, type AuthIdentity, type NewAuthProfile } from "./native-auth-store.js";

const ADMIN_ROLES = new Set(["admin", "Administrator", "editor"]);
export type AuthUser = Pick<AuthRecord, "id" | "email" | "status" | "first_name" | "last_name" | "staff_version" | "alumni_id" | "alumni_version"> & { role: string };
const publicUser = (user: AuthRecord): AuthUser => ({ id: user.id, email: user.email, status: user.status,
  role: user.roleName ?? "", first_name: user.first_name, last_name: user.last_name, staff_version: user.staff_version,
  alumni_id: user.alumni_id, alumni_version: user.alumni_version });
// Старые SSO/MFA-аккаунты нельзя незаметно перевести на вход по одному паролю.
const localPasswordAccount = (user: AuthRecord): boolean => (!user.provider || user.provider === "default") && !user.tfa_secret;
const recoverableAlumni = (user: AuthRecord): boolean => user.roleName === "alumni" && localPasswordAccount(user)
  && ["active", "unverified"].includes(user.status);

export async function findAuthUser(identity: AuthIdentity): Promise<AuthUser | null> {
  const user = await authStore.findUser(identity);
  return user ? publicUser(user) : null;
}
export async function findAlumniAuthUser(identity: AuthIdentity): Promise<AuthUser | null> {
  const user = await authStore.findUser(identity);
  return user && recoverableAlumni(user) ? publicUser(user) : null;
}
export async function findActiveAlumni(id: string): Promise<AuthUser | null> {
  const user = await findAlumniAuthUser({ id });
  return user?.status === "active" ? user : null;
}
export async function findActiveAdmin(id: string): Promise<AuthUser | null> {
  const user = await authStore.findUser({ id });
  return user?.status === "active" && localPasswordAccount(user) && ADMIN_ROLES.has(user.roleName ?? "") ? publicUser(user) : null;
}

export type AuthenticationResult = { status: "ok"; user: AuthUser } | { status: "invalid" | "unverified" | "forbidden" };
export async function authenticateNativeUser(email: string, password: string, scope: "alumni" | "admin"): Promise<AuthenticationResult> {
  const user = await authStore.findUser({ email });
  if (!user || !localPasswordAccount(user) || !["active", "unverified"].includes(user.status)
    || !await verifyPassword(user.password, password)) return { status: "invalid" };
  const allowed = scope === "alumni" ? user.roleName === "alumni" : ADMIN_ROLES.has(user.roleName ?? "");
  if (!allowed) return { status: "forbidden" };
  if (user.status === "unverified") return { status: scope === "alumni" ? "unverified" : "invalid" };
  return { status: "ok", user: publicUser(user) };
}

export async function createAlumniAuthUser(input: {
  email: string; password: string; first_name: string; last_name: string; status: "active" | "unverified";
  profile: Omit<NewAuthProfile, "id" | "user_id">;
}): Promise<{ id: string }> {
  const email = input.email.toLowerCase().trim();
  const hash = await hashPassword(input.password);
  return authStore.transaction(async tx => {
    await tx.lockEmail(email);
    if (await tx.findUser({ email })) throw Object.assign(new Error("Аккаунт с этой почтой уже есть – войдите или восстановите пароль"), { statusCode: 409 });
    const roles = await tx.alumniRoleIds();
    if (roles.length !== 1) throw new Error("Роль выпускника не настроена");
    const id = randomUUID();
    await tx.insertUser({ id, email, password: hash, role: roles[0]!, status: input.status, provider: "default", first_name: input.first_name, last_name: input.last_name });
    await tx.insertProfile({ ...input.profile, id: randomUUID(), user_id: id });
    return { id };
  });
}

export async function confirmAlumniAuthUser(id: string): Promise<"confirmed" | "already" | "invalid"> {
  return authStore.transaction(async tx => {
    const user = await tx.findUser({ id });
    if (!user || !recoverableAlumni(user)) return "invalid";
    if (user.status === "active") return "already";
    await tx.activateUser(id);
    return "confirmed";
  });
}

export async function resetAlumniPassword(input: {
  userId: string; password: string; jti: string; expectedVersion?: number | null;
}): Promise<"reset" | "invalid" | "used"> {
  if (!input.jti) return "invalid";
  const hash = await hashPassword(input.password);
  return authStore.transaction(async tx => {
    const user = await tx.findUser({ id: input.userId });
    if (!user || !recoverableAlumni(user)) return "invalid";
    const profiles = await tx.profiles(user.id);
    if (profiles.length !== 1) return "invalid";
    const profile = profiles[0]!;
    if (input.expectedVersion != null && input.expectedVersion !== (profile.token_version ?? 0)) return "used";
    if (!await tx.consumeReset(input.jti)) return "used";
    // Хеш, поколение сессий и одноразовость ссылки фиксируются одним COMMIT.
    await tx.writePassword(user.id, hash);
    await tx.incrementVersion(profile.id);
    return "reset";
  });
}
