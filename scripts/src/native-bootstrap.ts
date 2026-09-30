import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg, { type PoolClient } from "pg";
import { hashPassword } from "@club/server-auth";
import { LEVELS, POINT_RULES, ACHIEVEMENTS } from "@club/shared";

type SqlClient = Pick<PoolClient, "query">;
type SeedRow = Record<string, unknown>;
export type NativeBootstrapConfig = {
  appEnv: "development" | "production";
  seedDemo: boolean;
  adminEmail: string;
  adminPassword: string;
  publicUrl: string;
  editorEmail?: string;
  editorPassword?: string;
  alumniEmail?: string;
  alumniPassword?: string;
};
export type BootstrapResult = { createdUsers: number; createdRows: number; createdHome: boolean };

const SITE_DEFAULTS = {
  title: "Клуб выпускников факультета права Вышки",
  description: "Клуб выпускников факультета права Вышки: программы ДПО, мерч, подкасты и кабинет участника.",
  language: "ru-RU",
};
const HOME_HERO = {
  badge: "Клуб выпускников факультета права",
  title_pre: "Клуб выпускников",
  title_accent: "факультета права",
  subtitle: "Встречи, программы ДПО и кабинет участника. Статус выпускника – после проверки учебным офисом.",
  cta_primary: "Вступить в клуб",
  cta_secondary: "Как вступить",
};
const HOME_CTA = {
  title: "Вступить в клуб",
  text: "Подайте заявку – учебный офис сверит выпуск с реестром факультета и откроет кабинет.",
  button: "Подать заявку",
};

function required(values: NodeJS.ProcessEnv, name: string): string {
  const value = values[name];
  if (!value) throw new Error(`Не задана переменная ${name}`);
  return value;
}
function email(value: string, field: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length > 128) {
    throw new Error(`Некорректный адрес в ${field}`);
  }
  return normalized;
}
function validateConfig(config: NativeBootstrapConfig): void {
  if (config.appEnv === "production" && config.seedDemo) {
    throw new Error("SEED_DEMO=true запрещён при APP_ENV=production");
  }
  if (!config.adminPassword || (config.appEnv === "production" &&
      (config.adminPassword.length < 12 || /replace_with|changeme|сгенерируйте/i.test(config.adminPassword)))) {
    throw new Error("ADMIN_PASSWORD не задан или не подходит для production");
  }
  email(config.adminEmail, "ADMIN_EMAIL");
  if (config.seedDemo) {
    if (!config.editorEmail || !config.editorPassword || !config.alumniEmail || !config.alumniPassword) {
      throw new Error("Для демо нужны TEST_EDITOR_EMAIL/PASSWORD и TEST_ALUMNI_EMAIL/PASSWORD");
    }
    const addresses = [email(config.adminEmail, "ADMIN_EMAIL"), email(config.editorEmail, "TEST_EDITOR_EMAIL"), email(config.alumniEmail, "TEST_ALUMNI_EMAIL")];
    if (new Set(addresses).size !== addresses.length) throw new Error("Адреса администратора и демо-аккаунтов должны различаться");
  }
}

export function readNativeBootstrapConfig(values: NodeJS.ProcessEnv): NativeBootstrapConfig {
  if (values.APP_ENV && !["development", "production"].includes(values.APP_ENV)) throw new Error("Некорректный APP_ENV");
  if (values.SEED_DEMO && !["true", "false"].includes(values.SEED_DEMO)) throw new Error("SEED_DEMO должен быть true или false");
  const config: NativeBootstrapConfig = {
    appEnv: values.APP_ENV === "production" ? "production" : "development",
    seedDemo: values.SEED_DEMO === "true",
    adminEmail: email(required(values, "ADMIN_EMAIL"), "ADMIN_EMAIL"),
    adminPassword: required(values, "ADMIN_PASSWORD"),
    publicUrl: values.PUBLIC_URL || "http://localhost",
    editorEmail: values.TEST_EDITOR_EMAIL ? email(values.TEST_EDITOR_EMAIL, "TEST_EDITOR_EMAIL") : undefined,
    editorPassword: values.TEST_EDITOR_PASSWORD,
    alumniEmail: values.TEST_ALUMNI_EMAIL ? email(values.TEST_ALUMNI_EMAIL, "TEST_ALUMNI_EMAIL") : undefined,
    alumniPassword: values.TEST_ALUMNI_PASSWORD,
  };
  validateConfig(config);
  return config;
}

