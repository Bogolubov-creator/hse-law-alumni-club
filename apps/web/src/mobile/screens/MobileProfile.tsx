import { type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { token, clearToken } from "../../lib/cart.js";
import { useMe } from "../../lib/queries.js";
import { useToast } from "../../components/Toast.js";
import { useHead } from "../../lib/title.js";
import { INK, disp, mono, CARD } from "../theme.js";
import { Loader, OverlayHeader, OverlaySignIn } from "../ui.js";

export function MobileProfile() {
  useHead({ title: "Профиль", noindex: true });
  const nav = useNavigate();
  const me = useMe(token());
  const toast = useToast();
  const m = me.data;
  const logout = () => { clearToken(); nav("/", { replace: true }); };
  const copyRef = () => {
    if (!m?.alumni.referral_code) return;
    void navigator.clipboard?.writeText(`${window.location.origin}/join?ref=${m.alumni.referral_code}`);
    toast("Ссылка приглашения скопирована ✓");
  };
  const row = (icon: ReactNode, label: string, to: string, last = false) => (
    <Link to={to} style={{ display: "flex", alignItems: "center", gap: 12, padding: "15px 16px", borderBottom: last ? "none" : "1px solid #F3EDE1", textDecoration: "none", color: INK }}>
      {icon}<span style={{ flex: 1, fontSize: 14.5 }}>{label}</span><span style={{ color: "#C4BCAC" }}>›</span>
    </Link>
  );
  return (
    <div style={{ height: "100dvh", background: "#FBF3E8", display: "flex", flexDirection: "column", overflow: "hidden", color: INK, fontFamily: "'Onest', system-ui, sans-serif" }}>
      <OverlayHeader title="Профиль" onBack={() => nav("/")} />
      <div className="noscroll" style={{ flex: 1, overflowY: "auto" }}>
        {me.isLoading && <Loader />}
        {me.isError && <OverlaySignIn />}
        {m && (
          <div style={{ padding: "14px 20px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
              <div style={{ width: 70, height: 70, borderRadius: 20, background: "linear-gradient(140deg,#EC5A13,#C9450E)", display: "flex", alignItems: "center", justifyContent: "center", ...disp, fontWeight: 700, fontSize: 26, color: "#FBF3E8", flexShrink: 0, position: "relative", overflow: "hidden" }}>
                {m.alumni.avatar ? <img src={`/api/avatars/${m.alumni.avatar}`} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} /> : (m.alumni.fio?.trim()?.[0] ?? "В").toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ ...disp, fontWeight: 700, fontSize: 19 }}>{m.alumni.fio ?? "Выпускник"}</div>
                <div style={{ fontSize: 13, color: "#6B7280", marginTop: 3 }}>Выпуск {m.alumni.cohort ?? "—"}{m.alumni.edu_program ? ` · ${m.alumni.edu_program}` : ""}</div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 7, ...mono, fontSize: 10, color: "#2C6E80", background: "rgba(44,110,128,.1)", padding: "4px 9px", borderRadius: 7 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2C6E80" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>Диплом верифицирован
                </div>
              </div>
            </div>
            {(m.alumni.interests?.length ?? 0) > 0 && (
              <div>
                <div style={{ ...mono, fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "#9B9584", marginBottom: 10 }}>Интересы в праве</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {m.alumni.interests!.map((it) => <span key={it} style={{ fontWeight: 500, fontSize: 13, background: "#fff", border: "1px solid #E4DCCC", padding: "8px 13px", borderRadius: 99 }}>{it}</span>)}
                  <Link to="/lk/profile" style={{ fontWeight: 500, fontSize: 13, color: "#C9450E", background: "rgba(236,90,19,.1)", border: "1px dashed rgba(236,90,19,.4)", padding: "8px 13px", borderRadius: 99, textDecoration: "none" }}>+ добавить</Link>
                </div>
              </div>
            )}
            {m.alumni.referral_code && (
              <div style={{ background: INK, borderRadius: 18, padding: "17px 18px", position: "relative", overflow: "hidden" }}>
                <div style={{ ...mono, fontSize: 9.5, letterSpacing: ".12em", color: "rgba(227,194,114,.85)" }}>КОД ПРИГЛАШЕНИЯ · +80 БАЛЛОВ</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 11 }}>
                  <span style={{ ...disp, fontWeight: 700, fontSize: 19, color: "#FBF3E8", letterSpacing: ".02em" }}>{m.alumni.referral_code}</span>
                  <button onClick={copyRef} aria-label="Скопировать ссылку приглашения" style={{ width: 40, height: 40, borderRadius: 12, border: "none", background: "rgba(251,243,232,.12)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#E3C272" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2.5" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
                  </button>
                </div>
              </div>
            )}
            <div style={{ ...CARD, borderRadius: 18, overflow: "hidden" }}>
              {row(<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>, "Редактировать профиль", "/lk/profile")}
              {row(<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>, "Уведомления и Telegram-бот", "/lk")}
              {row(<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" /></svg>, "Юридические документы", "/privacy", true)}
            </div>
            <button onClick={logout} style={{ height: 50, borderRadius: 14, border: "1px solid #E4DCCC", background: "#fff", color: "#B5331B", fontFamily: "'Onest'", fontWeight: 600, fontSize: 14.5, cursor: "pointer" }}>Выйти из аккаунта</button>
          </div>
        )}
      </div>
    </div>
  );
}
