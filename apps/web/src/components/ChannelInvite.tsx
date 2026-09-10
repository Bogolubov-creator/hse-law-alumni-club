import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { hasCookieChoice } from "../lib/cookie-consent.js";
import { TELEGRAM_CHANNEL } from "../config/social.js";

const DISMISS_KEY = "club_channel_invite_closed";
const DISMISS_DAYS = 30;

function isDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < DISMISS_DAYS * 24 * 3600 * 1000;
  } catch {
    return false;
  }
}

function rememberDismiss(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* private mode */
  }
}

/**
 * Приглашение в Telegram-канал клуба после ответа на cookies.
 * По образцу channel-invite на сайте ДПО: один раз за визит-серию, пауза 1 с,
 * скрытие на 30 дней. Редкий UI – лёгкий enter, без вечного micro-motion.
 */
export function ChannelInvite() {
  const { pathname } = useLocation();
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);

  const hidden = pathname.startsWith("/admin");

  useEffect(() => {
    if (hidden || isDismissed()) return;

    let cancelled = false;
    const timer = window.setInterval(() => {
      if (!hasCookieChoice()) return;
      window.clearInterval(timer);
      window.setTimeout(() => {
        if (!cancelled && !isDismissed()) {
          setReady(true);
          setOpen(true);
        }
      }, 1000);
    }, 400);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [hidden]);

  if (hidden || !ready || !open) return null;

  const dismiss = () => {
    rememberDismiss();
    setOpen(false);
  };

  return (
    <aside
      className="club-channel-invite"
      role="complementary"
      aria-label={`Канал ${TELEGRAM_CHANNEL.handle}`}
    >
      <button type="button" className="foc club-channel-invite__close" aria-label="Скрыть" onClick={dismiss}>
        ✕
      </button>
      <div className="club-channel-invite__body">
        <span className="club-channel-invite__mark" aria-hidden>
          TG
        </span>
        <div className="club-channel-invite__copy">
          <strong className="club-channel-invite__title">{TELEGRAM_CHANNEL.title}</strong>
          <p className="club-channel-invite__text">{TELEGRAM_CHANNEL.description}</p>
        </div>
      </div>
      <a
        className="foc club-channel-invite__cta"
        href={TELEGRAM_CHANNEL.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={dismiss}
      >
        Подписаться · {TELEGRAM_CHANNEL.handle}
      </a>
    </aside>
  );
}