function identifier(name: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new Error("Недопустимый идентификатор bootstrap");
  return `"${name}"`;
}
function sqlValue(value: unknown): unknown {
  return value !== null && typeof value === "object" ? JSON.stringify(value) : value;
}
async function insertRow(client: SqlClient, table: string, row: SeedRow): Promise<string> {
  const values = { id: randomUUID(), ...row };
  const entries = Object.entries(values).filter(([, value]) => value !== undefined);
  const result = await client.query<{ id: string }>(
    `INSERT INTO ${identifier(table)} (${entries.map(([key]) => identifier(key)).join(",")}) VALUES (${entries.map((_, i) => `$${i + 1}`).join(",")}) RETURNING id`,
    entries.map(([, value]) => sqlValue(value)),
  );
  return result.rows[0]!.id;
}
async function seedMissing(client: SqlClient, table: string, key: string, rows: readonly SeedRow[]): Promise<number> {
  const existing = await client.query(`SELECT ${identifier(key)} FROM ${identifier(table)}`);
  const have = new Set(existing.rows.map(row => row[key]));
  let created = 0;
  for (const row of rows) {
    if (have.has(row[key])) continue;
    await insertRow(client, table, row);
    have.add(row[key]);
    created++;
  }
  return created;
}
async function ensureRole(client: SqlClient, name: string, aliases: string[] = []): Promise<string> {
  const result = await client.query<{ id: string }>("SELECT id FROM directus_roles WHERE name = ANY($1::text[]) ORDER BY name", [[name, ...aliases]]);
  if (result.rows.length > 1) throw new Error(`Неоднозначная роль ${name}: требуется явное сопоставление`);
  if (result.rows[0]) return result.rows[0].id;
  return insertRow(client, "directus_roles", { name });
}
async function ensureUser(
  client: SqlClient, input: { email: string; password: string; roleId: string; allowedRoles: string[]; firstName: string; lastName?: string },
  passwordHasher: (password: string) => Promise<string>,
): Promise<{ id: string; created: boolean }> {
  const address = email(input.email, "bootstrap email");
  const result = await client.query<{ id: string; status: string; role_name: string | null }>(
    "SELECT u.id, u.status, r.name AS role_name FROM directus_users u LEFT JOIN directus_roles r ON r.id=u.role WHERE lower(u.email)=$1", [address],
  );
  if (result.rows.length > 1) throw new Error("Адрес bootstrap неоднозначен: требуется проверка дубликатов");
  if (result.rows[0]) {
    const found = result.rows[0];
    if (found.status !== "active" || !input.allowedRoles.includes(found.role_name ?? "")) {
      throw new Error("Существующий аккаунт bootstrap заблокирован или имеет другую роль; права не изменены");
    }
    // Изменённый оператором пароль, provider, TFA и токен существующего аккаунта сохраняются.
    return { id: found.id, created: false };
  }
  const id = await insertRow(client, "directus_users", {
    email: address, password: await passwordHasher(input.password), role: input.roleId,
    first_name: input.firstName, last_name: input.lastName ?? null, status: "active", provider: "default",
  });
  return { id, created: true };
}

async function ensureHome(client: SqlClient): Promise<boolean> {
  const found = await client.query("SELECT id FROM pages WHERE slug=$1", ["home"]);
  // Пустые блоки существующей страницы могут быть выбором редактора.
  if (found.rows.length) return false;
  const pageId = await insertRow(client, "pages", { slug: "home", title: "Главная", status: "published" });
  const heroId = await insertRow(client, "block_hero", HOME_HERO);
  const ctaId = await insertRow(client, "block_cta", HOME_CTA);
  await insertRow(client, "pages_blocks", { pages_id: pageId, collection: "block_hero", item: heroId, sort: 1 });
  await insertRow(client, "pages_blocks", { pages_id: pageId, collection: "block_cta", item: ctaId, sort: 2 });
  return true;
}
async function ensureSiteSettings(client: SqlClient, publicUrl: string): Promise<void> {
  const legacy = await client.query<{ value: Record<string, unknown> }>(
    "SELECT value FROM club_settings WHERE key LIKE 'legacy_directus:%' ORDER BY key LIMIT 1",
  );
  const old = legacy.rows[0]?.value ?? {};
  const nonempty = (value: unknown): string | undefined => typeof value === "string" && value.trim() ? value : undefined;
  const site = {
    title: nonempty(old.project_name) && old.project_name !== "Directus" ? old.project_name : SITE_DEFAULTS.title,
    description: nonempty(old.project_descriptor) ?? SITE_DEFAULTS.description,
    url: nonempty(old.project_url) ?? publicUrl,
    language: nonempty(old.default_language) ?? SITE_DEFAULTS.language,
    logo: nonempty(old.project_logo) ?? null,
    favicon: nonempty(old.public_favicon) ?? null,
  };
  // Только явный публичный список полей. Legacy JSON с ключами интеграций сюда не попадает.
  await client.query("INSERT INTO club_settings(key,value) VALUES('site',$1::jsonb) ON CONFLICT(key) DO NOTHING", [JSON.stringify(site)]);
}

