// Тонкий клиент к same-origin /api (apps/api → Directus сервисным токеном).
const BASE = "/api";

export async function apiGet<T>(path: string, token?: string): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { headers });
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return (await res.json()) as T;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || `API ${res.status}`);
  return data as T;
}

export async function apiPatch<T>(path: string, body: unknown, token: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    headers: { accept: "application/json", "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || `API ${res.status}`);
  return data as T;
}

export type LedgerEntry = { id: string; delta: number; reason: string; ref: string | null; comment: string | null; created_at: string };
export type MyOrder = { number: string; type: string; status: string; subtotal: number; member_discount: number; total_estimate: number; created_at: string };

export type Program = { id: string; slug: string; title: string; direction: string; format: string; duration: string; price: number };
export type ProgramFull = Program & { dates?: unknown; modules?: unknown; teachers?: unknown; description?: string | null };
export type ProductVariant = { sku: string; size?: string; color?: string; stock: number };
export type Product = { id: string; slug: string; title: string; category: string; price: number; variants_json: ProductVariant[] | null; stock: number; description?: string | null };
export type CartLine = { type: "dpo" | "merch"; ref_id: string; variant_sku?: string | null; qty: number; price: number; title: string };
export type CartSummary = { items: CartLine[]; count: number; subtotal: number };
export type OrderResult = { number: string; status: string; member_discount: number; subtotal: number; total_estimate: number; notified: { channel: string; ok: boolean; blocked?: boolean } };

export const FORMAT_LABEL: Record<string, string> = { online: "онлайн", offline: "очно", blended: "смешанный" };
export const rub = (kop: number) => (kop / 100).toLocaleString("ru-RU") + " ₽";

export type AlumniBrief = { fio: string | null; cohort: string | null; verification_status: string; contacts?: Record<string, string> };
export type LevelInfo = { points: number; level: string; level_title: string; discount: number; next_level: string | null; to_next: number };
export type Achievement = { key: string; title: string; description: string; earned: boolean };
export type ActivityPoint = { month: string; points: number };
export type Me = { alumni: AlumniBrief; level: LevelInfo; achievements: Achievement[]; activity: ActivityPoint[] };
export type LoginResponse = { token: string; alumni: AlumniBrief };

export type NewsItem = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string | null;
  published_at: string | null;
};

export type HeroBlock = {
  badge?: string; title_pre?: string; title_accent?: string;
  subtitle?: string; cta_primary?: string; cta_secondary?: string;
};
export type CtaBlock = { title?: string; text?: string; button?: string };
export type PageHome = { slug: string; title: string; blocks: { hero?: HeroBlock; cta?: CtaBlock } };
