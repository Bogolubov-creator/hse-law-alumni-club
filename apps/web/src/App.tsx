import { lazy, Suspense, useEffect } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import Home from "./pages/Home.js";
import News from "./pages/News.js";
import NewsPost from "./pages/NewsPost.js";
import Stub from "./pages/Stub.js";
import Dpo from "./pages/Dpo.js";
import Program from "./pages/Program.js";
import Merch from "./pages/Merch.js";
import Podcasts from "./pages/Podcasts.js";
import Events from "./pages/Events.js";
import { Join, Forgot, Reset } from "./pages/JoinAuth.js";
import { Privacy, Confidential, Requisites } from "./pages/legal.js";
import CookieBanner from "./components/CookieBanner.js";
import InstallPrompt from "./components/InstallPrompt.js";
import { VisionPanel } from "./components/Vision.js";
import { ErrorBoundary, PageLoader } from "./components/ErrorBoundary.js";
import { clearToken } from "./lib/cart.js";

// Приватные/тяжёлые разделы — отдельными чанками: не грузятся публичному посетителю
// и не раздувают стартовый бандл (важно для LCP публичных страниц и SEO).
const Lk = lazy(() => import("./pages/Lk.js"));
const Profile = lazy(() => import("./pages/Profile.js"));
const Cart = lazy(() => import("./pages/Cart.js"));
const AdminApp = lazy(() => import("./admin/AdminApp.js"));

export default function App() {
  const navigate = useNavigate();
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
      <VisionPanel />
      <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Home />} />
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
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/confidential" element={<Confidential />} />
          <Route path="/requisites" element={<Requisites />} />
          <Route path="*" element={<Stub title="Страница не найдена" />} />
        </Routes>
      </Suspense>
      </ErrorBoundary>
      <CookieBanner />
      <InstallPrompt />
    </>
  );
}
