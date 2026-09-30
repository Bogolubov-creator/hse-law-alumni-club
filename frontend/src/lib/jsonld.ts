import { useEffect } from "react";

/**
 * Монтирует <script type="application/ld+json"> с переданными данными на время
 * жизни страницы и снимает при размонтировании. null/undefined – ничего не
 * добавляет. CSP это не блокирует: ld+json – data-блок, не исполняемый скрипт.
 */
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

/** Базовый URL сайта для абсолютных ссылок в JSON-LD (клиентский рантайм). */
export function siteOrigin(): string {
  return window.location.origin;
}
