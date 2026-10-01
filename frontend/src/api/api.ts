import { ApiError, requestJson } from "./http.js";
export { ApiError } from "./http.js";

type Parser<T> = { parse: (data: unknown) => T };

export function isAuthError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401;
}

export function retryUnlessClientError(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 2;
}

function signalUnauthorized(status: number, hadToken: boolean): void {
  if (status === 401 && hadToken) {
    try { window.dispatchEvent(new Event("club:unauthorized")); } catch {}
  }
}

export async function apiGet<T>(path: string, token?: string, schema?: Parser<T>): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const data = await requestJson<T>(path, { headers }, { strictJson: true, errorBeforeJson: true, errorMessage: (status) => `API ${status}: ${path}`, onError: (status) => signalUnauthorized(status, !!token) });
  return schema ? schema.parse(data) : (data as T);
}

export async function apiPost<T>(path: string, body: unknown, schema?: Parser<T>, token?: string): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json", "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const data = await requestJson<T>(path, { method: "POST", headers, body: JSON.stringify(body) }, { errorMessage: (status, data) => data?.error || `API ${status}`, onError: (status) => signalUnauthorized(status, !!token) });
  return schema ? schema.parse(data) : (data as T);
}

export async function apiPatch<T>(path: string, body: unknown, token: string, schema?: Parser<T>): Promise<T> {
  const data = await requestJson<T>(path, {
    method: "PATCH",
    headers: { accept: "application/json", "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  }, { errorMessage: (status, data) => data?.error || `API ${status}`, onError: (status) => signalUnauthorized(status, !!token) });
  return schema ? schema.parse(data) : (data as T);
}

export async function apiDelete<T>(path: string, token?: string, schema?: Parser<T>): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const data = await requestJson<T>(path, { method: "DELETE", headers }, { errorMessage: (status, data) => data?.error || `API ${status}`, onError: (status) => signalUnauthorized(status, !!token) });
  return schema ? schema.parse(data) : (data as T);
}

export type {
  NewsItem, HeroBlock, CtaBlock, PageHome, Program, ProgramFull, ProgramModule, ProgramTeacher, ProductVariant, Product,
  CartLine, CartSummary, LevelInfo, Achievement, ActivityPoint, AlumniBrief, Me, LoginResponse,
  OrderResult, MyOrder, LedgerEntry, PodcastItem, PodcastsRes,
} from "@club/shared";

export const FORMAT_LABEL: Record<string, string> = { online: "онлайн", offline: "очно", blended: "смешанный" };
export const rub = (kop: number) => (kop / 100).toLocaleString("ru-RU") + " ₽";
