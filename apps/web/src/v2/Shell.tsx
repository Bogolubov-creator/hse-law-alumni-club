import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { CLUB_OPERATOR } from "@club/shared";
import { token, useCart } from "../lib/cart.js";
import { VisionToggle } from "../components/Vision.js";
import { SiteSearch } from "../components/SiteSearch.js";
import { openCookieSettings } from "../lib/cookie-consent.js";
import { useReveal } from "../lib/use-reveal.js";
import { publicUrl } from "../lib/public-url.js";
import { TELEGRAM_CHANNEL } from "../config/social.js";
import "../styles/shell.css";
import { CLUB_NAV as NAV } from "../config/navigation.js";

/**
 * Общая оболочка публичного контура: шапка и подвал для всех страниц.
 * Пересобрана 12.09.2026 под референс: белая шапка 64px с hairline, капс-навигация,
 * поиск по программам и новостям, одно действие «Вступить»; тёмный подвал.
 */

// Определения – в styles/primitives.ts, здесь только точка входа для витрин.
import { pageTitle, action, caps } from "../styles/primitives.js";
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



const SearchIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
);
const CartIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M6 8h12l-1 12H7L6 8z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>
);

export function V2Shell({ children }: { children: ReactNode }) {
  const cartCount = useCart().data?.count ?? 0;
  const authed = !!token();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { pathname } = useLocation();
  const menuButton = useRef<HTMLButtonElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  useReveal(shellRef);

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMenuOpen(false); menuButton.current?.focus(); }
    };
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !shellRef.current?.querySelector("header")?.contains(event.target)) setMenuOpen(false);
    };
    const wide = window.matchMedia("(min-width: 1281px)");
    const resize = () => { if (wide.matches && !document.documentElement.classList.contains("pwa-shell")) setMenuOpen(false); };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", outside);
    wide.addEventListener("change", resize);
    return () => { document.removeEventListener("keydown", close); document.removeEventListener("pointerdown", outside); wide.removeEventListener("change", resize); };
  }, [menuOpen]);

  const cta = (
    <Link to={authed ? "/lk" : "/join"} viewTransition className="foc club-header__cta" style={action}>
      {authed ? "Кабинет" : "Вступить"}
    </Link>
  );

  return (
    <div ref={shellRef} className="club-public-shell" style={{ background: "var(--c-bg)", color: "var(--c-text)", fontFamily: "var(--f-body)", minHeight: "100dvh" }}>
      <a href="#main" className="skip">К содержанию страницы</a>
      <header className="club-header">
        <div className="club-header__inner">
          <Link to="/" viewTransition className="foc club-header__brand">
            <img src={publicUrl("icon-192.png")} width={36} height={36} alt="" className="club-header__emblem" />
            <span className="club-header__lockup">
              Клуб выпускников
              <small>факультета права Вышки</small>
            </span>
          </Link>

          <nav className="club-header__nav" aria-label="Разделы">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} viewTransition className="foc club-caps club-header__link">{n.label}</NavLink>
            ))}
            <div className="club-header__tools">
              <button type="button" onClick={() => setSearchOpen(true)} className="foc club-chrome-icon-btn" aria-label="Поиск" title="Поиск по клубу">
                {SearchIcon}
              </button>
              <Link to="/saved" className="foc club-chrome-icon-btn" aria-label="Сохранённое" title="Сохранённое"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z" /></svg></Link>
              <VisionToggle compact v2 />
              <Link to="/cart" className="foc club-chrome-icon-btn club-header__cart" aria-label={cartCount > 0 ? `Корзина, ${cartCount}` : "Корзина"} title="Корзина">
                {CartIcon}
                {cartCount > 0 && <span className="club-header__count" aria-hidden="true">{cartCount}</span>}
              </Link>
            </div>
            {cta}
          </nav>

          <button ref={menuButton} onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen} aria-controls="club-menu" aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"} className="foc club-header__burger">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d={menuOpen ? "M6 6l12 12M6 18L18 6" : "M4 6h16M4 12h16M4 18h16"} /></svg>
          </button>
        </div>

        <nav id="club-menu" className="club-menu" data-open={menuOpen} aria-label="Меню">
          <button type="button" onClick={() => { setMenuOpen(false); setSearchOpen(true); }} className="foc">
            Поиск по клубу
            {SearchIcon}
          </button>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className="foc" style={{ fontWeight: 600 }}>{n.label}</NavLink>
          ))}
          <NavLink to="/saved" className="foc" style={{ fontWeight: 600 }}>Сохранённое</NavLink>
          <Link to="/cart" className="foc" style={{ fontWeight: 600 }}>
            Корзина
            {cartCount > 0 && <span className="club-header__count" style={{ position: "static" }}>{cartCount}</span>}
          </Link>
          <div className="club-menu__tools">
            <VisionToggle compact v2 />
            <span style={{ ...caps, color: "var(--c-text-3)" }}>Версия для слабовидящих</span>
          </div>
          <Link to={authed ? "/lk" : "/join"} className="foc club-menu__cta" style={action}>
            {authed ? "Кабинет" : "Вступить в клуб"}
          </Link>
        </nav>
      </header>

      {searchOpen && <SiteSearch onClose={() => {
        setSearchOpen(false);
        requestAnimationFrame(() => {
          const desktopSearch = shellRef.current?.querySelector<HTMLButtonElement>('.club-header__tools button[aria-label="Поиск"]');
          if (desktopSearch?.getClientRects().length) desktopSearch.focus({ preventScroll: true });
          else menuButton.current?.focus({ preventScroll: true });
        });
      }} />}

      {children}

      <footer className="club-footer club-dark">
        <div className="club-footer__inner">
          <div className="club-footer__brand">
            <img src={publicUrl("icon-192.png")} width={48} height={48} alt="" className="club-footer__emblem" />
            <div>
              <strong>Клуб выпускников факультета права Вышки</strong>
              <p>Встречи выпускников, программы ДПО, подкасты и изменения в праве.</p>
            </div>
          </div>
          <div>
            <h2 className="club-caps">Разделы</h2>
            <ul>
              {NAV.map((n) => <li key={n.to}><Link to={n.to} className="foc">{n.label}</Link></li>)}
              <li><Link to={authed ? "/lk" : "/join"} className="foc">{authed ? "Кабинет" : "Вступить в клуб"}</Link></li>
            </ul>
          </div>
          <div>
            <h2 className="club-caps">Клуб</h2>
            <ul>
              <li><a href={TELEGRAM_CHANNEL.url} target="_blank" rel="noopener noreferrer" className="foc">{TELEGRAM_CHANNEL.handle}</a></li>
              <li><Link to="/support" className="foc">Поддержка</Link></li>
              <li><Link to="/privacy" className="foc">Политика обработки персональных данных</Link></li>
              <li><Link to="/confidential" className="foc">Политика конфиденциальности</Link></li>
              <li><Link to="/requisites" className="foc">Реквизиты</Link></li>
              <li><button type="button" className="foc" onClick={() => openCookieSettings()}>Cookies</button></li>
            </ul>
          </div>
          <div className="club-footer__legal">
            <span>© 2026 Клуб выпускников факультета права Вышки</span>
            <p>{CLUB_OPERATOR.shortName} · ОГРН {CLUB_OPERATOR.ogrn} · ИНН {CLUB_OPERATOR.inn} · {CLUB_OPERATOR.address}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

