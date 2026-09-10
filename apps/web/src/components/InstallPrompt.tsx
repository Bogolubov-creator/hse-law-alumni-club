import { useEffect, useState } from "react";
import { hasCookieChoice } from "../lib/cookie-consent.js";

const DISMISS_KEY = "club_pwa_dismiss";

/** Событие Chrome/Android для программного вызова установки PWA. */
type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches
  || (navigator as Navigator & { standalone?: boolean }).standalone === true;

const isIos = () => {
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return true;
  // iPadOS 13+: desktop UA, но с тачем
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
};

/**
 * Приглашение установить сайт как приложение.
 * iOS Safari не шлёт beforeinstallprompt – показываем подсказку «Поделиться».
 * На телефоне поднимаем над нижней таб-панелью MobileApp (~64px + safe-area),
 * чтобы не перекрывать навигацию.
 */
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (isStandalone() || localStorage.getItem(DISMISS_KEY)) return;

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBip);

    const timer = window.setInterval(() => {
      if (hasCookieChoice()) {
        window.clearInterval(timer);
        window.setTimeout(() => {
          if (isIos()) setIos(true);
          setShow(true);
        }, 6000);
      }
    }, 1000);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.clearInterval(timer);
    };
  }, []);

  if (!show || isStandalone() || (!ios && !deferred)) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setShow(false);
  };
  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") setShow(false);
    localStorage.setItem(DISMISS_KEY, "1");
  };

  return (
    <div
      role="dialog"
      aria-label="Установка приложения"
      className="mob-only"
      style={{
        position: "fixed",
        left: 16,
        right: 16,
        /* Как cookie: над вкладками; --cookie-h поднимает выше баннера, если он открыт. */
        bottom: "calc(16px + var(--tabs-h, 0px) + var(--cookie-h, 0px))",
        zIndex: 290,
        maxWidth: 560,
        margin: "0 auto",
        display: "flex",
        alignItems: "center",
        gap: 14,
        flexWrap: "wrap",
        background: "#11296B",
        color: "#FBF3E8",
        borderRadius: 16,
        padding: "14px 18px",
        boxShadow: "0 24px 60px -20px rgba(0,0,0,.55)",
        fontSize: 13.5,
        lineHeight: 1.45,
      }}
    >
      <p style={{ flex: 1, minWidth: 200, margin: 0 }}>
        {ios ? (
          <>
            На iPhone: кнопка{" "}
            <span aria-hidden="true" style={{ display: "inline-flex", verticalAlign: "middle", marginInline: 2 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v12" />
                <path d="m8 7 4-4 4 4" />
                <path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
              </svg>
            </span>
            <b>Поделиться</b>
            {" "}
            → <b>«На экран „Домой“»</b>
            {" "}
            – клуб откроется как приложение без адресной строки.
          </>
        ) : (
          <>Установите клуб как приложение – быстрый запуск с главного экрана, без адресной строки.</>
        )}
      </p>
      {!ios && (
        <button type="button" onClick={install} className="foc club-btn club-btn--primary" style={{ flex: "none" }}>
          Установить
        </button>
      )}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Скрыть"
        className="foc"
        style={{
          flex: "none",
          width: 34,
          height: 34,
          borderRadius: 999,
          border: "1px solid rgba(251,243,232,.25)",
          background: "transparent",
          color: "#FBF3E8",
          cursor: "pointer",
        }}
      >
        ✕
      </button>
    </div>
  );
}
