import { useSyncExternalStore } from "react";

// Мобильный брейкпоинт (<768px) — граница включения native-app-оболочки (см. mobile/MobileApp).
const QUERY = "(max-width: 767px)";

function subscribe(cb: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
}
function getSnapshot(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(QUERY).matches;
}

/** true на телефонах (<768px). Обновляется при ресайзе/повороте. */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
