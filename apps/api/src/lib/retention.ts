import { updateItems, deleteItems } from "@directus/sdk";
import { directus } from "./directus.js";
import { env } from "../env.js";
import { count } from "./agg.js";

const di = directus;

/**
 * Ретенция ПДн (152-ФЗ: хранение не дольше, чем нужно для целей обработки).
 * Заявки старше ORDER_RETENTION_DAYS обезличиваем (контактные ПДн стираем, строку
 * оставляем для учёта). Аудит-лог старше AUDIT_RETENTION_DAYS удаляем (в нём email/IP).
 * Идемпотентно, запускается кроном раз в сутки.
 */
export async function purgeOldOrders(now = Date.now()): Promise<number> {
  const cutoff = new Date(now - env.ORDER_RETENTION_DAYS * 86400000).toISOString();
  // «Ещё не обезличенные» = email не равен сентинелу «-». NULL здесь тоже считаем
  // необработанной строкой: SQL-условие `contact_email != '-'` для NULL не выполняется,
  // и такая заявка (в которой ПДн могли остаться в ФИО/телефоне/адресе) никогда бы
  // не попала под ретенцию – то есть хранилась бы дольше срока.
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
