import { useEffect } from "react";

export function useJsonLd(data: object | null | undefined): void {
  const json = data ? JSON.stringify(data) : "";
  useEffect(() => {
    if (!json) return;
    const el = document.createElement("script");
    el.type = "application/ld+json";
    el.textContent = json;
    document.head.appendChild(el);
    return () => {
      el.remove();
    };
  }, [json]);
}

export function siteOrigin(): string {
  return window.location.origin;
}
