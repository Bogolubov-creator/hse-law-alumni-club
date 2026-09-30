import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import jwt from "jsonwebtoken";
import { hashPassword, verifyPassword } from "@club/server-auth";
import { checkoutPool } from "../../src/db/checkout-store.js";
import { authenticateNativeUser, confirmAlumniAuthUser, createAlumniAuthUser, findActiveAdmin, resetAlumniPassword } from "../../src/modules/auth/native-auth.js";
import { resolveAlumni, signAdmin } from "../../src/modules/auth/auth.js";
import { authStore } from "../../src/modules/auth/native-auth-store.js";
import { authRoutes } from "../../src/modules/auth/routes.js";
import { env } from "../../src/config/env.js";
import { manageStaff } from "../../../scripts/src/manage-staff.js";

const enabled = process.env.RUN_NATIVE_AUTH_INTEGRATION === "true";
if (enabled && new URL(process.env.CHECKOUT_DATABASE_URL!).pathname !== "/alumni_staged") throw new Error("Only alumni_staged is allowed");
const pool = enabled ? checkoutPool() : null;
const roles = { alumni: randomUUID(), admin: randomUUID(), editor: randomUUID(), service: randomUUID() };
const users: string[] = [], profiles: string[] = [], tokens: string[] = [];
let originalHash: string;

beforeAll(async () => {
  if (!pool) return;
  originalHash = await hashPassword("synthetic-old-password");
  for (const [name, id] of Object.entries(roles)) await pool.query("INSERT INTO directus_roles(id,name) VALUES($1,$2)", [id, name]);
});
afterEach(async () => {
  if (!pool) return;
  await pool.query("DROP TRIGGER IF EXISTS test_auth_fail ON alumni");
  await pool.query("DROP TRIGGER IF EXISTS test_staff_fail ON club_staff_sessions");
  await pool.query("DROP FUNCTION IF EXISTS test_auth_fail()");
  await pool.query("DELETE FROM alumni WHERE id=ANY($1::uuid[])", [profiles.splice(0)]);
  await pool.query("DELETE FROM directus_users WHERE id=ANY($1::uuid[])", [users.splice(0)]);
  await pool.query("DELETE FROM club_auth_revocations WHERE token_key=ANY($1::text[])", [tokens.splice(0).map(t => `reset:${t}`)]);
});
afterAll(async () => {
  if (!pool) return;
  await pool.query("DELETE FROM directus_roles WHERE id=ANY($1::uuid[])", [Object.values(roles)]);
  await pool.end();
});

async function fixture(role: keyof typeof roles = "alumni", status = "active") {
  const id = randomUUID(), alumniId = randomUUID(), email = `${id}@example.test`;
  users.push(id); profiles.push(alumniId);
  await pool!.query("INSERT INTO directus_users(id,email,password,role,status,provider) VALUES($1,$2,$3,$4,$5,'default')", [id, email, originalHash, roles[role], status]);
  await pool!.query("INSERT INTO alumni(id,user_id,token_version) VALUES($1,$2,0)", [alumniId, id]);
  return { id, alumniId, email };
}
function resetInput(id: string) {
  const jti = randomUUID(); tokens.push(jti);
  return { userId: id, password: "synthetic-new-password", jti, expectedVersion: 0 };
}
const registration = (email: string) => ({
  email, password: "synthetic-register-password", first_name: "Тест", last_name: "Проверка", status: "unverified" as const,
  profile: { fio: "Тестовая анкета", cohort: "2020", edu_level: "магистратура", edu_program: "Право", interests_json: [],
    referral_code: `RC-${randomUUID()}`, referred_by: null, consent_at: new Date().toISOString(), consent_version: "test" },
});

async function staffCommand(input: Parameters<typeof manageStaff>[1]) {
  const client = await pool!.connect();
  try { return await manageStaff(client, input); }
  finally { client.release(); }
}
// Новый Node-процесс не наследует in-memory revocation map или Vitest mocks.
function freshProcessGuard(token: string): Promise<string> {
  const code = `const { resolveAdmin } = await import('../backend/src/modules/auth/auth.ts');
    let token = ''; for await (const part of process.stdin) token += part;
    const result = await resolveAdmin({ headers: { authorization: 'Bearer ' + token }, log: { warn() {} } });
    process.stdout.write(result ? 'allowed' : 'denied');
    const { checkoutPool } = await import('../backend/src/db/checkout-store.ts'); await checkoutPool().end();`;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", code], {
      cwd: fileURLToPath(new URL("../../../scripts", import.meta.url)), env: { ...process.env }, stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("Fresh auth process timed out")); }, 10_000);
    child.stdout.on("data", chunk => { output += chunk; });
    child.stderr.resume();
    child.on("error", reject);
    child.on("close", code => { clearTimeout(timer); code === 0 ? resolve(output) : reject(new Error("Fresh auth process failed")); });
    child.stdin.end(token);
  });
}

