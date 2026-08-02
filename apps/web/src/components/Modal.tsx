import { useEffect, useRef, type ReactNode } from "react";

/**
 * Доступная модалка: Esc закрывает, фокус уходит внутрь и возвращается на триггер,
 * role=dialog + aria-modal, клик по фону закрывает.
 */
export default function Modal({
  onClose, children, labelledBy, maxWidth = 460,
}: { onClose: () => void; children: ReactNode; labelledBy?: string; maxWidth?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      // Ловушка фокуса: Tab не должен уходить за пределы модалки (требование aria-modal).
      if (e.key === "Tab") {
        const box = ref.current;
        if (!box) return;
        const focusable = box.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input:not([disabled]), select, [tabindex]:not([tabindex="-1"])',
        );
        if (!focusable.length) { e.preventDefault(); box.focus(); return; }
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === box)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(15,18,24,.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, overflow: "auto" }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onClick={(e) => e.stopPropagation()}
        style={{ position: "relative", width: "100%", maxWidth, outline: "none", maxHeight: "92dvh", overflowY: "auto", WebkitOverflowScrolling: "touch", borderRadius: 22 }}
      >
        {children}
      </div>
    </div>
  );
}
