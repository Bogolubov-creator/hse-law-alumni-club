import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { allowsOptionalCookies } from "../lib/cookie-consent.js";

/** Лёгкий page-view маяк: только при «Принять все», только path, без cookies на запросе. */
export function PageViewBeacon() {
  const { pathname } = useLocation();
  const last = useRef<string | null>(null);

  useEffect(() => {
    const send = (path: string) => {
      if (!allowsOptionalCookies()) return;
      if (last.current === path) return;
      last.current = path;
      const body = JSON.stringify({ path });
      try {
        if (navigator.sendBeacon) {
          const blob = new Blob([body], { type: "application/json" });
          navigator.sendBeacon("/api/analytics/pageview", blob);
          return;
        }
      } catch {
        /* fallback ниже */
      }
      void fetch("/api/analytics/pageview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        keepalive: true,
        credentials: "omit",
      }).catch(() => undefined);
    };

    send(pathname);
    const onConsent = (ev: Event) => {
      const detail = (ev as CustomEvent<string>).detail;
      if (detail === "all") send(pathname);
      if (detail === "essential") last.current = null;
    };
    window.addEventListener("club:cookie-consent", onConsent);
    return () => window.removeEventListener("club:cookie-consent", onConsent);
  }, [pathname]);

  return null;
}
