/**
 * Идемпотентный bootstrap Directus для Клуба выпускников факультета права НИУ ВШЭ.
 * Создаёт: коллекции + поля + связи, роли, сервисный токен, тестовые аккаунты, сиды.
 * Повторный запуск ничего не дублирует (всё проверяется перед созданием).
 *
 * Запуск: pnpm --filter @club/scripts bootstrap   (env: DIRECTUS_URL, ADMIN_EMAIL, ADMIN_PASSWORD, ...)
 */
import { randomBytes } from "node:crypto";
import {
  createDirectus,
  rest,
  staticToken,
  readCollections,
  createCollection,
  readFieldsByCollection,
  createField,
  readRelations,
  createRelation,
  readRoles,
  createRole,
  readUsers,
  createUser,
  updateUser,
  readItems,
  createItems,
} from "@directus/sdk";
import { LEVELS, POINT_RULES, ACHIEVEMENTS, PROGRAMS_SEED, PRODUCTS_SEED, NEWS_SEED } from "@club/shared";

type Schema = Record<string, any>;

const URL = req("DIRECTUS_URL");
const ADMIN_EMAIL = req("ADMIN_EMAIL");
const ADMIN_PASSWORD = req("ADMIN_PASSWORD");
const SERVICE_TOKEN = req("DIRECTUS_SERVICE_TOKEN");

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Не задана переменная окружения ${name}`);
  return v;
}
function log(msg: string) {
  console.log(msg);
}

/** Логин админом → access_token (минуем drift сигнатур SDK login). */
async function adminToken(): Promise<string> {
  for (let attempt = 1; attempt <= 30; attempt++) {
    try {
      const res = await fetch(`${URL}/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
      });
      if (res.ok) {
        const json = (await res.json()) as { data: { access_token: string } };
        return json.data.access_token;
      }
    } catch {
      /* directus ещё поднимается */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Directus недоступен: не удалось залогиниться админом за 60с");
}

const token = await adminToken();
const client = createDirectus<Schema>(URL).with(staticToken(token)).with(rest());

// ──────────────────────────── helpers ────────────────────────────
const collectionsSet = new Set((await client.request(readCollections())).map((c: any) => c.collection));
const relations = await client.request(readRelations());
const fieldCache = new Map<string, Set<string>>();

function pkUuid() {
  return {
    field: "id",
    type: "uuid",
    meta: { hidden: true, readonly: true, interface: "input", special: ["uuid"] },
    schema: { is_primary_key: true, length: 36, has_auto_increment: false },
  };
}

async function ensureCollection(collection: string, icon = "box") {
  if (collectionsSet.has(collection)) return;
  await client.request(
    createCollection({ collection, meta: { icon }, schema: {}, fields: [pkUuid()] } as any),
  );
  collectionsSet.add(collection);
  log(`+ коллекция ${collection}`);
}

async function fieldsOf(collection: string) {
  if (!fieldCache.has(collection)) {
    const fs = (await client.request((readFieldsByCollection as any)(collection))) as any[];
    fieldCache.set(collection, new Set(fs.map((f: any) => f.field)));
  }
  return fieldCache.get(collection)!;
}

type Spec = { type: string; meta?: Record<string, any>; schema?: Record<string, any> };
async function ensureField(collection: string, field: string, spec: Spec) {
  const set = await fieldsOf(collection);
  if (set.has(field)) return;
  await client.request(
    (createField as any)(collection, { field, type: spec.type, meta: spec.meta ?? {}, schema: spec.schema ?? {} }),
  );
  set.add(field);
  log(`  + ${collection}.${field}`);
}

async function ensureM2O(collection: string, field: string, related: string, onDelete = "SET NULL") {
  await ensureField(collection, field, {
    type: "uuid",
    meta: { interface: "select-dropdown-m2o", special: ["m2o"] },
    schema: {},
  });
  if (relations.some((r: any) => r.collection === collection && r.field === field)) return;
  await client.request(
    createRelation({ collection, field, related_collection: related, schema: { on_delete: onDelete }, meta: {} } as any),
  );
  relations.push({ collection, field } as any);
  log(`  ~ ${collection}.${field} → ${related}`);
}

