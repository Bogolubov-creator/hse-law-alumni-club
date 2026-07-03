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

export type Overview = {
  new_orders: number; orders_count: number; orders_paid: number;
  pending_verifications: number; alumni_count: number; alumni_verified: number; points_total: number;
  programs_actual: number; programs_total: number; products_count: number; news_count: number;
  friendships: number; friend_requests: number; podcasts_count: number; podcast_subscribers: number;
};
export type AdminNews = { id: string; slug: string; title: string; excerpt: string | null; body: string | null; published_at: string | null; status: string };
export type AdminTimeline = { id: string; year: string; title: string; text: string | null; metric: string | null; sort: number; status: string };
export type AdminPodcast = { id: string; title: string; description: string | null; cover: string | null; audio_url: string | null; duration: string | null; is_free?: boolean; sort: number; status: string };
export type AdminOrderItem = { title: string; qty: number; variant_sku?: string | null };
export type AdminOrder = { id: string; number: string; type: string; contact_fio: string; contact_phone: string; contact_email: string; fulfillment: string; status: string; subtotal: number; total_estimate: number; created_at: string; items_json?: AdminOrderItem[] | null; address?: string | null; comment?: string | null };
export type Member = { id: string; fio: string | null; cohort: string | null; status: string; verification_status: string; points_cached: number; level_cached: string; personal_discount: number; friends_count?: number; podcast_active?: boolean };
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
export type AuditEntry = { id: string; event: string; actor: string | null; subject: string | null; detail: Record<string, unknown> | null; ip: string | null; created_at: string | null };
export function useAuditLog() {
  return useQuery({ queryKey: ["adm", "audit"], queryFn: () => req<AuditEntry[]>("GET", "/admin/audit?limit=300"), retry: false, refetchInterval: 60_000 });
}

/** Скачивание CSV с Bearer-токеном (обычная ссылка не передаст авторизацию). */
export async function downloadOrdersCsv(): Promise<void> {
  const t = adminToken();
  const res = await fetch("/api/admin/orders/export.csv", { headers: t ? { authorization: `Bearer ${t}` } : {} });
  if (!res.ok) throw new Error("Не удалось выгрузить CSV");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function useAdminPage(slug: string) {
  return useQuery({ queryKey: ["adm", "page", slug], queryFn: () => req<AdminPage>("GET", `/admin/pages/${slug}`), retry: false });
}
export function useAdminNews() {
  return useQuery({ queryKey: ["adm", "news"], queryFn: () => req<AdminNews[]>("GET", "/admin/news"), retry: false });
}
export function useAdminTimeline() {
  return useQuery({ queryKey: ["adm", "timeline"], queryFn: () => req<AdminTimeline[]>("GET", "/admin/timeline"), retry: false });
}
export function useAdminPodcasts() {
  return useQuery({ queryKey: ["adm", "podcasts"], queryFn: () => req<AdminPodcast[]>("GET", "/admin/podcasts"), retry: false });
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
    // Новости
    createNews: useMutation({ mutationFn: (v: { title: string; excerpt?: string | null; body?: string | null }) => req("POST", "/admin/news", v), onSuccess: () => { refetch(); qc.invalidateQueries({ queryKey: ["news"] }); } }),
    patchNews: useMutation({ mutationFn: (v: { id: string; title?: string; excerpt?: string | null; body?: string | null; status?: string }) => req("PATCH", `/admin/news/${v.id}`, { ...v, id: undefined }), onSuccess: () => { refetch(); qc.invalidateQueries({ queryKey: ["news"] }); } }),
    deleteNews: useMutation({ mutationFn: (id: string) => req("DELETE", `/admin/news/${id}`), onSuccess: () => { refetch(); qc.invalidateQueries({ queryKey: ["news"] }); } }),
    // История главной
    createTimeline: useMutation({ mutationFn: (v: { year: string; title: string; text?: string | null; metric?: string | null }) => req("POST", "/admin/timeline", v), onSuccess: () => { refetch(); qc.invalidateQueries({ queryKey: ["timeline"] }); } }),
    patchTimeline: useMutation({ mutationFn: (v: { id: string; year?: string; title?: string; text?: string | null; metric?: string | null; status?: string }) => req("PATCH", `/admin/timeline/${v.id}`, { ...v, id: undefined }), onSuccess: () => { refetch(); qc.invalidateQueries({ queryKey: ["timeline"] }); } }),
    deleteTimeline: useMutation({ mutationFn: (id: string) => req("DELETE", `/admin/timeline/${id}`), onSuccess: () => { refetch(); qc.invalidateQueries({ queryKey: ["timeline"] }); } }),
    // Подкасты
    createPodcast: useMutation({ mutationFn: (v: { title: string; description?: string | null; cover?: string | null; audio_url?: string | null; duration?: string | null }) => req("POST", "/admin/podcasts", v), onSuccess: () => { refetch(); qc.invalidateQueries({ queryKey: ["podcasts"] }); } }),
    patchPodcast: useMutation({ mutationFn: (v: { id: string; title?: string; description?: string | null; cover?: string | null; audio_url?: string | null; duration?: string | null; is_free?: boolean; status?: string }) => req("PATCH", `/admin/podcasts/${v.id}`, { ...v, id: undefined }), onSuccess: () => { refetch(); qc.invalidateQueries({ queryKey: ["podcasts"] }); } }),
    deletePodcast: useMutation({ mutationFn: (id: string) => req("DELETE", `/admin/podcasts/${id}`), onSuccess: () => { refetch(); qc.invalidateQueries({ queryKey: ["podcasts"] }); } }),
    grantPodcastSub: useMutation({ mutationFn: (id: string) => req("POST", `/admin/members/${id}/podcast-sub`), onSuccess: refetch }),
  };
}
