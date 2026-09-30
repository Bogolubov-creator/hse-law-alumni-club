import { type CSSProperties } from "react";


export const mono: CSSProperties = {
  fontFamily: "var(--f-data)",
  fontVariantNumeric: "tabular-nums",
};

export const disp: CSSProperties = {
  fontFamily: "var(--f-head)",
  letterSpacing: "var(--tr-display)",
};

// HSE Slab содержит только начертание 400; остальные браузер синтезирует.
export const pageTitle: CSSProperties = {
  fontFamily: "var(--f-display)",
  fontWeight: 400,
  letterSpacing: "var(--tr-display)",
};

export const label: CSSProperties = {
  ...mono,
  fontSize: "var(--t-caption)",
  letterSpacing: "var(--tr-data)",
  textTransform: "none",
  color: "var(--c-text-3)",
};

export const caps: CSSProperties = {
  fontFamily: "var(--f-body)",
  fontSize: "var(--t-caps)",
  fontWeight: 600,
  letterSpacing: "var(--tr-caps)",
  textTransform: "uppercase",
};

export const action: CSSProperties = {
  ...caps,
  padding: "13px 20px",
  minHeight: 44,
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--c-accent)",
  background: "var(--c-accent)",
  color: "var(--c-on-accent)",
  cursor: "pointer",
  textAlign: "center",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  boxSizing: "border-box",
};

export const actionGhost: CSSProperties = {
  ...action,
  background: "transparent",
  color: "var(--c-text)",
  border: "1px solid var(--c-text)",
};

export const actionText: CSSProperties = {
  ...action,
  background: "transparent",
  color: "var(--c-text)",
  border: "1px solid transparent",
  padding: "13px 4px",
};

export const field: CSSProperties = {
  width: "100%",
  marginTop: 7,
  padding: "12px 14px",
  borderRadius: "var(--r-md)",
  border: "1px solid var(--c-line-control)",
  background: "var(--c-bg)",
  color: "var(--c-text)",
  fontSize: 16,
  minHeight: 48,
  fontFamily: "inherit",
};

export const fieldCompact: CSSProperties = {
  padding: "10px 13px",
  borderRadius: "var(--r-md)",
  border: "1px solid var(--c-line-control)",
  background: "var(--c-bg)",
  color: "var(--c-text)",
  fontSize: 14,
  fontFamily: "inherit",
};
