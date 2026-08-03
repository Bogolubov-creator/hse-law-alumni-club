import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";

const KEY = "club_cookie_consent";

/**
 * Cookie-баннер (152-ФЗ): показывается при первом визите, скрывается по «Принять».
 * Выбор хранится в localStorage – баннер не навязывается повторно.
 */
export default function CookieBanner() {
  const [accepted, setAccepted] = useState(() => localStorage.getItem(KEY) === "1");
  const ref = useRef<HTMLDivElement>(null);
  // Баннер общий для обеих версий, поэтому и политику показывает «свою»:
  // со страницы v2 ссылка в старый интерфейс – это разрыв.
  const v2 = useLocation().pathname.startsWith("/v2");

  /**
   * Пока баннер висит, он закрывает низ страницы – а внизу профиля стоят права
   * по 152-ФЗ («скачать мои данные», «удалить мой аккаунт»). До согласия на
   * cookies воспользоваться ими было физически нельзя: клик уходил в баннер.
   *
   * Публикуем высоту в --cookie-h, а отступ добавляют сами оболочки страниц.
   * Отступ на body не годится: он открывает фон документа, и под тёмной темой
   * v2 внизу появлялась светлая полоса.
   */
  useEffect(() => {
    const el = ref.current;
    const root = document.documentElement;
    if (accepted || !el) return;
    const apply = () => root.style.setProperty("--cookie-h", `${el.offsetHeight + 32}px`);
    apply();
    const ro = new ResizeObserver(apply); // высота меняется при переносе текста
    ro.observe(el);
    return () => { ro.disconnect(); root.style.removeProperty("--cookie-h"); };
  }, [accepted]);

  if (accepted) return null;
  const accept = () => {
    localStorage.setItem(KEY, "1");
    setAccepted(true);
  };
  return (
    <div ref={ref} role="dialog" aria-label="Использование cookies" style={{
      position: "fixed", left: 16, right: 16, bottom: "calc(16px + env(safe-area-inset-bottom, 0px))", zIndex: 300, maxWidth: 720, margin: "0 auto",
      display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap",
      background: "#14181F", color: "#FBF3E8", borderRadius: 16, padding: "16px 20px",
      boxShadow: "0 24px 60px -20px rgba(0,0,0,.55)", fontSize: 13.5, lineHeight: 1.5,
    }}>
      <p style={{ flex: 1, minWidth: 260, margin: 0 }}>
        Мы используем cookies для работы корзины, личного кабинета и статистики. Продолжая
        пользоваться сайтом, вы соглашаетесь с{" "}
        <Link to={v2 ? "/v2/privacy" : "/privacy"} style={{ color: "#E3C272", textDecoration: "underline" }}>политикой обработки персональных данных</Link>.
      </p>
      {/* Тёмный текст на охре: 5,12:1 против 3,16:1 у светлого. То же решение,
          что уже принято для главной кнопки сайта – согласие по 152-ФЗ тем более
          должно быть читаемым. */}
      <button onClick={accept} className="foc" style={{
        flex: "none", fontWeight: 600, fontSize: 14, padding: "11px 26px", borderRadius: 11,
        border: "none", background: "#EC5A13", color: "#14181F", cursor: "pointer",
      }}>
        Принять
      </button>
    </div>
  );
}
