import { type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ANDROID, TABS, INK, disp, mono, HEADER, CARD, roundLight, BackInk, primaryBtn } from "./theme.js";

export function TabBar({ active }: { active: string }) {
  if (ANDROID) {
    // Material 3 NavigationBar: pill-индикатор активного таба, сплошной фон без блюра.
    return (
      <nav style={{ flexShrink: 0, display: "flex", alignItems: "stretch", padding: "6px 6px calc(env(safe-area-inset-bottom, 0px) + 8px)", background: "#FBF3E8", borderTop: "1px solid #E7E0D0" }}>
        {TABS.map((t) => {
          const on = t.to === active;
          const col = on ? "#C9450E" : "#5C5648";
          return (
            <Link key={t.to} to={t.to} aria-label={t.label} aria-current={on ? "page" : undefined}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "6px 0", textDecoration: "none" }}>
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 62, height: 32, borderRadius: 16, background: on ? "rgba(236,90,19,.16)" : "transparent", transition: "background .2s" }}>
                <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{t.icon}</svg>
              </span>
              <span style={{ ...mono, fontSize: 8.5, letterSpacing: ".02em", color: col }}>{t.label}</span>
            </Link>
          );
        })}
      </nav>
    );
  }
  // iOS / прочее – Cupertino-стиль: блюр-фон, активный цвет без «таблетки».
  return (
    <nav style={{ flexShrink: 0, display: "flex", alignItems: "stretch", padding: "9px 6px calc(env(safe-area-inset-bottom, 0px) + 12px)", background: "rgba(251,243,232,.95)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderTop: "1px solid #E7E0D0" }}>
      {TABS.map((t) => {
        const on = t.to === active;
        return (
          <Link key={t.to} to={t.to} aria-label={t.label} aria-current={on ? "page" : undefined}
            style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "5px 0", textDecoration: "none", color: on ? "#EC5A13" : "#9B9584", transition: "color .2s" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{t.icon}</svg>
            <span style={{ ...mono, fontSize: 8.5, letterSpacing: ".02em" }}>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function QuickAction({ to, onClick, label, tint, stroke, icon }: { to?: string; onClick?: () => void; label: string; tint: string; stroke: string; icon: ReactNode }) {
  const inner = (
    <>
      <span style={{ width: 36, height: 36, borderRadius: 11, background: tint, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
      </span>
      <span style={{ fontWeight: 600, fontSize: 13.5, textAlign: "left" }}>{label}</span>
    </>
  );
  const st: CSSProperties = { display: "flex", alignItems: "center", gap: 11, ...CARD, borderRadius: 16, padding: "13px 14px", textDecoration: "none", color: INK, width: "100%", cursor: "pointer" };
  return to ? <Link to={to} style={st}>{inner}</Link> : <button onClick={onClick} style={{ ...st, border: st.border as string, textAlign: "left", background: "#fff" }}>{inner}</button>;
}

export function Loader() {
  return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }} role="status" aria-label="Загрузка">
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#EC5A13" strokeWidth="2.5" style={{ animation: "spin .8s linear infinite" }}><circle cx="12" cy="12" r="9" strokeOpacity="0.2" /><path d="M21 12a9 9 0 0 0-9-9" /></svg>
    </div>
  );
}

export function ScreenHeader({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <header style={{ ...HEADER, display: right ? "flex" : "block", alignItems: "flex-end", justifyContent: "space-between", padding: "calc(env(safe-area-inset-top, 0px) + 18px) 20px 12px" }}>
      <div>
        {/* Настоящий <h1>: экран мобильной оболочки – самостоятельная страница, скринридер
            должен находить её заголовок навигацией по заголовкам (как на десктопе). */}
        <h1 style={{ ...disp, fontWeight: 800, fontSize: 27, letterSpacing: "-.02em", margin: 0 }}>{title}</h1>
        {sub && <div style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>{sub}</div>}
      </div>
      {right}
    </header>
  );
}

export function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  // Android – Material-чип (тёмный активный); iOS – оранжевый активный.
  const brd = on ? (ANDROID ? "#14181F" : "#EC5A13") : "#E4DCCC";
  const bg = on ? (ANDROID ? "#14181F" : "rgba(236,90,19,.1)") : "#fff";
  const col = on ? (ANDROID ? "#FBF3E8" : "#C9450E") : INK;
  return <button onClick={onClick} style={{ flexShrink: 0, fontFamily: "'Onest'", fontWeight: 600, fontSize: 13, padding: "8px 15px", borderRadius: 99, border: "1px solid " + brd, background: bg, color: col, cursor: "pointer" }}>{children}</button>;
}

/** Экран «сессия недоступна» для приватных оверлеев (истёк/отозван токен). */
export function OverlaySignIn() {
  return (
    <div style={{ padding: "60px 34px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
      <div style={{ width: 72, height: 72, borderRadius: 99, background: "#F2E3CF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }} aria-hidden>🔐</div>
      <div style={{ ...disp, fontWeight: 700, fontSize: 17, marginTop: 18 }}>Нужен вход</div>
      <div style={{ fontSize: 13.5, color: "#6B7280", marginTop: 6, lineHeight: 1.5 }}>Сессия истекла или недоступна – войдите, чтобы открыть этот раздел.</div>
      <Link to="/lk" style={{ ...primaryBtn, flex: "none", marginTop: 20, padding: "0 26px", height: 48, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>Войти в кабинет</Link>
    </div>
  );
}

export function OverlayHeader({ title, sub, onBack }: { title: string; sub?: string; onBack: () => void }) {
  return (
    <header style={{ ...HEADER, display: "flex", alignItems: "center", gap: 12, padding: "calc(env(safe-area-inset-top, 0px) + 14px) 18px 12px" }}>
      <button onClick={onBack} aria-label="Назад" style={roundLight}>{BackInk}</button>
      <div>
        <div style={{ ...disp, fontWeight: 800, fontSize: 20 }}>{title}</div>
        {sub && <div style={{ ...mono, fontSize: 10, color: "#9B9584", marginTop: 1 }}>{sub}</div>}
      </div>
    </header>
  );
}
