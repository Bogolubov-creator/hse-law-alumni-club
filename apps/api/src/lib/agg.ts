import { aggregate } from "@directus/sdk";
import { directus } from "./directus.js";

/**
 * Агрегатные count/sum на стороне Directus/Postgres — считает БД и возвращает
 * число, не таща тысячи строк в API ради .length. Под масштаб (тысячи выпускников).
 */
export async function count(collection: string, filter?: object): Promise<number> {
  const r = (await directus.request(
    (aggregate as any)(collection, { aggregate: { count: "*" }, ...(filter ? { query: { filter } } : {}) }),
  )) as { count: string }[];
  return Number(r?.[0]?.count ?? 0);
}

export async function sum(collection: string, field: string, filter?: object): Promise<number> {
  const r = (await directus.request(
    (aggregate as any)(collection, { aggregate: { sum: field }, ...(filter ? { query: { filter } } : {}) }),
  )) as { sum: Record<string, string | null> }[];
  return Number(r?.[0]?.sum?.[field] ?? 0);
}
