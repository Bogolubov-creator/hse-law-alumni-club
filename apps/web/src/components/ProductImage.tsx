import { useEffect, useState } from "react";
import { mediaUrl, webpSiblingUrl } from "../lib/public-url.js";

type Props = {
  src?: string;
  title: string;
  /** LCP / above-fold: eager + high; иначе lazy (каталог, карточки). */
  priority?: boolean;
};

/**
 * Картинка товара: локальные `/assets/…` через Vite `base`.
 * Для jpeg/png сначала пробуем соседний `.webp`, при ошибке – оригинал.
 */
export default function ProductImage({ src, title, priority = false }: Props) {
  const resolved = src ? mediaUrl(src) : undefined;
  const webp = src ? webpSiblingUrl(src) : null;
  const [useOrig, setUseOrig] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setUseOrig(false);
    setFailed(false);
  }, [src]);

  const current = useOrig ? resolved : (webp ?? resolved);

  if (!resolved || failed) {
    return (
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

  return (
    <img
      src={current}
      alt={title}
      width={600}
      height={600}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : undefined}
      style={{ display: "block", width: "100%", height: "100%", objectFit: "contain" }}
      onError={() => {
        if (!useOrig && webp) {
          setUseOrig(true);
          return;
        }
        setFailed(true);
      }}
    />
  );
}
