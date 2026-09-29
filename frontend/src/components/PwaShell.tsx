import { useEffect, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useIsPwaShell } from "../lib/use-pwa.js";

/**
 * Оболочка установленного приложения: класс на html, phone-column на широком
 * экране, мобильная навигация вместо десктоп-шапки.
 * Админка и обычный браузер – без рамки.
 */
export function PwaShell({ children }: { children: ReactNode }) {
  const pwa = useIsPwaShell();
  const { pathname } = useLocation();
  const active = pwa && !pathname.startsWith("/admin");

  useEffect(() => {
    const root = document.documentElement;
    if (!active) {
      root.classList.remove("pwa-shell");
      return;
    }
    root.classList.add("pwa-shell");
    return () => root.classList.remove("pwa-shell");
  }, [active]);

  if (!active) return <>{children}</>;

  return (
    <div className="pwa-shell-root" data-testid="pwa-shell">
      <div className="pwa-shell-stage">{children}</div>
    </div>
  );
}
