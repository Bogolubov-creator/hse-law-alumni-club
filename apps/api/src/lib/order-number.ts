import { readItems } from "@directus/sdk";
import { directus } from "./directus.js";

/**
 * Последний использованный порядковый номер заявки за год — через индекс по number
 * (одна строка), без полного скана таблицы orders. Номер: ALU-<год>-<seq 6 цифр>.
 * Дальше orderNumber(year, seq, attempt) даёт seq+1+attempt.
 */
export async function lastOrderSeq(year: number): Promise<number> {
  const rows = (await directus.request((readItems as any)("orders", {
    filter: { number: { _starts_with: `ALU-${year}-` } },
    sort: ["-number"], limit: 1, fields: ["number"],
  }))) as { number: string }[];
  if (!rows[0]) return 0;
  const seq = parseInt(rows[0].number.split("-")[2] ?? "0", 10);
  return Number.isFinite(seq) ? seq : 0;
}
