import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg, { type PoolClient } from "pg";
import { verifyPassword } from "@club/server-auth";
import { nativeBootstrap, readNativeBootstrapConfig, type NativeBootstrapConfig } from "./native-bootstrap.js";

const config: NativeBootstrapConfig = {
  appEnv: "development", seedDemo: false, adminEmail: "native-admin@example.invalid",
  adminPassword: "synthetic-native-bootstrap-password", publicUrl: "http://localhost",
};

test("production останавливает демо и шаблонный пароль до SQL", async () => {
  let queries = 0;
  const client = { query: async () => { queries++; throw new Error("unexpected SQL"); } } as unknown as PoolClient;
  await assert.rejects(nativeBootstrap(client, { ...config, appEnv: "production", seedDemo: true }), /SEED_DEMO/);
  await assert.rejects(nativeBootstrap(client, { ...config, appEnv: "production", adminPassword: "replace_with_password" }), /ADMIN_PASSWORD/);
  assert.equal(queries, 0);
});

test("bootstrap нормализует адрес и отвергает неоднозначные env", () => {
  assert.equal(readNativeBootstrapConfig({ ADMIN_EMAIL: " Native-Admin@Example.Invalid ", ADMIN_PASSWORD: config.adminPassword }).adminEmail, config.adminEmail);
  assert.throws(() => readNativeBootstrapConfig({ ADMIN_EMAIL: config.adminEmail, ADMIN_PASSWORD: config.adminPassword, SEED_DEMO: "TRUE" }), /SEED_DEMO/);
  assert.throws(() => readNativeBootstrapConfig({ ADMIN_EMAIL: config.adminEmail, ADMIN_PASSWORD: config.adminPassword, APP_ENV: "prod" }), /APP_ENV/);
});

test("demo не может использовать email администратора", async () => {
  let queries = 0;
  const client = { query: async () => { queries++; } } as unknown as PoolClient;
  await assert.rejects(nativeBootstrap(client, {
    ...config, seedDemo: true, editorEmail: config.adminEmail.toUpperCase(), editorPassword: "synthetic-editor-password",
    alumniEmail: "native-alumni@example.invalid", alumniPassword: "synthetic-alumni-password",
  }), /должны различаться/);
  assert.equal(queries, 0);
});

const testUrl = process.env.NATIVE_BOOTSTRAP_TEST_DATABASE_URL;
const integration = { skip: !testUrl };
async function database(t: TestContext): Promise<{ pool: pg.Pool; client: PoolClient; schema: string }> {
  const url = new URL(testUrl!);
  // Создание и удаление БД разрешены только на выделенном локальном тестовом сервере.
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/club_native_test") {
    throw new Error("NATIVE_BOOTSTRAP_TEST_DATABASE_URL должен указывать на локальную БД club_native_test");
  }
  const owner = new pg.Client({ connectionString: url.toString() });
  await owner.connect();
  const name = `club_native_bootstrap_${randomBytes(7).toString("hex")}`;
  await owner.query(`CREATE DATABASE "${name}"`);
  url.pathname = `/${name}`;
  const pool = new pg.Pool({ connectionString: url.toString(), max: 3 });
  const client = await pool.connect();
  t.after(async () => {
    client.release();
    await pool.end();
    await owner.query(`DROP DATABASE "${name}"`);
    await owner.end();
  });
  const schema = await readFile(new URL("../../backend/migrations/001_native_base.sql", import.meta.url), "utf8");
  return { pool, client, schema };
}

test("чистая база: только нужные legacy tables, defaults, hash и повтор без дубликатов", integration, async t => {
  const { client, schema } = await database(t);
  await client.query(schema);
  const first = await nativeBootstrap(client, config);
  assert.equal(first.createdUsers, 1);
  assert.equal(first.createdHome, true);
  const tables = await client.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'directus_%' ORDER BY tablename");
  assert.deepEqual(tables.rows.map(row => row.tablename), ["directus_files", "directus_roles", "directus_users"]);
  const user = (await client.query("SELECT password FROM directus_users WHERE email=$1", [config.adminEmail])).rows[0];
  assert.equal(await verifyPassword(user.password, config.adminPassword), true);
  assert.equal((await client.query("SELECT count(*)::int AS n FROM programs")).rows[0].n, 0);
  assert.equal((await client.query("SELECT count(*)::int AS n FROM directus_users WHERE email LIKE 'service@%'")).rows[0].n, 0);
  const created = (await client.query("INSERT INTO events(title) VALUES('synthetic default probe') RETURNING id,created_at")).rows[0];
  assert.match(created.id, /^[0-9a-f-]{36}$/);
  assert.ok(created.created_at instanceof Date);
  await client.query(schema);
  assert.deepEqual(await nativeBootstrap(client, config), { createdUsers: 0, createdRows: 0, createdHome: false });
});