// краткие конструкторы полей
const str = (unique = false, def?: string): Spec => ({ type: "string", schema: { is_unique: unique, default_value: def } });
const txt = (): Spec => ({ type: "text" });
const int = (def?: number): Spec => ({ type: "integer", schema: { default_value: def } });
const bool = (def?: boolean): Spec => ({ type: "boolean", schema: { default_value: def } });
const json = (): Spec => ({ type: "json" });
const ts = (special?: "date-created" | "date-updated"): Spec => ({
  type: "timestamp",
  meta: special ? { special: [special] } : {},
});
const enumf = (choices: string[], def?: string): Spec => ({
  type: "string",
  meta: { interface: "select-dropdown", options: { choices: choices.map((c) => ({ text: c, value: c })) } },
  schema: { default_value: def },
});

async function ensureSeed(collection: string, keyField: string, rows: Record<string, any>[]) {
  const existing = (await client.request((readItems as any)(collection, { fields: [keyField], limit: -1 }))) as any[];
  const have = new Set(existing.map((r) => r[keyField]));
  const toCreate = rows.filter((r) => !have.has(r[keyField]));
  if (toCreate.length) {
    await client.request((createItems as any)(collection, toCreate));
    log(`  seed ${collection}: +${toCreate.length}`);
  }
}

// ──────────────────────────── 1. коллекции (PK) ────────────────────────────
const COLLECTIONS = [
  "levels", "point_rules", "achievements", "alumni", "points_ledger",
  "alumni_achievements", "alumni_friends", "pages", "news", "programs", "products",
  "carts", "orders", "offers", "referrals", "timeline_items", "podcasts", "audit_log",
  "events", "event_rsvps", "push_subs", "podcast_plays",
];
log("== Коллекции ==");
for (const c of COLLECTIONS) await ensureCollection(c);

// ──────────────────────────── 2. поля + связи ────────────────────────────
log("== Поля и связи ==");

// levels
await ensureField("levels", "key", str(true));
await ensureField("levels", "title", str());
await ensureField("levels", "min_points", int(0));
await ensureField("levels", "discount_percent", int(0));
await ensureField("levels", "sort", int());
await ensureField("levels", "color", str());

// point_rules
await ensureField("point_rules", "reason", str(true));
await ensureField("point_rules", "points", int(0));
await ensureField("point_rules", "active", bool(true));
await ensureField("point_rules", "description", str());

// achievements
await ensureField("achievements", "key", str(true));
await ensureField("achievements", "title", str());
await ensureField("achievements", "description", txt());
await ensureField("achievements", "rule_json", json());
await ensureField("achievements", "points_reward", int(0));
await ensureField("achievements", "sort", int());
await ensureField("achievements", "icon", str());
await ensureField("achievements", "kind", str());

// alumni
await ensureM2O("alumni", "user_id", "directus_users");
await ensureField("alumni", "fio", str());
await ensureField("alumni", "cohort", str());
await ensureField("alumni", "status", enumf(["active", "inactive", "alumni_left"], "active"));
await ensureField("alumni", "verification_status", enumf(["pending", "verified", "rejected"], "pending"));
await ensureField("alumni", "points_cached", int(0));
await ensureField("alumni", "level_cached", enumf(["graduate", "friend", "expert", "ambassador"], "graduate"));
await ensureField("alumni", "personal_discount", int(0));
await ensureField("alumni", "contacts_json", json());
await ensureField("alumni", "edu_program", str());
await ensureField("alumni", "edu_level", str());
await ensureField("alumni", "interests_json", json());
await ensureField("alumni", "podcast_reminder_sent", bool(false)); // напоминание об окончании подписки уже отправлено
await ensureField("alumni", "podcast_sub_until", ts()); // подписка на подкасты активна до этой даты
await ensureField("alumni", "avatar", str()); // uuid файла в Directus (раздача через /api/avatars/:id)
await ensureField("alumni", "referral_code", str(true));
await ensureField("alumni", "telegram_id", str(true)); // связка с Telegram-ботом (/points, /calendar)
await ensureField("alumni", "token_version", int(0)); // ревокация JWT: +1 при сбросе пароля
await ensureField("alumni", "consent_at", ts());        // 152-ФЗ: когда дано согласие на ПДн
await ensureField("alumni", "consent_version", str()); // ... и версия политики (доказательство)
// Дата верификации офисом: пишется в admin.ts при переводе в verified и объявлена в
// AlumniRow, но самого поля в схеме не было – под ролью Administrator Directus молча
// выбрасывал неизвестный ключ из payload, и дата нигде не сохранялась.
await ensureField("alumni", "verified_at", ts());
await ensureM2O("alumni", "referred_by", "alumni");
await ensureField("alumni", "joined_at", ts("date-created"));
await ensureField("alumni", "last_activity_at", ts());

