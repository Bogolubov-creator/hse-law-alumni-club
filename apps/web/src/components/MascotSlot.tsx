import { useState, type ReactNode } from "react";
import { mascot } from "../config/mascot.js";
/** Размер области не зависит от файла; внешние URL не загружаются. */
export function MascotSlot({ placement, fallback }: { placement: "hero" | "support"; fallback?: ReactNode }) {
  const [failed, setFailed] = useState(false);
  const src: string = mascot[placement];
  if (!src || !/^\/assets\/[a-zA-Z0-9/_.-]+$/.test(src) || failed) return <>{fallback}</>;
  if (placement === "support") return <span className="crow-support-portrait" aria-hidden="true"><img src={src} alt="" onError={() => setFailed(true)} width={1400} height={1465} /></span>;
  return <img className={`club-mascot club-mascot-${placement}`} src={src} alt={mascot.alt} onError={() => setFailed(true)} width={placement === "hero" ? 560 : 64} height={placement === "hero" ? 560 : 64} />;
}
