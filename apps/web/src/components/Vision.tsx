import { useVision, setVision } from "../lib/a11y.js";

/**
 * Кнопка-переключатель «Версия для слабовидящих» (в шапке).
 *
 * `v2` переводит кнопку на семантические токены: в тёмной теме зашитый
 * bg-white светился белой плашкой на графите. Старый фронт остаётся на
 * Tailwind-классах – там тёмной темы нет и менять нечего.
 */
export function VisionToggle({ compact = false, v2 = false }: { compact?: boolean; v2?: boolean }) {
  const v = useVision();
  return (
    <button
      onClick={() => setVision({ on: !v.on })}
      aria-pressed={v.on}
      aria-label="Версия для слабовидящих"
      title="Версия для слабовидящих"
      className={v2 ? "foc" : "foc rounded-[10px] border border-[#7C828C] bg-white px-2.5 py-2 text-[13px] font-medium leading-none"}
      style={v2 ? { borderRadius: "var(--r-sm)", border: "1px solid var(--c-line-control)", background: "transparent", color: "var(--c-text-2)", padding: "7px 10px", fontSize: 13, lineHeight: 1, cursor: "pointer" } : undefined}
    >
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ display: "inline-block", verticalAlign: "middle" }}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>{!compact && <span className="ml-1.5 align-middle">Для слабовидящих</span>}
    </button>
  );
}

/** Плавающая кнопка версии для слабовидящих для страниц без общей шапки (auth/ЛК/админка). */
export function VisionCorner() {
  const v = useVision();
  if (v.on) return null; // когда режим включён, панель настроек уже видна сверху
  return (
    <div style={{ position: "fixed", top: import.meta.env.VITE_LOCAL_REVIEW === "true" ? 72 : 10, right: 10, zIndex: 60 }}>
      <VisionToggle compact v2={window.location.pathname.startsWith("/v2")} />
    </div>
  );
}

/** Панель настроек версии для слабовидящих – показывается вверху, когда режим включён. */
export function VisionPanel() {
  const v = useVision();
  if (!v.on) return null;
  const B = ({ active, onClick, children, label }: { active?: boolean; onClick: () => void; children: React.ReactNode; label?: string }) => (
    <button onClick={onClick} aria-pressed={!!active} aria-label={label} className={`vis-btn foc${active ? " vis-active" : ""}`} style={{ padding: "6px 12px", borderRadius: 8, cursor: "pointer" }}>
      {children}
    </button>
  );
  return (
    <div className="vis-bar" role="region" aria-label="Настройки версии для слабовидящих" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: "10px 16px" }}>
      <strong style={{ marginRight: 4 }}>Версия для слабовидящих</strong>

      <span>Размер:</span>
      <B active={v.zoom === 1} onClick={() => setVision({ zoom: 1 })} label="Обычный размер шрифта"><span style={{ fontSize: 14 }}>А</span></B>
      <B active={v.zoom === 1.4} onClick={() => setVision({ zoom: 1.4 })} label="Крупный шрифт"><span style={{ fontSize: 18 }}>А</span></B>
      <B active={v.zoom === 1.8} onClick={() => setVision({ zoom: 1.8 })} label="Очень крупный шрифт"><span style={{ fontSize: 22 }}>А</span></B>

      <span style={{ marginLeft: 8 }}>Цвет:</span>
      <B active={v.scheme === "bw"} onClick={() => setVision({ scheme: "bw" })} label="Чёрным по белому">Ч</B>
      <B active={v.scheme === "wb"} onClick={() => setVision({ scheme: "wb" })} label="Белым по чёрному">Б</B>
      <B active={v.scheme === "bb"} onClick={() => setVision({ scheme: "bb" })} label="Тёмно-синим по бежевому">С</B>

      <span style={{ marginLeft: 8 }}>Интервал:</span>
      <B active={v.spacing} onClick={() => setVision({ spacing: !v.spacing })} label="Межбуквенный интервал">{v.spacing ? "увеличен" : "обычный"}</B>

      <span style={{ marginLeft: 8 }}>Шрифт:</span>
      <B active={v.serif} onClick={() => setVision({ serif: !v.serif })} label="Шрифт с засечками">{v.serif ? "с засечками" : "без засечек"}</B>

      <span style={{ marginLeft: 8 }}>Изображения:</span>
      <B active={!v.images} onClick={() => setVision({ images: !v.images })} label="Показ изображений">{v.images ? "показаны" : "скрыты"}</B>

      <button onClick={() => setVision({ on: false })} className="vis-btn foc" style={{ marginLeft: "auto", padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}>Обычная версия ✕</button>
    </div>
  );
}
