import { useSyncExternalStore } from "react";

// Мобильный брейкпоинт (<768px) – граница включения native-app-оболочки (см. mobile/MobileApp).
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

/**
 * true на Android – для платформенно-идиоматичной мобильной оболочки (Material vs iOS).
 * Оверрайд ?platform=android|ios (превью/QA любого варианта без реального устройства).
 */
export function isAndroid(): boolean {
  if (typeof window !== "undefined") {
    const p = new URLSearchParams(window.location.search).get("platform");
    if (p === "android") return true;
    if (p === "ios") return false;
  }
  return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
}
