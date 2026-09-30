import { type CSSProperties, type ReactNode } from "react";


// Определения общие с витринами и кабинетом – в styles/primitives.ts.
import { mono, label } from "../styles/primitives.js";
export { mono, disp, label, action, actionGhost } from "../styles/primitives.js";
export { fieldCompact as field } from "../styles/primitives.js";

export function Panel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ border: "1px solid var(--c-line)", borderRadius: "var(--r-lg)", background: "var(--c-bg-raised)", padding: 20, boxShadow: "0 14px 32px -24px rgb(20 24 31 / 0.35), inset 0 1px 0 rgb(255 255 255 / 0.9)", ...style }}>
      {children}
    </div>
  );
}

export function PanelTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
      <h2 style={{ fontFamily: "var(--f-display)", fontWeight: 400, letterSpacing: "var(--tr-display)", fontSize: 21, lineHeight: 1.2, margin: 0 }}>{children}</h2>
      {right}
    </div>
  );
}

export function statusTone(s: string): { color: string; border: string } {
  if (s === "new" || s === "pending") return { color: "var(--c-accent-text)", border: "var(--c-accent-text)" };
  if (s === "in_progress") return { color: "var(--c-link)", border: "var(--c-link)" };
  if (s === "confirmed" || s === "verified" || s === "done") return { color: "var(--c-ok-text)", border: "var(--c-ok-text)" };
  return { color: "var(--c-danger-text)", border: "var(--c-danger-text)" };
}

export function Pill({ status, children }: { status: string; children: ReactNode }) {
  const t = statusTone(status);
  return (
    <span style={{
      ...mono, fontSize: 10, letterSpacing: "var(--tr-data)", textTransform: "uppercase",
      padding: "4px 10px", borderRadius: 999, border: `1px solid ${t.border}`, color: t.color, whiteSpace: "nowrap",
    }}>{children}</span>
  );
}

export function Row({ children, cols, style }: { children: ReactNode; cols: string; style?: CSSProperties }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: cols, gap: 14, alignItems: "center", padding: "12px 0", borderTop: "1px solid var(--c-line)", ...style }}>
      {children}
    </div>
  );
}

export function Stat({ name, value, note, accent }: { name: string; value: number | string; note?: string; accent?: boolean }) {
  return (
    <div style={{ padding: "16px 0", borderTop: "1px solid var(--c-line)" }}>
      <div style={label}>{name}</div>
      <div style={{ fontFamily: "var(--f-display)", fontWeight: 400, fontVariantNumeric: "tabular-nums", fontSize: 34, lineHeight: 1.1, marginTop: 6, color: accent ? "var(--c-accent-text)" : "var(--c-text)" }}>{value}</div>
      {note && <div style={{ ...label, fontSize: 10, marginTop: 4 }}>{note}</div>}
    </div>
  );
}