describe.skipIf(!enabled)("Нативная авторизация: настоящие Argon2 и SQL-транзакции", () => {
  it("вход сохраняет старый UUID и хеш, пароль не проходит через общий слой данных", async () => {
    const user = await fixture();
    const result = await authenticateNativeUser(user.email.toUpperCase(), "synthetic-old-password", "alumni");
    expect(result).toMatchObject({ status: "ok", user: { id: user.id, role: "alumni" } });
    expect(JSON.stringify(result)).not.toContain(originalHash);
    expect(await authenticateNativeUser(user.email, "wrong", "alumni")).toEqual({ status: "invalid" });
    expect((await pool!.query("SELECT password FROM directus_users WHERE id=$1", [user.id])).rows[0].password).toBe(originalHash);
  });

  it("вход со старым паролем во время сброса не получает новое поколение сессии", async () => {
    const user = await fixture();
    const app = Fastify();
    await app.register(authRoutes);
    const snapshotRead = Promise.withResolvers<void>(), resumeLogin = Promise.withResolvers<void>();
    const findUser = authStore.findUser.bind(authStore);
    const spy = vi.spyOn(authStore, "findUser").mockImplementationOnce(async identity => {
      const snapshot = await findUser(identity);
      snapshotRead.resolve();
      await resumeLogin.promise;
      return snapshot;
    });
    const pending = app.inject({ method: "POST", url: "/auth/login", payload: { email: user.email, password: "synthetic-old-password" } });
    try {
      await snapshotRead.promise;
      expect(await resetAlumniPassword(resetInput(user.id))).toBe("reset");
      resumeLogin.resolve();
      const stale = await pending;
      expect(stale.statusCode).toBe(200);
      expect(jwt.verify(stale.json().token, env.AUTH_SECRET)).toMatchObject({ ver: 0 });
      const request = (token: string) => ({ headers: { authorization: `Bearer ${token}` }, log: { warn() {} } }) as Parameters<typeof resolveAlumni>[0];
      expect(await resolveAlumni(request(stale.json().token))).toBeNull();
      const current = await app.inject({ method: "POST", url: "/auth/login", payload: { email: user.email, password: "synthetic-new-password" } });
      expect(current.statusCode).toBe(200);
      expect(jwt.verify(current.json().token, env.AUTH_SECRET)).toMatchObject({ ver: 1 });
      expect(await resolveAlumni(request(current.json().token))).toMatchObject({ id: user.alumniId });
    } finally {
      resumeLogin.resolve();
      await pending;
      spy.mockRestore();
      await app.close();
    }
  });

  it.each(["admin", "editor", "service"] as const)("роль %s не входит в ЛК и не меняется публичной ссылкой", async role => {
    const user = await fixture(role);
    expect(await authenticateNativeUser(user.email, "synthetic-old-password", "alumni")).toEqual({ status: "forbidden" });
    const admin = await authenticateNativeUser(user.email, "synthetic-old-password", "admin");
    expect(admin.status).toBe(role === "service" ? "forbidden" : "ok");
    expect(await resetAlumniPassword(resetInput(user.id))).toBe("invalid");
    expect(await confirmAlumniAuthUser(user.id)).toBe("invalid");
    expect((await pool!.query("SELECT password,role FROM directus_users WHERE id=$1", [user.id])).rows[0]).toEqual({ password: originalHash, role: roles[role] });
  });

  it("блокировка, MFA и внешний provider не обходятся паролем или старым admin JWT", async () => {
    const user = await fixture("admin");
    expect(await findActiveAdmin(user.id)).not.toBeNull();
    for (const change of ["status='suspended'", "status='active',provider='external'", "provider='default',tfa_secret='synthetic-mfa'"]) {
      await pool!.query(`UPDATE directus_users SET ${change} WHERE id=$1`, [user.id]);
      expect(await findActiveAdmin(user.id)).toBeNull();
      expect(await authenticateNativeUser(user.email, "synthetic-old-password", "admin")).toEqual({ status: "invalid" });
    }
  });

  it("сброс alumni не обходит блокировку, MFA и внешний provider", async () => {
    const user = await fixture();
    for (const change of ["status='suspended'", "status='active',provider='external'", "provider='default',tfa_secret='synthetic-mfa'"]) {
      await pool!.query(`UPDATE directus_users SET ${change} WHERE id=$1`, [user.id]);
      expect(await resetAlumniPassword(resetInput(user.id))).toBe("invalid");
    }
    expect((await pool!.query("SELECT password FROM directus_users WHERE id=$1", [user.id])).rows[0].password).toBe(originalHash);
  });

  it("SQL-ошибка после password UPDATE откатывает пароль, версию и JTI; повтор успешен", async () => {
    const user = await fixture(), input = resetInput(user.id);
    await pool!.query(`CREATE FUNCTION test_auth_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected auth failure'; END $$`);
    await pool!.query("CREATE TRIGGER test_auth_fail BEFORE UPDATE OF token_version ON alumni FOR EACH ROW EXECUTE FUNCTION test_auth_fail()");
    await expect(resetAlumniPassword(input)).rejects.toThrow();
    expect((await pool!.query("SELECT password FROM directus_users WHERE id=$1", [user.id])).rows[0].password).toBe(originalHash);
    expect((await pool!.query("SELECT token_version FROM alumni WHERE id=$1", [user.alumniId])).rows[0].token_version).toBe(0);
    expect((await pool!.query("SELECT token_key FROM club_auth_revocations WHERE token_key=$1", [`reset:${input.jti}`])).rowCount).toBe(0);
    await pool!.query("DROP TRIGGER test_auth_fail ON alumni");
    expect(await resetAlumniPassword(input)).toBe("reset");
    const stored = (await pool!.query("SELECT password FROM directus_users WHERE id=$1", [user.id])).rows[0].password;
    expect(await verifyPassword(stored, input.password)).toBe(true);
    expect(await verifyPassword(stored, "synthetic-old-password")).toBe(false);
    expect((await pool!.query("SELECT token_version FROM alumni WHERE id=$1", [user.alumniId])).rows[0].token_version).toBe(1);
  });

  it("конкурирующие сбросы с разными ссылками одного поколения срабатывают один раз", async () => {
    const user = await fixture();
    const first = resetInput(user.id), second = resetInput(user.id);
    const results = await Promise.all([resetAlumniPassword(first), resetAlumniPassword(second)]);
    expect(results.sort()).toEqual(["reset", "used"]);
    expect((await pool!.query("SELECT token_version FROM alumni WHERE id=$1", [user.alumniId])).rows[0].token_version).toBe(1);
    expect((await pool!.query("SELECT token_key FROM club_auth_revocations WHERE token_key=ANY($1::text[])", [[`reset:${first.jti}`, `reset:${second.jti}`]])).rowCount).toBe(1);
  });

  it("старый формат ссылки без ver всё равно одноразовый после нового вызова", async () => {
    const user = await fixture();
    const input = { ...resetInput(user.id), expectedVersion: undefined };
    expect(await resetAlumniPassword(input)).toBe("reset");
    expect(await resetAlumniPassword(input)).toBe("used");
  });

  it("смена роли после отправки письма закрывает сброс и подтверждение", async () => {
    const user = await fixture("alumni", "unverified"), input = resetInput(user.id);
    await pool!.query("UPDATE directus_users SET role=$2 WHERE id=$1", [user.id, roles.admin]);
    expect(await resetAlumniPassword(input)).toBe("invalid");
    expect(await confirmAlumniAuthUser(user.id)).toBe("invalid");
  });

  it("сбой INSERT анкеты не оставляет аккаунт; одновременная регистрация даёт один аккаунт", async () => {
    const email = `${randomUUID()}@example.test`, form = registration(email);
    await pool!.query(`CREATE FUNCTION test_auth_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected profile failure'; END $$`);
    await pool!.query("CREATE TRIGGER test_auth_fail BEFORE INSERT ON alumni FOR EACH ROW EXECUTE FUNCTION test_auth_fail()");
    await expect(createAlumniAuthUser(form)).rejects.toThrow();
    expect((await pool!.query("SELECT id FROM directus_users WHERE email=$1", [email])).rowCount).toBe(0);
    await pool!.query("DROP TRIGGER test_auth_fail ON alumni");
    const results = await Promise.allSettled([createAlumniAuthUser(form), createAlumniAuthUser(form)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
    const user = (await pool!.query("SELECT id,password,status FROM directus_users WHERE email=$1", [email])).rows[0];
    users.push(user.id);
    const rows = (await pool!.query("SELECT id,token_version,verification_status FROM alumni WHERE user_id=$1", [user.id])).rows;
    profiles.push(...rows.map(r => r.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ token_version: 0, verification_status: "pending" });
    expect(user.status).toBe("unverified");
    expect(await verifyPassword(user.password, form.password)).toBe(true);
    expect(await confirmAlumniAuthUser(user.id)).toBe("confirmed");
    expect(await confirmAlumniAuthUser(user.id)).toBe("already");
  });

  it("операторский сброс атомарен и старый staff JWT не работает в новом процессе", async () => {
    const user = await fixture("admin");
    const oldToken = signAdmin(user.id, "admin");
    expect(await freshProcessGuard(oldToken)).toBe("allowed");
    const input = { action: "reset-password" as const, role: "admin" as const, email: user.email, password: "synthetic-staff-reset-password" };
    await pool!.query(`CREATE FUNCTION test_auth_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected staff failure'; END $$`);
    await pool!.query("CREATE TRIGGER test_staff_fail BEFORE INSERT ON club_staff_sessions FOR EACH ROW EXECUTE FUNCTION test_auth_fail()");
    await expect(staffCommand(input)).rejects.toThrow();
    expect((await pool!.query("SELECT password FROM directus_users WHERE id=$1", [user.id])).rows[0].password).toBe(originalHash);
    expect((await pool!.query("SELECT token_version FROM club_staff_sessions WHERE user_id=$1", [user.id])).rowCount).toBe(0);
    await pool!.query("DROP TRIGGER test_staff_fail ON club_staff_sessions");
    expect(await staffCommand(input)).toBe("password-reset");
    expect(await freshProcessGuard(oldToken)).toBe("denied");
    const result = await authenticateNativeUser(user.email, input.password, "admin");
    expect(result).toMatchObject({ status: "ok", user: { staff_version: 1 } });
    expect(await freshProcessGuard(signAdmin(user.id, "admin", 1))).toBe("allowed");
    expect(await authenticateNativeUser(user.email, "synthetic-old-password", "admin")).toEqual({ status: "invalid" });
  }, 15_000);

  it("операторская команда создаёт editor, но не повышает alumni и не перезаписывает существующего", async () => {
    const alumni = await fixture();
    const input = { action: "reset-password" as const, role: "editor" as const, email: alumni.email, password: "synthetic-staff-create-password" };
    await expect(staffCommand(input)).rejects.toThrow(/роль сотрудника/);
    expect((await pool!.query("SELECT role,password FROM directus_users WHERE id=$1", [alumni.id])).rows[0]).toEqual({ role: roles.alumni, password: originalHash });
    const email = `${randomUUID()}@example.test`;
    expect(await staffCommand({ ...input, action: "create", email })).toBe("created");
    const created = (await pool!.query("SELECT id,password FROM directus_users WHERE email=$1", [email])).rows[0]; users.push(created.id);
    await expect(staffCommand({ ...input, action: "create", email, password: "synthetic-another-password" })).rejects.toThrow(/существует/);
    expect((await pool!.query("SELECT password FROM directus_users WHERE id=$1", [created.id])).rows[0].password).toBe(created.password);
    expect(await authenticateNativeUser(email, input.password, "admin")).toMatchObject({ status: "ok", user: { role: "editor" } });
  });

  it("роль приложения не может использовать операторскую команду", async () => {
    const user = await fixture("admin");
    const role = `auth_test_${randomUUID().replaceAll("-", "")}`;
    await pool!.query(`CREATE ROLE "${role}" NOLOGIN`);
    const client = await pool!.connect();
    try {
      await client.query(`SET ROLE "${role}"`);
      await expect(manageStaff(client, { action: "reset-password", role: "admin", email: user.email, password: "synthetic-forbidden-password" })).rejects.toThrow(/владельцу базы/);
    } finally {
      await client.query("RESET ROLE"); client.release();
      await pool!.query(`DROP ROLE "${role}"`);
    }
    expect((await pool!.query("SELECT password FROM directus_users WHERE id=$1", [user.id])).rows[0].password).toBe(originalHash);
  });
});
