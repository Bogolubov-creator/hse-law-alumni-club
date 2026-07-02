import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { newsListSchema, newsItemSchema, pageHomeSchema, meSchema, ledgerListSchema, myOrdersSchema, classmatesSchema, type Classmate } from "@club/shared";
import { apiGet, apiPost, type NewsItem, type PageHome, type Me, type LedgerEntry, type MyOrder } from "./api.js";

export function useLedger(token: string | null) {
  return useQuery({
    queryKey: ["ledger", token],
    queryFn: () => apiGet<LedgerEntry[]>("/me/ledger", token!, ledgerListSchema),
    enabled: !!token,
    retry: false,
  });
}

export function useMyOrders(token: string | null) {
  return useQuery({
    queryKey: ["my-orders", token],
    queryFn: () => apiGet<MyOrder[]>("/me/orders", token!, myOrdersSchema),
    enabled: !!token,
    retry: false,
  });
}

export function usePage(slug: string) {
  return useQuery({ queryKey: ["page", slug], queryFn: () => apiGet<PageHome>(`/pages/${slug}`, undefined, pageHomeSchema) });
}

export function useMe(token: string | null) {
  return useQuery({
    queryKey: ["me", token],
    queryFn: () => apiGet<Me>("/me", token!, meSchema),
    enabled: !!token,
    retry: false,
  });
}

// «Сообщество»: однокурсники того же выпуска/ОП + заявка в друзья.
export function useClassmates(token: string | null) {
  return useQuery({
    queryKey: ["classmates", token],
    queryFn: () => apiGet<Classmate[]>("/me/classmates", token!, classmatesSchema),
    enabled: !!token,
    retry: false,
  });
}

export function useAddFriend(token: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (alumniId: string) => apiPost<{ status: string }>("/me/friends", { alumni_id: alumniId }, undefined, token ?? undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["classmates"] }),
  });
}

export function useNewsList(limit?: number) {
  return useQuery({
    queryKey: ["news", limit ?? "all"],
    queryFn: () => apiGet<NewsItem[]>(`/news${limit ? `?limit=${limit}` : ""}`, undefined, newsListSchema),
  });
}

export function useNewsPost(slug: string) {
  return useQuery({
    queryKey: ["news", slug],
    queryFn: () => apiGet<NewsItem>(`/news/${slug}`, undefined, newsItemSchema),
    enabled: !!slug,
  });
}

export function formatNewsDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return iso;
  }
}
