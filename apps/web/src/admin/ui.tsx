import { type CSSProperties, type ReactNode } from "react";

/**
 * Примитивы админ-панели в языке v2 (DESIGN.md).
 *
 * Панель – это плотный реестр: офис читает записи и меняет их статусы, а не
 * любуется карточками. Поэтому здесь режим кабинета – плотность высокая,
 * движения нет, один акцент на все действия.
 *
 * Всё на семантических токенах, поэтому панель наконец работает в тёмной теме:
 * раньше цвета были зашиты классами (`bg-white`, `border-[#E5E7EB]`), и ночью
 * офис смотрел в белый лист.
 *
 * Панель одна. Второй, «v2-админки» не существует и не должно: офис не станет
 * работать в двух панелях, а копия неизбежно разошлась бы с оригиналом – и это
 * были бы уже не косметические расхождения, а разное поведение инструмента.
 */

// Определения общие с витринами и кабинетом – в styles/primitives.ts.
import { mono, disp, label } from "../styles/primitives.js";
export { mono, disp, label, action, actionGhost } from "../styles/primitives.js";
/** Поле панели плотнее кабинетного: ввод с клавиатуры, а не с телефона. */
export { fieldCompact as field } from "../styles/primitives.js";

/** Блок-запись: материал сайта – hairline и мягкая тень снизу (не тяжелее, чем у карточки кабинета). */
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

/**
 * Статус записи. Цвет несёт смысл, но не единственный: рядом всегда текст,
 * поэтому дальтоник и чёрно-белая печать ничего не теряют.
 */
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

/** Строка реестра: разделитель – линия, а не карточка. */
export function Row({ children, cols, style }: { children: ReactNode; cols: string; style?: CSSProperties }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: cols, gap: 14, alignItems: "center", padding: "12px 0", borderTop: "1px solid var(--c-line)", ...style }}>
      {children}
    </div>
  );
}

/** Показатель обзора: число плитой HSE Slab, подпись под ним. */
export function Stat({ name, value, note, accent }: { name: string; value: number | string; note?: string; accent?: boolean }) {
  return (
    <div style={{ padding: "16px 0", borderTop: "1px solid var(--c-line)" }}>
      <div style={label}>{name}</div>
      <div style={{ fontFamily: "var(--f-display)", fontWeight: 400, fontVariantNumeric: "tabular-nums", fontSize: 34, lineHeight: 1.1, marginTop: 6, color: accent ? "var(--c-accent-text)" : "var(--c-text)" }}>{value}</div>
      {note && <div style={{ ...label, fontSize: 10, marginTop: 4 }}>{note}</div>}
    </div>
  );
}
