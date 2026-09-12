import { useEffect, type RefObject } from "react";

/**
 * Проявление полос при прокрутке (решение заказчика 12.09: живое движение на
 * публичном контуре). Элементы с data-reveal получают класс is-in, когда входят
 * в окно; до этого они лишь приглушены и сдвинуты на 18px – содержание видно
 * и без анимации. Полосы, смонтированные позже (после загрузки данных), ловит
 * MutationObserver; страховка через 2,5 с показывает каждую полосу полностью.
 * При reduced-motion и без IntersectionObserver ничего не делаем.
 */
export function useReveal(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el || typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) return;
    el.classList.add("reveal-armed");
    const timers = new Set<number>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      }
    }, { rootMargin: "0px 0px -5% 0px", threshold: 0 });
    const seen = new WeakSet<Element>();
    const arm = (node: Element) => {
      if (seen.has(node)) return;
      seen.add(node);
      io.observe(node);
      timers.add(window.setTimeout(() => node.classList.add("is-in"), 2500));
    };
    el.querySelectorAll("[data-reveal]").forEach(arm);
    const mo = new MutationObserver((records) => {
      for (const r of records) {
        r.addedNodes.forEach((n) => {
          if (!(n instanceof Element)) return;
          if (n.matches("[data-reveal]")) arm(n);
          n.querySelectorAll("[data-reveal]").forEach(arm);
        });
      }
    });
    mo.observe(el, { childList: true, subtree: true });
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      mo.disconnect();
      io.disconnect();
      el.classList.remove("reveal-armed");
    };
  }, [root]);
}
