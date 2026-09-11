import { useLayoutEffect, useRef, type ReactNode } from "react";

/** Учитываем высоту баннера в полноэкранной мобильной оболочке. */
export function SiteNotice({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => document.documentElement.style.setProperty("--notice-h", `${node.getBoundingClientRect().height}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => { observer.disconnect(); document.documentElement.style.removeProperty("--notice-h"); };
  }, []);
  return <div ref={ref} className="club-local-notice">{children}</div>;
}
