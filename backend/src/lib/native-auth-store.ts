import type { PoolClient } from "pg";
import { checkoutPool } from "./checkout-store.js";
import { consumeReset } from "./auth-state.js";

export interface AuthRecord {
  id: string; email: string | null; password: string | null; role: string | null;
  roleName: string | null; status: string; provider: string | null; tfa_secret: string | null;
  first_name: string | null; last_name: string | null;
  staff_version: number;
  alumni_id: string | null;
  alumni_version: number;
}
export type AuthIdentity = { id: string } | { email: string };
export interface AuthProfile { id: string; token_version: number | null }
export interface NewAuthProfile {
  id: string; user_id: string; fio: string; cohort: string; edu_level: string; edu_program: string;
  interests_json: string[]; referral_code: string; referred_by: string | null;
  consent_at: string; consent_version: string;
}
export interface AuthTransaction {
  findUser(identity: AuthIdentity): Promise<AuthRecord | null>;
  profiles(userId: string): Promise<AuthProfile[]>;
  alumniRoleIds(): Promise<string[]>;
  lockEmail(email: string): Promise<void>;
  insertUser(user: Omit<AuthRecord, "roleName" | "tfa_secret" | "staff_version" | "alumni_id" | "alumni_version">): Promise<void>;
  insertProfile(profile: NewAuthProfile): Promise<void>;
  activateUser(id: string): Promise<void>;
  consumeReset(jti: string): Promise<boolean>;
  writePassword(id: string, hash: string): Promise<void>;
  incrementVersion(id: string): Promise<void>;
}

type Database = Pick<PoolClient, "query">;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function findUser(db: Database, identity: AuthIdentity, lock = false): Promise<AuthRecord | null> {
  if ("id" in identity && !UUID.test(identity.id)) return null;
  const byId = "id" in identity;
  const { rows } = await db.query<AuthRecord>(`SELECT u.id,u.email,u.password,u.role,u.status,u.provider,u.tfa_secret,u.first_name,u.last_name,
      r.name AS "roleName",COALESCE(s.token_version,0) AS staff_version,
      a.id AS alumni_id,COALESCE(a.token_version,0) AS alumni_version
    FROM directus_users u LEFT JOIN directus_roles r ON r.id=u.role LEFT JOIN club_staff_sessions s ON s.user_id=u.id
    LEFT JOIN alumni a ON a.user_id=u.id
    WHERE ${byId ? "u.id=$1" : "lower(u.email)=$1"} LIMIT 2${lock ? " FOR UPDATE OF u" : ""}`,
  [byId ? identity.id : identity.email.toLowerCase().trim()]);
  if (rows.length !== 1) return null;
  return rows[0]!;
}

function transaction(client: PoolClient): AuthTransaction {
  return {
    findUser: identity => findUser(client, identity, true),
    async profiles(userId) {
      return (await client.query<AuthProfile>("SELECT id,token_version FROM alumni WHERE user_id=$1 ORDER BY id LIMIT 2 FOR UPDATE", [userId])).rows;
    },
    async alumniRoleIds() { return (await client.query<{ id: string }>("SELECT id FROM directus_roles WHERE name='alumni' LIMIT 2")).rows.map(r => r.id); },
    async lockEmail(email) { await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`auth-email:${email}`]); },
    async insertUser(user) {
      await client.query("INSERT INTO directus_users(id,email,password,role,status,provider,first_name,last_name) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [user.id, user.email, user.password, user.role, user.status, user.provider, user.first_name, user.last_name]);
    },
    async insertProfile(profile) {
      await client.query(`INSERT INTO alumni(id,user_id,fio,cohort,edu_level,edu_program,interests_json,referral_code,referred_by,
        consent_at,consent_version,status,verification_status,points_cached,level_cached,personal_discount,token_version)
        VALUES($1,$2,$3,$4,$5,$6,$7::json,$8,$9,$10,$11,'active','pending',0,'graduate',0,0)`,
      [profile.id, profile.user_id, profile.fio, profile.cohort, profile.edu_level, profile.edu_program, JSON.stringify(profile.interests_json),
        profile.referral_code, profile.referred_by, profile.consent_at, profile.consent_version]);
    },
    async activateUser(id) { await client.query("UPDATE directus_users SET status='active' WHERE id=$1", [id]); },
    consumeReset: jti => consumeReset(jti, client),
    async writePassword(id, hash) { await client.query("UPDATE directus_users SET password=$2 WHERE id=$1", [id, hash]); },
    async incrementVersion(id) { await client.query("UPDATE alumni SET token_version=COALESCE(token_version,0)+1 WHERE id=$1", [id]); },
  };
}

export const authStore = {
  findUser: (identity: AuthIdentity) => findUser(checkoutPool(), identity),
  async transaction<T>(run: (tx: AuthTransaction) => Promise<T>): Promise<T> {
    const client = await checkoutPool().connect();
    try {
      await client.query("BEGIN");
      const result = await run(transaction(client));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      // PostgreSQL detail может содержать всю неудавшуюся строку, включая хеш.
      if ((error as { statusCode?: number }).statusCode === 409) throw error;
      // eslint-disable-next-line preserve-caught-error -- Причина содержит закрытые поля PostgreSQL.
      throw new Error("Не удалось сохранить изменения аккаунта");
    }
    finally { client.release(); }
  },
};
