import { Link, useLocation } from "react-router-dom";
import { token, useCart } from "../lib/cart.js";
import { mono } from "./Shell.js";

/**
 * Нижняя панель вкладок – оболочка приложения для v2 на телефоне.
 *
 * Почему панель, а не второй набор экранов: мобильная оболочка v1 (MobileApp,
 * 1000+ строк) заново рисует каждый экран под телефон. Страницы v2 уже
 * адаптивны и написаны одним языком – им не хватает не вёрстки, а хвата
 * приложения: постоянная навигация под большим пальцем вместо бургера,
 * безопасные отступы и отсутствие «страничности».
 *
 * Панель живёт только на телефоне (`.mob-only`) и только в v2.
 */

const ICON = {
  fill: "none", stroke: "currentColor", strokeWidth: 1.7,
  strokeLinecap: "round", strokeLinejoin: "round",
} as const;

/** Иконки в языке знака: монолиния, 24×24, без заливок. */
const ICONS: Record<string, JSX.Element> = {
  home: <g {...ICON}><path d="M4 10.5 12 4l8 6.5" /><path d="M6 9.6V20h12V9.6" /><path d="M10 20v-5.2h4V20" /></g>,
  dpo: <g {...ICON}><path d="M12 5 3.5 9 12 13l8.5-4L12 5Z" /><path d="M7 11v4.6c0 1.4 2.2 2.6 5 2.6s5-1.2 5-2.6V11" /><path d="M20.5 9v5" /></g>,
  merch: <g {...ICON}><path d="M8.5 4 5 5.8 3.5 9.4 6 10.6V20h12v-9.4l2.5-1.2L19 5.8 15.5 4" /><path d="M8.5 4c0 1.9 1.6 3 3.5 3s3.5-1.1 3.5-3" /></g>,
  cart: <g {...ICON}><path d="M3.5 4h2.2l2.1 10.2a1.8 1.8 0 0 0 1.8 1.4h7.4a1.8 1.8 0 0 0 1.8-1.4L20.5 7H6.2" /><circle cx="10" cy="19.4" r="1.3" /><circle cx="17" cy="19.4" r="1.3" /></g>,
  lk: <g {...ICON}><circle cx="12" cy="8.2" r="3.6" /><path d="M4.8 20c0-3.6 3.2-5.8 7.2-5.8s7.2 2.2 7.2 5.8" /></g>,
};

interface Tab { to: string; label: string; icon: keyof typeof ICONS; match: (p: string) => boolean }

/**
 * Пять вкладок – коммерческий путь: главная, две витрины, корзина, кабинет.
 * Контент (подкасты, события, новости) остаётся в меню шапки: туда заходят
 * читать, а не действовать, и держать его под большим пальцем незачем.
 */
const TABS: Tab[] = [
  { to: "/v2", label: "главная", icon: "home", match: (p) => p === "/v2" },
  { to: "/v2/dpo", label: "дпо", icon: "dpo", match: (p) => p.startsWith("/v2/dpo") },
  { to: "/v2/merch", label: "мерч", icon: "merch", match: (p) => p.startsWith("/v2/merch") },
  { to: "/v2/cart", label: "корзина", icon: "cart", match: (p) => p.startsWith("/v2/cart") },
  { to: "/v2/lk", label: "кабинет", icon: "lk", match: (p) => p.startsWith("/v2/lk") },
];

export function MobileTabs() {
  const { pathname } = useLocation();
  const cartCount = useCart().data?.count ?? 0;
  const authed = !!token();

  return (
    <nav
      className="mob-only v2-tabs"
      aria-label="Основные разделы"
      style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 200,
        display: "flex", alignItems: "stretch",
        background: "color-mix(in srgb, var(--c-bg) 92%, transparent)",
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        borderTop: "1px solid var(--c-line)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {TABS.map((t) => {
        const on = t.match(pathname);
        // Кабинет у гостя ведёт на вход – он и есть экран кабинета для неавторизованного
        const to = t.to;
        const badge = t.to === "/v2/cart" ? cartCount : 0;
        return (
          <Link
            key={t.to} to={to} className="foc"
            aria-current={on ? "page" : undefined}
            aria-label={t.to === "/v2/lk" && !authed ? "Кабинет – вход" : undefined}
            style={{
              flex: 1, minHeight: 56, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 3,
              textDecoration: "none", padding: "8px 2px 6px",
              color: on ? "var(--c-accent-text)" : "var(--c-text-3)",
            }}
          >
            <span style={{ position: "relative", display: "block" }}>
              <svg viewBox="0 0 24 24" width={22} height={22} aria-hidden focusable="false" style={{ display: "block" }}>
                {ICONS[t.icon]}
              </svg>
              {badge > 0 && (
                <span style={{
                  ...mono, position: "absolute", top: -5, right: -8, minWidth: 15, height: 15,
                  borderRadius: 999, background: "var(--c-accent)", color: "var(--c-on-accent)",
                  fontSize: 9, lineHeight: "15px", textAlign: "center", padding: "0 3px",
                }}>{badge}</span>
              )}
            </span>
            <span style={{ ...mono, fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase" }}>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