// Транзакция и общий lock исключают частичную запись home и конкуренцию bootstrap.
export async function nativeBootstrap(
  client: SqlClient, config: NativeBootstrapConfig, passwordHasher = hashPassword,
): Promise<BootstrapResult> {
  validateConfig(config);
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL lock_timeout = '30s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('club:native-bootstrap:v1', 0))");
    const result: BootstrapResult = { createdUsers: 0, createdRows: 0, createdHome: false };
    const adminRole = await ensureRole(client, "admin", ["Administrator"]);
    const alumniRole = await ensureRole(client, "alumni");
    const editorRole = await ensureRole(client, "editor");
    const admin = await ensureUser(client, {
      email: config.adminEmail, password: config.adminPassword, roleId: adminRole,
      allowedRoles: ["admin", "Administrator"], firstName: "Администратор", lastName: "Клуба",
    }, passwordHasher);
    result.createdUsers += Number(admin.created);
    result.createdRows += await seedMissing(client, "levels", "key", LEVELS.map(row => ({ ...row, color: "" })));
    result.createdRows += await seedMissing(client, "point_rules", "reason", POINT_RULES.map(row => ({ ...row, active: true })));
    result.createdRows += await seedMissing(client, "achievements", "key", ACHIEVEMENTS.map(row => ({
      key: row.key, title: row.title, description: row.description, rule_json: row.rule_json, sort: row.sort, icon: row.icon, kind: row.kind,
    })));
    result.createdHome = await ensureHome(client);
    await ensureSiteSettings(client, config.publicUrl);
    if (config.seedDemo) {
      const editor = await ensureUser(client, {
        email: config.editorEmail!, password: config.editorPassword!, roleId: editorRole,
        allowedRoles: ["editor"], firstName: "Тест", lastName: "Офис",
      }, passwordHasher);
      const alumni = await ensureUser(client, {
        email: config.alumniEmail!, password: config.alumniPassword!, roleId: alumniRole,
        allowedRoles: ["alumni"], firstName: "Сергей", lastName: "Кондратьев",
      }, passwordHasher);
      result.createdUsers += Number(editor.created) + Number(alumni.created);
      const { PROGRAMS_SEED, PRODUCTS_SEED, NEWS_SEED } = await import("@club/shared/seeds");
      result.createdRows += await seedMissing(client, "programs", "slug", PROGRAMS_SEED.map(row => ({ ...row, status: "published" })));
      result.createdRows += await seedMissing(client, "products", "slug", PRODUCTS_SEED.map(row => ({ ...row, status: "published" })));
      result.createdRows += await seedMissing(client, "news", "slug", NEWS_SEED.map(row => ({ ...row, status: "published" })));
      result.createdRows += await seedDemoContent(client);
      const profile = await client.query("SELECT id FROM alumni WHERE user_id=$1", [alumni.id]);
      if (!profile.rows.length) {
        await insertRow(client, "alumni", {
          user_id: alumni.id, fio: "Сергей Кондратьев", cohort: "2026", edu_program: "Публичное право", edu_level: "магистратура",
          status: "active", verification_status: "verified", points_cached: 120, level_cached: "graduate", personal_discount: 0, referral_code: "SERGEY2026",
        });
        result.createdRows++;
      }
    }
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main(): Promise<void> {
  const config = readNativeBootstrapConfig(process.env);
  const connectionString = process.env.BOOTSTRAP_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString && !(process.env.PGHOST && process.env.PGDATABASE)) {
    throw new Error("Задайте BOOTSTRAP_DATABASE_URL или PGHOST/PGDATABASE для bootstrap");
  }
  const pool = new pg.Pool({ connectionString, max: 1, connectionTimeoutMillis: 10_000 });
  const client = await pool.connect();
  try {
    const result = await nativeBootstrap(client, config);
    console.log(`Bootstrap: создано пользователей ${result.createdUsers}, записей ${result.createdRows}, home ${Number(result.createdHome)}`);
  } finally { client.release(); await pool.end(); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : "Ошибка нативного bootstrap");
    process.exitCode = 1;
  });
}

