import { randomUUID } from "node:crypto";
import type { Descriptor } from "./fake-sdk.js";

/**
 * Directus в памяти: хранит коллекции как массивы объектов и исполняет описания
 * запросов из fake-sdk. Нужен, чтобы тесты роутов проверяли настоящую логику
 * (гарды, переоценку, идемпотентность), а не моки на каждый вызов.
 *
 * Поддержан тот минимум операторов фильтра, который реально используют роуты.
 * Неизвестный оператор — исключение, а не тихое «ничего не нашлось»: молчаливое
 * расхождение с прод-поведением обесценило бы тест.
 */

export type Row = Record<string, any>;
export const db: Record<string, Row[]> = {};

export function resetDb(seed: Record<string, Row[]> = {}): void {
  for (const k of Object.keys(db)) delete db[k];
  for (const [k, v] of Object.entries(seed)) db[k] = v.map((r) => ({ ...r }));
}

function matchOp(value: any, op: string, operand: any): boolean {
  switch (op) {
    case "_eq": return value === operand;
    case "_neq": return value !== operand;
    case "_in": return Array.isArray(operand) && operand.includes(value);
    case "_null": return operand ? value === null || value === undefined : value !== null && value !== undefined;
    case "_nnull": return operand ? value !== null && value !== undefined : value === null || value === undefined;
    case "_lt": return value < operand;
    case "_lte": return value <= operand;
    case "_gt": return value > operand;
    case "_gte": return value >= operand;
    case "_contains": return String(value ?? "").includes(String(operand));
    case "_starts_with": return String(value ?? "").startsWith(String(operand));
    case "_empty": return operand ? !value || (Array.isArray(value) && !value.length) : !!value;
    default: throw new Error(`fake-directus: оператор ${op} не реализован — добавьте его, иначе тест проверяет не то`);
  }
}

function matchFilter(row: Row, filter: any): boolean {
  if (!filter) return true;
  return Object.entries(filter).every(([key, cond]) => {
    if (key === "_and") return (cond as any[]).every((c) => matchFilter(row, c));
    if (key === "_or") return (cond as any[]).some((c) => matchFilter(row, c));
    const value = row[key];
    if (cond && typeof cond === "object" && !Array.isArray(cond)) {
      return Object.entries(cond as Record<string, any>).every(([op, operand]) => matchOp(value, op, operand));
    }
    return value === cond;
  });
}

function applySort(rows: Row[], sort?: string[]): Row[] {
  if (!sort?.length) return rows;
  const keys = sort.map((s) => (s.startsWith("-") ? { key: s.slice(1), dir: -1 } : { key: s, dir: 1 }));
  return [...rows].sort((a, b) => {
    for (const { key, dir } of keys) {
      if (a[key] === b[key]) continue;
      return (a[key] > b[key] ? 1 : -1) * dir;
    }
    return 0;
  });
}

/** Разворачивает точечные поля («role.name») в вложенный объект, как это делает Directus. */
function project(row: Row, fields?: string[]): Row {
  if (!fields?.length || fields.includes("*")) return { ...row };
  const out: Row = {};
  for (const f of fields) {
    if (!f.includes(".")) { out[f] = row[f]; continue; }
    const [head, ...rest] = f.split(".");
    const nested = row[head!];
    if (nested === undefined || nested === null) { out[head!] = nested ?? null; continue; }
    out[head!] = typeof nested === "object" ? { ...(out[head!] ?? {}), [rest.join(".")]: nested[rest.join(".")] } : nested;
  }
  return out;
}

function table(name: string): Row[] {
  db[name] ??= [];
  return db[name];
}

export async function request(desc: Descriptor): Promise<any> {
  switch (desc.kind) {
    case "readItems":
    case "readUsers": {
      const rows = table(desc.collection!).filter((r) => matchFilter(r, desc.query?.filter));
      const sorted = applySort(rows, desc.query?.sort);
      const limit = desc.query?.limit;
      const limited = typeof limit === "number" && limit >= 0 ? sorted.slice(0, limit) : sorted;
      return limited.map((r) => project(r, desc.query?.fields));
    }
    case "readItem": {
      const row = table(desc.collection!).find((r) => r.id === desc.id);
      return row ? project(row, desc.query?.fields) : null;
    }
    case "createItem": {
      const row = { id: randomUUID(), ...desc.data };
      // Уникальность номера заявки: в БД это UNIQUE-индекс, роут рассчитывает на отказ.
      if (desc.collection === "orders" && table("orders").some((r) => r.number === row.number)) {
        throw new Error("duplicate key value violates unique constraint (orders.number)");
      }
      table(desc.collection!).push(row);
      return { ...row };
    }
    case "createItems": {
      const rows = (desc.data as Row[]).map((d) => ({ id: randomUUID(), ...d }));
      table(desc.collection!).push(...rows);
      return rows.map((r) => ({ ...r }));
    }
    case "updateItem": {
      const row = table(desc.collection!).find((r) => r.id === desc.id);
      if (!row) throw new Error(`fake-directus: нет записи ${desc.collection}/${desc.id}`);
      Object.assign(row, desc.data);
      return { ...row };
    }
    case "deleteItem": {
      const t = table(desc.collection!);
      const i = t.findIndex((r) => r.id === desc.id);
      if (i >= 0) t.splice(i, 1);
      return null;
    }
    case "aggregate": {
      const rows = table(desc.collection!).filter((r) => matchFilter(r, desc.query?.query?.filter));
      const agg = desc.query?.aggregate ?? {};
      if (agg.count) return [{ count: String(rows.length) }];
      if (agg.sum) {
        const field = Array.isArray(agg.sum) ? agg.sum[0] : agg.sum;
        return [{ sum: { [field]: rows.reduce((s, r) => s + (Number(r[field]) || 0), 0) } }];
      }
      return [{}];
    }
    default:
      throw new Error(`fake-directus: операция ${desc.kind} не реализована`);
  }
}

/** Мок модуля lib/directus.js целиком (роуты импортируют именно его). */
export const directusModuleMock = {
  directus: { request },
  checkDirectus: async () => ({ ok: true, serviceUser: "service@test", levelsSeeded: table("levels").length }),
};
