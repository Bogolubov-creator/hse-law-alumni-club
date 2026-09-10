import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { CLUB_OPERATOR } from "@club/shared";
import { token, useCart } from "../lib/cart.js";
import { VisionToggle } from "../components/Vision.js";
import { MobileTabs } from "./MobileTabs.js";
import { Mark } from "./Mark.js";
import { openCookieSettings } from "../lib/cookie-consent.js";
import { TELEGRAM_CHANNEL } from "../config/social.js";

/**
 * Общая оболочка v2: шапка и подвал для всех страниц нового языка.
 * Вынесена из HomeV2, чтобы витрины не дублировали разметку и чтобы
 * навигация менялась в одном месте.
 */

// Определения – в styles/primitives.ts, здесь только точка входа для витрин.
import { mono, disp, pageTitle } from "../styles/primitives.js";
export { mono, disp, pageTitle } from "../styles/primitives.js";

/**
 * Текст из админки или запасной. Именно так, а не `??`: Directus отдаёт
 * незаполненные поля пустой строкой, и `??` её пропускает – в разметку уезжает
 * пустой заголовок вместо запасного.
 */
export const text = (v: string | null | undefined, fallback: string): string => (v && v.trim() ? v : fallback);

/** Сигнатура «поле бланка»: линия и моно-подпись под ней. Только там, где под ней данные. */
export function BlankField({ children, label }: { children: ReactNode; label: string }) {
  return (
    <span className="blank-field">
      {children}
      <span className="blank-field__label">{label}</span>
    </span>
  );
}

const NAV = [
  { to: "/dpo", label: "ДПО" },
  { to: "/merch", label: "Мерч" },
  { to: "/podcasts", label: "Подкасты" },
  { to: "/events", label: "События" },
  { to: "/news", label: "Новости" },
];