// points_ledger (append-only источник правды)
await ensureM2O("points_ledger", "alumni_id", "alumni", "CASCADE");
await ensureField("points_ledger", "delta", int(0));
await ensureField("points_ledger", "reason", enumf(["program", "event", "referral", "mentorship", "order", "decay", "manual", "achievement"]));
await ensureField("points_ledger", "ref", str());
await ensureField("points_ledger", "comment", txt());
await ensureField("points_ledger", "idempotency_key", str(true));
await ensureField("points_ledger", "created_at", ts("date-created"));

// alumni_achievements (junction = M2M)
await ensureM2O("alumni_achievements", "alumni_id", "alumni", "CASCADE");
await ensureM2O("alumni_achievements", "achievement_id", "achievements", "CASCADE");
await ensureField("alumni_achievements", "earned_at", ts("date-created"));

// alumni_friends («Сообщество»: заявки в друзья между выпускниками)
await ensureM2O("alumni_friends", "alumni_id", "alumni", "CASCADE");
await ensureM2O("alumni_friends", "friend_id", "alumni", "CASCADE");
await ensureField("alumni_friends", "status", enumf(["pending", "accepted"], "pending"));
await ensureField("alumni_friends", "created_at", ts("date-created"));

// pages (минимально – блоки M2A в Фазе 1)
await ensureField("pages", "slug", str(true));
await ensureField("pages", "title", str());
await ensureField("pages", "status", enumf(["draft", "published", "archived"], "draft"));
await ensureField("pages", "sort", int());

// news
await ensureField("news", "slug", str(true));
await ensureField("news", "title", str());
await ensureField("news", "excerpt", txt());
await ensureField("news", "body", txt());
await ensureField("news", "source_url", str());
await ensureField("news", "published_at", ts());
await ensureField("news", "status", enumf(["draft", "published"], "draft"));

// timeline_items – «История» на главной (редактируется в админ-панели)
await ensureField("timeline_items", "year", str());
await ensureField("timeline_items", "title", str());
await ensureField("timeline_items", "text", txt());
await ensureField("timeline_items", "metric", str());
await ensureField("timeline_items", "sort", int());
await ensureField("timeline_items", "status", enumf(["draft", "published"], "published"));

// podcasts – подкасты клуба (доступ по годовой подписке)
await ensureField("podcasts", "title", str());
await ensureField("podcasts", "description", txt());
await ensureField("podcasts", "cover", str()); // URL/путь обложки
await ensureField("podcasts", "audio_url", str()); // URL аудио (mp3 и т. п.) либо uuid файла в Directus
await ensureField("podcasts", "video_url", str()); // ссылка RuTube: выпуск показывается видеоплеером

// podcast_plays – факт прослушивания. Пишется сервером при выдаче аудио,
// поэтому счётчик нельзя накрутить из браузера.
await ensureM2O("podcast_plays", "podcast_id", "podcasts", "CASCADE");
await ensureM2O("podcast_plays", "alumni_id", "alumni", "SET NULL");
await ensureField("podcast_plays", "created_at", ts("date-created"));
await ensureField("podcasts", "duration", str()); // «43 мин»
await ensureField("podcasts", "is_free", bool(false)); // пробный выпуск – доступен без подписки
await ensureField("podcasts", "sort", int());
await ensureField("podcasts", "status", enumf(["draft", "published"], "draft"));
await ensureField("podcasts", "created_at", ts("date-created"));

// events – календарь событий клуба (встречи, лекции, нетворкинг)
await ensureField("events", "title", str());
await ensureField("events", "description", txt());
await ensureField("events", "starts_at", ts());
await ensureField("events", "location", str()); // адрес или ссылка на трансляцию
await ensureField("events", "cover", str()); // картинка-анонс: URL или /assets/…
await ensureField("events", "reg_url", str()); // внешняя регистрация (Timepad, форма и т.п.)
await ensureField("events", "reminder_sent", bool(false)); // пуш «завтра событие» уже отправлен
await ensureField("events", "format", enumf(["offline", "online"], "offline"));
await ensureField("events", "points", int(60)); // баллы за посещение
await ensureField("events", "status", enumf(["draft", "published", "done", "canceled"], "published"));
await ensureField("events", "created_at", ts("date-created"));

// event_rsvps – «пойду» + отметка посещения (посещение = баллы)
await ensureM2O("event_rsvps", "event_id", "events", "CASCADE");
await ensureM2O("event_rsvps", "alumni_id", "alumni", "CASCADE");
await ensureField("event_rsvps", "attended", bool(false));
await ensureField("event_rsvps", "created_at", ts("date-created"));

