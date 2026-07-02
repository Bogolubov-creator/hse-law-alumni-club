import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const ADMIN_TOKEN = "club_admin_token";

export function adminToken(): string | null {
  return localStorage.getItem(ADMIN_TOKEN);
}
export function setAdminToken(t: string) { localStorage.setItem(ADMIN_TOKEN, t); }
export function clearAdminToken() { localStorage.removeItem(ADMIN_TOKEN); }

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const t = adminToken();
  const res = await fetch(`/api${path}`, {
    method,
    headers: { accept: "application/json", "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
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

export function useOverview() {
  return useQuery({ queryKey: ["adm", "overview"], queryFn: () => req<Overview>("GET", "/admin/overview"), retry: false });
}
export function useAdminOrders() {
  return useQuery({ queryKey: ["adm", "orders"], queryFn: () => req<AdminOrder[]>("GET", "/admin/orders"), retry: false });
}
export function useMembers() {
  return useQuery({ queryKey: ["adm", "members"], queryFn: () => req<Member[]>("GET", "/admin/members"), retry: false });
}

export function useAdminMutations() {
  const qc = useQueryClient();
  const refetch = () => { qc.invalidateQueries({ queryKey: ["adm"] }); };
  return {
    setOrderStatus: useMutation({ mutationFn: (v: { id: string; status: string }) => req("PATCH", `/admin/orders/${v.id}`, { status: v.status }), onSuccess: refetch }),
    patchMember: useMutation({ mutationFn: (v: { id: string; verification_status?: string; personal_discount?: number }) => req("PATCH", `/admin/members/${v.id}`, { verification_status: v.verification_status, personal_discount: v.personal_discount }), onSuccess: refetch }),
    addPoints: useMutation({ mutationFn: (v: { id: string; delta: number; comment?: string }) => req("POST", `/admin/members/${v.id}/points`, { delta: v.delta, reason: "manual", comment: v.comment }), onSuccess: refetch }),
  };
}
