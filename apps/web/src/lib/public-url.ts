/** Публичный URL с учётом Vite `base` (нужно для GitHub Pages project site). */
export function publicUrl(path: string): string {
  const clean = path.replace(/^\//, "");
  return `${import.meta.env.BASE_URL}${clean}`;
}

/** http(s)/data/blob – как есть; относительные пути сайта – через `publicUrl`. */
export function mediaUrl(src: string): string {
  if (/^(https?:|data:|blob:)/i.test(src)) return src;
  return publicUrl(src);
}

const RASTER_EXT = /\.(jpe?g|png)$/i;

/** Локальный jpeg/png → соседние `.avif` / `.webp` (оригинал остаётся fallback). */
export function modernRasterSources(src: string): { avif: string; webp: string; fallback: string } | null {
  if (/^(https?:|data:|blob:)/i.test(src)) return null;
  if (!RASTER_EXT.test(src)) return null;
  const base = src.replace(RASTER_EXT, "");
  return {
    avif: mediaUrl(`${base}.avif`),
    webp: mediaUrl(`${base}.webp`),
    fallback: mediaUrl(src),
  };
}

/** Соседний `.webp` для lazy-prefer в ProductImage; иначе null. */
export function webpSiblingUrl(src: string): string | null {
  if (/^(https?:|data:|blob:)/i.test(src)) return null;
  if (!RASTER_EXT.test(src)) return null;
  return mediaUrl(src.replace(RASTER_EXT, ".webp"));
}

/** Basename для React Router: без завершающего слэша; корень → undefined. */
export function routerBasename(): string | undefined {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return base || undefined;
}

export const isMirror = import.meta.env.VITE_MIRROR === "true";
