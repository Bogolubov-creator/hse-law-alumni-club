import { useState } from "react";
import { useLocation } from "react-router-dom";
import { ClubSupportBot } from "./ClubSupportBot.js";
import { MascotSlot } from "./MascotSlot.js";

export function SupportDock() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  if (pathname.startsWith("/admin") || pathname.includes("/support")) return null;
  return (
    <>
      <button
        type="button"
        className="club-support-dock foc"
        aria-label="Открыть бота поддержки"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <MascotSlot
          placement="support"
          fallback={
            <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M20 11a8 8 0 0 1-8 8H5l-3 3V11a9 9 0 0 1 18 0Z" />
              <path d="M7 9h8M7 13h5" />
            </svg>
          }
        />
        <span>Поддержка</span>
      </button>
      <ClubSupportBot open={open} onClose={() => setOpen(false)} />
    </>
  );
}
