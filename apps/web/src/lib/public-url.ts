/** Публичный URL с учётом Vite `base` (нужно для GitHub Pages project site). */
export function publicUrl(path: string): string {
  const clean = path.replace(/^\//, "");
  return `${import.meta.env.BASE_URL}${clean}`;
}

/** Basename для React Router: без завершающего слэша; корень → undefined. */
export function routerBasename(): string | undefined {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return base || undefined;
}

export const isMirror = import.meta.env.VITE_MIRROR === "true";
