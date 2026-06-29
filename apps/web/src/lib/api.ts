// Тонкий клиент к same-origin /api (apps/api → Directus сервисным токеном).
const BASE = "/api";

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return (await res.json()) as T;
}

export type NewsItem = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string | null;
  published_at: string | null;
};
