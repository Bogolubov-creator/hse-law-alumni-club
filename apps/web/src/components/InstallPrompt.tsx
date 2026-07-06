import { useEffect, useState } from "react";

const DISMISS_KEY = "club_pwa_dismiss";
const COOKIE_KEY = "club_cookie_consent";

/** Событие Chrome/Android для программного вызова установки PWA. */
type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

/**
 * Ненавязчивое приглашение установить сайт как приложение:
 *  • Android/Chrome — кнопка «Установить» вызывает системный диалог;
 *  • iOS/Safari — подсказка «Поделиться → На экран „Домой“» (другого пути у Apple нет).
 * Показывается один раз (закрыл — больше не беспокоим), только после принятия
 * cookie-баннера и никогда внутри уже установленного приложения.
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

    // Не наваливаемся сразу и не спорим с cookie-баннером.
    const timer = window.setInterval(() => {
      if (localStorage.getItem(COOKIE_KEY) === "1") {
        window.clearInterval(timer);
        window.setTimeout(() => {
          if (isIos()) setIos(true);
          setShow(true);
        }, 6000);
      }
    }, 1000);

    return () => { window.removeEventListener("beforeinstallprompt", onBip); window.clearInterval(timer); };
  }, []);

  // Android без события установки (уже установлено/не поддерживается) — молчим.
  if (!show || isStandalone() || (!ios && !deferred)) return null;

  const dismiss = () => { localStorage.setItem(DISMISS_KEY, "1"); setShow(false); };
  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") setShow(false);
    localStorage.setItem(DISMISS_KEY, "1");
  };

  return (
    <div role="dialog" aria-label="Установка приложения" className="mob-only" style={{
      position: "fixed", left: 16, right: 16, bottom: `calc(16px + env(safe-area-inset-bottom, 0px))`, zIndex: 290,
      maxWidth: 560, margin: "0 auto", alignItems: "center", gap: 14, flexWrap: "wrap",
      background: "#11296B", color: "#FBF3E8", borderRadius: 16, padding: "14px 18px",
      boxShadow: "0 24px 60px -20px rgba(0,0,0,.55)", fontSize: 13.5, lineHeight: 1.45,
    }}>
      <span style={{ fontSize: 22, flex: "none" }}>📲</span>
      <p style={{ flex: 1, minWidth: 200, margin: 0 }}>
        {ios
          ? <>Добавьте клуб на экран телефона: нажмите <b>Поделиться</b> <span aria-hidden>⎋</span> → <b>«На экран „Домой“»</b> — сайт откроется как приложение.</>
          : <>Установите клуб как приложение — быстрый запуск с главного экрана, без адресной строки.</>}
      </p>
      {!ios && (
        <button onClick={install} className="foc" style={{ flex: "none", fontWeight: 600, fontSize: 14, padding: "10px 20px", borderRadius: 11, border: "none", background: "#EC5A13", color: "#FBF3E8", cursor: "pointer" }}>
          Установить
        </button>
      )}
      <button onClick={dismiss} aria-label="Скрыть" className="foc" style={{ flex: "none", width: 34, height: 34, borderRadius: 10, border: "1px solid rgba(251,243,232,.25)", background: "transparent", color: "#FBF3E8", cursor: "pointer" }}>✕</button>
    </div>
  );
}
