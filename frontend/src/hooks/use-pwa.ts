import { useSyncExternalStore } from "react";

const STANDALONE_QUERY = "(display-mode: standalone), (display-mode: minimal-ui)";
const QA_KEY = "club_pwa_shell";

function rememberQaFlag(): void {
  if (typeof window === "undefined") return;
  try {
    if (new URLSearchParams(window.location.search).get("pwa") === "1") {
      sessionStorage.setItem(QA_KEY, "1");
    }
  } catch {
  }
}

function qaForced(): boolean {
  if (typeof window === "undefined") return false;
  rememberQaFlag();
  try {
    if (new URLSearchParams(window.location.search).get("pwa") === "1") return true;
    return sessionStorage.getItem(QA_KEY) === "1";
  } catch {
    return false;
  }
}

function isStandaloneNow(): boolean {
  if (typeof window === "undefined") return false;
  if (qaForced()) return true;
  const ios = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (ios) return true;
  return !!window.matchMedia?.(STANDALONE_QUERY).matches;
}

function subscribe(cb: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mql = window.matchMedia(STANDALONE_QUERY);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
}

export function useIsPwaShell(): boolean {
  return useSyncExternalStore(subscribe, isStandaloneNow, () => false);
}

export function readIsPwaShell(): boolean {
  return isStandaloneNow();
}
