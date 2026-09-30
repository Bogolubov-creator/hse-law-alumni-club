import { updateItems, deleteItems } from "../db/data-commands.js";
import { data } from "../db/data.js";
import { env } from "../config/env.js";
import { count } from "../db/agg.js";

const di = data;

// Учётные строки сохраняются после удаления контактных данных.
export async function purgeOldOrders(now = Date.now()): Promise<number> {
  const cutoff = new Date(now - env.ORDER_RETENTION_DAYS * 86400000).toISOString();
  // NULL тоже требует обезличивания; SQL != исключил бы такие строки.
  const filter = {
    _and: [
      { created_at: { _lt: cutoff } },
      { _or: [{ contact_email: { _null: true } }, { contact_email: { _neq: "-" } }] },
    ],
  };
  const n = await count("orders", filter);
  if (!n) return 0;
  await di.request((updateItems as any)("orders", { filter }, {
    contact_fio: "срок хранения истёк", contact_phone: "-", contact_email: "-", address: null, comment: null,
  }));
  return n;
}

export async function pruneAuditLog(now = Date.now()): Promise<number> {
  const cutoff = new Date(now - env.AUDIT_RETENTION_DAYS * 86400000).toISOString();
  const filter = { created_at: { _lt: cutoff } };
  const n = await count("audit_log", filter);
  if (!n) return 0;
  await di.request((deleteItems as any)("audit_log", { filter }));
  return n;
}

export async function runRetention(): Promise<{ orders: number; audit: number }> {
  const orders = await purgeOldOrders().catch((e) => { console.error("[retention] orders:", (e as Error).message); return 0; });
  const audit = await pruneAuditLog().catch((e) => { console.error("[retention] audit:", (e as Error).message); return 0; });
  return { orders, audit };
}
