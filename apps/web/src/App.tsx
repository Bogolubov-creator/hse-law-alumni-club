import { SupportDock } from "./components/SupportDock.js";
import { lazy, Suspense, useEffect } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { useIsMobile } from "./lib/use-mobile.js";
import { useIsPwaShell } from "./lib/use-pwa.js";
import Stub from "./pages/Stub.js";
import CookieBanner from "./components/CookieBanner.js";
import InstallPrompt from "./components/InstallPrompt.js";
import { PwaShell } from "./components/PwaShell.js";
import { VisionPanel } from "./components/Vision.js";
import { ErrorBoundary, PageLoader } from "./components/ErrorBoundary.js";
import { clearToken } from "./lib/cart.js";

// Канон (этап 0): публичное лицо – бывший v2. Legacy UI под /legacy.
// На телефоне (<768px) и в установленном PWA для ключевых маршрутов – MobileApp.

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
const Privacy = lazy(() => import("./pages/legal.js").then((m) => ({ default: m.Privacy })));
const Confidential = lazy(() => import("./pages/legal.js").then((m) => ({ default: m.Confidential })));
const Requisites = lazy(() => import("./pages/legal.js").then((m) => ({ default: m.Requisites })));
const AdminApp = lazy(() => import("./admin/AdminApp.js"));
const MobileApp = lazy(() => import("./mobile/MobileApp.js"));

const Home = lazy(() => import("./pages/Home.js"));
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
const Lk = lazy(() => import("./pages/Lk.js"));
const Profile = lazy(() => import("./pages/Profile.js"));
const Cart = lazy(() => import("./pages/Cart.js"));

const MOBILE_APP_ROUTES = new Set(["/", "/news", "/dpo", "/podcasts", "/merch"]);

/** Старые закладки /v2/... → канонические пути. */
function StripV2Prefix() {
  const { pathname, search, hash } = useLocation();
  const next = pathname === "/v2" || pathname === "/v2/" ? "/" : pathname.replace(/^\/v2/, "") || "/";
  return <Navigate to={`${next}${search}${hash}`} replace />;
}

export default function App() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isMobile = useIsMobile();
  const isPwa = useIsPwaShell();
  const appShell = (isMobile || isPwa) && !pathname.startsWith("/admin");
  const mobileTakeover = appShell && (
    MOBILE_APP_ROUTES.has(pathname)
    || pathname.startsWith("/dpo/")
    || pathname.startsWith("/news/")
    || pathname === "/cart"
  );

  useEffect(() => {
    if (window.location.hash.startsWith("#/")) {
      navigate(window.location.hash.slice(1), { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    const onUnauth = () => clearToken();
    window.addEventListener("club:unauthorized", onUnauth);
    return () => window.removeEventListener("club:unauthorized", onUnauth);
  }, []);

  return (
    <PwaShell>
      {import.meta.env.VITE_LOCAL_REVIEW === "true" && <div className="club-local-notice">Локальный стенд · тестовые участники, товары и события · заявки обрабатываются только здесь</div>}
      <VisionPanel />
      <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        {mobileTakeover ? <MobileApp /> : (
        <Routes>
          <Route path="/" element={<HomeV2 />} />
          <Route path="/support" element={<SupportV2 />} />
          <Route path="/support/consent" element={<SupportConsent />} />
          <Route path="/dpo" element={<DpoV2 />} />
          <Route path="/dpo/:slug" element={<ProgramV2 />} />
          <Route path="/merch" element={<MerchV2 />} />
          <Route path="/merch/:slug" element={<ProductV2 />} />
          <Route path="/cart" element={<CartV2 />} />
          <Route path="/news" element={<NewsV2 />} />
          <Route path="/news/:slug" element={<NewsPostV2 />} />
          <Route path="/events" element={<EventsV2 />} />
          <Route path="/events/:eventId" element={<EventsV2 />} />
          <Route path="/podcasts" element={<PodcastsV2 />} />
          <Route path="/join" element={<JoinV2 />} />
          <Route path="/forgot" element={<ForgotV2 />} />
          <Route path="/reset" element={<ResetV2 />} />
          <Route path="/confirm" element={<ConfirmEmailV2 />} />
          <Route path="/privacy" element={<Privacy v2 />} />
          <Route path="/confidential" element={<Confidential v2 />} />
          <Route path="/requisites" element={<Requisites v2 />} />
          <Route path="/lk" element={<LkV2 />} />
          <Route path="/lk/profile" element={<ProfileV2 />} />
          <Route path="/admin/*" element={<AdminApp />} />

          <Route path="/v2" element={<StripV2Prefix />} />
          <Route path="/v2/*" element={<StripV2Prefix />} />

          <Route path="/legacy" element={<Home />} />
          <Route path="/legacy/news" element={<News />} />
          <Route path="/legacy/news/:slug" element={<NewsPost />} />
          <Route path="/legacy/dpo" element={<Dpo />} />
          <Route path="/legacy/dpo/:slug" element={<Program />} />
          <Route path="/legacy/merch" element={<Merch />} />
          <Route path="/legacy/cart" element={<Cart />} />
          <Route path="/legacy/podcasts" element={<Podcasts />} />
          <Route path="/legacy/events" element={<Events />} />
          <Route path="/legacy/join" element={<Join />} />
          <Route path="/legacy/forgot" element={<Forgot />} />
          <Route path="/legacy/reset" element={<Reset />} />
          <Route path="/legacy/confirm" element={<ConfirmEmail />} />
          <Route path="/legacy/lk" element={<Lk />} />
          <Route path="/legacy/lk/profile" element={<Profile />} />
          <Route path="/legacy/privacy" element={<Privacy />} />
          <Route path="/legacy/confidential" element={<Confidential />} />
          <Route path="/legacy/requisites" element={<Requisites />} />

          <Route path="*" element={<Stub title="Страница не найдена" />} />
        </Routes>
        )}
      </Suspense>
      </ErrorBoundary>
      <SupportDock />
      <CookieBanner />
      <InstallPrompt />
    </PwaShell>
  );
}
