import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { isMiniApp, useTelegramApp, miniStartRoute, leaveMiniPreview } from "./bridge.js";
import { publicUrl } from "../lib/public-url.js";
import "./telegram.css";

export function TelegramShell() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const active = isMiniApp() && !pathname.startsWith("/admin");
  const tg = useTelegramApp();
  const started = useRef(false);
  useEffect(() => {
    if (!active || started.current) return;
    // Поздний SDK не должен увести пользователя с уже открытого им раздела.
    const browserPath = window.location.pathname.replace(/\/$/, "");
    const atEntry = [publicUrl(""), publicUrl("tg")].some(path => path.replace(/\/$/, "") === browserPath);
    if (!atEntry || (pathname !== "/" && pathname !== "/tg")) { started.current = true; return; }
    const params = new URLSearchParams(search);
    const target = miniStartRoute(tg?.initDataUnsafe?.start_param ?? params.get("tgWebAppStartParam") ?? params.get("startapp"));
    if (target) { started.current = true; navigate(target, { replace: true }); }
  }, [active, pathname, search, tg, navigate]);
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    root.classList.add("telegram-mini");
    const update = () => {
      // Telegram отдаёт inset в CSS px; значения не включают друг друга.
      root.style.setProperty("--mini-top", `${Math.max(0, tg?.contentSafeAreaInset?.top ?? 0) + Math.max(0, tg?.safeAreaInset?.top ?? 0)}px`);
      root.style.setProperty("--mini-bottom", `${Math.max(0, tg?.contentSafeAreaInset?.bottom ?? 0) + Math.max(0, tg?.safeAreaInset?.bottom ?? 0)}px`);
      if (tg?.initData) {
        if (tg.isVersionAtLeast?.("6.1")) tg.setBackgroundColor?.("#ffffff");
        if (tg.isVersionAtLeast?.("6.9")) tg.setHeaderColor?.("#ffffff");
        if (tg.isVersionAtLeast?.("7.10")) tg.setBottomBarColor?.("#ffffff");
      }
    };
    update();
    if (tg?.initData) {
      tg.ready(); tg.expand();
      for (const event of ["safeAreaChanged", "contentSafeAreaChanged", "viewportChanged", "themeChanged"]) tg.onEvent(event, update);
    }
    return () => {
      root.classList.remove("telegram-mini");
      root.style.removeProperty("--mini-top"); root.style.removeProperty("--mini-bottom");
      if (tg?.initData) for (const event of ["safeAreaChanged", "contentSafeAreaChanged", "viewportChanged", "themeChanged"]) tg.offEvent(event, update);
    };
  }, [active, tg]);
  useEffect(() => {
    if (!active || !tg?.initData || !tg.BackButton) return;
    const back = () => window.history.state?.idx > 0 ? navigate(-1) : navigate("/");
    if (pathname === "/" || pathname === "/tg") tg.BackButton.hide(); else tg.BackButton.show();
    tg.BackButton.onClick(back);
    return () => { tg.BackButton?.offClick(back); tg.BackButton?.hide(); };
  }, [active, pathname, tg, navigate]);
  if (!active || tg?.initData) return null;
  return <div className="mini-preview"><span>Предпросмотр мини-приложения</span><button onClick={leaveMiniPreview}>Вернуться на сайт</button></div>;
}
