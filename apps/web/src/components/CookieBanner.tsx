import { useState } from "react";
import { Link } from "react-router-dom";

const KEY = "club_cookie_consent";

/**
 * Cookie-баннер (152-ФЗ): показывается при первом визите, скрывается по «Принять».
 * Выбор хранится в localStorage – баннер не навязывается повторно.
 */
export default function CookieBanner() {
  const [accepted, setAccepted] = useState(() => localStorage.getItem(KEY) === "1");
  if (accepted) return null;
  const accept = () => {
    localStorage.setItem(KEY, "1");
    setAccepted(true);
  };
  return (
    <div role="dialog" aria-label="Использование cookies" style={{
      position: "fixed", left: 16, right: 16, bottom: "calc(16px + env(safe-area-inset-bottom, 0px))", zIndex: 300, maxWidth: 720, margin: "0 auto",
      display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap",
      background: "#14181F", color: "#FBF3E8", borderRadius: 16, padding: "16px 20px",
      boxShadow: "0 24px 60px -20px rgba(0,0,0,.55)", fontSize: 13.5, lineHeight: 1.5,
    }}>
      <p style={{ flex: 1, minWidth: 260, margin: 0 }}>
        Мы используем cookies для работы корзины, личного кабинета и статистики. Продолжая
        пользоваться сайтом, вы соглашаетесь с{" "}
        <Link to="/privacy" style={{ color: "#E3C272", textDecoration: "underline" }}>политикой обработки персональных данных</Link>.
      </p>
      <button onClick={accept} className="foc" style={{
        flex: "none", fontWeight: 600, fontSize: 14, padding: "11px 26px", borderRadius: 11,
        border: "none", background: "#EC5A13", color: "#FBF3E8", cursor: "pointer",
      }}>
        Принять
      </button>
    </div>
  );
}