// push_subs – web-push подписки браузеров участников
await ensureM2O("push_subs", "alumni_id", "alumni", "CASCADE");
await ensureField("push_subs", "endpoint", txt());
await ensureField("push_subs", "keys", json());
await ensureField("push_subs", "created_at", ts("date-created"));

// audit_log – append-only след критичных операций (логины, платежи, статусы, выдачи)
await ensureField("audit_log", "event", str());
await ensureField("audit_log", "actor", str()); // кто: alumni:<id> | admin:<userId> | system | ip
await ensureField("audit_log", "subject", str()); // над чем: order:<num> | alumni:<id> | ...
await ensureField("audit_log", "detail", json());
await ensureField("audit_log", "ip", str());
await ensureField("audit_log", "created_at", ts("date-created"));

// programs (ДПО)
await ensureField("programs", "slug", str(true));
await ensureField("programs", "title", str());
await ensureField("programs", "direction", str());
await ensureField("programs", "format", enumf(["online", "offline", "blended"], "online"));
await ensureField("programs", "duration", str());
await ensureField("programs", "price", int(0));
await ensureField("programs", "dates", json());
await ensureField("programs", "capacity", int());
await ensureField("programs", "seats_taken", int(0));
await ensureField("programs", "modules", json());
await ensureField("programs", "teachers", json());
await ensureField("programs", "document", str());
await ensureField("programs", "source_url", str()); // страница программы на hse.ru (управляется синком)
await ensureField("programs", "enrollment", enumf(["actual", "nonactual"], "actual")); // актуальный набор / набор закрыт
await ensureField("programs", "description", txt());
await ensureField("programs", "status", enumf(["draft", "published", "archived"], "draft"));

// products (мерч)
await ensureField("products", "slug", str(true));
await ensureField("products", "title", str());
await ensureField("products", "category", str());
await ensureField("products", "price", int(0));
await ensureField("products", "images", json());
await ensureField("products", "variants_json", json());
await ensureField("products", "stock", int(0));
await ensureField("products", "description", txt());
await ensureField("products", "status", enumf(["draft", "published", "archived"], "draft"));

// carts
await ensureM2O("carts", "alumni_id", "alumni", "SET NULL");
await ensureField("carts", "session_token", str());
await ensureField("carts", "items_json", json());
await ensureField("carts", "updated_at", ts("date-updated"));

// orders (ЗАЯВКА – без оплаты)
await ensureField("orders", "number", str(true));
await ensureM2O("orders", "alumni_id", "alumni", "SET NULL");
await ensureField("orders", "type", enumf(["dpo", "merch", "mixed"], "dpo"));
await ensureField("orders", "items_json", json());
await ensureField("orders", "subtotal", int(0));
await ensureField("orders", "member_discount", int(0));
await ensureField("orders", "total_estimate", int(0));
await ensureField("orders", "contact_fio", str());
await ensureField("orders", "contact_phone", str());
await ensureField("orders", "contact_email", str());
await ensureField("orders", "fulfillment", enumf(["pickup", "delivery"], "pickup"));
await ensureField("orders", "address", txt());
await ensureField("orders", "comment", txt());
await ensureField("orders", "consent_pdn", bool(false));
// Оплата ЮKassa (заполняются при подключённых ключах магазина)
await ensureField("orders", "payment_id", str());
await ensureField("orders", "payment_status", str());
await ensureField("orders", "paid_at", ts());
await ensureField("orders", "status", enumf(["new", "in_progress", "confirmed", "done", "canceled"], "new"));
await ensureField("orders", "created_at", ts("date-created"));

// offers
await ensureField("offers", "kind", enumf(["level", "personal"], "level"));
await ensureM2O("offers", "alumni_id", "alumni", "CASCADE");
await ensureField("offers", "level_key", str());
await ensureField("offers", "percent", int(0));
await ensureField("offers", "title", str());
await ensureField("offers", "active", bool(true));
await ensureField("offers", "valid_until", ts());

// referrals
await ensureM2O("referrals", "referrer_id", "alumni", "CASCADE");
await ensureM2O("referrals", "invited_user_id", "directus_users", "SET NULL");
await ensureField("referrals", "code", str());
await ensureField("referrals", "status", enumf(["pending", "confirmed"], "pending"));
await ensureField("referrals", "reward_points", int(0));
await ensureField("referrals", "created_at", ts("date-created"));

