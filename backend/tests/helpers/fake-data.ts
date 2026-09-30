import { randomUUID } from "node:crypto";
import type { DataCommand } from "../../src/db/data-commands.js";

/**
 * Хранилище HTTP-тестов исполняет настоящие команды data-commands по данным
 * в памяти. Гарды и бизнес-правила остаются в модулях приложения;
 * SQL-транзакции и ограничения проверяются отдельно на PostgreSQL.
 *
 * Поддержан тот минимум операторов фильтра, который реально используют роуты.
 * Неизвестный оператор – исключение, а не тихое «ничего не нашлось»: молчаливое
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
    // _neq тоже повторяет SQL: `NULL != 'x'` неопределено → строка не попадает.
    // Роуты, которым нужны и NULL-строки, обязаны писать явную ветку _null.
    case "_neq": return value !== null && value !== undefined && value !== operand;
    case "_in": return Array.isArray(operand) && operand.includes(value);
    // _nin повторяет семантику SQL NOT IN: для NULL/undefined сравнение неопределено
    // и строка НЕ попадает в выборку. Иначе тест расходился бы с продом ровно там,
    // где это опаснее всего – на «ещё не заполненных» полях.
    case "_nin": return value !== null && value !== undefined && Array.isArray(operand) && !operand.includes(value);
    case "_null": return operand ? value === null || value === undefined : value !== null && value !== undefined;
    case "_nnull": return operand ? value !== null && value !== undefined : value === null || value === undefined;
    case "_lt": return value < operand;
    case "_lte": return value <= operand;
    case "_gt": return value > operand;
    case "_gte": return value >= operand;
    case "_contains": return String(value ?? "").includes(String(operand));
    case "_starts_with": return String(value ?? "").startsWith(String(operand));
    case "_empty": return operand ? !value || (Array.isArray(value) && !value.length) : !!value;
    default: throw new Error(`fake-data: оператор ${op} не реализован – добавьте его, иначе тест проверяет не то`);
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

function applySort(rows: Row[], sort?: readonly string[]): Row[] {
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

function project(row: Row, fields?: readonly string[]): Row {
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

export async function request(desc: DataCommand): Promise<any> {
  switch (desc.kind) {
    case "readItems": {
      const rows = table(desc.collection).filter((r) => matchFilter(r, desc.query?.filter));
      const sorted = applySort(rows, desc.query?.sort);
      const limit = desc.query?.limit ?? 100;
      const offset = desc.query?.offset ?? ((desc.query?.page ?? 1) - 1) * (limit === -1 ? 0 : limit);
      const limited = typeof limit === "number" && limit >= 0 ? sorted.slice(offset, offset + limit) : sorted.slice(offset);
      return limited.map((r) => project(r, desc.query?.fields));
    }
    case "readItem": {
      const row = table(desc.collection).find((r) => r.id === desc.id && matchFilter(r, desc.query?.filter));
      if (!row) throw Object.assign(new Error("Запись не найдена"), { statusCode: 404 });
      return project(row, desc.query?.fields);
    }
    case "createItem": {
      // В рабочей БД UUID и created_at заполняются DEFAULT; временные фильтры
      // (например дедупликация прослушиваний) должны видеть эти поля и в тесте.
      const row: Row = { id: randomUUID(), created_at: new Date().toISOString(), ...desc.data };
      // Уникальность номера заявки: в БД это UNIQUE-индекс, роут рассчитывает на отказ.
      if (desc.collection === "orders" && table("orders").some((r) => r.number === row.number)) {
        throw Object.assign(new Error("duplicate key value violates unique constraint (orders.number)"), { code: "23505" });
      }
      table(desc.collection!).push(row);
      return { ...row };
    }
    case "createItems": {
      const rows = (desc.data as Row[]).map((d) => ({ id: randomUUID(), created_at: new Date().toISOString(), ...d }));
      table(desc.collection!).push(...rows);
      return rows.map((r) => ({ ...r }));
    }
    case "updateItem": {
      const row = table(desc.collection!).find((r) => r.id === desc.id);
      if (!row) throw new Error(`fake-data: нет записи ${desc.collection}/${desc.id}`);
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
      const rows = table(desc.collection).filter((r) => matchFilter(r, desc.query?.filter));
      const agg = desc.aggregate ?? {};
      const groupBy = desc.groupBy;
      if (groupBy?.length && agg.count) {
        const buckets = new Map<string, Row & { count: string }>();
        for (const r of rows) {
          const key = JSON.stringify(groupBy.map(g => r[g] ?? null));
          const prev = buckets.get(key);
          if (prev) {
            prev.count = String(Number(prev.count) + 1);
          } else {
            const base: Row & { count: string } = { count: "1" };
            for (const g of groupBy) base[g] = r[g] ?? null;
            buckets.set(key, base);
          }
        }
        return [...buckets.values()];
      }
      if (agg.count) return [{ count: String(rows.length) }];
      if (agg.sum) {
        const field = agg.sum;
        const values = rows.map(r => r[field]).filter(value => value !== null && value !== undefined);
        return [{ sum: { [field]: values.length ? String(values.reduce((total, value) => total + Number(value), 0)) : null } }];
      }
      throw new Error("fake-data: неподдерживаемый агрегат; проверьте SQL-интеграционный тест");
    }
    default:
      throw new Error(`fake-data: операция ${desc.kind} не реализована`);
  }
}

export const dataModuleMock = { data: { request } };