test("частичная legacy база: UUID, hash, контент, пустой home и приватные settings сохраняются", integration, async t => {
  const { client, schema } = await database(t);
  await client.query(`
    CREATE TABLE directus_roles(id uuid PRIMARY KEY, name varchar(100) NOT NULL);
    INSERT INTO directus_roles VALUES('10000000-0000-0000-0000-000000000001','Administrator');
    CREATE TABLE directus_users(id uuid PRIMARY KEY,email varchar(128),password varchar(255),role uuid,status varchar(16) NOT NULL DEFAULT 'active');
    INSERT INTO directus_users VALUES('20000000-0000-0000-0000-000000000001','native-admin@example.invalid','synthetic-preserved-hash','10000000-0000-0000-0000-000000000001','active');
    CREATE TABLE programs(id uuid PRIMARY KEY,slug varchar(255),title varchar(255),status varchar(255));
    INSERT INTO programs VALUES('30000000-0000-0000-0000-000000000001','preserved','Редакторское название','draft');
    CREATE TABLE pages(id uuid PRIMARY KEY,slug varchar(255),title varchar(255),status varchar(255));
    INSERT INTO pages VALUES('40000000-0000-0000-0000-000000000001','home','Авторская главная','draft');
    CREATE TABLE directus_settings(id integer PRIMARY KEY,project_name text,project_url text,project_descriptor text,default_language text,ai_openai_api_key text);
    INSERT INTO directus_settings VALUES(1,'Авторский клуб','https://example.invalid','Авторское описание','ru-RU','synthetic-private-setting');
  `);
  await client.query(schema);
  await nativeBootstrap(client, config);
  const user = (await client.query("SELECT id,password,role FROM directus_users WHERE email=$1", [config.adminEmail])).rows[0];
  assert.deepEqual(user, { id: "20000000-0000-0000-0000-000000000001", password: "synthetic-preserved-hash", role: "10000000-0000-0000-0000-000000000001" });
  assert.deepEqual((await client.query("SELECT title,status FROM programs WHERE slug='preserved'")).rows[0], { title: "Редакторское название", status: "draft" });
  assert.equal((await client.query("SELECT count(*)::int AS n FROM pages_blocks")).rows[0].n, 0);
  const settings = (await client.query("SELECT key,value FROM club_settings ORDER BY key")).rows;
  assert.equal(settings[0].value.ai_openai_api_key, "synthetic-private-setting");
  assert.equal(settings[1].value.title, "Авторский клуб");
  assert.equal(Object.hasOwn(settings[1].value, "ai_openai_api_key"), false);
  await client.query("UPDATE club_settings SET value=$1::jsonb WHERE key='site'", [JSON.stringify({ title: "После переноса" })]);
  await client.query("UPDATE directus_settings SET project_name='Другой legacy заголовок'");
  await client.query(schema);
  await nativeBootstrap(client, { ...config, adminPassword: "synthetic-changed-env-password" });
  assert.deepEqual((await client.query("SELECT value FROM club_settings WHERE key='site'")).rows[0].value, { title: "После переноса" });
  assert.equal((await client.query("SELECT value->>'project_name' AS name FROM club_settings WHERE key='legacy_directus:1'")).rows[0].name, "Авторский клуб");
  assert.equal((await client.query("SELECT password FROM directus_users WHERE email=$1", [config.adminEmail])).rows[0].password, "synthetic-preserved-hash");
});

test("сбой привязки блока откатывает роли, пользователя и все seed-записи", integration, async t => {
  const { client, schema } = await database(t);
  await client.query(schema);
  const injected = {
    query: ((query: string, values?: unknown[]) => {
      if (query.startsWith('INSERT INTO "pages_blocks"')) throw new Error("synthetic block-link failure");
      return client.query(query, values);
    }) as PoolClient["query"],
  };
  await assert.rejects(nativeBootstrap(injected, config), /synthetic block-link failure/);
  for (const table of ["directus_users", "directus_roles", "levels", "pages", "block_hero", "block_cta"]) {
    assert.equal((await client.query(`SELECT count(*)::int AS n FROM "${table}"`)).rows[0].n, 0, table);
  }
  assert.equal((await nativeBootstrap(client, config)).createdHome, true);
});

test("конкурирующие demo bootstrap сохраняют один набор и редакторскую цену", integration, async t => {
  const { client, pool, schema } = await database(t);
  await client.query(schema);
  const second = await pool.connect();
  const demo: NativeBootstrapConfig = {
    ...config, seedDemo: true, editorEmail: "native-editor@example.invalid", editorPassword: "synthetic-editor-password",
    alumniEmail: "native-alumni@example.invalid", alumniPassword: "synthetic-alumni-password",
  };
  try {
    const results = await Promise.all([nativeBootstrap(client, demo), nativeBootstrap(second, demo)]);
    assert.equal(results.reduce((n, result) => n + result.createdUsers, 0), 3);
    assert.equal(results.filter(result => result.createdHome).length, 1);
    assert.equal((await client.query("SELECT count(*)::int AS n FROM directus_users")).rows[0].n, 3);
    assert.equal((await client.query("SELECT count(*)::int AS n FROM pages_blocks")).rows[0].n, 2);
    const program = (await client.query("SELECT id FROM programs ORDER BY slug LIMIT 1")).rows[0];
    assert.ok(program);
    await client.query("UPDATE programs SET price=12345,title='Редакторская программа',status='draft' WHERE id=$1", [program.id]);
    assert.deepEqual(await nativeBootstrap(client, demo), { createdUsers: 0, createdRows: 0, createdHome: false });
    assert.deepEqual((await client.query("SELECT price,title,status FROM programs WHERE id=$1", [program.id])).rows[0], { price: 12345, title: "Редакторская программа", status: "draft" });
  } finally { second.release(); }
});

