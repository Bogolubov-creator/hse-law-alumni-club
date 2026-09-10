import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  COOKIE_SETTINGS_EVENT,
  hasCookieChoice,
  type CookieConsent,
  writeCookieConsent,
} from "../lib/cookie-consent.js";

/**
 * Баннер cookies по 152-ФЗ (ст. 9): информирование + свободный выбор.
 * Кнопки «Только необходимые» и «Принять все» равнозначны на первом экране.
 * Сайт не грузит необязательную аналитику до «Принять все»; после согласия
 * пишется только агрегат path+день (без IP и user-id).
 */
export default function CookieBanner() {
  const [visible, setVisible] = useState(() => !hasCookieChoice());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reopen = () => setVisible(true);
    window.addEventListener(COOKIE_SETTINGS_EVENT, reopen);
    return () => window.removeEventListener(COOKIE_SETTINGS_EVENT, reopen);
  }, []);

  /**
   * Пока баннер висит, он закрывает низ страницы – права по 152-ФЗ в профиле
   * не должны оказаться под ним. Высота уходит в --cookie-h для оболочек.
   */
  useEffect(() => {
    const el = ref.current;
    const root = document.documentElement;
    if (!visible || !el) {
      root.style.removeProperty("--cookie-h");
      return;
    }
    const apply = () => root.style.setProperty("--cookie-h", `${el.offsetHeight + 32}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--cookie-h");
    };
  }, [visible]);

  if (!visible) return null;

  const choose = (value: CookieConsent) => {
    writeCookieConsent(value);
    setVisible(false);
  };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-label="Использование cookies"
      className="club-cookie-banner"
    >
      <p className="club-cookie-banner__text">
        Сайт использует необходимые файлы cookies и локальное хранилище браузера: корзина,
        сессия входа, выбранные настройки и ваш выбор по cookies. При выборе «Принять все»
        дополнительно учитываются обезличенные просмотры страниц клуба (путь и день, без
        рекламных сетей). Подробнее – в{" "}
        <Link to="/privacy#cookies" className="foc club-cookie-banner__link">
          политике обработки персональных данных
        </Link>
        . Выбор можно изменить в любой момент ссылкой «Cookies» в подвале.
      </p>
      <div className="club-cookie-banner__actions">
        <button type="button" className="foc club-cookie-banner__btn club-cookie-banner__btn--secondary" onClick={() => choose("essential")}>
          Только необходимые
        </button>
        <button type="button" className="foc club-cookie-banner__btn club-cookie-banner__btn--primary" onClick={() => choose("all")}>
          Принять все
        </button>
      </div>
    </div>
  );
}
