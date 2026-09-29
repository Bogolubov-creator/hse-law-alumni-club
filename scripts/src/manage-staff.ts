import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg, { type PoolClient } from "pg";
import { hashPassword } from "@club/server-auth";

export interface StaffInput {
  action: "create" | "reset-password";
  email: string;
  role: "admin" | "editor";
  password: string;
}
class StaffInputError extends Error {}
export function validateStaffInput(input: StaffInput): StaffInput {
  if (!["create", "reset-password"].includes(input.action)) throw new StaffInputError("STAFF_ACTION должен быть create или reset-password");
  if (!["admin", "editor"].includes(input.role)) throw new StaffInputError("STAFF_ROLE должен быть admin или editor");
  const email = input.email?.trim().toLowerCase();
  if (!email || email.length > 128 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new StaffInputError("Некорректный STAFF_EMAIL");
  if (!input.password || input.password.length < 12 || input.password.length > 100 || /[\r\n]/.test(input.password)) {
    throw new StaffInputError("Пароль сотрудника должен содержать 12–100 символов без переноса строки");
  }
  return { ...input, email };
}

/** Оператор работает от владельца БД; публичный API не создаёт роли и сотрудников. */
export async function manageStaff(client: Pick<PoolClient, "query">, raw: StaffInput): Promise<"created" | "password-reset"> {
  const input = validateStaffInput(raw);
  const hash = await hashPassword(input.password);
  await client.query("BEGIN");
  try {
    const owner = await client.query(`SELECT pg_has_role(current_user,relowner,'USAGE') AS allowed FROM pg_class WHERE oid='public.directus_users'::regclass`);
    if (!owner.rows[0]?.allowed) throw new StaffInputError("Команда доступна только владельцу базы данных");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`auth-email:${input.email}`]);
    const { rows } = await client.query<{ id: string; role: string; status: string; provider: string | null; tfa_secret: string | null }>(
      `SELECT u.id,r.name AS role,u.status,u.provider,u.tfa_secret FROM directus_users u
       LEFT JOIN directus_roles r ON r.id=u.role WHERE lower(u.email)=$1 LIMIT 2 FOR UPDATE OF u`, [input.email]);
    if (rows.length > 1) throw new StaffInputError("Адрес неоднозначен; исправьте дубликаты перед операцией");
    if (input.action === "create") {
      if (rows.length) throw new StaffInputError("Аккаунт уже существует; создание не меняет пароль или роль");
      const roles = await client.query<{ id: string }>("SELECT id FROM directus_roles WHERE name=ANY($1::text[]) LIMIT 2", [input.role === "admin" ? ["admin", "Administrator"] : ["editor"]]);
      if (roles.rows.length !== 1) throw new StaffInputError("Нужная роль отсутствует или неоднозначна; выполните bootstrap");
      await client.query("INSERT INTO directus_users(id,email,password,role,status,provider,first_name,last_name) VALUES($1,$2,$3,$4,'active','default','Сотрудник','')", [randomUUID(), input.email, hash, roles.rows[0]!.id]);
    } else {
      const user = rows[0];
      const allowedRole = user?.role === input.role || (input.role === "admin" && user?.role === "Administrator");
      if (!user || !allowedRole) throw new StaffInputError("Существующий аккаунт должен иметь указанную роль сотрудника; повышения прав нет");
      if (user.status !== "active" || (user.provider && user.provider !== "default") || user.tfa_secret) {
        throw new StaffInputError("Сброс доступен активному локальному аккаунту без MFA; статус и способ входа не меняются");
      }
      await client.query("UPDATE directus_users SET password=$2 WHERE id=$1", [user.id, hash]);
      await client.query(`INSERT INTO club_staff_sessions(user_id,token_version) VALUES($1,1)
        ON CONFLICT(user_id) DO UPDATE SET token_version=club_staff_sessions.token_version+1`, [user.id]);
    }
    await client.query("COMMIT");
    return input.action === "create" ? "created" : "password-reset";
  } catch (error) {
    await client.query("ROLLBACK");
    if (error instanceof StaffInputError) throw error;
    // Не выводим PostgreSQL detail: он может содержать строку с хешем или адресом.
    // eslint-disable-next-line preserve-caught-error -- Причина содержит закрытые поля PostgreSQL.
    throw new Error("Не удалось сохранить аккаунт сотрудника; транзакция отменена");
  }
}

async function readPassword(): Promise<string> {
  if (process.env.STAFF_PASSWORD) return process.env.STAFF_PASSWORD;
  if (process.stdin.isTTY) throw new StaffInputError("Передайте пароль через stdin или STAFF_PASSWORD; аргументы командной строки не принимаются");
  let value = "";
  for await (const chunk of process.stdin) {
    value += chunk.toString();
    if (value.length > 1024) throw new StaffInputError("Ввод пароля слишком длинный");
  }
  return value.replace(/\r?\n$/, "");
}

async function main(): Promise<void> {
  if (process.argv.length > 2) throw new StaffInputError("Используйте STAFF_ACTION, STAFF_EMAIL, STAFF_ROLE и пароль через stdin; аргументы запрещены");
  const input = validateStaffInput({ action: process.env.STAFF_ACTION as StaffInput["action"], email: process.env.STAFF_EMAIL ?? "",
    role: process.env.STAFF_ROLE as StaffInput["role"], password: await readPassword() });
  const connectionString = process.env.BOOTSTRAP_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString && !(process.env.PGHOST && process.env.PGDATABASE)) throw new StaffInputError("Задайте BOOTSTRAP_DATABASE_URL или PGHOST/PGDATABASE владельца БД");
  const pool = new pg.Pool({ connectionString, max: 1, connectionTimeoutMillis: 10_000, statement_timeout: 15_000 });
  const client = await pool.connect();
  try { console.log(`Аккаунт сотрудника: ${await manageStaff(client, input)}`); }
  finally { client.release(); await pool.end(); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => {
    console.error(error instanceof StaffInputError ? error.message : "Операция с аккаунтом сотрудника не выполнена");
    process.exitCode = 1;
  });
}