// ──────────────────────────── 2b. M2A-блоки страниц (Фаза 1b) ────────────────────────────
// pages ←(o2m alias "blocks")→ pages_blocks ←(m2a "item")→ block_hero | block_cta
log("== M2A блоки страниц ==");
await ensureCollection("block_hero", "title");
await ensureField("block_hero", "badge", str());
await ensureField("block_hero", "title_pre", str());
await ensureField("block_hero", "title_accent", str());
await ensureField("block_hero", "subtitle", txt());
await ensureField("block_hero", "cta_primary", str());
await ensureField("block_hero", "cta_secondary", str());
await ensureField("block_hero", "history_eyebrow", str()); // секция «История клуба»: надзаголовок
await ensureField("block_hero", "history_title", str());   // ... заголовок
await ensureField("block_hero", "history_hint", str());    // ... подсказка «листайте»
await ensureField("block_hero", "marquee", json());        // бегущая лента: массив строк

await ensureCollection("block_cta", "campaign");
await ensureField("block_cta", "title", str());
await ensureField("block_cta", "text", txt());
await ensureField("block_cta", "button", str());

await ensureCollection("pages_blocks", "list");
await ensureField("pages_blocks", "collection", str());
await ensureField("pages_blocks", "item", str());
await ensureField("pages_blocks", "sort", int());

// alias-поле на pages (o2m к junction)
{
  const set = await fieldsOf("pages");
  if (!set.has("blocks")) {
    await client.request((createField as any)("pages", { field: "blocks", type: "alias", meta: { special: ["m2a"], interface: "list-m2a" } }));
    set.add("blocks");
    log("  + pages.blocks (alias m2a)");
  }
}
// junction → pages (m2o) с обратным алиасом blocks
await ensureField("pages_blocks", "pages_id", { type: "uuid", meta: { interface: "select-dropdown-m2o", special: ["m2o"] }, schema: {} });
if (!relations.some((r: any) => r.collection === "pages_blocks" && r.field === "pages_id")) {
  await client.request((createRelation as any)({ collection: "pages_blocks", field: "pages_id", related_collection: "pages", meta: { one_field: "blocks", sort_field: "sort", junction_field: "item" }, schema: { on_delete: "CASCADE" } }));
  relations.push({ collection: "pages_blocks", field: "pages_id" } as any);
  log("  ~ pages_blocks.pages_id → pages");
}
// junction.item → any (m2a)
if (!relations.some((r: any) => r.collection === "pages_blocks" && r.field === "item")) {
  await client.request((createRelation as any)({ collection: "pages_blocks", field: "item", related_collection: null, meta: { one_collection_field: "collection", one_allowed_collections: ["block_hero", "block_cta"], junction_field: "pages_id", sort_field: "sort" }, schema: null }));
  relations.push({ collection: "pages_blocks", field: "item" } as any);
  log("  ~ pages_blocks.item → any (m2a)");
}

// Сид страницы home (если ещё нет блоков)
{
  const pages = (await client.request((readItems as any)("pages", { filter: { slug: { _eq: "home" } }, limit: 1 }))) as any[];
  let homeId = pages[0]?.id;
  if (!homeId) {
    const created = (await client.request((createItems as any)("pages", [{ slug: "home", title: "Главная", status: "published" }]))) as any;
    homeId = Array.isArray(created) ? created[0].id : created.id;
    log("  + страница home");
  }
  const links = (await client.request((readItems as any)("pages_blocks", { filter: { pages_id: { _eq: homeId } }, limit: 1 }))) as any[];
  if (!links.length) {
    const hero = (await client.request((createItems as any)("block_hero", [{
      badge: "Сообщество выпускников факультета права",
      title_pre: "Статус выпускника, который",
      title_accent: "работает",
      subtitle: "Клуб выпускников факультета права «Вышки»: личный кабинет с уровнями, скидка 5% на ДПО и мерч, новости и менторы – всё в одном месте.",
      cta_primary: "Войти в личный кабинет",
      cta_secondary: "Как вступить",
    }]))) as any;
    const cta = (await client.request((createItems as any)("block_cta", [{
      title: "Вступить в клуб",
      text: "Подтвердите выпуск у учебного офиса – и получите статус, скидки и доступ к витринам.",
      button: "Подать заявку",
    }]))) as any;
    const heroId = Array.isArray(hero) ? hero[0].id : hero.id;
    const ctaId = Array.isArray(cta) ? cta[0].id : cta.id;
    await client.request((createItems as any)("pages_blocks", [
      { pages_id: homeId, collection: "block_hero", item: String(heroId), sort: 1 },
      { pages_id: homeId, collection: "block_cta", item: String(ctaId), sort: 2 },
    ]));
    log("  + блоки home: hero + cta");
  }
}

