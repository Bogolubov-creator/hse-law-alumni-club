// Тонкий клиент к same-origin /api. Опциональная zod-валидация ответа (schema из @club/shared).
const BASE = "/api";

type Parser<T> = { parse: (data: unknown) => T };

export async function apiGet<T>(path: string, token?: string, schema?: Parser<T>): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { headers });
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  const data = await res.json();
  return schema ? schema.parse(data) : (data as T);
}

export async function apiPost<T>(path: string, body: unknown, schema?: Parser<T>): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || `API ${res.status}`);
  return schema ? schema.parse(data) : (data as T);
}

export async function apiPatch<T>(path: string, body: unknown, token: string, schema?: Parser<T>): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    headers: { accept: "application/json", "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || `API ${res.status}`);
  return schema ? schema.parse(data) : (data as T);
}

// Типы ответов — из @club/shared (z.infer от схем-источников).
export type {
  NewsItem, HeroBlock, CtaBlock, PageHome, Program, ProgramFull, ProgramModule, ProgramTeacher, ProductVariant, Product,
  CartLine, CartSummary, LevelInfo, Achievement, ActivityPoint, AlumniBrief, Me, LoginResponse,
  OrderResult, MyOrder, LedgerEntry,
} from "@club/shared";

export const FORMAT_LABEL: Record<string, string> = { online: "онлайн", offline: "очно", blended: "смешанный" };
export const rub = (kop: number) => (kop / 100).toLocaleString("ru-RU") + " ₽";
