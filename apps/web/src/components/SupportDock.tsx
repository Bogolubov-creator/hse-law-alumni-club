import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
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
      if (cancelled || crowRef.current) return;
      const narrow = window.matchMedia("(max-width: 1023px)").matches;
      const width = narrow ? 96 : 200;
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
        idleSeconds: 14,
        idleAnim: "askQ",
        onClick: openBot,
        solo: true,
      }) as CrowInstance;
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
  }, [hidden]);

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
        window.setTimeout(() => crowRef.current?.play("wave"), 50);
      }}
    />
  );
}
