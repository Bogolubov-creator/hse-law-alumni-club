import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { isMiniApp, telegramApp, leaveMiniPreview } from "./bridge.js";
import "./telegram.css";

export function TelegramShell() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const active = isMiniApp() && !pathname.startsWith("/admin");
  const tg = telegramApp();
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    root.classList.add("telegram-mini");
    const update = () => {
      // Telegram отдаёт inset в CSS px; значения не включают друг друга.
      root.style.setProperty("--mini-top", `${Math.max(0, tg?.contentSafeAreaInset?.top ?? 0) + Math.max(0, tg?.safeAreaInset?.top ?? 0)}px`);
      root.style.setProperty("--mini-bottom", `${Math.max(0, tg?.contentSafeAreaInset?.bottom ?? 0) + Math.max(0, tg?.safeAreaInset?.bottom ?? 0)}px`);
    };
    update();
    if (tg?.initData) {
      tg.ready(); tg.expand();
      if (tg.isVersionAtLeast?.("6.1")) tg.setBackgroundColor?.("#ffffff");
      if (tg.isVersionAtLeast?.("6.9")) tg.setHeaderColor?.("#ffffff");
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