// ──────────────────────────── 3. роли ────────────────────────────
log("== Роли ==");
const roles = await client.request(readRoles());
async function ensureRole(name: string, icon: string) {
  let r = roles.find((x: any) => x.name === name);
  if (!r) {
    r = await client.request(createRole({ name, icon } as any));
    roles.push(r);
    log(`+ роль ${name}`);
  }
  return r;
}
const editorRoleRec = await ensureRole("editor", "edit_note");
await ensureRole("alumni", "school");
const serviceRoleRec = await ensureRole("service", "smart_toy");
// Administrator существует из ENV-бутстрапа Directus – используем для сервисного токена.
const adminRole = roles.find((x: any) => x.name === "Administrator");

// ─────────────────── 3.1 политики доступа (least privilege) ───────────────────
// Directus 11: права живут в политиках, политики цепляются к ролям через directus_access.
// До этого роли editor/service были ПУСТЫЕ (ноль политик), поэтому офис работал в Studio
// под Administrator, а apps/api ходил админским токеном – утечка любого из них означала
// полный доступ ко всем ПДн. Теперь у каждой стороны свой минимум.

/** Контент, который офис ведёт в Studio. ПДн (alumni, orders, points_ledger, audit_log) сюда НЕ входят. */
const CONTENT_COLLECTIONS = [
  "pages", "pages_blocks", "block_hero", "block_cta",
  "news", "programs", "products", "timeline_items", "podcasts", "events", "offers",
];
/** Что нужно apps/api: свои коллекции + системные, без которых не работают регистрация и аватары. */
const SERVICE_SYSTEM = ["directus_files", "directus_users", "directus_roles"];
const CRUD = ["create", "read", "update", "delete"] as const;

