import { SupportDock } from "./components/SupportDock.js";
import { lazy, Suspense, useEffect } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { useIsMobile } from "./lib/use-mobile.js";
import Home from "./pages/Home.js";
import Stub from "./pages/Stub.js";
import CookieBanner from "./components/CookieBanner.js";
import InstallPrompt from "./components/InstallPrompt.js";
import { VisionPanel } from "./components/Vision.js";
import { ErrorBoundary, PageLoader } from "./components/ErrorBoundary.js";
import { clearToken } from "./lib/cart.js";

// Всё, кроме главной, – отдельными чанками. Главная и есть LCP-критичная страница
// для поисковика и первого визита; код витрин, юр. страниц и форм входа ей не нужен
// и раньше ехал в стартовом бандле целиком.
// Главная v2 – вариант «Реестр». Живёт рядом со старой, чтобы их сравнить.
const SupportV2 = lazy(() => import("./pages/SupportV2.js"));
const SupportConsent = lazy(() => import("./pages/SupportV2.js").then(m => ({ default: m.SupportConsent })));
const HomeV2 = lazy(() => import("./pages/HomeV2.js"));
const DpoV2 = lazy(() => import("./pages/DpoV2.js"));
const ProductV2 = lazy(() => import("./pages/ProductV2.js"));
const MerchV2 = lazy(() => import("./pages/MerchV2.js"));
const ProgramV2 = lazy(() => import("./pages/ProgramV2.js"));
const NewsV2 = lazy(() => import("./pages/NewsV2.js").then((m) => ({ default: m.NewsV2 })));
const NewsPostV2 = lazy(() => import("./pages/NewsV2.js").then((m) => ({ default: m.NewsPostV2 })));
const EventsV2 = lazy(() => import("./pages/EventsV2.js"));
const PodcastsV2 = lazy(() => import("./pages/PodcastsV2.js"));
const JoinV2 = lazy(() => import("./pages/JoinAuthV2.js").then((m) => ({ default: m.JoinV2 })));
const ForgotV2 = lazy(() => import("./pages/JoinAuthV2.js").then((m) => ({ default: m.ForgotV2 })));
const ResetV2 = lazy(() => import("./pages/JoinAuthV2.js").then((m) => ({ default: m.ResetV2 })));
const ConfirmEmailV2 = lazy(() => import("./pages/JoinAuthV2.js").then((m) => ({ default: m.ConfirmEmailV2 })));
const CartV2 = lazy(() => import("./pages/CartV2.js"));
const LkV2 = lazy(() => import("./pages/LkV2.js"));
const ProfileV2 = lazy(() => import("./pages/ProfileV2.js"));
const News = lazy(() => import("./pages/News.js"));
const NewsPost = lazy(() => import("./pages/NewsPost.js"));
const Dpo = lazy(() => import("./pages/Dpo.js"));
const Program = lazy(() => import("./pages/Program.js"));
const Merch = lazy(() => import("./pages/Merch.js"));
const Podcasts = lazy(() => import("./pages/Podcasts.js"));
const Events = lazy(() => import("./pages/Events.js"));
const Join = lazy(() => import("./pages/JoinAuth.js").then((m) => ({ default: m.Join })));
const Forgot = lazy(() => import("./pages/JoinAuth.js").then((m) => ({ default: m.Forgot })));
const Reset = lazy(() => import("./pages/JoinAuth.js").then((m) => ({ default: m.Reset })));
const ConfirmEmail = lazy(() => import("./pages/JoinAuth.js").then((m) => ({ default: m.ConfirmEmail })));
const Privacy = lazy(() => import("./pages/legal.js").then((m) => ({ default: m.Privacy })));
const Confidential = lazy(() => import("./pages/legal.js").then((m) => ({ default: m.Confidential })));
const Requisites = lazy(() => import("./pages/legal.js").then((m) => ({ default: m.Requisites })));

// Приватные/тяжёлые разделы – отдельными чанками: не грузятся публичному посетителю
// и не раздувают стартовый бандл (важно для LCP публичных страниц и SEO).
const Lk = lazy(() => import("./pages/Lk.js"));
const Profile = lazy(() => import("./pages/Profile.js"));
const Cart = lazy(() => import("./pages/Cart.js"));
const AdminApp = lazy(() => import("./admin/AdminApp.js"));
// Мобильная native-app-оболочка (порт Claude Design) – отдельным чанком, только для телефонов.
const MobileApp = lazy(() => import("./mobile/MobileApp.js"));

// Маршруты-табы, которые на телефоне (<768px) показываются как native-app вместо десктоп-сайта.
const MOBILE_APP_ROUTES = new Set(["/", "/news", "/dpo", "/podcasts", "/merch"]);

