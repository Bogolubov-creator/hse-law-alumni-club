import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useIsMobile } from "../lib/use-mobile.js";
import { useIsPwaShell } from "../lib/use-pwa.js";
import { ClubSupportBot } from "./ClubSupportBot.js";
import { crowMascotApi } from "../mascot/crow-mascot.js";
import { publicUrl } from "../lib/public-url.js";
import "./CrowSupportLauncher.css";

type CrowInstance = {
  play: (name: string) => void;
  hide: () => void;
  show: () => void;
  destroy: () => void;
  host: HTMLElement;
};

/**
 * Угловая ворона Шерлок = launcher FAQ-бота (как на dpo-pravo-hse).
 * Синяя пилюля убрана: прозрачный hit поверх маскота; в html.vis – текстовая кнопка.
 */
export function SupportDock() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const crowRef = useRef<CrowInstance | null>(null);
  const mobile = useIsMobile();
  const pwa = useIsPwaShell();
  const compact = mobile || pwa;
  const hidden = pathname.startsWith("/admin") || pathname.includes("/support");

  useEffect(() => {
    if (hidden) return;

    let cancelled = false;
    let crow: CrowInstance | null = null;
    let hit: HTMLButtonElement | null = null;
    let viBtn: HTMLButtonElement | null = null;
    let bootTimer = 0;

    const openBot = () => setOpen(true);

    const mount = () => {
      if (cancelled || crowRef.current || hit) return;

      // На телефоне персонаж меньше, чтобы оставить место содержимому.
      const width = compact ? 80 : 112;
      const height = Math.round((width * 1465) / 1400);

      hit = document.createElement("button");
      hit.type = "button";
      hit.className = "club-crow-hit foc";
      hit.setAttribute("aria-label", "Открыть бота поддержки");
      hit.style.width = `${width}px`;
      hit.style.height = `${height}px`;
      hit.addEventListener("click", openBot);
      document.body.appendChild(hit);

      viBtn = document.createElement("button");
      viBtn.type = "button";
      viBtn.className = "club-crow-vi foc";
      viBtn.textContent = "Поддержка";
      viBtn.setAttribute("aria-label", "Открыть бота поддержки");
      viBtn.addEventListener("click", openBot);
      document.body.appendChild(viBtn);

      crow = crowMascotApi.mount({
        assetPath: publicUrl("assets/crow/"),
        anchor: "bottom-right",
        width,
        zIndex: 40,
        idleSeconds: 0,
        followCursor: false,
        idleAnim: "askQ",
        onClick: openBot,
        solo: true,
      }) as CrowInstance;
      crow.play("idle");
      crow.host.classList.add("club-crow-corner");
      crowRef.current = crow;
    };

    const schedule = () => {
      bootTimer = window.setTimeout(mount, 0);
    };
    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });

    return () => {
      cancelled = true;
      window.clearTimeout(bootTimer);
      window.removeEventListener("load", schedule);
      crow?.destroy();
      crowRef.current = null;
      hit?.remove();
      viBtn?.remove();
    };
  }, [hidden, compact]);

  useEffect(() => {
    const crow = crowRef.current;
    if (!crow) return;
    if (open) crow.hide();
    else crow.show();
  }, [open]);

  if (hidden) return null;

  return (
    <ClubSupportBot
      open={open}
      onClose={() => {
        setOpen(false);
        document.querySelector<HTMLButtonElement>(".club-crow-hit")?.focus({ preventScroll: true });
      }}
    />
  );
}
