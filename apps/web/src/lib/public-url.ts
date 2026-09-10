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

/** Basename для React Router: без завершающего слэша; корень → undefined. */
export function routerBasename(): string | undefined {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return base || undefined;
}

export const isMirror = import.meta.env.VITE_MIRROR === "true";
