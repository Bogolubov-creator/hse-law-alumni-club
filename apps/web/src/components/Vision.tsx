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
      className={v2 ? "foc" : "foc rounded-[10px] border border-[#E5E7EB] bg-white px-2.5 py-2 text-[13px] font-medium leading-none"}
      style={v2 ? { borderRadius: "var(--r-sm)", border: "1px solid var(--c-line)", background: "transparent", color: "var(--c-text-2)", padding: "7px 10px", fontSize: 13, lineHeight: 1, cursor: "pointer" } : undefined}
    >
      <span aria-hidden>👁</span>{!compact && <span className="ml-1.5 align-middle">Для слабовидящих</span>}
    </button>
  );
}

/** Плавающая кнопка версии для слабовидящих для страниц без общей шапки (auth/ЛК/админка). */
export function VisionCorner() {
  const v = useVision();
  if (v.on) return null; // когда режим включён, панель настроек уже видна сверху
  return (
    <div style={{ position: "fixed", top: 10, right: 10, zIndex: 60 }}>
      <VisionToggle compact />
    </div>
  );
}

/** Панель настроек версии для слабовидящих – показывается вверху, когда режим включён. */
export function VisionPanel() {
  const v = useVision();
  if (!v.on) return null;
  const B = ({ active, onClick, children, label }: { active?: boolean; onClick: () => void; children: React.ReactNode; label?: string }) => (
    <button onClick={onClick} aria-pressed={!!active} aria-label={label} className={`vis-btn${active ? " vis-active" : ""}`} style={{ padding: "6px 12px", borderRadius: 8, cursor: "pointer" }}>
      {children}
    </button>
  );
  // Каждая настройка – неделимый кластер «подпись + кнопки»: на узком экране
  // (телефон, крупный zoom) панель переносится по кластерам, и подпись
  // не отрывается от своих кнопок. Ширина панели ограничена вьюпортом.
  const Group = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <span style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: 10, maxWidth: "100%" }}>
      <span>{label}</span>
      {children}
    </span>
  );
  return (
    <div className="vis-bar" role="region" aria-label="Настройки версии для слабовидящих" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: "10px 16px", maxWidth: "100%", boxSizing: "border-box", overflowWrap: "break-word" }}>
      <strong style={{ marginRight: 4 }}>Версия для слабовидящих</strong>

      <Group label="Размер:">
        <B active={v.zoom === 1} onClick={() => setVision({ zoom: 1 })} label="Обычный размер шрифта"><span style={{ fontSize: 14 }}>А</span></B>
        <B active={v.zoom === 1.4} onClick={() => setVision({ zoom: 1.4 })} label="Крупный шрифт"><span style={{ fontSize: 18 }}>А</span></B>
        <B active={v.zoom === 1.8} onClick={() => setVision({ zoom: 1.8 })} label="Очень крупный шрифт"><span style={{ fontSize: 22 }}>А</span></B>
      </Group>

      <Group label="Цвет:">
        <B active={v.scheme === "bw"} onClick={() => setVision({ scheme: "bw" })} label="Чёрным по белому">Ч</B>
        <B active={v.scheme === "wb"} onClick={() => setVision({ scheme: "wb" })} label="Белым по чёрному">Б</B>
        <B active={v.scheme === "bb"} onClick={() => setVision({ scheme: "bb" })} label="Тёмно-синим по бежевому">С</B>
      </Group>

      <Group label="Интервал:">
        <B active={v.spacing} onClick={() => setVision({ spacing: !v.spacing })} label="Межбуквенный интервал">{v.spacing ? "увеличен" : "обычный"}</B>
      </Group>

      <Group label="Шрифт:">
        <B active={v.serif} onClick={() => setVision({ serif: !v.serif })} label="Шрифт с засечками">{v.serif ? "с засечками" : "без засечек"}</B>
      </Group>

      <Group label="Изображения:">
        <B active={!v.images} onClick={() => setVision({ images: !v.images })} label="Показ изображений">{v.images ? "показаны" : "скрыты"}</B>
      </Group>

      <button onClick={() => setVision({ on: false })} className="vis-btn" style={{ marginLeft: "auto", padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontWeight: 700, maxWidth: "100%" }}>Обычная версия ✕</button>
    </div>
  );
}