export function V2Shell({ children }: { children: ReactNode }) {
  const cartCount = useCart().data?.count ?? 0;
  const authed = !!token();
  const [menuOpen, setMenuOpen] = useState(false);

  // Тема: следуем системной, но даём переключатель – канон-охра должна быть
  // проверяема в обоих режимах, а не только в том, что стоит у смотрящего.
  const [theme, setTheme] = useState<"auto" | "light" | "dark">("auto");
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    return () => root.removeAttribute("data-theme");
  }, [theme]);

  return (
    <div className="club-public-shell" style={{ background: "var(--c-bg)", color: "var(--c-text)", fontFamily: "var(--f-body)", minHeight: "100dvh" }}>
      <a href="#main" className="skip">К содержанию страницы</a>
      <header style={{ position: "sticky", top: 0, zIndex: 50, background: "color-mix(in srgb, var(--c-bg) 88%, transparent)", backdropFilter: "blur(10px)", borderBottom: "1px solid var(--c-line)" }}>
        <div className="club-header-inner" style={{ maxWidth: "var(--container)", margin: "0 auto", padding: "0 28px", height: 72, display: "flex", alignItems: "center", gap: 24 }}>
          <Link to="/" className="foc" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none", color: "inherit" }}>
            <Mark kind="scales" size={34} style={{ color: "var(--c-accent-text)" }} />
            <span style={{ ...disp, fontWeight: 800, fontSize: 15, lineHeight: 1.1 }}>
              Клуб выпускников
              <span style={{ ...mono, display: "block", fontSize: "var(--t-micro)", letterSpacing: "normal", color: "var(--c-text-3)", fontWeight: 400, marginTop: 3, textTransform: "none" }}>факультета права Вышки</span>
            </span>
          </Link>

          <nav className="desk-only" style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: "auto" }}>
            {NAV.map((n) => (
              <Link key={n.to} to={n.to} className="foc" style={{ textDecoration: "none", color: "var(--c-text-2)", fontSize: 14, fontWeight: 500, padding: "8px 12px", borderRadius: "var(--r-sm)" }}>{n.label}</Link>
            ))}
            <Link to="/cart" className="foc" style={{ textDecoration: "none", color: "var(--c-text-2)", fontSize: 14, fontWeight: 500, padding: "8px 12px", borderRadius: "var(--r-sm)" }}>
              Корзина{cartCount > 0 && <span style={{ ...mono, marginLeft: 6, background: "var(--c-accent)", color: "var(--c-on-accent)", borderRadius: 999, padding: "1px 6px", fontSize: "var(--t-micro)" }}>{cartCount}</span>}
            </Link>
            <button
              type="button"
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              aria-label={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
              title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
              aria-pressed={theme === "dark"}
              className="foc club-chrome-icon-btn"
              style={{ marginLeft: 4 }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z" /></svg>
            </button>
            <VisionToggle compact v2 />
            <Link to={authed ? "/lk" : "/join"} className="foc" style={{ marginLeft: 8, textDecoration: "none", background: "var(--c-accent)", color: "var(--c-on-accent)", fontWeight: 600, fontSize: 14, padding: "10px 18px", borderRadius: "var(--r-md)" }}>
              {authed ? "Кабинет" : "Вступить"}
            </Link>
          </nav>

          <button onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen} aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"} className="foc mob-only" style={{ marginLeft: "auto", width: 44, height: 44, borderRadius: "var(--r-md)", border: "1px solid var(--c-line-control)", background: "transparent", color: "var(--c-text)", fontSize: 18, cursor: "pointer" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d={menuOpen ? "M6 6l12 12M6 18L18 6" : "M4 6h16M4 12h16M4 18h16"} /></svg>
          </button>
        </div>

        {menuOpen && (
          <nav className="mob-only club-mobile-menu" style={{ flexDirection: "column", borderTop: "1px solid var(--c-line)", padding: "8px 20px 18px" }}>
            {/* Главная, витрины, корзина и кабинет живут во вкладках снизу –
                в меню остаётся только контент и вступление */}
            {[
              ...NAV,
              { to: "/cart", label: "Корзина" },
              { to: "/lk", label: "Личный кабинет" },
              ...(authed ? [] : [{ to: "/join", label: "Вступить в клуб" }]),
            ].map((n) => (
              <Link key={n.to} to={n.to} onClick={() => setMenuOpen(false)} className={["/dpo", "/merch", "/cart", "/lk"].includes(n.to) ? "foc club-tablet-link" : "foc"} style={{ textDecoration: "none", color: "var(--c-text)", fontWeight: 600, fontSize: 16, padding: "13px 8px", borderRadius: "var(--r-md)" }}>{n.label}</Link>
            ))}

            {/* Тема и версия для слабовидящих жили только в десктопной строке –
                на телефоне режим по ГОСТ было физически нечем включить. */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, paddingTop: 12, borderTop: "1px solid var(--c-line)" }}>
              <button
                type="button"
                onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
                aria-label={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
                aria-pressed={theme === "dark"}
                className="foc tap club-chrome-icon-btn"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z" /></svg>
              </button>
              <VisionToggle compact v2 />
            </div>
          </nav>
        )}
      </header>

      {children}

      <footer style={{ marginTop: "var(--rh-section)", borderTop: "1px solid var(--c-line)", padding: "34px 28px 46px", paddingBottom: "calc(46px + var(--cookie-h, 0px) + var(--tabs-h, 0px))" }}>
        <div style={{ maxWidth: "var(--container)", margin: "0 auto", fontSize: "var(--t-small)", color: "var(--c-text-3)" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 18, justifyContent: "space-between" }}>
            <span>© 2026 Клуб выпускников факультета права Вышки</span>
            <span style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
              <a href={TELEGRAM_CHANNEL.url} target="_blank" rel="noopener noreferrer" className="foc tap" style={{ color: "inherit" }}>{TELEGRAM_CHANNEL.handle}</a>
              <Link to="/privacy" className="foc tap" style={{ color: "inherit" }}>Политика обработки персональных данных</Link>
              <Link to="/confidential" className="foc tap" style={{ color: "inherit" }}>Политика конфиденциальности</Link>
              <Link to="/requisites" className="foc tap" style={{ color: "inherit" }}>Реквизиты</Link>
              <Link to="/support" className="foc tap" style={{ color: "inherit" }}>Поддержка</Link>
              <button type="button" className="foc tap" style={{ color: "inherit", background: "none", border: 0, padding: 0, cursor: "pointer", font: "inherit" }} onClick={() => openCookieSettings()}>
                Cookies
              </button>
            </span>
          </div>
          <p style={{ margin: "14px 0 0", fontSize: "var(--t-caption)", lineHeight: 1.55, maxWidth: "72ch" }}>
            {CLUB_OPERATOR.shortName} · ОГРН {CLUB_OPERATOR.ogrn} · ИНН {CLUB_OPERATOR.inn} · {CLUB_OPERATOR.address}
          </p>
        </div>
      </footer>
      <MobileTabs />
    </div>
  );
}

/** Заголовок витрины: моно-надзаголовок, крупный заголовок, счётчик записей. */
export function ShowcaseHead({ title, lead, count }: { eyebrow: string; title: string; lead: string; count?: string }) {
  return (
    <div style={{ paddingTop: "var(--rh-head-top)", paddingBottom: "var(--rh-head-bottom)" }}>

      <h1 style={{ ...pageTitle, fontSize: "var(--t-h1-page)", lineHeight: 1.12, margin: 0, maxWidth: "28ch" }}>{title}</h1>
      <div style={{ marginTop: 20, maxWidth: 560 }}>
        {count ? (
          <BlankField label={count}>
            <p style={{ margin: 0, fontSize: "var(--t-lead)", lineHeight: 1.5, color: "var(--c-text-2)" }}>{lead}</p>
          </BlankField>
        ) : (
          <p style={{ margin: 0, fontSize: "var(--t-lead)", lineHeight: 1.5, color: "var(--c-text-2)" }}>{lead}</p>
        )}
      </div>
    </div>
  );
}
