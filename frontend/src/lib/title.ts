import { useEffect } from "react";

const BASE = "Клуб выпускников факультета права Вышки";
const BASE_DESC = "Клуб выпускников факультета права Вышки: программы ДПО, мерч, подкасты и кабинет участника.";

function upsertMeta(key: "name" | "property", val: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${key}="${val}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(key, val);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

export interface HeadOptions {
  title?: string | null;
  description?: string | null;
  canonical?: string | null;
  noindex?: boolean;
}

export function useHead(o: HeadOptions): void {
  const { title, description, canonical, noindex } = o;
  useEffect(() => {
    document.title = title ? `${title} – ${BASE}` : BASE;
    upsertMeta("property", "og:title", title ?? BASE);
    const desc = description || BASE_DESC;
    upsertMeta("name", "description", desc);
    upsertMeta("property", "og:description", desc);
    const url = canonical ?? window.location.origin + window.location.pathname;
    upsertCanonical(url);
    upsertMeta("property", "og:url", url);
    upsertMeta("name", "robots", noindex ? "noindex, nofollow" : "index, follow");
  }, [title, description, canonical, noindex]);
}

export function usePageTitle(title?: string | null): void {
  useHead({ title });
}