async function api(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${URL}${path}`, {
    ...init,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} → ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : await res.json();
}

async function ensurePolicy(name: string, opts: { appAccess: boolean; description: string }): Promise<string> {
  const found = (await api(`/policies?filter[name][_eq]=${encodeURIComponent(name)}&fields=id&limit=1`)).data;
  if (found?.[0]) return found[0].id as string;
  const created = await api("/policies", {
    method: "POST",
    body: JSON.stringify({ name, icon: "policy", description: opts.description, app_access: opts.appAccess, admin_access: false, enforce_tfa: false }),
  });
  log(`+ политика ${name}`);
  return created.data.id as string;
}

/** Идемпотентно выдать политике права на коллекцию. Повторный прогон ничего не дублирует. */
async function ensurePermissions(policyId: string, collections: string[], actions: readonly string[]) {
  const existing = (await api(`/permissions?filter[policy][_eq]=${policyId}&fields=collection,action&limit=-1`)).data ?? [];
  const have = new Set(existing.map((p: any) => `${p.collection}:${p.action}`));
  for (const collection of collections) {
    for (const action of actions) {
      if (have.has(`${collection}:${action}`)) continue;
      await api("/permissions", {
        method: "POST",
        body: JSON.stringify({ policy: policyId, collection, action, fields: ["*"], permissions: {}, validation: {} }),
      });
    }
  }
}

/** Привязать политику к роли (directus_access), не создавая дублей. */
async function ensureAccess(roleId: string, policyId: string) {
  const existing = (await api(`/access?filter[role][_eq]=${roleId}&filter[policy][_eq]=${policyId}&fields=id&limit=1`)).data;
  if (existing?.[0]) return;
  await api("/access", { method: "POST", body: JSON.stringify({ role: roleId, policy: policyId, sort: 1 }) });
}

const editorPolicy = await ensurePolicy("Офис (контент)", {
  appAccess: true, // вход в Studio
  description: "Редактирование контента сайта. Персональные данные выпускников и заявки недоступны – они ведутся в админ-панели сайта, где действия пишутся в аудит.",
});
await ensurePermissions(editorPolicy, CONTENT_COLLECTIONS, CRUD);
await ensurePermissions(editorPolicy, ["directus_files"], CRUD); // обложки новостей/программ
if (editorRoleRec?.id) await ensureAccess(editorRoleRec.id, editorPolicy);

const servicePolicy = await ensurePolicy("Сервис (apps/api)", {
  appAccess: false, // машине Studio не нужна
  description: "Права бэкенда apps/api: данные приложения и файлы. Схему, настройки и расширения Directus менять нельзя – утечка токена не даёт захватить инсталляцию.",
});
await ensurePermissions(servicePolicy, [...COLLECTIONS, "pages_blocks", "block_hero", "block_cta"], CRUD);
await ensurePermissions(servicePolicy, SERVICE_SYSTEM, CRUD);
if (serviceRoleRec?.id) await ensureAccess(serviceRoleRec.id, servicePolicy);
log("  политики: офис – только контент, сервис – только данные приложения");

// ──────────────────────────── 4. пользователи ────────────────────────────
log("== Пользователи ==");
async function ensureUser(email: string, fields: Record<string, any>) {
  const found = (await client.request(readUsers({ filter: { email: { _eq: email } }, limit: 1 }))) as any[];
  if (found.length) return { id: found[0].id, created: false };
  const u = (await client.request(createUser({ email, status: "active", ...fields } as any))) as any;
  log(`+ пользователь ${email}`);
  return { id: u.id, created: true };
}

// Сервисный пользователь со статическим токеном для apps/api (пока под Administrator;
// тонкие политики роли service – в Фазе 4).
// Пароль – случайный и НИКОМУ не известен (раньше сюда клали сам SERVICE_TOKEN, и утечка
// токена автоматически давала вход в публичную Studio под полным админом). Машине пароль
// не нужен: apps/api ходит статическим токеном. Перегенерируется при каждом прогоне –
// это не мешает идемпотентности, живых сессий у сервисного аккаунта нет.
// Роль – service с урезанной политикой (см. 3.1), а не Administrator: токен даёт доступ
// к данным приложения, но не к схеме, настройкам и расширениям Directus.
const svcRoleId = serviceRoleRec?.id ?? adminRole?.id ?? null;
const svcPassword = randomBytes(32).toString("hex");
const svc = await ensureUser("service@club.example.com", {
  first_name: "Service",
  last_name: "API",
  password: svcPassword,
  role: svcRoleId,
  token: SERVICE_TOKEN,
});
await client.request(updateUser(svc.id, { token: SERVICE_TOKEN, role: svcRoleId ?? undefined, password: svcPassword } as any));
log("  сервисный токен установлен (пароль сервисного аккаунта – случайный, вход паролем не предполагается)");

// Демо-аккаунты (офис + тестовый выпускник) – ТОЛЬКО при SEED_DEMO=true.
// В проде НЕ создаём: иначе editor со слабым паролем из .env.example = бэкдор.
// Офис в проде входит в админку под аккаунтом Directus Administrator.
const SEED_DEMO = process.env.SEED_DEMO === "true";
const editorRole = roles.find((x: any) => x.name === "editor");
const alumniRole = roles.find((x: any) => x.name === "alumni");
let testAlumniUser: { id: string; created: boolean } | null = null;
if (SEED_DEMO) {
  await ensureUser(req("TEST_EDITOR_EMAIL"), {
    first_name: "Тест", last_name: "Офис", password: req("TEST_EDITOR_PASSWORD"), role: editorRole?.id ?? null,
  });
  testAlumniUser = await ensureUser(req("TEST_ALUMNI_EMAIL"), {
    first_name: "Сергей", last_name: "Кондратьев", password: req("TEST_ALUMNI_PASSWORD"), role: alumniRole?.id ?? null,
  });
}

// ──────────────────────────── 5. сиды ────────────────────────────
log("== Сиды ==");
await ensureSeed("levels", "key", LEVELS.map((l) => ({ ...l, color: "" })));
await ensureSeed("point_rules", "reason", POINT_RULES.map((p) => ({ ...p, active: true })));
await ensureSeed("achievements", "key", ACHIEVEMENTS.map((a) => ({
  key: a.key, title: a.title, description: a.description, rule_json: a.rule_json, sort: a.sort, icon: a.icon, kind: a.kind,
})));
// Демо-контент (программы/новости/события/подкасты/мерч/профиль/однокурсники) – только демо.
if (SEED_DEMO) {
await ensureSeed("programs", "slug", PROGRAMS_SEED.map((p) => ({ ...p, status: "published" })));
await ensureSeed("news", "slug", NEWS_SEED.map((n) => ({ ...n, status: "published" })));
// История главной – стартовый таймлайн (дальше редактируется в админ-панели)
await ensureSeed("timeline_items", "title", [
  { year: "2024", title: "Клуб основан", text: "Первый выпуск собирается в сообщество, появляется личный кабинет.", metric: "1-й выпуск · ~40 участников", sort: 1, status: "published" },
  { year: "2024", title: "Витрина ДПО", text: "Открывается доступ к программам доп. образования со скидкой выпускника.", metric: "каталог ВШЭ · скидка выпускника", sort: 2, status: "published" },
  { year: "2025", title: "Геймификация", text: "Запуск уровней статуса, баллов и бейджей за активность в клубе.", metric: "4 уровня · 10 достижений", sort: 3, status: "published" },
  { year: "2025", title: "Мерч и партнёры", text: "Второй выпуск, фирменный мерч и первые партнёрские предложения.", metric: "2-й выпуск · мерч", sort: 4, status: "published" },
  { year: "2026", title: "Сегодня", text: "Растущее сообщество выпускников факультета права с витринами и менторством.", metric: "и это только начало", sort: 5, status: "published" },
]);
// Демо-события календаря
await ensureSeed("events", "title", [
  { title: "Встреча выпуска 2026: нетворкинг в Milutin Hall", description: "Неформальная встреча свежего выпуска: знакомство с клубом, столы по интересам, лёгкий фуршет.", starts_at: "2026-09-18T18:30:00+03:00", location: "Милютинский пер., 13", format: "offline", points: 60, status: "published" },
  { title: "Открытая лекция: карьера юриста в 2027", description: "Партнёры и инхаус-руководители о том, куда движется рынок юридических услуг.", starts_at: "2026-10-02T19:00:00+03:00", location: "Онлайн (ссылка придёт участникам)", format: "online", points: 60, status: "published" },
]);

// Демо-подкасты (доступ по подписке)
await ensureSeed("podcasts", "title", [
  { title: "Право и карьера: первые шаги после выпуска", description: "Разговор с выпускниками о старте карьеры юриста: фирмы, инхаус, госслужба.", cover: "/assets/dpo-hero.jpg", audio_url: "https://download.samplelib.com/mp3/sample-15s.mp3", duration: "42 мин", sort: 1, status: "published", is_free: true },
  { title: "M&A изнутри: как проходят большие сделки", description: "Партнёр корпоративной практики о кухне сделок слияний и поглощений.", cover: "/assets/themis.jpeg", audio_url: "https://download.samplelib.com/mp3/sample-12s.mp3", duration: "51 мин", sort: 2, status: "published" },
]);
await ensureSeed("products", "slug", PRODUCTS_SEED.map((p) => ({ ...p, status: "published" })));

// Профиль для тестового выпускника (если ещё нет)
const alumniRows = (await client.request(
  (readItems as any)("alumni", { filter: { user_id: { _eq: testAlumniUser!.id } }, limit: 1 }),
)) as any[];
if (!alumniRows.length) {
  await client.request(
    (createItems as any)("alumni", [
      {
        user_id: testAlumniUser!.id,
        fio: "Сергей Кондратьев",
        cohort: "2026",
        edu_program: "Публичное право",
        edu_level: "магистратура",
        status: "active",
        verification_status: "verified",
        points_cached: 120,
        level_cached: "graduate",
        personal_discount: 0,
        referral_code: "SERGEY2026",
      },
    ]),
  );
  log("  + профиль alumni для тестового выпускника");
}

// Демо-однокурсники для «Сообщества» (тот же выпуск 2026 / ОП «Публичное право»).
const CLASSMATES = [
  { fio: "Алина Ветрова", cohort: "2026", edu_program: "Публичное право", edu_level: "магистратура", interests_json: ["Публичное право", "GR и публичная политика"], referral_code: "ALINA2026" },
  { fio: "Максим Столяров", cohort: "2026", edu_program: "Публичное право", edu_level: "магистратура", interests_json: ["Налоговое право", "Комплаенс и антикоррупция"], referral_code: "MAKSIM2026" },
  { fio: "Дарья Ким", cohort: "2026", edu_program: "Цифровое право", edu_level: "магистратура", interests_json: ["Цифровое право и IT", "LegalTech"], referral_code: "DARIA2026" },
];
for (const c of CLASSMATES) {
  const ex = (await client.request((readItems as any)("alumni", { filter: { referral_code: { _eq: c.referral_code } }, limit: 1, fields: ["id"] }))) as any[];
  if (!ex.length) {
    await client.request((createItems as any)("alumni", [{ ...c, status: "active", verification_status: "verified", points_cached: 80, level_cached: "graduate", personal_discount: 0 }]));
    log(`  + однокурсник ${c.fio}`);
  }
}

}
log("\n✓ Bootstrap завершён. Повторный запуск идемпотентен.");
process.exit(0);
