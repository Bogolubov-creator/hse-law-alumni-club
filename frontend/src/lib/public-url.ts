export function publicUrl(path: string): string {
  const clean = path.replace(/^\//, "");
  return `${import.meta.env.BASE_URL}${clean}`;
}

export function mediaUrl(src: string): string {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuid.test(src)) return `/api/media/${src}`;
  try {
    const path = new URL(src, "http://media.local").pathname;
    const legacy = /^\/(?:assets|api\/media)\/([0-9a-f-]{36})(?:\/[^/]*)?\/?$/i.exec(path);
    if (legacy && uuid.test(legacy[1]!)) return `/api/media/${legacy[1]}`;
  } catch { /* Обычный локальный путь обработает publicUrl. */ }
  if (src.startsWith("/api/")) return src;
  if (/^(https?:|data:|blob:)/i.test(src)) return src;
  return publicUrl(src);
}

export function programThumbUrl(cover: string | null | undefined): string | null {
  if (!cover) return null;
  const m = /\/assets\/programs\/([^/]+)\.(jpe?g|png|webp)$/i.exec(cover);
  if (m) return mediaUrl(`/assets/programs/thumbs/${m[1]}.jpg`);
  return mediaUrl(cover);
}

const RASTER_EXT = /\.(jpe?g|png)$/i;

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

export function webpSiblingUrl(src: string): string | null {
  if (/^(https?:|data:|blob:)/i.test(src)) return null;
  if (!RASTER_EXT.test(src)) return null;
  return mediaUrl(src.replace(RASTER_EXT, ".webp"));
}

export function routerBasename(): string | undefined {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return base || undefined;
}

export const isMirror = import.meta.env.VITE_MIRROR === "true";
