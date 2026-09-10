import { useState } from "react";
export default function ProductImage({ src, title }: { src?: string; title: string }) {
  const [failed, setFailed] = useState<string>();
  return src && failed !== src ? <img src={src} alt={title} width={600} height={600} style={{ display: "block", width: "100%", height: "100%", objectFit: "contain" }} onError={() => setFailed(src)} /> : <div className="club-image-missing" style={{ display: "grid", placeItems: "center", minHeight: 64, height: "100%", padding: 20, background: "var(--c-bg-sunken)", color: "var(--c-text-2)" }}>Фотография пока недоступна</div>;
}
