import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { token, useCart } from "../lib/cart.js";
import { useVision } from "../lib/a11y.js";
import { VisionToggle } from "../components/Vision.js";
import { MobileTabs } from "./MobileTabs.js";

/**
 * Общая оболочка v2: шапка и подвал для всех страниц нового языка.
 * Вынесена из HomeV2, чтобы витрины не дублировали разметку и чтобы
 * навигация менялась в одном месте.
 */

export const mono: CSSProperties = { fontFamily: "var(--f-data)", fontVariantNumeric: "tabular-nums" };
export const disp: CSSProperties = { fontFamily: "var(--f-display)", letterSpacing: "var(--tr-display)" };
/**
 * Выразительный титул: HSE Slab (директива 2026-09). Только публичные витрины
 * и новости – в кабинете, корзине, админке, формах, кнопках и навигации Slab
 * не применяется. Веса строго 400 или 900: других начертаний у Slab нет
 * (public/fonts/fonts.css), а синтезированный 600/700 был бы псевдожирным.
 * Макетные 600–800 заменяем ближайшим реальным: для крупных титулов – 900.
 * Класс v2-title в строгой палитре окрашивает титул в фирменный синий (tokens.css).
 */
export const slab: CSSProperties = { fontFamily: "var(--f-slab)", fontWeight: 900, letterSpacing: "var(--tr-display)" };

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
  { to: "/v2/dpo", label: "ДПО" },
  { to: "/v2/merch", label: "Мерч" },
  { to: "/v2/podcasts", label: "Подкасты" },
  { to: "/v2/events", label: "События" },
  { to: "/v2/news", label: "Новости" },
];

/** Кнопка смены темы. Одна на десктопную шапку и бургер-меню – логика общая,
    дублируется только разметка кнопки, а не поведение. */