/**
 * Заголовок витрины. С фотографией – тёмный разворот 50/50 как на главной («Фасад и зал»,
 * 12.09): титул плитой слева, фото факультета во весь край справа. Без фото (корзина) –
 * тихая шапка на белом. Eyebrow не рендерится: заголовок несёт себя сам.
 */
export function ShowcaseHead({ title, lead, count, photo }: { eyebrow?: string; title: string; lead: string; count?: string; photo?: { src: string; alt: string; side?: "left" | "right" } }) {
  const copy = (
    <>
      <h1 style={{ ...pageTitle, fontSize: photo ? "clamp(36px, 4vw, 60px)" : "var(--t-h1-page)", lineHeight: 1.06, margin: 0, maxWidth: "min(18ch, 100%)", overflowWrap: "anywhere", textWrap: "balance" }}>{title}</h1>
      <p style={{ margin: "22px 0 0", maxWidth: "44ch", fontSize: "var(--t-lead)", lineHeight: 1.5, color: "var(--c-text-2)" }}>{lead}</p>
      {count && <p style={{ ...caps, margin: "20px 0 0", color: "var(--c-text-3)" }}>{count}</p>}
    </>
  );
  if (!photo) {
    return <div style={{ paddingTop: "var(--rh-head-top)", paddingBottom: "var(--rh-head-bottom)" }}>{copy}</div>;
  }
  return (
    <header className={photo.side === "left" ? "club-masthead club-masthead--photo-left club-dark" : "club-masthead club-dark"}>
      <div className="club-masthead__copy" data-reveal>{copy}</div>
      <div className="club-masthead__photo">
        <img src={publicUrl(photo.src)} alt={photo.alt} width={1083} height={722} decoding="async" fetchPriority="high" />
      </div>
    </header>
  );
}
