import { createPortal } from "react-dom";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * Доступная модалка: Esc закрывает, фокус уходит внутрь и возвращается на триггер,
 * role=dialog + aria-modal, клик по фону закрывает.
 */
export default function Modal({
  onClose, children, labelledBy, maxWidth = 460,
}: { onClose: () => void; children: ReactNode; labelledBy?: string; maxWidth?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const background = Array.from(document.body.children).filter((el): el is HTMLElement => el instanceof HTMLElement && !el.contains(ref.current));
    const inert = background.map((el) => el.inert);
    background.forEach((el) => { el.inert = true; });
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { closeRef.current(); return; }
      // Ловушка фокуса: Tab не должен уходить за пределы модалки (требование aria-modal).
      if (e.key === "Tab") {
        const box = ref.current;
        if (!box) return;
        const focusable = Array.from(box.querySelectorAll<HTMLElement>(
          'a[href], button, textarea, input, select, [tabindex]',
        )).filter((el) => el.tabIndex >= 0 && !el.matches(":disabled") && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden");
        if (!focusable.length) { e.preventDefault(); box.focus(); return; }
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === box)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (active === last || active === box || !box.contains(active))) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; background.forEach((el, i) => { el.inert = inert[i]!; }); if (prev?.isConnected) prev.focus(); };
  }, []);

  return createPortal(
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: "var(--layer-modal, 500)", background: "rgba(15,18,24,.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, overflow: "auto", overscrollBehavior: "contain" }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onClick={(e) => e.stopPropagation()}
        style={{ position: "relative", width: "100%", maxWidth, outline: "none", maxHeight: "92dvh", overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch", borderRadius: 22 }}
      >
        {children}
      </div>
    </div>, document.body
  );
}
