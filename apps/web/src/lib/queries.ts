import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { newsListSchema, newsItemSchema, pageHomeSchema, meSchema, ledgerListSchema, myOrdersSchema, classmatesSchema, timelineSchema, podcastsResSchema, lkEventsSchema, type Classmate, type TimelineItem, type PodcastsRes, type LkEvent } from "@club/shared";
import { apiGet, apiPost, apiDelete, retryUnlessClientError, type NewsItem, type PageHome, type Me, type LedgerEntry, type MyOrder } from "./api.js";

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["classmates"] });
      qc.invalidateQueries({ queryKey: ["lk-events"] });
    },
  });
}

/**
 * Подключена ли онлайн-оплата. Тексты витрин раньше утверждали «оплаты на сайте
 * нет» жёстко — при включении ЮKassa они становились ложью.
 */
export function usePaymentsEnabled() {
  return useQuery({
    queryKey: ["payments-config"],
    queryFn: () => apiGet<{ enabled: boolean }>("/payments/config"),
    staleTime: 5 * 60_000,
  });
}

/**
 * Отклонить входящую заявку, отозвать свою или удалить из друзей.
 * До этого связь можно было только создать: отклонить входящую было нечем,
 * и она висела в ленте событий бесконечно.
 */
export function useRemoveFriend(token: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (alumniId: string) => apiDelete<{ status: string }>(`/me/friends/${alumniId}`, token ?? undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["classmates"] });
      qc.invalidateQueries({ queryKey: ["lk-events"] });
    },
  });
}

// «События» вверху ЛК (заявки в друзья, статусы заказов, подписка).
export function useLkEvents(token: string | null) {
  return useQuery({
    queryKey: ["lk-events", token],
    queryFn: () => apiGet<LkEvent[]>("/me/events", token!, lkEventsSchema),
    enabled: !!token,
    retry: false,
  });
}

// «История» на главной (редактируется в админ-панели).
export function useTimeline() {
  return useQuery({ queryKey: ["timeline"], queryFn: () => apiGet<TimelineItem[]>("/timeline", undefined, timelineSchema) });
}

// Подкасты: audio_url приходит только активным подписчикам.
export function usePodcasts(token: string | null) {
  return useQuery({
    queryKey: ["podcasts", token ?? "guest"],
    queryFn: () => apiGet<PodcastsRes>("/podcasts", token ?? undefined, podcastsResSchema),
  });
}

export function useSubscribePodcasts(token: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<{ number: string; payment_url?: string }>("/podcasts/subscribe", {}, undefined, token ?? undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["podcasts"] }),
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
    retry: retryUnlessClientError, // 404 показываем сразу, а не через три ретрая
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
