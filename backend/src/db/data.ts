import type { PoolClient } from "pg";
import { checkoutPool } from "./checkout-store.js";
import type { DataCommand, DataQuery } from "./data-commands.js";
import { DATA_COLUMNS, JSON_COLUMNS } from "./data-schema.js";
import { assertMediaReferences } from "../modules/media/media-store.js";
export type * from "./data-models.js";

type Database = Pick<PoolClient, "query">;
type Row = Record<string, any>;
const invalid = () => new Error("Недопустимый внутренний запрос данных");
const quote = (name: string) => `"${name}"`;

function columns(table: string): readonly string[] {
  if (!Object.hasOwn(DATA_COLUMNS, table)) throw invalid();
  return DATA_COLUMNS[table]!;
}
function field(table: string, name: string): string {
  if (!columns(table).includes(name)) throw invalid();
  return quote(name);
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

class Parameters {
  values: unknown[] = [];
  add(value: unknown) { this.values.push(value); return `$${this.values.length}`; }
}

function where(table: string, input: unknown, p: Parameters, depth = 0): string {
  if (input === undefined) return "TRUE";
  if (!record(input) || depth > 12) throw invalid();
  const clauses = Object.entries(input).map(([key, condition]) => {
    if (key === "_and" || key === "_or") {
      if (!Array.isArray(condition) || condition.length > 1000) throw invalid();
      if (!condition.length) return key === "_and" ? "TRUE" : "FALSE";
      return `(${condition.map((part) => where(table, part, p, depth + 1)).join(key === "_and" ? " AND " : " OR ")})`;
    }
    const column = field(table, key);
    if (!record(condition)) throw invalid();
    return Object.entries(condition).map(([operator, value]) => {
      const comparisons: Record<string, string> = { _eq: "=", _neq: "<>", _gt: ">", _gte: ">=", _lt: "<", _lte: "<=" };
      if (Object.hasOwn(comparisons, operator)) {
        if (value === null && (operator === "_eq" || operator === "_neq")) return `${column} IS ${operator === "_neq" ? "NOT " : ""}NULL`;
        if (record(value) || Array.isArray(value)) throw invalid();
        return `${column} ${comparisons[operator]} ${p.add(value)}`;
      }
      if (operator === "_null" || operator === "_nnull") {
        if (typeof value !== "boolean") throw invalid();
        return `${column} IS ${(operator === "_nnull") === value ? "NOT " : ""}NULL`;
      }
      if (operator === "_in" || operator === "_nin") {
        if (!Array.isArray(value) || value.length > 20000 || value.some((v) => record(v) || Array.isArray(v))) throw invalid();
        if (!value.length) return operator === "_in" ? "FALSE" : "TRUE";
        return `${column} ${operator === "_nin" ? "NOT " : ""}IN (${value.map((v) => p.add(v)).join(",")})`;
      }
      if (["_icontains", "_contains", "_starts_with"].includes(operator)) {
        if (typeof value !== "string") throw invalid();
        const escaped = value.replace(/[\\%_]/g, "\\$&");
        return `${column} ${operator === "_icontains" ? "ILIKE" : "LIKE"} ${p.add(`${operator === "_starts_with" ? "" : "%"}${escaped}%`)}`;
      }
      throw invalid();
    }).join(" AND ") || "TRUE";
  });
  return clauses.map((c) => `(${c})`).join(" AND ") || "TRUE";
}

const PAGE_BLOCK_FIELDS = new Set(["blocks.collection", "blocks.sort", "blocks.item:block_hero.*", "blocks.item:block_cta.*"]);
function selection(table: string, query: DataQuery): string {
  const fields = query.fields ?? ["*"];
  if (!fields.length) throw invalid();
  const names = fields.flatMap((name) => {
    if (table === "pages" && PAGE_BLOCK_FIELDS.has(name)) return [];
    return name === "*" ? columns(table).map(quote) : [field(table, name)];
  });
  return [...new Set(names)].join(",") || field(table, "id");
}
function pagination(table: string, query: DataQuery, p: Parameters): string {
  let sql = "";
  if (query.sort?.length) sql += ` ORDER BY ${query.sort.map((f) => `${field(table, f.replace(/^-/, ""))} ${f.startsWith("-") ? "DESC" : "ASC"}`).join(",")}`;
  const limit = query.limit ?? 100;
  const offset = query.offset ?? ((query.page ?? 1) - 1) * (limit === -1 ? 0 : limit);
  if (!Number.isSafeInteger(limit) || limit < -1 || !Number.isSafeInteger(offset) || offset < 0) throw invalid();
  if (limit !== -1) sql += ` LIMIT ${p.add(limit)}`;
  if (offset) sql += ` OFFSET ${p.add(offset)}`;
  return sql;
}

function normalize(value: any): any {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (record(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalize(v)]));
  return value;
}

async function attachBlocks(db: Database, rows: Row[]) {
  if (!rows.length) return;
  const { rows: blocks } = await db.query(`SELECT b.pages_id, b.collection, b.sort,
    CASE b.collection WHEN 'block_hero' THEN to_jsonb(h) WHEN 'block_cta' THEN to_jsonb(c) END AS item
    FROM pages_blocks b
    LEFT JOIN block_hero h ON b.collection='block_hero' AND b.item=h.id::text
    LEFT JOIN block_cta c ON b.collection='block_cta' AND b.item=c.id::text
    WHERE b.pages_id=ANY($1::uuid[]) ORDER BY b.sort,b.id`, [rows.map((r) => r.id)]);
  for (const row of rows) row.blocks = blocks.filter((b) => b.pages_id === row.id).map(({ pages_id: _page, ...b }) => b);
}

