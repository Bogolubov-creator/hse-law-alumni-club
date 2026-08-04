import { type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { VisionToggle } from "../components/Vision.js";
import { MobileTabs } from "./MobileTabs.js";
import { mono, disp } from "./Shell.js";
import { Mark } from "./Mark.js";

/**
 * Общие примитивы кабинета v2 (DESIGN.md): плотность 7, движения нет,
 * один акцент на все действия. Вынесены из LkV2, чтобы профиль и кабинет
 * говорили одним языком, а не расходились при первой же правке.
 *
 * Внешний контур живёт в Shell.tsx – у него другой режим и другая шапка.
 */

export const TOKEN_KEY = "club_token";

/** Моно-подпись реестра: разрядка, верхний регистр, третичный цвет. */
export const label: CSSProperties = {
  ...mono, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)",
  textTransform: "uppercase", color: "var(--c-text-3)",
};

export const field: CSSProperties = {
  width: "100%", marginTop: 7, padding: "12px 14px", borderRadius: "var(--r-md)",
  border: "1px solid var(--c-line)", background: "var(--c-bg)", color: "var(--c-text)",
  fontSize: 15, fontFamily: "inherit",
};

/** Действие. Один акцент на весь кабинет – охра с тёмным текстом (5,12:1). */
export const action: CSSProperties = {
  ...mono, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)", textTransform: "uppercase",
  padding: "8px 14px", borderRadius: "var(--r-sm)", border: "none",
  background: "var(--c-accent)", color: "var(--c-on-accent)", cursor: "pointer",
};

export const actionGhost: CSSProperties = {
  ...action, background: "transparent", color: "var(--c-text-2)", border: "1px solid var(--c-line)",
};

/** Строка удостоверения: подпись слева, значение справа, разделитель – линия. */
export function DataRow({ name, value, accent }: { name: string; value: string; accent?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, padding: "11px 0", borderTop: "1px solid var(--c-line)" }}>
      <span style={label}>{name}</span>
      <span style={{ ...mono, fontSize: 15, fontWeight: 500, color: accent ? "var(--c-accent-text)" : "var(--c-text)" }}>{value}</span>
    </div>
  );
}

export function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: 34 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginBottom: 10 }}>
        <h2 style={{ ...disp, fontWeight: 600, fontSize: "var(--t-h3)", margin: 0 }}>{title}</h2>
        {note && <span style={label}>{note}</span>}
      </div>
      {children}
    </section>
  );
}

/** Инициал в плашке – когда аватара нет. */
export function Initial({ fio, size, radius }: { fio: string | null | undefined; size: number; radius: string }) {
  return (
    <div aria-hidden style={{ width: size, height: size, flexShrink: 0, borderRadius: radius, background: "var(--c-bg-sunken)", border: "1px solid var(--c-line)", display: "flex", alignItems: "center", justifyContent: "center", ...disp, fontWeight: 700, fontSize: Math.round(size / 2.6), color: "var(--c-text-2)" }}>
      {(fio ?? "").trim().charAt(0).toUpperCase() || "?"}
    </div>
  );
}

/**
 * Полоса прогресса. Ширина задаётся раз при отрисовке и не анимируется:
 * в кабинете движения нет (DESIGN.md), а «ползущая» полоса при каждом
 * обновлении данных только мешает читать число рядом.
 */
export function Progress({ value, target, done }: { value: number; target: number; done: boolean }) {
  const pct = done ? 100 : target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  return (
    <div style={{ height: 3, background: "var(--c-line)", borderRadius: 2, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${pct}%`, background: done ? "var(--c-ok-text)" : "var(--c-accent)" }} />
    </div>
  );
}

const NAV = [
  { to: "/v2/lk", label: "кабинет" },
  { to: "/v2/lk/profile", label: "профиль" },
];

/** Шапка кабинета: одна на все приватные экраны v2. */
export function CabinetShell({ active, onLogout, children }: { active: "lk" | "profile"; onLogout: () => void; children: ReactNode }) {
  return (
    <div style={{ background: "var(--c-bg)", color: "var(--c-text)", fontFamily: "var(--f-body)", minHeight: "100dvh" }}>
      <header style={{ position: "sticky", top: 0, zIndex: 50, background: "var(--c-bg)", borderBottom: "1px solid var(--c-line)" }}>
        <div style={{ maxWidth: 1040, margin: "0 auto", padding: "0 20px", minHeight: 64, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Link to="/v2" className="foc" style={{ display: "flex", alignItems: "center", gap: 9, ...disp, fontWeight: 800, fontSize: 15, textDecoration: "none", color: "inherit" }}>
            <Mark kind="scales" size={26} style={{ color: "var(--c-accent-text)" }} />Клуб
          </Link>
          <nav style={{ display: "flex", alignItems: "center", gap: 2 }}>
            {NAV.map((n) => {
              const on = (active === "lk" && n.to === "/v2/lk") || (active === "profile" && n.to === "/v2/lk/profile");
              return (
                <Link key={n.to} to={n.to} className="foc" aria-current={on ? "page" : undefined}
                  style={{ ...label, textDecoration: "none", padding: "8px 10px", color: on ? "var(--c-text)" : "var(--c-text-3)", borderBottom: `2px solid ${on ? "var(--c-accent)" : "transparent"}` }}>
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            <VisionToggle compact v2 />
            <button onClick={onLogout} className="foc" style={{ ...actionGhost, padding: "8px 12px" }}>выйти</button>
          </div>
        </div>
      </header>

      {/* Низ не должен уезжать под cookie-баннер: внизу профиля права по 152-ФЗ */}
      <main style={{ maxWidth: 1040, margin: "0 auto", padding: "26px 20px 64px", paddingBottom: "calc(64px + var(--cookie-h, 0px) + var(--tabs-h, 0px))" }}>{children}</main>
      <MobileTabs />
    </div>
  );
}
