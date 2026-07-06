import { useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useCart, token } from "../lib/cart.js";

const NAV = [
  { to: "/dpo", label: "ДПО" },
  { to: "/merch", label: "Мерч" },
  { to: "/podcasts", label: "Подкасты" },
  { to: "/events", label: "События" },
  { to: "/news", label: "Новости" },
];

// Общая обёртка публичных витрин: шапка с корзиной + футер. Канон-токены.
// На десктопе — прежняя горизонтальная навигация; на телефоне — бургер.
export default function SiteShell({ children }: { children: ReactNode }) {
  const cart = useCart();
  const count = cart.data?.count ?? 0;
  const authed = !!token();
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  return (
    <div className="min-h-screen bg-kost font-body text-grafit">
      <header className="sticky top-0 z-50 border-b border-[#E5E7EB] bg-kost/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-5 px-7 py-3.5">
          <Link to="/" className="foc flex items-center gap-3">
            <img src="/assets/themis.jpeg" alt="" width={38} height={38} className="rounded-[10px] object-cover" />
            <div className="leading-none">
              <div className="font-display text-[15px] font-extrabold tracking-tight">Клуб выпускников</div>
              <div className="mt-0.5 font-mono text-[10px] tracking-wider text-grafit-soft">факультета права Вышки</div>
            </div>
          </Link>
          {/* Десктоп: прежняя горизонтальная навигация */}
          <nav className="desk-only flex flex-wrap items-center justify-end gap-1.5 text-[14px]">
            {NAV.map((n) => <Link key={n.to} to={n.to} className="foc shop-nav rounded-[10px] px-3 py-2 font-medium">{n.label}</Link>)}
            <Link to="/lk" className="foc shop-nav rounded-[10px] px-3 py-2 font-medium">{authed ? "Личный кабинет" : "Войти"}</Link>
            {!authed && (
              <Link to="/join" className="foc ml-1 rounded-[11px] bg-ohra px-4 py-2.5 font-semibold text-kost">Вступить в клуб</Link>
            )}
            <Link to="/cart" className="foc relative ml-1 rounded-[11px] bg-grafit px-4 py-2.5 font-semibold text-kost">
              Корзина{count > 0 && <span className="ml-1.5 rounded-full bg-ohra px-1.5 font-mono text-[12px]">{count}</span>}
            </Link>
          </nav>
          {/* Телефон: корзина + бургер */}
          <div className="mob-only items-center gap-2">
            <Link to="/cart" aria-label="Корзина" className="foc relative rounded-[11px] bg-grafit px-3.5 py-2.5 font-semibold text-kost">
              🛒{count > 0 && <span className="absolute -right-1.5 -top-1.5 rounded-full bg-ohra px-1.5 font-mono text-[11px] text-kost">{count}</span>}
            </Link>
            <button onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen} aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"} className="foc rounded-[11px] border border-[#E5E7EB] bg-white px-3.5 py-2.5 text-lg leading-none">
              {menuOpen ? "✕" : "☰"}
            </button>
          </div>
        </div>
        {/* Мобильная выпадающая панель */}
        {menuOpen && (
          <nav className="mob-only flex-col border-t border-[#E5E7EB] bg-kost px-5 pb-4 pt-2">
            {[...NAV, { to: "/lk", label: authed ? "Личный кабинет" : "Войти в ЛК" }, { to: "/cart", label: "Корзина" }].map((n) => (
              <Link key={n.to} to={n.to} onClick={() => setMenuOpen(false)}
                className={`foc rounded-[12px] px-4 py-3.5 text-[16px] font-semibold ${pathname === n.to ? "bg-[rgba(236,90,19,.12)] text-ohra-deep" : ""}`}>
                {n.label}
              </Link>
            ))}
            {!authed && <Link to="/join" onClick={() => setMenuOpen(false)} className="foc mt-2 rounded-[12px] bg-ohra px-4 py-3.5 text-center text-[16px] font-semibold text-kost">Вступить в клуб</Link>}
          </nav>
        )}
      </header>
      {children}
      <footer className="mt-20 bg-grafit px-7 py-10 text-[13px] text-[#9aa3b2]">
        <div className="mx-auto max-w-[1180px]">
          <div className="flex flex-wrap justify-between gap-4">
            <span>© 2026 Клуб выпускников факультета права Вышки</span>
            <span className="flex flex-wrap gap-4">
              {!authed && <Link to="/join" className="foc font-semibold text-latun-br underline underline-offset-2">Вступить в клуб</Link>}
              <a href="https://t.me/pravohse" target="_blank" rel="noopener noreferrer" className="foc text-latun-br">t.me/pravohse</a>
            </span>
          </div>
          {/* 152-ФЗ: юридические документы + информация о владельце на каждой странице */}
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-[rgba(251,243,232,.12)] pt-5">
            <Link to="/privacy" className="foc underline decoration-[rgba(154,163,178,.5)] underline-offset-2 hover:text-kost">Политика обработки персональных данных</Link>
            <Link to="/confidential" className="foc underline decoration-[rgba(154,163,178,.5)] underline-offset-2 hover:text-kost">Политика конфиденциальности</Link>
            <Link to="/requisites" className="foc underline decoration-[rgba(154,163,178,.5)] underline-offset-2 hover:text-kost">Реквизиты</Link>
          </div>
          <p className="mt-3 text-[12px] leading-relaxed">
            НИУ «Высшая школа экономики», факультет права · ОГРН 1027739630401 · ИНН 7714030726 · 101000, г. Москва, ул. Мясницкая, д. 20 · pravo@hse.ru · +7 (495) 771-32-32
          </p>
        </div>
      </footer>
    </div>
  );
}

// Кнопка/бейдж скидки выпускника (справочно).
export function DiscountBadge({ percent }: { percent: number }) {
  if (!percent) return null;
  return <span className="rounded-full bg-ohra px-2.5 py-1 font-mono text-[12px] font-medium text-kost">−{percent}% выпускнику</span>;
}