function writeValues(table: string, input: unknown, p: Parameters): { names: string[]; params: string[] } {
  if (!record(input)) throw invalid();
  const entries = Object.entries(input).filter(([, v]) => v !== undefined);
  const names = entries.map(([key]) => field(table, key));
  const params = entries.map(([key, value]) => p.add(JSON_COLUMNS[table]?.includes(key) && value !== null ? JSON.stringify(value) : value));
  return { names, params };
}

// Идентификаторы SQL берутся из allowlist, значения передаются параметрами.
export async function executeData(db: Database, command: DataCommand): Promise<any> {
  const table = command.collection;
  columns(table);
  const p = new Parameters();
  const query = command.query ?? {};
  const one = command.kind === "readItem";
  if (command.kind === "readItems" || one) {
    const blocks = table === "pages" && query.fields?.some((f) => PAGE_BLOCK_FIELDS.has(f));
    const hiddenId = blocks && !query.fields?.some((f) => f === "id" || f === "*");
    const projected = hiddenId ? { ...query, fields: [...query.fields!, "id"] } : query;
    const filter = one ? { _and: [query.filter ?? {}, { id: { _eq: command.id } }] } : query.filter;
    const sql = `SELECT ${selection(table, projected)} FROM ${quote(table)} WHERE ${where(table, filter, p)}${pagination(table, one ? { ...query, limit: 1 } : query, p)}`;
    const { rows } = await db.query(sql, p.values);
    if (blocks) await attachBlocks(db, rows);
    if (hiddenId) for (const row of rows) delete row.id;
    if (one && !rows.length) throw Object.assign(new Error("Запись не найдена"), { statusCode: 404 });
    return normalize(one ? rows[0] : rows);
  }
  if (command.kind === "aggregate") {
    const group = command.groupBy ?? [];
    const grouped = group.map((f) => field(table, f));
    const aggregate = command.aggregate;
    let expression: string;
    if (aggregate?.count === "*") expression = 'COUNT(*)::text AS "count"';
    else if (aggregate?.sum) expression = `json_build_object(${p.add(aggregate.sum)}::text,SUM(${field(table, aggregate.sum)})::text) AS "sum"`;
    else throw invalid();
    const sql = `SELECT ${[...grouped, expression].join(",")} FROM ${quote(table)} WHERE ${where(table, query.filter, p)}${grouped.length ? ` GROUP BY ${grouped.join(",")}` : ""}`;
    return normalize((await db.query(sql, p.values)).rows);
  }
  // Пароли, роли и файлы изменяются только специализированными модулями.
  if (table.startsWith("directus_")) {
    if (table !== "directus_users" || !["updateAlumniUser", "deleteAlumniUser"].includes(command.kind)) throw invalid();
    if (!command.id) throw invalid();
    const predicate = `id=${p.add(command.id)} AND role IN (SELECT id FROM directus_roles WHERE name='alumni')`;
    if (command.kind === "deleteAlumniUser") { await db.query(`DELETE FROM directus_users WHERE ${predicate}`, p.values); return null; }
    if (!record(command.data) || Object.keys(command.data).some((k) => !["email", "first_name", "last_name", "status"].includes(k))) throw invalid();
    const values = writeValues(table, command.data, p);
    if (values.names.length) await db.query(`UPDATE directus_users SET ${values.names.map((n, i) => `${n}=${values.params[i]}`).join(",")} WHERE ${predicate}`, p.values);
    return null;
  }
  if (command.kind === "createItems") {
    if (!Array.isArray(command.data)) throw invalid();
    const rows = [];
    for (const item of command.data) rows.push(await executeData(db, { ...command, kind: "createItem", data: item }));
    return rows;
  }
  if (command.kind === "createItem") {
    if (record(command.data)) await assertMediaReferences(db, table, command.data);
    const { names, params } = writeValues(table, command.data, p);
    const insert = names.length ? `(${names.join(",")}) VALUES (${params.join(",")})` : "DEFAULT VALUES";
    return normalize((await db.query(`INSERT INTO ${quote(table)} ${insert} RETURNING ${selection(table, {})}`, p.values)).rows[0]);
  }
  const single = command.kind === "updateItem" || command.kind === "deleteItem";
  if (single && !command.id) throw invalid();
  if (!single && (!record(query.filter) || !Object.keys(query.filter).length)) throw invalid();
  const filter = single ? { id: { _eq: command.id } } : query.filter;
  if (["updateItem", "updateItems"].includes(command.kind)) {
    if (record(command.data)) await assertMediaReferences(db, table, command.data);
    const values = writeValues(table, command.data, p);
    if (values.names.includes('"id"')) throw invalid();
    if (!values.names.length) return single ? executeData(db, { kind: "readItem", collection: table, id: command.id }) : [];
    const { rows } = await db.query(`UPDATE ${quote(table)} SET ${values.names.map((n, i) => `${n}=${values.params[i]}`).join(",")} WHERE ${where(table, filter, p)} RETURNING ${selection(table, {})}`, p.values);
    if (single && !rows.length) throw Object.assign(new Error("Запись не найдена"), { statusCode: 404 });
    return normalize(single ? rows[0] : rows);
  }
  if (["deleteItem", "deleteItems"].includes(command.kind)) { await db.query(`DELETE FROM ${quote(table)} WHERE ${where(table, filter, p)}`, p.values); return null; }
  throw invalid();
}

export const data = {
  async request(command: DataCommand): Promise<any> {
    if (["readItems", "readItem", "aggregate"].includes(command.kind)) return executeData(checkoutPool(), command);
    const client = await checkoutPool().connect();
    try {
      await client.query("BEGIN");
      const result = await executeData(client, command);
      await client.query("COMMIT");
      return result;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  },
};