async function seedDemoContent(client: SqlClient): Promise<number> {
  let count = 0;
  count += await seedMissing(client, "timeline_items", "title", [
    { year: "2024", title: "Клуб основан", text: "Первый выпуск и запуск личного кабинета.", metric: "1-й выпуск · ~40 участников", sort: 1, status: "published" },
    { year: "2024", title: "Витрина ДПО", text: "Каталог программ доп. образования и цена выпускника после проверки.", metric: "каталог ВШЭ · скидка выпускника", sort: 2, status: "published" },
    { year: "2025", title: "Уровни и баллы", text: "Уровни статуса, баллы и достижения за участие в жизни клуба.", metric: "4 уровня · 16 достижений", sort: 3, status: "published" },
    { year: "2025", title: "Мерч и партнёры", text: "Второй выпуск, мерч клуба и первые партнёрские предложения.", metric: "2-й выпуск · мерч", sort: 4, status: "published" },
    { year: "2026", title: "Сейчас", text: "Предрелизная версия портала: витрины, кабинет и афиша в работе.", metric: "предрелиз", sort: 5, status: "published" },
  ]);
  count += await seedMissing(client, "events", "title", [
    { title: "Встреча выпуска 2026: нетворкинг в Milutin Hall", description: "Неформальная встреча свежего выпуска: знакомство с клубом, столы по интересам, лёгкий фуршет.", starts_at: "2026-09-18T18:30:00+03:00", location: "Милютинский пер., 13", format: "offline", points: 60, status: "published" },
    { title: "Открытая лекция: карьера юриста в 2027", description: "Партнёры и инхаус-руководители о том, куда движется рынок юридических услуг.", starts_at: "2026-10-02T19:00:00+03:00", location: "Онлайн (ссылка придёт участникам)", format: "online", points: 60, status: "published" },
  ]);
  count += await seedMissing(client, "podcasts", "title", [
    { title: "Право и карьера: первые шаги после выпуска", description: "Разговор с выпускниками о старте карьеры юриста: фирмы, инхаус, госслужба.", cover: "/assets/dpo-hero.jpg", audio_url: "https://download.samplelib.com/mp3/sample-15s.mp3", duration: "42 мин", sort: 1, status: "draft", is_free: true },
    { title: "M&A изнутри: как проходят большие сделки", description: "Партнёр корпоративной практики о кухне сделок слияний и поглощений.", cover: "/assets/themis.jpeg", audio_url: "https://download.samplelib.com/mp3/sample-12s.mp3", duration: "51 мин", sort: 2, status: "draft" },
  ]);
  const CLASSMATES = [
    { fio: "Алина Ветрова", cohort: "2026", edu_program: "Публичное право", edu_level: "магистратура", interests_json: ["Публичное право", "GR и публичная политика"], referral_code: "ALINA2026" },
    { fio: "Максим Столяров", cohort: "2026", edu_program: "Публичное право", edu_level: "магистратура", interests_json: ["Налоговое право", "Комплаенс и антикоррупция"], referral_code: "MAKSIM2026" },
    { fio: "Дарья Ким", cohort: "2026", edu_program: "Цифровое право", edu_level: "магистратура", interests_json: ["Цифровое право и IT", "LegalTech"], referral_code: "DARIA2026" },
  ];
  count += await seedMissing(client, "alumni", "referral_code", CLASSMATES.map(row => ({ ...row, status: "active", verification_status: "verified", points_cached: 80, level_cached: "graduate", personal_discount: 0 })));
  return count;
}
