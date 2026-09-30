// Выполняется Node внутри API с его настоящими SQL-реквизитами.
import assert from 'node:assert/strict';
import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.CHECKOUT_DATABASE_URL });
try {
  const { rows: [rights] } = await pool.query(`SELECT
    has_table_privilege(current_user,'club_settings','SELECT') AS settings,
    has_table_privilege(current_user,'directus_roles','UPDATE') AS roles,
    has_column_privilege(current_user,'directus_users','token','SELECT') AS legacy_token,
    has_column_privilege(current_user,'directus_users','role','UPDATE') AS elevation,
    has_column_privilege(current_user,'directus_users','password','UPDATE') AS password,
    has_table_privilege(current_user,'alumni','UPDATE') AS profile`);
  assert.deepEqual(rights, { settings: false, roles: false, legacy_token: false, elevation: false, password: true, profile: true });
  console.log('SQL-права API: профиль и пароль разрешены; архив настроек, старые токены и смена ролей закрыты');
} finally { await pool.end(); }
