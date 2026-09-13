import { publicUrl } from "../lib/public-url.js";
import { useSyncExternalStore } from "react";

export type TelegramApp = {
  initData: string;
  initDataUnsafe?: { start_param?: string };
  ready(): void; expand(): void;
  isVersionAtLeast?(version: string): boolean;
  setHeaderColor?(color: string): void; setBackgroundColor?(color: string): void;
  setBottomBarColor?(color: string): void;
  viewportStableHeight?: number;
  contentSafeAreaInset?: { top: number; bottom: number };
  safeAreaInset?: { top: number; bottom: number };
  onEvent(name: string, callback: () => void): void;
  offEvent(name: string, callback: () => void): void;
  BackButton?: { show(): void; hide(): void; onClick(callback: () => void): void; offClick(callback: () => void): void };
};
declare global { interface Window { Telegram?: { WebApp?: TelegramApp } } }
const PREVIEW_KEY = "club_telegram_preview";
export const telegramApp = () => window.Telegram?.WebApp;
const SDK_EVENT = "club:telegram-sdk";
const subscribe = (notify: () => void) => {
  window.addEventListener(SDK_EVENT, notify);
  return () => window.removeEventListener(SDK_EVENT, notify);
};
export const useTelegramApp = () => useSyncExternalStore(subscribe, telegramApp);

/** Только маршрутизация: параметр запуска не подтверждает личность или права. */
export function miniStartRoute(value: string | null | undefined): string | null {
  if (!value || value.length > 512) return null;
  const sections: Record<string, string> = { club: "/", dpo: "/dpo", events: "/events", news: "/news", podcasts: "/podcasts", merch: "/merch", lk: "/lk", support: "/support" };
  if (Object.hasOwn(sections, value)) return sections[value]!;
  const program = /^p_([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(value);
  return program ? `/dpo/${program[1]}` : null;
}
export function isMiniApp(): boolean {
  if (telegramApp()?.initData) return true;
  try { return sessionStorage.getItem(PREVIEW_KEY) === "1"; } catch { return false; }
}
export function leaveMiniPreview() {
  sessionStorage.removeItem(PREVIEW_KEY);
  window.location.assign(publicUrl(""));
}

/** Загружаем официальный SDK только для входа /tg или запуска из Telegram. */
export async function prepareTelegram(): Promise<void> {
  const entry = location.pathname.replace(/\/$/, "") === publicUrl("tg").replace(/\/$/, "");
  const launched = new URLSearchParams(location.hash.slice(1)).has("tgWebAppData");
  if (entry || launched) { try { sessionStorage.setItem(PREVIEW_KEY, "1"); } catch { /* storage недоступен */ } }
  if (!entry && !launched && !isMiniApp()) return;
  if (telegramApp()) return;
  await new Promise<void>((resolve) => {
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-web-app.js";
    script.async = true;
    const timer = window.setTimeout(resolve, 4000);
    const done = () => { clearTimeout(timer); window.dispatchEvent(new Event(SDK_EVENT)); resolve(); };
    script.onload = done; script.onerror = done;
    document.head.appendChild(script);
  });
}
