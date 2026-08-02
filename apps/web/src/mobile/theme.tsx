import { type CSSProperties } from "react";
import { isAndroid } from "../lib/use-mobile.js";

// Платформа фиксируется один раз (UA не меняется в рамках сессии).
export const ANDROID = isAndroid();

export const INK = "#14181F";
export const disp: CSSProperties = { fontFamily: "'Unbounded', system-ui, sans-serif" };
export const mono: CSSProperties = { fontFamily: "'Martian Mono', monospace" };
export const CARD: CSSProperties = { background: "#fff", border: "1px solid #ECE6DA", borderRadius: 20 };
export const HEADER: CSSProperties = {
  position: "sticky", top: 0, zIndex: 3,
  padding: "calc(env(safe-area-inset-top, 0px) + 16px) 20px 12px",
  background: "rgba(251,243,232,.9)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
};

// ── Нижняя таб-навигация ──────────────────────────────────────────────
export const TABS = [
  { to: "/", label: "Карта", icon: (<><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M3 10h18" /><path d="M7 15h5" /></>) },
  { to: "/news", label: "Лента", icon: (<><rect x="4" y="4" width="16" height="16" rx="2.5" /><path d="M8 9h8M8 13h8M8 17h5" /></>) },
  { to: "/dpo", label: "ДПО", icon: (<><path d="M3 8l9-4 9 4-9 4-9-4z" /><path d="M7 10.5V15c0 1 2.2 2.2 5 2.2s5-1.2 5-2.2v-4.5" /><path d="M21 8.5v5" /></>) },
  { to: "/podcasts", label: "Подкасты", icon: (<path d="M5 10v4M9 6v12M13 8.5v7M17 5v14M21 10.5v3" />) },
  { to: "/merch", label: "Мерч", icon: (<><path d="M6 8h12l-1 12H7L6 8z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>) },
];

// Экран «Карта» – соответствие reason → человекочитаемая причина начисления.
export const REASON_RU: Record<string, string> = {
  program: "Пройдена программа ДПО", event: "Участие в событии", referral: "Приглашённый выпускник",
  mentorship: "Менторство", order: "Заказ", decay: "Списание за неактивность", manual: "Начисление офисом", achievement: "Достижение",
};

// Лента (новости) – палитра оттенков карточек.
export const NEWS_TINTS = ["#2C6E80", "#11296B", "#C9450E", "#7A5CA8", "#1F8A5B"];

// ДПО – цвет и подпись формата.
export const FMT_COL: Record<string, string> = { online: "#2C6E80", offline: "#C9450E", blended: "#11296B" };
export const FMT_RU: Record<string, string> = { online: "онлайн", offline: "очно", blended: "смешанный" };

// Мерч – палитра оттенков карточек.
export const MERCH_TINTS = ["#C9450E", "#2C6E80", "#11296B", "#7A5CA8"];

// ── Детальные экраны (стадия 2): full-screen без нижней навигации ─────
export const roundDark: CSSProperties = { width: 40, height: 40, borderRadius: 99, border: "none", background: "rgba(20,24,31,.42)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, textDecoration: "none" };
export const roundLight: CSSProperties = { width: 40, height: 40, borderRadius: 12, border: "1px solid #ECE6DA", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 };
export const secTitle: CSSProperties = { ...disp, fontWeight: 600, fontSize: 15, marginBottom: 8 };
export const factChip: CSSProperties = { ...mono, fontSize: 10.5, color: INK, background: "#fff", border: "1px solid #ECE6DA", padding: "7px 11px", borderRadius: 9 };
export const stickyBar: CSSProperties = { flexShrink: 0, padding: "12px 20px calc(env(safe-area-inset-bottom, 0px) + 16px)", background: "#FBF3E8", borderTop: "1px solid #EFE7D8", display: "flex", gap: 11 };
export const primaryBtn: CSSProperties = { flex: 1, height: 52, borderRadius: 15, border: "none", background: "#EC5A13", color: "#FBF3E8", fontFamily: "'Onest'", fontWeight: 700, fontSize: 15, cursor: "pointer", boxShadow: "0 12px 24px -12px rgba(236,90,19,.8)" };
export const ghostBtn: CSSProperties = { flex: 1, height: 52, borderRadius: 15, border: "1.5px solid #14181F", background: "#fff", color: INK, fontFamily: "'Onest'", fontWeight: 700, fontSize: 15, cursor: "pointer" };
export const BackWhite = <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>;
export const BackInk = <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>;