export default function App() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isMobile = useIsMobile();
  // На телефоне оболочку показываем и на детальных экранах (программа/новость/корзина).
  const mobileTakeover = isMobile && (MOBILE_APP_ROUTES.has(pathname) || pathname.startsWith("/dpo/") || pathname.startsWith("/news/") || pathname === "/cart");
  // Обратная совместимость: старый хэш-адрес админки (#/admin) → обычный маршрут.
  useEffect(() => {
    if (window.location.hash.startsWith("#/")) {
      navigate(window.location.hash.slice(1), { replace: true });
    }
  }, [navigate]);
  // Централизованная реакция на истёкшую сессию (событие из api.ts при 401 с токеном):
  // убираем ТОЛЬКО мёртвый токен. Намеренно НЕ трогаем кэш и НЕ навигируем:
  //  • qc.clear() отменил бы ещё-pending запрос, его isError не закоммитился бы,
  //    и экраны, ждущие isError (ЛК), зависли бы в бесконечном рефетч-цикле;
  //  • navigate('/lk') выкидывал бы гостя с истёкшим токеном с публичных страниц
  //    (корзина/витрины, где справочный бейдж скидки дёргает /me) и ломал бы
  //    гостевое оформление.
  // Защищённые страницы (ЛК/профиль/админка) сами обрабатывают свой 401 и показывают вход.
  useEffect(() => {
    const onUnauth = () => clearToken();
    window.addEventListener("club:unauthorized", onUnauth);
    return () => window.removeEventListener("club:unauthorized", onUnauth);
  }, []);
  return (
    <>
      {import.meta.env.VITE_LOCAL_REVIEW === "true" && <div className="club-local-notice">Локальный стенд · тестовые участники, товары и события · заявки обрабатываются только здесь</div>}
      <VisionPanel />
      <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        {mobileTakeover ? <MobileApp /> : (
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/support" element={<SupportV2 />} />
          <Route path="/v2/support" element={<SupportV2 />} />
          <Route path="/v2/support/consent" element={<SupportConsent />} />
          <Route path="/v2" element={<HomeV2 />} />
          <Route path="/v2/dpo" element={<DpoV2 />} />
          <Route path="/v2/dpo/:slug" element={<ProgramV2 />} />
          <Route path="/v2/merch" element={<MerchV2 />} />
          <Route path="/v2/merch/:slug" element={<ProductV2 />} />
          <Route path="/v2/cart" element={<CartV2 />} />
          <Route path="/v2/news" element={<NewsV2 />} />
          <Route path="/v2/news/:slug" element={<NewsPostV2 />} />
          <Route path="/v2/events" element={<EventsV2 />} />
          <Route path="/v2/events/:eventId" element={<EventsV2 />} />
          <Route path="/v2/podcasts" element={<PodcastsV2 />} />
          <Route path="/v2/join" element={<JoinV2 />} />
          <Route path="/v2/forgot" element={<ForgotV2 />} />
          <Route path="/v2/reset" element={<ResetV2 />} />
          <Route path="/v2/confirm" element={<ConfirmEmailV2 />} />
          <Route path="/v2/privacy" element={<Privacy v2 />} />
          <Route path="/v2/confidential" element={<Confidential v2 />} />
          <Route path="/v2/requisites" element={<Requisites v2 />} />
          <Route path="/v2/lk" element={<LkV2 />} />
          <Route path="/v2/lk/profile" element={<ProfileV2 />} />
          <Route path="/news" element={<News />} />
          <Route path="/news/:slug" element={<NewsPost />} />
          <Route path="/admin/*" element={<AdminApp />} />
          <Route path="/lk" element={<Lk />} />
          <Route path="/lk/profile" element={<Profile />} />
          <Route path="/dpo" element={<Dpo />} />
          <Route path="/dpo/:slug" element={<Program />} />
          <Route path="/merch" element={<Merch />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/podcasts" element={<Podcasts />} />
          <Route path="/events" element={<Events />} />
          <Route path="/join" element={<Join />} />
          <Route path="/forgot" element={<Forgot />} />
          <Route path="/reset" element={<Reset />} />
          <Route path="/confirm" element={<ConfirmEmail />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/confidential" element={<Confidential />} />
          <Route path="/requisites" element={<Requisites />} />
          <Route path="*" element={<Stub title="Страница не найдена" />} />
        </Routes>
        )}
      </Suspense>
      </ErrorBoundary>
      <SupportDock />
      <CookieBanner />
      <InstallPrompt />
    </>
  );
}
