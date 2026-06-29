import { useQuery } from "@tanstack/react-query";
import { apiGet, type NewsItem, type PageHome, type Me, type LedgerEntry } from "./api.js";

export function useLedger(token: string | null) {
  return useQuery({
    queryKey: ["ledger", token],
    queryFn: () => apiGet<LedgerEntry[]>("/me/ledger", token!),
    enabled: !!token,
    retry: false,
  });
}

export function usePage(slug: string) {
  return useQuery({ queryKey: ["page", slug], queryFn: () => apiGet<PageHome>(`/pages/${slug}`) });
}

export function useMe(token: string | null) {
  return useQuery({
    queryKey: ["me", token],
    queryFn: () => apiGet<Me>("/me", token!),
    enabled: !!token,
    retry: false,
  });
}

export function useNewsList(limit?: number) {
  return useQuery({
    queryKey: ["news", limit ?? "all"],
    queryFn: () => apiGet<NewsItem[]>(`/news${limit ? `?limit=${limit}` : ""}`),
  });
}

export function useNewsPost(slug: string) {
  return useQuery({
    queryKey: ["news", slug],
    queryFn: () => apiGet<NewsItem>(`/news/${slug}`),
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
