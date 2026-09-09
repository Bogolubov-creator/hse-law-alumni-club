import { useLayoutEffect, useRef, type RefObject } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * Живой motion главной «Вестник» (gpt-taste): grain drift, scale Фемиды,
 * scrub-reveal полос, marquee. При reduced-motion – только статичный кадр.
 */
export function useVestnikMotion(rootRef: RefObject<HTMLElement | null>) {
  const scrubTriggers = useRef<ScrollTrigger[]>([]);

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root || prefersReducedMotion()) return;

      const themis = root.querySelector<HTMLElement>(".vestnik-themis");
      if (themis) {
        gsap.fromTo(
          themis,
          { scale: 1.12, opacity: 0.42 },
          {
            scale: 1,
            opacity: 0.62,
            ease: "none",
            scrollTrigger: {
              trigger: root.querySelector(".vestnik-hero"),
              start: "top top",
              end: "bottom top",
              scrub: true,
            },
          },
        );
      }

      const lines = root.querySelectorAll<HTMLElement>(".vestnik-scrub");
      lines.forEach((el) => {
        const tween = gsap.fromTo(
          el,
          { opacity: 0.18, y: 18 },
          {
            opacity: 1,
            y: 0,
            ease: "none",
            scrollTrigger: {
              trigger: el,
              start: "top 88%",
              end: "top 55%",
              scrub: true,
            },
          },
        );
        if (tween.scrollTrigger) scrubTriggers.current.push(tween.scrollTrigger);
      });
    },
    { scope: rootRef, dependencies: [] },
  );

  useLayoutEffect(() => {
    return () => {
      scrubTriggers.current.forEach((st) => st.kill());
      scrubTriggers.current = [];
    };
  }, []);
}
