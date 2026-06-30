import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cartSummarySchema, programsSchema, programFullSchema, productsSchema, meSchema, orderResultSchema } from "@club/shared";
import { apiGet, type CartSummary, type Program, type ProgramFull, type Product, type Me } from "./api.js";

const CART_KEY = "club_cart";
const TOKEN_KEY = "club_token";

export function cartSession(): string {
  let s = localStorage.getItem(CART_KEY);
  if (!s) { s = crypto.randomUUID(); localStorage.setItem(CART_KEY, s); }
  return s;
}

async function cartFetch<T>(method: string, body?: unknown, schema?: { parse: (d: unknown) => T }): Promise<T> {
  const res = await fetch("/api/cart", {
    method,
    headers: { accept: "application/json", "content-type": "application/json", "x-cart-session": cartSession() },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || `API ${res.status}`);
  return schema ? schema.parse(data) : (data as T);
}

export function useCart() {
  return useQuery({ queryKey: ["cart"], queryFn: () => cartFetch<CartSummary>("GET", undefined, cartSummarySchema) });
}

export function useCartMutations() {
  const qc = useQueryClient();
  const invalidate = (d: CartSummary) => qc.setQueryData(["cart"], d);
  return {
    add: useMutation({ mutationFn: (v: { type: "dpo" | "merch"; ref_id: string; variant_sku?: string | null; qty?: number }) => cartFetch<CartSummary>("POST", v, cartSummarySchema), onSuccess: invalidate }),
    setQty: useMutation({ mutationFn: (v: { ref_id: string; variant_sku?: string | null; qty: number }) => cartFetch<CartSummary>("PATCH", v, cartSummarySchema), onSuccess: invalidate }),
    clear: useMutation({ mutationFn: () => cartFetch<CartSummary>("DELETE", undefined, cartSummarySchema), onSuccess: invalidate }),
  };
}

export function usePrograms() {
  return useQuery({ queryKey: ["programs"], queryFn: () => apiGet<Program[]>("/programs", undefined, programsSchema) });
}
export function useProgram(slug: string) {
  return useQuery({ queryKey: ["program", slug], queryFn: () => apiGet<ProgramFull>(`/programs/${slug}`, undefined, programFullSchema), enabled: !!slug });
}
export function useProducts() {
  return useQuery({ queryKey: ["products"], queryFn: () => apiGet<Product[]>("/products", undefined, productsSchema) });
}

/** Скидка выпускника (если вошёл и верифицирован) – для справочного бейджа на витринах. */
export function useMemberDiscount(): number {
  const token = localStorage.getItem(TOKEN_KEY);
  const q = useQuery({ queryKey: ["me-discount", token], queryFn: () => apiGet<Me>("/me", token!, meSchema), enabled: !!token, retry: false });
  return q.data?.level.discount ?? 0;
}

export function token(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export async function submitOrder(body: unknown): Promise<import("./api.js").OrderResult> {
  const headers: Record<string, string> = { accept: "application/json", "content-type": "application/json", "x-cart-session": cartSession() };
  const t = token();
  if (t) headers.authorization = `Bearer ${t}`;
  const res = await fetch("/api/orders", { method: "POST", headers, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || `API ${res.status}`);
  return orderResultSchema.parse(data);
}
