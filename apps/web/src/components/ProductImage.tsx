import { useState } from "react";
import { mediaUrl } from "../lib/public-url.js";

/** Картинка товара: локальные `/assets/…` идут через Vite `base` (зеркало Pages). */
export default function ProductImage({ src, title }: { src?: string; title: string }) {
  const resolved = src ? mediaUrl(src) : undefined;
  const [failed, setFailed] = useState<string>();
  return resolved && failed !== resolved ? (
    <img
      src={resolved}
      alt={title}
      width={600}
      height={600}
      style={{ display: "block", width: "100%", height: "100%", objectFit: "contain" }}
      onError={() => setFailed(resolved)}
    />
  ) : (
    <div
      className="club-image-missing"
      style={{
        display: "grid",
        placeItems: "center",
        minHeight: 64,
        height: "100%",
        padding: 20,
        background: "var(--c-bg-sunken)",
        color: "var(--c-text-2)",
      }}
    >
      Фотография пока недоступна
    </div>
  );
}
