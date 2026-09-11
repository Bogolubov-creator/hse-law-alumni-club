import { type CSSProperties, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { isAndroid } from "../lib/use-mobile.js";

/**
 * Единая нижняя панель: Карта · Лента · ДПО · Мерч · Кабинет.
 * Подкасты и корзина – из шапки/карты; здесь один набор пунктов для витрин и ЛК.
 */

const ANDROID = isAndroid();

const MONO = { fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace' } as const;

type Tab = {
  to: string;
  label: string;
  match: (pathname: string) => boolean;
  icon: ReactNode;
};

export const CLUB_TABS: Tab[] = [
  {
    to: "/",
    label: "Карта",
    match: (p) => p === "/",
    icon: (<><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M3 10h18" /><path d="M7 15h5" /></>),
  },
  {
    to: "/news",
    label: "Лента",
    match: (p) => p.startsWith("/news"),
    icon: (<><rect x="4" y="4" width="16" height="16" rx="2.5" /><path d="M8 9h8M8 13h8M8 17h5" /></>),
  },
  {
    to: "/dpo",
    label: "ДПО",
    match: (p) => p.startsWith("/dpo"),
    icon: (<><path d="M3 8l9-4 9 4-9 4-9-4z" /><path d="M7 10.5V15c0 1 2.2 2.2 5 2.2s5-1.2 5-2.2v-4.5" /><path d="M21 8.5v5" /></>),
  },
  {
    to: "/merch",
    label: "Мерч",
    match: (p) => p.startsWith("/merch"),
    icon: (<><path d="M6 8h12l-1 12H7L6 8z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>),
  },
  {
    to: "/lk",
    label: "Кабинет",
    match: (p) => p.startsWith("/lk"),
    icon: (<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>),
  },
];

export function clubTabActive(pathname: string): string {
  return CLUB_TABS.find((t) => t.match(pathname))?.to ?? "/";
}

type Props = {
  /** Явный активный таб; иначе из location. */
  active?: string;
  /**
   * embedded – внутри колонки MobileApp;
   * fixed – поверх канон-страниц (Shell / кабинет), только .mob-only.
   */
  variant?: "embedded" | "fixed";
};

export function ClubTabBar({ active: activeProp, variant = "fixed" }: Props) {
  const { pathname } = useLocation();
  const active = activeProp ?? clubTabActive(pathname);
  const fixed = variant === "fixed";

  const navStyle: CSSProperties = {
    flexShrink: 0,
    display: "flex",
    alignItems: "stretch",
    padding: ANDROID
      ? "6px 6px calc(env(safe-area-inset-bottom, 0px) + 8px)"
      : "9px 6px calc(env(safe-area-inset-bottom, 0px) + 12px)",
    background: ANDROID ? "#FBF3E8" : "rgba(251,243,232,.95)",
    borderTop: "1px solid #E7E0D0",
    ...(ANDROID
      ? {}
      : { backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }),
    ...(fixed ? { position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 200 } : {}),
  };

  return (
    <nav
      className={fixed ? "mob-only club-tab-bar v2-tabs" : "club-tab-bar v2-tabs"}
      aria-label="Основные разделы"
      style={navStyle}
    >
      {CLUB_TABS.map((t) => {
        const on = t.to === active;
        if (ANDROID) {
          const col = on ? "#C24009" : "#5C5648";
          return (
            <Link
              key={t.to}
              to={t.to}
              aria-label={t.label}
              aria-current={on ? "page" : undefined}
              className="foc"
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "6px 0", textDecoration: "none" }}
            >
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 62, height: 32, borderRadius: 16, background: on ? "rgba(236,90,19,.16)" : "transparent" }}>
                <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{t.icon}</svg>
              </span>
              <span style={{ ...MONO, fontSize: 11, letterSpacing: ".02em", color: col }}>{t.label}</span>
            </Link>
          );
        }
        return (
          <Link
            key={t.to}
            to={t.to}
            aria-label={t.label}
            aria-current={on ? "page" : undefined}
            className="foc"
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              padding: "5px 0",
              textDecoration: "none",
              color: on ? "#EC5A13" : "#6E675A",
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{t.icon}</svg>
            <span style={{ ...MONO, fontSize: 11, letterSpacing: ".02em" }}>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