function ThemeButton({ theme, onToggle }: { theme: "auto" | "light" | "dark"; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      aria-label={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
      className="foc"
      style={{ border: "1px solid var(--c-line)", background: "transparent", color: "var(--c-text-2)", borderRadius: "var(--r-sm)", padding: "7px 10px", cursor: "pointer", ...mono, fontSize: 11, letterSpacing: "var(--tr-data)" }}
    >
      {theme === "dark" ? "СВЕТ" : "ТЕМА"}
    </button>
  );
}

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
  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  // Режим слабовидящих масштабирует страницу CSS-свойством zoom, а оно не
  // влияет на медиа-запросы: при zoom 1.8 окно 1440px для @media всё ещё
  // «широкое», хотя реальная раскладка идёт в ~800px и десктопная навигация
  // уезжает за вьюпорт. Считаем эффективную ширину сами и переключаем шапку
  // на бургер классом v2-vis-narrow (стили в index.css).
  const vis = useVision();
  const [vw, setVw] = useState(() => (typeof window === "undefined" ? 1440 : window.innerWidth));
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const visNarrow = vis.on && vw / (vis.zoom || 1) <= 1100;

  // В обычном мобильном меню витрины и корзина живут во вкладках снизу.
  // В режиме слабовидящих на бургер уходит и планшетная ширина, где вкладок
  // нет – поэтому там меню показывает навигацию полностью.
  const menuItems = visNarrow
    ? [...NAV, { to: "/v2/cart", label: "Корзина" }, authed ? { to: "/v2/lk", label: "Кабинет" } : { to: "/v2/join", label: "Вступить в клуб" }]
    : [
        { to: "/v2/podcasts", label: "Подкасты" },
        { to: "/v2/events", label: "События" },
        { to: "/v2/news", label: "Новости" },
        ...(authed ? [] : [{ to: "/v2/join", label: "Вступить в клуб" }]),
      ];

  return (
    <div style={{ background: "var(--c-bg)", color: "var(--c-text)", fontFamily: "var(--f-body)", minHeight: "100dvh" }}>
      <header className={visNarrow ? "v2-vis-narrow" : undefined} style={{ position: "sticky", top: 0, zIndex: 50, background: "color-mix(in srgb, var(--c-bg) 88%, transparent)", backdropFilter: "blur(10px)", borderBottom: "1px solid var(--c-line)" }}>
        <div style={{ maxWidth: "var(--container)", margin: "0 auto", padding: "0 28px", height: 72, display: "flex", alignItems: "center", gap: 24 }}>
          <Link to="/v2" className="foc" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none", color: "inherit" }}>
            {/* Эмблема клуба: растровый оригинал (круглый знак на белом поле).
                Круглый кадр + лёгкий scale убирают белую кайму по краю, пропорции
                не меняются – масштаб равномерный. */}
            <span style={{ width: 34, height: 34, borderRadius: "50%", overflow: "hidden", flexShrink: 0, display: "block" }}>
              <img
                src="/brand/emblem.jpg"
                alt="Эмблема клуба"
                width={34}
                height={34}
                style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", transform: "scale(1.1)" }}
              />
            </span>
            <span style={{ ...disp, fontWeight: 800, fontSize: 15, lineHeight: 1.1 }}>
              Клуб выпускников
              <span style={{ ...mono, display: "block", fontSize: 10, letterSpacing: "var(--tr-data)", color: "var(--c-text-3)", fontWeight: 400, marginTop: 3, textTransform: "uppercase" }}>факультет права</span>
            </span>
          </Link>

          <nav className="desk-only" style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: "auto" }}>
            {NAV.map((n) => (
              <Link key={n.to} to={n.to} className="foc" style={{ textDecoration: "none", color: "var(--c-text-2)", fontSize: 14, fontWeight: 500, padding: "8px 12px", borderRadius: "var(--r-sm)" }}>{n.label}</Link>
            ))}
            <Link to="/v2/cart" className="foc" style={{ textDecoration: "none", color: "var(--c-text-2)", fontSize: 14, fontWeight: 500, padding: "8px 12px", borderRadius: "var(--r-sm)" }}>
              Корзина{cartCount > 0 && <span style={{ ...mono, marginLeft: 6, background: "var(--c-accent)", color: "var(--c-on-accent)", borderRadius: 999, padding: "1px 6px", fontSize: 11 }}>{cartCount}</span>}
            </Link>
            <span style={{ marginLeft: 4, display: "inline-flex" }}>
              <ThemeButton theme={theme} onToggle={toggleTheme} />
            </span>
            <VisionToggle compact v2 />
            <Link to={authed ? "/v2/lk" : "/v2/join"} className="foc" style={{ marginLeft: 8, textDecoration: "none", background: "var(--c-accent)", color: "var(--c-on-accent)", fontWeight: 600, fontSize: 14, padding: "10px 18px", borderRadius: "var(--r-md)" }}>
              {authed ? "Кабинет" : "Вступить"}
            </Link>
          </nav>

          <button onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen} aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"} className="foc mob-only" style={{ marginLeft: "auto", width: 44, height: 44, borderRadius: "var(--r-md)", border: "1px solid var(--c-line)", background: "transparent", color: "var(--c-text)", fontSize: 18, cursor: "pointer" }}>
            {menuOpen ? "✕" : "☰"}
          </button>
        </div>

        {menuOpen && (
          <nav className="mob-only" style={{ flexDirection: "column", borderTop: "1px solid var(--c-line)", padding: "8px 20px 18px" }}>
            {menuItems.map((n) => (
              <Link key={n.to} to={n.to} onClick={() => setMenuOpen(false)} className="foc" style={{ textDecoration: "none", color: "var(--c-text)", fontWeight: 600, fontSize: 16, padding: "13px 8px", borderRadius: "var(--r-md)" }}>
                {n.label}
                {n.to === "/v2/cart" && cartCount > 0 && <span style={{ ...mono, marginLeft: 6, background: "var(--c-accent)", color: "var(--c-on-accent)", borderRadius: 999, padding: "1px 6px", fontSize: 11 }}>{cartCount}</span>}
              </Link>
            ))}
            {/* Тема и версия для слабовидящих обязаны быть доступны на любой
                ширине: на десктопе они в шапке, на телефоне – здесь, в меню.
                Те же контролы и обработчики, что в десктопной навигации. */}
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginTop: 6, padding: "13px 8px 0", borderTop: "1px solid var(--c-line)" }}>
              <ThemeButton theme={theme} onToggle={toggleTheme} />
              <VisionToggle v2 />
            </div>
          </nav>
        )}
      </header>

      {children}

      <footer style={{ marginTop: 72, borderTop: "1px solid var(--c-line)", padding: "34px 28px 46px", paddingBottom: "calc(46px + var(--cookie-h, 0px) + var(--tabs-h, 0px))" }}>
        <div style={{ maxWidth: "var(--container)", margin: "0 auto", display: "flex", flexWrap: "wrap", gap: 18, justifyContent: "space-between", fontSize: "var(--t-small)", color: "var(--c-text-3)" }}>
          <span>© 2026 Клуб выпускников факультета права Вышки</span>
          <span style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
            <Link to="/v2/privacy" className="foc" style={{ color: "inherit" }}>Политика обработки персональных данных</Link>
            <Link to="/v2/confidential" className="foc" style={{ color: "inherit" }}>Политика конфиденциальности</Link>
            <Link to="/v2/requisites" className="foc" style={{ color: "inherit" }}>Реквизиты</Link>
          </span>
        </div>
      </footer>
      <MobileTabs />
    </div>
  );
}

/** Заголовок витрины: моно-надзаголовок, крупный заголовок, счётчик записей.
    Титул набирается HSE Slab на публичных витринах (slabTitle); в корзине и
    кабинете остаётся HSE Sans. */
export function ShowcaseHead({ eyebrow, title, lead, count, slabTitle }: { eyebrow: string; title: string; lead: string; count?: string; slabTitle?: boolean }) {
  return (
    <div style={{ paddingTop: 56, paddingBottom: 28 }}>
      <div style={{ ...mono, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)", textTransform: "uppercase", color: "var(--c-accent-text)" }}>{eyebrow}</div>
      <h1 className={slabTitle ? "v2-title" : undefined} style={{ ...(slabTitle ? slab : { ...disp, fontWeight: 800 }), fontSize: "var(--t-h1)", lineHeight: 1.08, margin: "12px 0 0", maxWidth: "16ch" }}>{title}</h1>
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
