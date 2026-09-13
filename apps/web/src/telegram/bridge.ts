import { publicUrl } from "../lib/public-url.js";

export type TelegramApp = {
  initData: string;
  ready(): void; expand(): void;
  isVersionAtLeast?(version: string): boolean;
  setHeaderColor?(color: string): void; setBackgroundColor?(color: string): void;
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
  if (entry) { try { sessionStorage.setItem(PREVIEW_KEY, "1"); } catch { /* storage недоступен */ } }
  if (!entry && !launched && !isMiniApp()) return;
  if (telegramApp()) return;
  await new Promise<void>((resolve) => {
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-web-app.js";
    script.async = true;
    const timer = window.setTimeout(resolve, 4000);
    const done = () => { clearTimeout(timer); resolve(); };
    script.onload = done; script.onerror = done;
    document.head.appendChild(script);
  });
}
