import { createHash, randomUUID } from "node:crypto";
import { db } from "./fake-directus.js";
import type { commitCheckout as commit } from "../lib/checkout-store.js";
// Адаптер только для unit-проверок HTTP-валидации. Транзакции проверяются отдельно на PostgreSQL.
export const digest = (s: string) => createHash('sha256').update(s).digest('hex');
export const checkoutKey = (s: string, k: string) => digest(`${s}:${k}`);
export const findCheckout = async () => null;
export const saveReceipt = async () => {};
export const withCartLock = async <T>(_s: string, fn: () => Promise<T>) => fn();
export async function commitCheckout(input: Parameters<typeof commit>[0]) {
  const year = new Date().getFullYear();
  const seq = Math.max(0, ...(db.orders ?? []).map(o => Number(o.number?.split('-')[2]) || 0)) + 1;
  const number = `ALU-${year}-${String(seq).padStart(6, '0')}`;
  db.orders!.push({ id: randomUUID(), ...input.base, number });
  db.carts!.find(c => c.id === input.cartId)!.items_json = [];
  return { number, replay: null };
}
export async function changeOrderStatus(id: string, status: string) {
  const row = db.orders?.find(o => o.id === id);
  if (!row) throw Object.assign(new Error('Заявка не найдена'), { statusCode: 404 });
  if (row.status === status) return false;
  row.status = status; return true;
}
