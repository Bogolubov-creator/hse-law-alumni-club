import { useEffect } from "react";

const BASE = "Клуб выпускников факультета права НИУ ВШЭ";

/** Заголовок вкладки: «Страница — Клуб…». Без аргумента — базовый. */
export function usePageTitle(title?: string | null): void {
  useEffect(() => {
    document.title = title ? `${title} — ${BASE}` : BASE;
    return () => { document.title = BASE; };
  }, [title]);
}
