import { useQuery } from "@tanstack/react-query";
import { apiGet, type NewsItem } from "./api.js";

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
