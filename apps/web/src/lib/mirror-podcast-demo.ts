import { useSyncExternalStore } from "react";
import { isMirror } from "./public-url.js";

const key = "club_mirror_podcast_demo";
const event = "club:mirror-podcast-demo";
let fallback = false;
export function mirrorPodcastDemo(): boolean {
  if (!isMirror || typeof window === "undefined") return false;
  try { return sessionStorage.getItem(key) === "subscriber"; } catch { return fallback; }
}
export function setMirrorPodcastDemo(enabled: boolean): void {
  if (!isMirror) return;
  fallback = enabled;
  try { if (enabled) sessionStorage.setItem(key, "subscriber"); else sessionStorage.removeItem(key); } catch { /* Состояние живёт в памяти при недоступном хранилище. */ }
  window.dispatchEvent(new Event(event));
}
function subscribe(callback: () => void) {
  window.addEventListener(event, callback);
  return () => window.removeEventListener(event, callback);
}
export function useMirrorPodcastDemo() {
  return useSyncExternalStore(subscribe, mirrorPodcastDemo, () => false);
}
