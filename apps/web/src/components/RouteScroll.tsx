import { useLayoutEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

const positions = new Map<string, number>();

/** Новая страница открывается с заголовка; возврат сохраняет место чтения. */
export function RouteScroll() {
  const { key, hash } = useLocation();
  const navigation = useNavigationType();
  useLayoutEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    if (hash) {
      try { document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView(); } catch { /* Некорректный якорь. */ }
    } else {
      window.scrollTo({ top: navigation === "POP" ? positions.get(key) ?? 0 : 0, behavior: "instant" });
    }
    return () => {
      positions.set(key, window.scrollY);
      if (positions.size > 100) positions.delete(positions.keys().next().value!);
      window.history.scrollRestoration = previous;
    };
  }, [key, hash, navigation]);
  return null;
}
