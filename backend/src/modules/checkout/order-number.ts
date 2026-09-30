import { readItems } from "../../db/data-commands.js";
import { data } from "../../db/data.js";

/** При сетевом сбое заявка могла сохраниться: повтор допустим только после коллизии SQL. */
export function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && e.code === "23505";
}

/** Одна строка по индексу number вместо загрузки всех заявок за год. */
export async function lastOrderSeq(year: number): Promise<number> {
  const rows = (await data.request((readItems as any)("orders", {
    filter: { number: { _starts_with: `ALU-${year}-` } },
    sort: ["-number"], limit: 1, fields: ["number"],
  }))) as { number: string }[];
  if (!rows[0]) return 0;
  const seq = parseInt(rows[0].number.split("-")[2] ?? "0", 10);
  return Number.isFinite(seq) ? seq : 0;
}
