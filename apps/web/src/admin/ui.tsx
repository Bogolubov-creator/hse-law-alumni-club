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

export const mono: CSSProperties = { fontFamily: "var(--f-data)", fontVariantNumeric: "tabular-nums" };
export const disp: CSSProperties = { fontFamily: "var(--f-display)", letterSpacing: "var(--tr-display)" };

/** Моно-подпись реестра. */
export const label: CSSProperties = {
  ...mono, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)",
  textTransform: "uppercase", color: "var(--c-text-3)",
};

/** Действие. Один акцент на всю панель – охра с тёмным текстом (5,12:1). */
export const action: CSSProperties = {
  ...mono, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)", textTransform: "uppercase",
  padding: "9px 15px", borderRadius: "var(--r-sm)", border: "none",
  background: "var(--c-accent)", color: "var(--c-on-accent)", cursor: "pointer",
};

export const actionGhost: CSSProperties = {
  ...action, background: "transparent", color: "var(--c-text-2)", border: "1px solid var(--c-line)",
};

/** Поле ввода. */
export const field: CSSProperties = {
  padding: "10px 13px", borderRadius: "var(--r-md)", border: "1px solid var(--c-line)",
  background: "var(--c-bg)", color: "var(--c-text)", fontSize: 14, fontFamily: "inherit",
};

/** Блок-запись. Рамка, а не тень: тень в плотном списке превращается в грязь. */
export function Panel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ border: "1px solid var(--c-line)", borderRadius: "var(--r-lg)", background: "var(--c-bg-raised)", padding: 20, ...style }}>
      {children}
    </div>
  );
}

export function PanelTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
      <h2 style={{ ...disp, fontWeight: 600, fontSize: 17, margin: 0 }}>{children}</h2>
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

/** Показатель обзора: число крупно моноширинным, подпись под ним. */
export function Stat({ name, value, note, accent }: { name: string; value: number | string; note?: string; accent?: boolean }) {
  return (
    <div style={{ padding: "16px 0", borderTop: "1px solid var(--c-line)" }}>
      <div style={label}>{name}</div>
      <div style={{ ...mono, fontSize: 28, fontWeight: 500, marginTop: 6, color: accent ? "var(--c-accent-text)" : "var(--c-text)" }}>{value}</div>
      {note && <div style={{ ...label, fontSize: 10, marginTop: 4 }}>{note}</div>}
    </div>
  );
}
