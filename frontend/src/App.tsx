import { TelegramShell } from "./telegram/TelegramShell.js";
import { isMiniApp, useTelegramApp } from "./telegram/bridge.js";
import MiniHome from "./telegram/MiniHome.js";
import { useIsPwaShell } from "./hooks/use-pwa.js";
import { MobileTabs } from "./layouts/MobileTabs.js";
import { SiteNotice } from "./components/SiteNotice.js";
import { RouteScroll } from "./components/RouteScroll.js";
import { SupportDock } from "./features/support/SupportDock.js";
import { lazy, Suspense, useEffect } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation, Link } from "react-router-dom";
import Stub from "./pages/Stub.js";
import CookieBanner from "./features/privacy/CookieBanner.js";
import { PageViewBeacon } from "./components/PageViewBeacon.js";
import InstallPrompt from "./features/pwa/InstallPrompt.js";
import { PwaShell } from "./features/pwa/PwaShell.js";
import { VisionPanel } from "./components/Vision.js";
import { ErrorBoundary, PageLoader } from "./components/ErrorBoundary.js";
import { clearToken } from "./stores/cart.js";

const Support = lazy(() => import("./pages/Support.js"));
const SupportConsent = lazy(() => import("./pages/Support.js").then(m => ({ default: m.SupportConsent })));
const Home = lazy(() => import("./pages/Home.js"));
const Dpo = lazy(() => import("./pages/Dpo.js"));
const Product = lazy(() => import("./pages/Product.js"));
const Merch = lazy(() => import("./pages/Merch.js"));
const Program = lazy(() => import("./pages/Program.js"));
const News = lazy(() => import("./pages/News.js").then((m) => ({ default: m.News })));
const NewsPost = lazy(() => import("./pages/News.js").then((m) => ({ default: m.NewsPost })));
const Events = lazy(() => import("./pages/Events.js"));
const PodcastEpisode = lazy(() => import("./pages/PodcastEpisode.js"));
const Podcasts = lazy(() => import("./pages/Podcasts.js"));
const Saved = lazy(() => import("./pages/Saved.js"));
const Changes = lazy(() => import("./pages/Changes.js"));
const Join = lazy(() => import("./pages/MembershipAuth.js").then((m) => ({ default: m.Join })));
const ForgotPassword = lazy(() => import("./pages/MembershipAuth.js").then((m) => ({ default: m.ForgotPassword })));
const ResetPassword = lazy(() => import("./pages/MembershipAuth.js").then((m) => ({ default: m.ResetPassword })));
const ConfirmEmail = lazy(() => import("./pages/MembershipAuth.js").then((m) => ({ default: m.ConfirmEmail })));
const Cart = lazy(() => import("./pages/Cart.js"));
const Cabinet = lazy(() => import("./pages/Cabinet.js"));
const Profile = lazy(() => import("./pages/Profile.js"));
const Privacy = lazy(() => import("./pages/legal.js").then((m) => ({ default: m.Privacy })));
const Confidential = lazy(() => import("./pages/legal.js").then((m) => ({ default: m.Confidential })));
const Requisites = lazy(() => import("./pages/legal.js").then((m) => ({ default: m.Requisites })));
const AdminApp = lazy(() => import("./admin/AdminApp.js"));

function StripV2Prefix() {
  const { pathname, search, hash } = useLocation();
  const next = pathname === "/v2" || pathname === "/v2/" ? "/" : pathname.replace(/^\/v2/, "") || "/";
  return <Navigate to={`${next}${search}${hash}`} replace />;
}

function StripLegacyPrefix() {
  const { pathname, search, hash } = useLocation();
  const next = pathname === "/legacy" || pathname === "/legacy/" ? "/" : pathname.replace(/^\/legacy/, "") || "/";
  return <Navigate to={`${next}${search}${hash}`} replace />;
}

export default function App() {
  useTelegramApp();
  const pwa = useIsPwaShell();
  const navigate = useNavigate();
  const { pathname } = useLocation();

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
      {import.meta.env.VITE_LOCAL_REVIEW === "true" && <SiteNotice>Локальный стенд · тестовые участники, товары и события · заявки обрабатываются только здесь</SiteNotice>}
      {import.meta.env.VITE_MIRROR === "true" && (
        <SiteNotice>
          Демоверсия ·{" "}
          <Link to="/lk" className="foc" style={{ color: "inherit", fontWeight: 600 }}>кабинет</Link>
          {" · "}
          <Link to="/admin" className="foc" style={{ color: "inherit", fontWeight: 600 }}>админка</Link>

          {" · отправка заявок отключена"}
        </SiteNotice>
      )}
      <TelegramShell />
      <VisionPanel />
      <div style={{ paddingBottom: "var(--tabs-h, 0px)" }}>
      <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        <RouteScroll />
        <Routes>
          <Route path="/" element={isMiniApp() || pwa ? <MiniHome /> : <Home />} />
          <Route path="/tg" element={<MiniHome />} />
          <Route path="/support" element={<Support />} />
          <Route path="/support/consent" element={<SupportConsent />} />
          <Route path="/dpo" element={<Dpo />} />
          <Route path="/dpo/:slug" element={<Program />} />
          <Route path="/merch" element={<Merch />} />
          <Route path="/merch/:slug" element={<Product />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/news" element={<News />} />
          <Route path="/news/:slug" element={<NewsPost />} />
          <Route path="/events" element={<Events />} />
          <Route path="/events/:eventId" element={<Events />} />
          <Route path="/podcasts" element={<Podcasts />} />
          <Route path="/saved" element={<Saved />} />
          <Route path="/changes" element={<Changes />} />
          <Route path="/changes/:id" element={<Changes />} />
          <Route path="/podcasts/:id" element={<PodcastEpisode />} />
          <Route path="/join" element={<Join />} />
          <Route path="/forgot" element={<ForgotPassword />} />
          <Route path="/reset" element={<ResetPassword />} />
          <Route path="/confirm" element={<ConfirmEmail />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/confidential" element={<Confidential />} />
          <Route path="/requisites" element={<Requisites />} />
          <Route path="/lk" element={<Cabinet />} />
          <Route path="/lk/profile" element={<Profile />} />
          <Route path="/admin/*" element={<AdminApp />} />

          <Route path="/v2" element={<StripV2Prefix />} />
          <Route path="/v2/*" element={<StripV2Prefix />} />

          <Route path="/legacy" element={<StripLegacyPrefix />} />
          <Route path="/legacy/*" element={<StripLegacyPrefix />} />

          <Route path="*" element={<Stub title="Страница не найдена" />} />
        </Routes>
      </Suspense>
      </ErrorBoundary>
      </div>
      {!pathname.startsWith("/admin") && <MobileTabs />}
      <SupportDock />
      <PageViewBeacon />
      <CookieBanner />
      <InstallPrompt />
    </PwaShell>
  );
}
