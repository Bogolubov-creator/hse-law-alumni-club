import { useEffect, type RefObject } from "react";

/**
 * Проявление полос при прокрутке (решение заказчика 12.09: живое движение на
 * публичном контуре). Элементы с data-reveal получают класс is-in, когда входят
 * в окно; до этого они лишь приглушены и сдвинуты на 22px – содержание видно
 * и без анимации. При reduced-motion и без IntersectionObserver ничего не делаем.
 */
export function useReveal(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el || typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) return;
    const items = el.querySelectorAll<HTMLElement>("[data-reveal]");
    if (!items.length) return;
    el.classList.add("reveal-armed");
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      }
    }, { rootMargin: "0px 0px -5% 0px", threshold: 0.05 });
    items.forEach((i) => io.observe(i));
    return () => { io.disconnect(); el.classList.remove("reveal-armed"); };
  }, [root]);
}
