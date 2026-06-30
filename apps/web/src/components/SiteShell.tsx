import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useCart } from "../lib/cart.js";

// Общая обёртка публичных витрин: шапка с корзиной + футер. Канон-токены.
export default function SiteShell({ children }: { children: ReactNode }) {
  const cart = useCart();
  const count = cart.data?.count ?? 0;
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
          <nav className="flex flex-wrap items-center justify-end gap-1.5 text-[14px]">
            <Link to="/dpo" className="foc shop-nav rounded-[10px] px-3 py-2 font-medium">ДПО</Link>
            <Link to="/merch" className="foc shop-nav rounded-[10px] px-3 py-2 font-medium">Мерч</Link>
            <Link to="/news" className="foc shop-nav rounded-[10px] px-3 py-2 font-medium">Новости</Link>
            <Link to="/lk" className="foc shop-nav rounded-[10px] px-3 py-2 font-medium">ЛК</Link>
            <Link to="/cart" className="foc relative ml-1 rounded-[11px] bg-grafit px-4 py-2.5 font-semibold text-kost">
              Корзина{count > 0 && <span className="ml-1.5 rounded-full bg-ohra px-1.5 font-mono text-[12px]">{count}</span>}
            </Link>
          </nav>
        </div>
      </header>
      {children}
      <footer className="mt-20 bg-grafit px-7 py-10 text-[13px] text-[#9aa3b2]">
        <div className="mx-auto flex max-w-[1180px] flex-wrap justify-between gap-4">
          <span>© 2026 Клуб выпускников факультета права Вышки · макет</span>
          <a href="https://t.me/pravohse" target="_blank" rel="noopener noreferrer" className="foc text-latun-br">t.me/pravohse</a>
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