test("bootstrap не повышает права существующего аккаунта", integration, async t => {
  const { client, schema } = await database(t);
  await client.query(schema);
  await nativeBootstrap(client, config);
  await client.query("UPDATE directus_users SET role=(SELECT id FROM directus_roles WHERE name='editor') WHERE email=$1", [config.adminEmail]);
  await assert.rejects(nativeBootstrap(client, config), /права не изменены/);
  const user = (await client.query("SELECT r.name FROM directus_users u JOIN directus_roles r ON r.id=u.role WHERE u.email=$1", [config.adminEmail])).rows[0];
  assert.equal(user.name, "editor");
});

test("дубли legacy user_id блокируют миграцию без удаления профилей", integration, async t => {
  const { client, schema } = await database(t);
  await client.query(`
    CREATE TABLE alumni(id uuid PRIMARY KEY,user_id uuid);
    INSERT INTO alumni VALUES
      ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001'),
      ('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001');
    CREATE TABLE directus_users(id uuid PRIMARY KEY);
    INSERT INTO directus_users VALUES('20000000-0000-0000-0000-000000000001');
  `);
  await assert.rejects(client.query(schema), /дубликаты/);
  await client.query("ROLLBACK");
  assert.equal((await client.query("SELECT count(*)::int AS n FROM alumni")).rows[0].n, 2);
  assert.equal((await client.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name='alumni'")).rows[0].n, 2);
});

test("legacy аватары получают постоянную метку без потери metadata и повторных изменений", integration, async t => {
  const { client, schema } = await database(t);
  await client.query(schema);
  const migration = await readFile(new URL("../../backend/migrations/20260929-native-avatar-files.sql", import.meta.url), "utf8");
  const ids = [1, 2, 3, 4].map(n => `aa000000-0000-0000-0000-00000000000${n}`);
  const metadata = [null, "null", JSON.stringify({ caption: "Сохранить", nested: { value: 7 }, club_upload_kind: "office" }), JSON.stringify({ club_upload_kind: "office" })];
  for (let i = 0; i < ids.length; i++) {
    await client.query("INSERT INTO directus_files(id,storage,filename_download,metadata) VALUES($1,'local','synthetic.png',$2::json)", [ids[i], metadata[i]]);
  }
  for (const id of ids.slice(0, 3)) {
    await client.query("INSERT INTO alumni(avatar) VALUES($1)", [id.toUpperCase()]);
  }
  await client.query("INSERT INTO alumni(avatar) VALUES('https://example.invalid/unrelated.png')");
  await client.query(migration);
  const read = async () => (await client.query("SELECT id,metadata FROM directus_files ORDER BY id")).rows;
  const first = await read();
  assert.deepEqual(first.map(row => row.metadata), [
    { club_upload_kind: "avatar" },
    { club_upload_kind: "avatar" },
    { caption: "Сохранить", nested: { value: 7 }, club_upload_kind: "avatar" },
    { club_upload_kind: "office" },
  ]);
  await client.query(migration);
  assert.deepEqual(await read(), first);
  await client.query("UPDATE alumni SET avatar=NULL");
  await client.query(migration);
  assert.deepEqual(await read(), first);
});

test("необъектные legacy metadata останавливают avatar migration атомарно", integration, async t => {
  const { client, schema } = await database(t);
  await client.query(schema);
  const migration = await readFile(new URL("../../backend/migrations/20260929-native-avatar-files.sql", import.meta.url), "utf8");
  for (const [suffix, value] of [[1, null], [2, '["preserved"]'], [3, '"preserved"']] as const) {
    const id = `bb000000-0000-0000-0000-00000000000${suffix}`;
    await client.query("INSERT INTO directus_files(id,storage,filename_download,metadata) VALUES($1,'local','synthetic.png',$2::json)", [id, value]);
    await client.query("INSERT INTO alumni(avatar) VALUES($1)", [id]);
  }
  const before = (await client.query("SELECT id,metadata FROM directus_files ORDER BY id")).rows;
  await assert.rejects(client.query(migration), /metadata не является объектом/);
  await client.query("ROLLBACK");
  assert.deepEqual((await client.query("SELECT id,metadata FROM directus_files ORDER BY id")).rows, before);
});
