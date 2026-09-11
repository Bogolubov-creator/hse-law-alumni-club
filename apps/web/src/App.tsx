import { SiteNotice } from "./components/SiteNotice.js";
import { RouteScroll } from "./components/RouteScroll.js";
import { SupportDock } from "./components/SupportDock.js";
import { lazy, Suspense, useEffect } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation, Link } from "react-router-dom";
import Stub from "./pages/Stub.js";
import CookieBanner from "./components/CookieBanner.js";
import { PageViewBeacon } from "./components/PageViewBeacon.js";
import InstallPrompt from "./components/InstallPrompt.js";
import { PwaShell } from "./components/PwaShell.js";
import { VisionPanel } from "./components/Vision.js";
import { ErrorBoundary, PageLoader } from "./components/ErrorBoundary.js";
import { clearToken } from "./lib/cart.js";

// Канон: публичное лицо – бывший v2. /v2/* и /legacy/* – только редиректы на канон.
// Телефон – та же адаптивная вёрстка (решение заказчика 12.09), отдельного «приложения» нет.

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

/** Старые закладки /v2/... → канонические пути. */
function StripV2Prefix() {
  const { pathname, search, hash } = useLocation();
  const next = pathname === "/v2" || pathname === "/v2/" ? "/" : pathname.replace(/^\/v2/, "") || "/";
  return <Navigate to={`${next}${search}${hash}`} replace />;
}

/** Soft-cutover: /legacy/... → канон без старого UI (файлы pages/* legacy – hard-remove позже). */
function StripLegacyPrefix() {
  const { pathname, search, hash } = useLocation();
  const next = pathname === "/legacy" || pathname === "/legacy/" ? "/" : pathname.replace(/^\/legacy/, "") || "/";
  return <Navigate to={`${next}${search}${hash}`} replace />;
}

export default function App() {
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
          Публичное зеркало · демо-данные ·{" "}
          <Link to="/lk" className="foc" style={{ color: "inherit", fontWeight: 600 }}>кабинет</Link>
          {" · "}
          <Link to="/admin" className="foc" style={{ color: "inherit", fontWeight: 600 }}>админка</Link>
          {" · "}
          <Link to="/?pwa=1" className="foc" style={{ color: "inherit", fontWeight: 600 }}>Смотреть как на телефоне</Link>
          {" · отправка заявок отключена"}
        </SiteNotice>
      )}
      <VisionPanel />
      <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        <RouteScroll />
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

          <Route path="/legacy" element={<StripLegacyPrefix />} />
          <Route path="/legacy/*" element={<StripLegacyPrefix />} />

          <Route path="*" element={<Stub title="Страница не найдена" />} />
        </Routes>
      </Suspense>
      </ErrorBoundary>
      <SupportDock />
      <PageViewBeacon />
      <CookieBanner />
      <InstallPrompt />
    </PwaShell>
  );
}
