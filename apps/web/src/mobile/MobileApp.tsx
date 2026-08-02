import { useLocation } from "react-router-dom";
import { token } from "../lib/cart.js";
import { INK, TABS } from "./theme.js";
import { TabBar } from "./ui.js";
import { MobileHome } from "./screens/MobileHome.js";
import { MobileFeed } from "./screens/MobileFeed.js";
import { MobileDpo } from "./screens/MobileDpo.js";
import { MobilePodcasts } from "./screens/MobilePodcasts.js";
import { MobileMerch } from "./screens/MobileMerch.js";
import { MobileProgram } from "./screens/MobileProgram.js";
import { MobileCart } from "./screens/MobileCart.js";
import { MobileNewsPost } from "./screens/MobileNewsPost.js";
import { MobilePodcastPlayer } from "./screens/MobilePodcastPlayer.js";
import { MobileMerchItem } from "./screens/MobileMerchItem.js";
import { MobileAch } from "./screens/MobileAch.js";
import { MobileLedger } from "./screens/MobileLedger.js";
import { MobileProfile } from "./screens/MobileProfile.js";

/**
 * Мобильная native-app-оболочка (порт «Клуб выпускников.dc.html» из Claude Design).
 * Включается на телефонах (<768px, см. useIsMobile) вместо десктоп-сайта: нижние
 * табы + экраны на РЕАЛЬНЫХ данных. Экран выбирается по маршруту (deep-link/SEO/назад).
 * Детальные слайд-оверлеи (программа/плеер/оформление/профиль) — стадия 2, пока ведут
 * на существующие маршруты.
 */

// ── Оболочка ─────────────────────────────────────────────────────────
export default function MobileApp() {
  const { pathname, search } = useLocation();
  const qs = new URLSearchParams(search);
  // Детальные экраны — full-screen без нижней навигации (слайд-оверлеи макета).
  if (pathname.startsWith("/dpo/")) return <MobileProgram />;
  if (pathname.startsWith("/news/")) return <MobileNewsPost />;
  if (pathname === "/cart") return <MobileCart />;
  const ep = pathname === "/podcasts" ? qs.get("ep") : null;
  if (ep) return <MobilePodcastPlayer epId={ep} />;
  const item = pathname === "/merch" ? qs.get("item") : null;
  if (item) return <MobileMerchItem slug={item} />;
  // Приватные оверлеи ЛК — только для вошедшего: гость по прямой ссылке иначе
  // получал пустой тупиковый экран. Без токена показываем обычную «Карту»
  // (для гостя это приглашение войти/вступить).
  const screen = pathname === "/" && token() ? qs.get("screen") : null;
  if (screen === "ach") return <MobileAch />;
  if (screen === "ledger") return <MobileLedger />;
  if (screen === "profile") return <MobileProfile />;
  const active = TABS.some((t) => t.to === pathname) ? pathname : "/";
  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", background: "#FBF3E8", color: INK, fontFamily: "'Onest', system-ui, sans-serif", overflow: "hidden" }}>
      <div className="noscroll" style={{ flex: 1, overflowY: "auto", overflowX: "hidden", WebkitOverflowScrolling: "touch" }}>
        {pathname === "/news" ? <MobileFeed />
          : pathname === "/dpo" ? <MobileDpo />
            : pathname === "/podcasts" ? <MobilePodcasts />
              : pathname === "/merch" ? <MobileMerch />
                : <MobileHome />}
      </div>
      <TabBar active={active} />
    </div>
  );
}
