import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkoutPool } from "./checkout-store.js";
import { data, executeData } from "./data.js";
import {
  aggregate, createItem, createItems, deleteItem, deleteItems, deleteUser,
  readItem, readItems, readUser, updateItem, updateItems, updateUser,
  type DataCommand,
} from "./data-commands.js";

const enabled = process.env.RUN_DATA_INTEGRATION === "true";
if (enabled && new URL(process.env.CHECKOUT_DATABASE_URL!).pathname !== "/alumni_staged") {
  throw new Error("Для SQL-тестов допустима только alumni_staged");
}
const pool = enabled ? checkoutPool() : null;
let client: PoolClient;
const run = (command: DataCommand) => executeData(client, command);
const invalid = "Недопустимый внутренний запрос данных";

describe.skipIf(!enabled)("PostgreSQL: внутренний слой данных", () => {
  beforeEach(async () => {
    client = await pool!.connect();
    await client.query("BEGIN");
  });
  afterEach(async () => {
    if (!client) return;
    await client.query("ROLLBACK");
    client.release();
  });
  afterAll(async () => { await pool?.end(); });

  it("отклоняет посторонние таблицы, поля, сортировку и агрегаты до исполнения SQL", async () => {
    const injection = 'id"; DROP TABLE programs; --';
    const requests: DataCommand[] = [
      readItems('programs"; DROP TABLE programs; --'),
      readItems("programs", { fields: [injection] }),
      readItems("programs", { filter: { [injection]: { _eq: "x" } } }),
      readItems("programs", { sort: [injection] }),
      aggregate("programs", { aggregate: { sum: injection } }),
      aggregate("programs", { aggregate: { count: "*" }, groupBy: [injection] }),
      createItem("programs", { [injection]: "x" }),
      updateItem("programs", randomUUID(), { [injection]: "x" }),
      readItems("constructor"),
      readItems("programs", { filter: { title: { _raw: "TRUE" } } }),
    ];
    for (const request of requests) await expect(run(request)).rejects.toThrow(invalid);
    expect((await client.query("SELECT to_regclass('public.programs') AS table_name")).rows[0].table_name).toBe("programs");
  });

  it("сохраняет SQL-подобные значения как текст и сравнивает только точное значение", async () => {
    const text = "Robert'); DELETE FROM programs; -- OR '1'='1";
    const first = await run(createItem("programs", { slug: randomUUID(), title: text }));
    const second = await run(createItem("programs", { slug: randomUUID(), title: "Соседняя запись" }));
    expect(await run(readItems("programs", { fields: ["id", "title"], filter: { title: { _eq: text } } }))).toEqual([{ id: first.id, title: text }]);
    expect((await run(readItem("programs", second.id))).title).toBe("Соседняя запись");
    await run(updateItem("programs", first.id, { description: text }));
    expect((await client.query("SELECT description FROM programs WHERE id=$1", [first.id])).rows[0].description).toBe(text);
  });

  it("не раскрывает секретные поля пользователей и закрывает общие записи ролей, файлов и настроек", async () => {
    const id = randomUUID();
    await client.query("INSERT INTO directus_users(id,email,password,token,tfa_secret,auth_data) VALUES($1,$2,'synthetic-password-hash','synthetic-token','synthetic-factor',$3::json)", [id, `${id}@example.test`, JSON.stringify({ synthetic: true })]);
    const user = await run(readUser(id));
    expect(Object.keys(user).sort()).toEqual(["email", "first_name", "id", "last_name", "role", "status"]);
    for (const secret of ["password", "token", "tfa_secret", "auth_data", "provider"]) {
      await expect(run(readUser(id, { fields: [secret] }))).rejects.toThrow(invalid);
      await expect(run(readItems("directus_users", { filter: { [secret]: { _eq: "x" } } }))).rejects.toThrow(invalid);
      await expect(run(updateUser(id, { [secret]: "x" }))).rejects.toThrow(invalid);
    }
    for (const request of [
      createItem("directus_users", { email: "nobody@example.test" }),
      updateItem("directus_users", id, { status: "active" }),
      deleteItem("directus_users", id),
      createItem("directus_roles", { name: "admin" }),
      updateItem("directus_roles", id, { name: "admin" }),
      deleteItem("directus_roles", id),
      readItems("directus_files"),
      readItems("club_settings"),
    ]) await expect(run(request)).rejects.toThrow(invalid);
  });

  it("разрешает профиль и удаление alumni, но не меняет текущего сотрудника и его роль", async () => {
    const users = new Map<string, string>();
    const roles = new Map<string, string>();
    for (const name of ["alumni", "editor", "admin"]) {
      const role = randomUUID(), id = randomUUID();
      await client.query("INSERT INTO directus_roles(id,name) VALUES($1,$2)", [role, name]);
      await client.query("INSERT INTO directus_users(id,email,role,status,first_name) VALUES($1,$2,$3,'active','Прежнее имя')", [id, `${id}@example.test`, role]);
      users.set(name, id); roles.set(name, role);
    }
    const alumni = users.get("alumni")!;
    await run(updateUser(alumni, { first_name: "Новое имя", status: "suspended" }));
    expect(await run(readUser(alumni))).toMatchObject({ first_name: "Новое имя", status: "suspended", role: roles.get("alumni") });
    await expect(run(updateUser(alumni, { role: roles.get("admin") }))).rejects.toThrow(invalid);
    for (const name of ["editor", "admin"]) {
      const id = users.get(name)!;
      await run(updateUser(id, { first_name: "Изменённое имя", status: "suspended" }));
      await run(deleteUser(id));
      expect(await run(readUser(id))).toMatchObject({ first_name: "Прежнее имя", status: "active", role: roles.get(name) });
    }
    await client.query("UPDATE directus_users SET role=$2 WHERE id=$1", [alumni, roles.get("editor")]);
    await run(deleteUser(alumni));
    expect((await run(readUser(alumni))).role).toBe(roles.get("editor"));
    await client.query("UPDATE directus_users SET role=$2 WHERE id=$1", [alumni, roles.get("alumni")]);
    await run(deleteUser(alumni));
    await expect(run(readUser(alumni))).rejects.toMatchObject({ statusCode: 404 });
  });

  it("пишет и обновляет JSON и даты без двойного кодирования, сохраняет NULL и возвращает ISO", async () => {
    const nested = { label: "Обсуждение", values: ["Один", 2, null], details: { active: true } };
    const program = await run(createItem("programs", { slug: randomUUID(), title: "Программа", modules: nested, dates: ["2026-10-01"] }));
    expect(program.modules).toEqual(nested);
    expect((await client.query("SELECT modules->'details'->>'active' AS value FROM programs WHERE id=$1", [program.id])).rows[0].value).toBe("true");
    const event = await run(createItem("events", { title: "Встреча", starts_at: "2026-10-01T15:45:00+03:00" }));
    expect(event.starts_at).toBe("2026-10-01T12:45:00.000Z");
    expect(Number.isFinite(Date.parse(event.created_at))).toBe(true);
    const changed = await run(updateItem("programs", program.id, { modules: ["Новая тема"], dates: null, description: undefined }));
    expect(changed.modules).toEqual(["Новая тема"]);
    expect(changed.dates).toBeNull();
    expect((await client.query("SELECT modules, dates FROM programs WHERE id=$1", [program.id])).rows[0]).toEqual({ modules: ["Новая тема"], dates: null });
    await run(deleteItem("events", event.id));
    await expect(run(readItem("events", event.id))).rejects.toMatchObject({ statusCode: 404 });
  });

  it("сочетает NULL, логические группы и списки, включая пустой in/nin", async () => {
    const rows = [];
    for (const [title, price] of [["A", null], ["B", 10], ["C", 20]] as const) {
      rows.push(await run(createItem("programs", { slug: randomUUID(), title, price })));
    }
    const ids = rows.map(row => row.id);
    const find = async (condition: object) => (await run(readItems("programs", {
      fields: ["title"], sort: ["title"], filter: { _and: [{ id: { _in: ids } }, condition] },
    }))).map((row: { title: string }) => row.title);
    expect(await find({ price: { _eq: null } })).toEqual(["A"]);
    expect(await find({ price: { _neq: null } })).toEqual(["B", "C"]);
    expect(await find({ price: { _null: false } })).toEqual(["B", "C"]);
    expect(await find({ price: { _nnull: false } })).toEqual(["A"]);
    expect(await find({ _or: [{ price: { _null: true } }, { price: { _gte: 20 } }] })).toEqual(["A", "C"]);
    expect(await find({ id: { _in: [] } })).toEqual([]);
    expect(await find({ id: { _nin: [] } })).toEqual(["A", "B", "C"]);
    expect(await find({ id: { _nin: [rows[1].id] } })).toEqual(["A", "C"]);
    expect(await find({ _or: [] })).toEqual([]);
    expect(await find({ _and: [] })).toEqual(["A", "B", "C"]);
  });

  it("поиск трактует %, _ и обратный слеш буквально", async () => {
    const literal = "Prefix_100%\\Case";
    const exact = await run(createItem("programs", { slug: randomUUID(), title: literal }));
    const decoy = await run(createItem("programs", { slug: randomUUID(), title: "PrefixX100anythingCase" }));
    const find = async (operator: string, value: string) => (await run(readItems("programs", {
      fields: ["id"], filter: { id: { _in: [exact.id, decoy.id] }, title: { [operator]: value } },
    }))).map((row: { id: string }) => row.id);
    expect(await find("_contains", "_100%\\")).toEqual([exact.id]);
    expect(await find("_icontains", "prefix_100%\\case")).toEqual([exact.id]);
    expect(await find("_starts_with", "Prefix_100%\\")).toEqual([exact.id]);
    expect(await find("_contains", "prefix")).toEqual([]);
  });

  it("считает count/sum/group с фильтром и пустым результатом", async () => {
    const rows = [];
    for (const [direction, price] of [["A", 10], ["A", 20], ["B", null], ["B", 99]] as const) {
      rows.push(await run(createItem("programs", { slug: randomUUID(), title: "Программа", direction, price })));
    }
    const filter = { id: { _in: rows.slice(0, 3).map(row => row.id) } };
    expect(await run(aggregate("programs", { aggregate: { count: "*" }, query: { filter } }))).toEqual([{ count: "3" }]);
    expect(await run(aggregate("programs", { aggregate: { sum: "price" }, query: { filter } }))).toEqual([{ sum: { price: "30" } }]);
    const grouped = await run(aggregate("programs", { aggregate: { sum: "price" }, groupBy: ["direction"], query: { filter } }));
    expect(grouped.sort((a: { direction: string }, b: { direction: string }) => a.direction.localeCompare(b.direction))).toEqual([
      { direction: "A", sum: { price: "30" } }, { direction: "B", sum: { price: null } },
    ]);
    expect(await run(aggregate("programs", { aggregate: { count: "*" }, query: { filter: { id: { _in: [] } } } }))).toEqual([{ count: "0" }]);
  });

  it("читает и меняет M2A-блоки в порядке sort, включая проекцию страницы без id", async () => {
    const page = await run(createItem("pages", { slug: randomUUID(), title: "Страница" }));
    const other = await run(createItem("pages", { slug: randomUUID(), title: "Другая страница" }));
    const hero = await run(createItem("block_hero", { title_pre: "Заголовок", marquee: ["Первый", "Второй"] }));
    const cta = await run(createItem("block_cta", { title: "Действие", text: "Текст" }));
    await run(createItem("pages_blocks", { pages_id: page.id, collection: "block_cta", item: cta.id, sort: 20 }));
    await run(createItem("pages_blocks", { pages_id: page.id, collection: "block_hero", item: hero.id, sort: 10 }));
    await run(createItem("pages_blocks", { pages_id: other.id, collection: "block_cta", item: cta.id, sort: 1 }));
    await run(updateItem("block_hero", hero.id, { title_pre: "Исправленный заголовок", marquee: ["Новый"] }));
    const fields = ["slug", "blocks.collection", "blocks.sort", "blocks.item:block_hero.*", "blocks.item:block_cta.*"];
    const expanded = await run(readItem("pages", page.id, { fields }));
    expect(expanded).not.toHaveProperty("id");
    expect(expanded.slug).toBe(page.slug);
    expect(expanded.blocks).toHaveLength(2);
    expect(expanded.blocks.map((block: { collection: string; sort: number }) => [block.collection, block.sort])).toEqual([["block_hero", 10], ["block_cta", 20]]);
    expect(expanded.blocks[0].item).toMatchObject({ id: hero.id, title_pre: "Исправленный заголовок", marquee: ["Новый"] });
    expect(expanded.blocks[1].item).toMatchObject({ id: cta.id, title: "Действие" });
    expect(await run(readItems("pages", { fields, filter: { id: { _eq: other.id } } }))).toMatchObject([{ slug: other.slug, blocks: [{ collection: "block_cta", sort: 1 }] }]);
  });

  it("откатывает весь createItems при SQL-сбое второй записи", async () => {
    const slug = `batch-${randomUUID()}`;
    try {
      // data.request открывает собственную транзакцию; чтение идёт другим соединением.
      await expect(data.request(createItems("programs", [
        { slug, title: "Первая запись" }, { slug, title: "Дублирующая запись" },
      ]))).rejects.toMatchObject({ code: "23505" });
      expect((await pool!.query("SELECT id FROM programs WHERE slug=$1", [slug])).rows).toEqual([]);
    } finally {
      await pool!.query("DELETE FROM programs WHERE slug=$1", [slug]);
    }
  });

  it("ограничивает pagination и bulk-запись, возвращает 404 для отсутствующей записи", async () => {
    const rows = [];
    for (const title of ["A", "B", "C"]) rows.push(await run(createItem("programs", { slug: randomUUID(), title })));
    const filter = { id: { _in: rows.map(row => row.id) } };
    expect(await run(readItems("programs", { fields: ["title"], filter, sort: ["-title"], limit: 1, page: 2 }))).toEqual([{ title: "B" }]);
    for (const query of [{ limit: -2 }, { offset: -1 }, { page: 0 }, { limit: 1.5 }]) {
      await expect(run(readItems("programs", query))).rejects.toThrow(invalid);
    }
    await expect(run(updateItems("programs", {}, { title: "Все записи" }))).rejects.toThrow(invalid);
    await expect(run(deleteItems("programs", { filter: {} }))).rejects.toThrow(invalid);
    await expect(run(updateItem("programs", rows[0].id, { id: randomUUID() }))).rejects.toThrow(invalid);
    await expect(run(updateItem("programs", randomUUID(), { title: "Нет записи" }))).rejects.toMatchObject({ statusCode: 404 });
    expect(await run(updateItems("programs", { filter }, { status: "published" }))).toHaveLength(3);
    await run(deleteItems("programs", { filter }));
    expect(await run(readItems("programs", { filter }))).toEqual([]);
  });
});
