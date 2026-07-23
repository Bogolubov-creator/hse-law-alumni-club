import { Link } from "react-router-dom";
import type { CSSProperties, ReactNode } from "react";
import { LkTokensContext, useLkTheme } from "../lib/lk-theme.js";
import { VisionToggle } from "./Vision.js";

const mono: CSSProperties = { fontFamily: "'Martian Mono', monospace" };
const disp: CSSProperties = { fontFamily: "'Unbounded', sans-serif" };

type LkTab = "overview" | "profile";

export function LkShell({
  active,
  onLogout,
  children,
}: {
  active: LkTab;
  onLogout: () => void;
  children: ReactNode;
}) {
  const { theme, toggle, tokens: t } = useLkTheme();

  const navLink = (tab: LkTab, to: string, label: string) =>
    active === tab ? (
      <span style={{ color: t.headerText, fontWeight: 600, fontSize: 14, padding: "8px 14px", borderRadius: 10, background: t.navActiveBg }}>{label}</span>
    ) : (
      <Link to={to} className="foc" style={{ textDecoration: "none", color: t.navMuted, fontWeight: 500, fontSize: 14, padding: "8px 14px", borderRadius: 10 }}>{label}</Link>
    );

  return (
    <LkTokensContext.Provider value={t}>
      <div style={{ background: t.bg, color: t.text, minHeight: "100vh", fontFamily: "'Onest', system-ui, sans-serif", transition: "background .2s, color .2s" }}>
        <header style={{ background: t.headerBg, color: t.headerText, position: "sticky", top: 0, zIndex: 50, borderBottom: "1px solid rgba(251,243,232,.08)" }}>
          <div style={{ maxWidth: 1180, margin: "0 auto", padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
            <Link to="/" className="foc" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none", color: "inherit" }}>
              <img src="/assets/themis.jpeg" alt="Логотип" width={38} height={38} style={{ borderRadius: 9, objectFit: "cover" }} />
              <div style={{ ...disp, fontWeight: 800, fontSize: 15, letterSpacing: "-0.01em" }}>Личный кабинет</div>
            </Link>
            <nav style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {navLink("overview", "/lk", "Обзор")}
              {navLink("profile", "/lk/profile", "Профиль")}
              <Link to="/dpo" className="foc" style={{ textDecoration: "none", color: t.navMuted, fontWeight: 500, fontSize: 14, padding: "8px 14px", borderRadius: 10 }}>Витрины</Link>
              <VisionToggle compact />
              <button
                type="button"
                onClick={toggle}
                className="foc"
                aria-label={theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"}
                title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
                style={{ ...mono, fontSize: 13, color: t.headerText, background: t.logoutBg, border: `1px solid ${t.logoutBorder}`, borderRadius: 10, padding: "8px 13px", cursor: "pointer" }}
              >
                {theme === "dark" ? "☀️ Светлая" : "🌙 Тёмная"}
              </button>
              <button onClick={onLogout} className="foc" style={{ ...mono, fontSize: 13, color: t.headerText, background: t.logoutBg, border: `1px solid ${t.logoutBorder}`, borderRadius: 10, padding: "8px 13px", cursor: "pointer" }}>Выйти</button>
            </nav>
          </div>
        </header>
        <main style={{ maxWidth: 1180, margin: "0 auto", padding: "32px 28px 80px" }}>{children}</main>
        {/* 152-ФЗ: юр-документы доступны и в ЛК (как и на публичных страницах). */}
        <footer style={{ borderTop: `1px solid ${t.divider}`, padding: "22px 28px 40px" }}>
          <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexWrap: "wrap", gap: 16, ...mono, fontSize: 12 }}>
            <Link to="/privacy" className="foc" style={{ color: t.navMuted, textDecoration: "underline", textUnderlineOffset: 2 }}>Политика обработки ПДн</Link>
            <Link to="/confidential" className="foc" style={{ color: t.navMuted, textDecoration: "underline", textUnderlineOffset: 2 }}>Конфиденциальность</Link>
            <Link to="/requisites" className="foc" style={{ color: t.navMuted, textDecoration: "underline", textUnderlineOffset: 2 }}>Реквизиты</Link>
          </div>
        </footer>
      </div>
    </LkTokensContext.Provider>
  );
}