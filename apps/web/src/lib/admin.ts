import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const ADMIN_TOKEN = "club_admin_token";

export function adminToken(): string | null {
  return localStorage.getItem(ADMIN_TOKEN);
}
export function setAdminToken(t: string) { localStorage.setItem(ADMIN_TOKEN, t); }
export function clearAdminToken() { localStorage.removeItem(ADMIN_TOKEN); }

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const t = adminToken();
  const hasBody = body !== undefined;
  const res = await fetch(`/api${path}`, {
    method,
    // content-type только при наличии тела — иначе Fastify падает на пустом JSON
    headers: { accept: "application/json", ...(hasBody ? { "content-type": "application/json" } : {}), ...(t ? { authorization: `Bearer ${t}` } : {}) },
    body: hasBody ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || `API ${res.status}`);
  return data as T;
}

export async function adminLogin(email: string, password: string): Promise<{ token: string; role: string }> {
  return req("POST", "/auth/admin-login", { email, password });
}

export type Overview = { new_orders: number; orders_count: number; pending_verifications: number; alumni_count: number };
export type AdminOrderItem = { title: string; qty: number; variant_sku?: string | null };
export type AdminOrder = { id: string; number: string; type: string; contact_fio: string; contact_phone: string; contact_email: string; fulfillment: string; status: string; subtotal: number; total_estimate: number; created_at: string; items_json?: AdminOrderItem[] | null; address?: string | null; comment?: string | null };
export type Member = { id: string; fio: string | null; cohort: string | null; status: string; verification_status: string; points_cached: number; level_cached: string; personal_discount: number };
export type AdminProgram = { id: string; slug: string; title: string; direction: string; format: "online" | "offline" | "blended"; duration: string; price: number; status: string; enrollment?: "actual" | "nonactual" | null; dates?: { start?: string } | null; document?: string | null; description?: string | null };
export type AdminProduct = { id: string; slug: string; title: string; category: string; price: number; stock: number; status: string; variants_json?: { sku: string; size?: string; color?: string; stock: number }[] | null; description?: string | null };
export type ProgramInput = { title: string; direction: string; format: string; duration: string; price: number; description?: string | null; start?: string | null; document?: string | null; status?: string };
export type ProductInput = { title: string; category: string; price: number; stock?: number; description?: string | null; images?: string[] | null; status?: string };
export type PageHeroInput = { badge?: string; title_pre?: string; title_accent?: string; subtitle?: string; cta_primary?: string; cta_secondary?: string };
export type PageCtaInput = { title?: string; text?: string; button?: string };
export type AdminPage = { slug: string; title: string; blocks: { hero?: PageHeroInput & { id?: string }; cta?: PageCtaInput & { id?: string } } };

export function useOverview() {
  return useQuery({ queryKey: ["adm", "overview"], queryFn: () => req<Overview>("GET", "/admin/overview"), retry: false });
}
export function useAdminOrders() {
  return useQuery({ queryKey: ["adm", "orders"], queryFn: () => req<AdminOrder[]>("GET", "/admin/orders"), retry: false });
}
export function useMembers() {
  return useQuery({ queryKey: ["adm", "members"], queryFn: () => req<Member[]>("GET", "/admin/members"), retry: false });
}
export function useAdminPrograms() {
  return useQuery({ queryKey: ["adm", "programs"], queryFn: () => req<AdminProgram[]>("GET", "/admin/programs"), retry: false });
}
export function useAdminProducts() {
  return useQuery({ queryKey: ["adm", "products"], queryFn: () => req<AdminProduct[]>("GET", "/admin/products"), retry: false });
}
export function useAdminPage(slug: string) {
  return useQuery({ queryKey: ["adm", "page", slug], queryFn: () => req<AdminPage>("GET", `/admin/pages/${slug}`), retry: false });
}

export function useAdminMutations() {
  const qc = useQueryClient();
  const refetch = () => { qc.invalidateQueries({ queryKey: ["adm"] }); };
  return {
    setOrderStatus: useMutation({ mutationFn: (v: { id: string; status: string }) => req("PATCH", `/admin/orders/${v.id}`, { status: v.status }), onSuccess: refetch }),
    patchMember: useMutation({ mutationFn: (v: { id: string; verification_status?: string; personal_discount?: number }) => req("PATCH", `/admin/members/${v.id}`, { verification_status: v.verification_status, personal_discount: v.personal_discount }), onSuccess: refetch }),
    addPoints: useMutation({ mutationFn: (v: { id: string; delta: number; comment?: string }) => req("POST", `/admin/members/${v.id}/points`, { delta: v.delta, reason: "manual", comment: v.comment }), onSuccess: refetch }),
    // Каталог: программы ДПО и мерч (инвалидация и публичных витрин тоже)
    createProgram: useMutation({ mutationFn: (v: ProgramInput) => req("POST", "/admin/programs", v), onSuccess: () => { refetch(); qc.invalidateQueries({ queryKey: ["programs"] }); } }),
    patchProgram: useMutation({ mutationFn: (v: { id: string } & Partial<ProgramInput>) => req("PATCH", `/admin/programs/${v.id}`, { ...v, id: undefined }), onSuccess: () => { refetch(); qc.invalidateQueries({ queryKey: ["programs"] }); } }),
    deleteProgram: useMutation({ mutationFn: (id: string) => req("DELETE", `/admin/programs/${id}`), onSuccess: () => { refetch(); qc.invalidateQueries({ queryKey: ["programs"] }); } }),
    createProduct: useMutation({ mutationFn: (v: ProductInput) => req("POST", "/admin/products", v), onSuccess: () => { refetch(); qc.invalidateQueries({ queryKey: ["products"] }); } }),
    patchProduct: useMutation({ mutationFn: (v: { id: string } & Partial<ProductInput>) => req("PATCH", `/admin/products/${v.id}`, { ...v, id: undefined }), onSuccess: () => { refetch(); qc.invalidateQueries({ queryKey: ["products"] }); } }),
    deleteProduct: useMutation({ mutationFn: (id: string) => req("DELETE", `/admin/products/${id}`), onSuccess: () => { refetch(); qc.invalidateQueries({ queryKey: ["products"] }); } }),
    syncDpo: useMutation({ mutationFn: () => req<{ ok: boolean; created: number; updated: number; archived: number; total: number }>("POST", "/admin/dpo-sync"), onSuccess: () => { refetch(); qc.invalidateQueries({ queryKey: ["programs"] }); } }),
    savePage: useMutation({ mutationFn: (v: { slug: string; hero?: PageHeroInput; cta?: PageCtaInput }) => req("PATCH", `/admin/pages/${v.slug}`, { hero: v.hero, cta: v.cta }), onSuccess: (_r, v) => { refetch(); qc.invalidateQueries({ queryKey: ["page", v.slug] }); } }),
  };
}
