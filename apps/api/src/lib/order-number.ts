import { readItems } from "@directus/sdk";
import { directus } from "./directus.js";

/**
 * Последний использованный порядковый номер заявки за год – через индекс по number
 * (одна строка), без полного скана таблицы orders. Номер: ALU-<год>-<seq 6 цифр>.
 * Дальше orderNumber(year, seq, attempt) даёт seq+1+attempt.
 */
/**
 * Ошибка создания – это коллизия уникального номера (а не таймаут/сеть)?
 * Ретраить со следующим номером можно ТОЛЬКО такую: при прочих сбоях строка
 * могла записаться на сервере, и повтор создал бы дубль заявки.
 * Directus SDK отдаёт code RECORD_NOT_UNIQUE; на всякий случай ловим и по тексту.
 */
export function isUniqueViolation(e: unknown): boolean {
  const errs = (e as { errors?: { extensions?: { code?: string } }[] })?.errors;
  if (Array.isArray(errs) && errs.some((x) => x?.extensions?.code === "RECORD_NOT_UNIQUE")) return true;
  const msg = (e as Error)?.message ?? "";
  return /record_not_unique|unique constraint|duplicate key|has to be unique/i.test(msg);
}

export async function lastOrderSeq(year: number): Promise<number> {
  const rows = (await directus.request((readItems as any)("orders", {
    filter: { number: { _starts_with: `ALU-${year}-` } },
    sort: ["-number"], limit: 1, fields: ["number"],
  }))) as { number: string }[];
  if (!rows[0]) return 0;
  const seq = parseInt(rows[0].number.split("-")[2] ?? "0", 10);
  return Number.isFinite(seq) ? seq : 0;
}
