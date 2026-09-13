import SupportAdmin from "./SupportAdmin.js";
import AnalyticsAdmin from "./AnalyticsAdmin.js";
import { useId, useState, type FormEvent } from "react";
import { useHead } from "../lib/title.js";
import { VisionToggle } from "../components/Vision.js";
import { Mark } from "../v2/Mark.js";
import { mono, disp, label, action, actionGhost, field } from "./ui.js";
import { caps, pageTitle } from "../styles/primitives.js";
import { adminLogin, adminToken, setAdminToken, adminLogout, useOverview } from "../lib/admin.js";
import { Overview } from "./OverviewAdmin.js";
import { Orders } from "./OrdersAdmin.js";
import { Members } from "./MembersAdmin.js";
import { PodcastSubs } from "./PodcastSubsAdmin.js";
import { AuditLog } from "./AuditLogAdmin.js";
import { Content } from "./ContentAdmin.js";
import { type Section } from "./common.js";

export default function AdminApp() {
  useHead({ title: "Админ-панель", noindex: true }); // офисная зона – не индексируем
  const [token, setToken] = useState<string | null>(() => adminToken());
  if (!token) return <AdminGate onAuthed={(t) => { setAdminToken(t); setToken(t); }} />;
  return <AdminShell onLogout={() => { void adminLogout().finally(() => setToken(null)); }} />;
}

function AdminGate({ onAuthed }: { onAuthed: (t: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const emailId = useId();
  const passId = useId();
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null); setBusy(true);
    try { const r = await adminLogin(email, password); onAuthed(r.token); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <main id="main" style={{ minHeight: "100dvh", background: "var(--c-bg)", color: "var(--c-text)", fontFamily: "var(--f-body)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <form onSubmit={submit} style={{ width: "100%", maxWidth: 400, background: "var(--c-bg-raised)", border: "1px solid var(--c-line)", borderRadius: "var(--r-lg)", padding: 32, boxShadow: "var(--shadow-ambient), inset 0 1px 0 rgb(255 255 255 / 0.9)" }}>
        <Mark kind="scales" size={38} style={{ color: "var(--c-accent-text)" }} />
        <h1 style={{ ...pageTitle, fontSize: 28, lineHeight: 1.1, margin: "16px 0 0" }}>Панель учебного офиса</h1>
        <p style={{ ...label, textTransform: "none", letterSpacing: 0, margin: "8px 0 0", lineHeight: 1.5 }}>
          Служебный вход. Все действия попадают в журнал безопасности.
        </p>

        <label htmlFor={emailId} style={{ ...caps, color: "var(--c-text-2)", display: "block", marginTop: 22 }}>Почта</label>
        <input id={emailId} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="foc" style={{ ...field, width: "100%", marginTop: 7, padding: "12px 14px", fontSize: 15 }} />

        <label htmlFor={passId} style={{ ...caps, color: "var(--c-text-2)", display: "block", marginTop: 16 }}>Пароль</label>
        <input id={passId} type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="foc" style={{ ...field, width: "100%", marginTop: 7, padding: "12px 14px", fontSize: 15 }} />

        {err && <p role="alert" style={{ ...mono, margin: "14px 0 0", fontSize: "var(--t-caption)", color: "var(--c-danger-text)" }}>{err}</p>}

        <button disabled={busy} className="foc" style={{ ...action, width: "100%", marginTop: 22, cursor: busy ? "wait" : "pointer" }}>
          {busy ? "Входим…" : "Войти"}
        </button>
      </form>
    </main>
  );
}

function AdminShell({ onLogout }: { onLogout: () => void }) {
  const [section, setSection] = useState<Section>("overview");
  const ov = useOverview();
  const nav: { key: Section; label: string; badge?: number }[] = [
    { key: "overview", label: "Обзор" },
    { key: "analytics", label: "Аналитика" },
    { key: "orders", label: "Заявки", badge: ov.data?.new_orders },
    { key: "members", label: "Выпускники", badge: ov.data?.pending_verifications },
    { key: "subs", label: "Подписки" },
    { key: "content", label: "Контент" },
    { key: "audit", label: "Журнал" },
    { key: "support", label: "Поддержка" },
  ];
  const titles: Record<Section, string> = {
    overview: "Обзор",
    analytics: "Аналитика",
    orders: "Заявки и заказы",
    members: "Выпускники",
    subs: "Подписки на подкасты",
    content: "Контент",
    audit: "Журнал безопасности",
    support: "Поддержка",
  };

  // На вход выкидываем ТОЛЬКО при 401 (истёкшая сессия). Прочие ошибки (5xx/сеть)
  // не должны маскироваться под разлогин – показываем ретрай в основной области.
  if (ov.isError && (ov.error as { status?: number })?.status === 401)
    return <AdminGate onAuthed={(t) => { setAdminToken(t); location.reload(); }} />;

  return (
    <div className="adm-grid" style={{ display: "grid", gridTemplateColumns: "232px 1fr", minHeight: "100dvh", background: "var(--c-bg)", color: "var(--c-text)", fontFamily: "var(--f-body)" }}>
      <aside className="adm-aside club-dark" style={{ position: "sticky", top: 0, height: "100dvh", display: "flex", flexDirection: "column", gap: 2, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 6px 18px" }}>
          <Mark kind="scales" size={28} style={{ color: "var(--c-accent)" }} />
          <span style={{ ...disp, fontWeight: 600, fontSize: 14, lineHeight: 1.1 }}>
            Учебный офис
            <span style={{ ...caps, display: "block", fontSize: 10, marginTop: 4, color: "var(--c-text-3)" }}>клуб выпускников</span>
          </span>
        </div>
        {nav.map((n) => {
          const on = section === n.key;
          return (
            <button key={n.key} onClick={() => setSection(n.key)} aria-current={on ? "page" : undefined} className="foc"
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                padding: "10px 12px", borderRadius: "var(--r-sm)", textAlign: "left", cursor: "pointer",
                border: "none", background: on ? "rgb(255 255 255 / 0.06)" : "transparent",
                color: on ? "var(--c-text)" : "var(--c-text-2)",
                ...caps,
                borderLeft: `2px solid ${on ? "var(--c-accent)" : "transparent"}`,
              }}>
              {n.label}
              {n.badge ? <span style={{ ...mono, background: "var(--c-accent)", color: "var(--c-on-accent)", borderRadius: 999, padding: "1px 7px", fontSize: 10 }}>{n.badge}</span> : null}
            </button>
          );
        })}
        <div style={{ marginTop: 14, paddingLeft: 2 }}><VisionToggle compact v2 /></div>
        <button onClick={onLogout} className="foc" style={{ ...actionGhost, marginTop: "auto", textAlign: "left" }}>Выйти</button>
      </aside>

      {/* Низ панели не должен уезжать под cookie-баннер */}
      <main id="main" style={{ minWidth: 0, padding: "26px 32px 64px", paddingBottom: "calc(64px + var(--cookie-h, 0px))" }}>
        <h1 style={{ ...pageTitle, fontSize: 36, lineHeight: 1.1, margin: "0 0 24px" }}>{titles[section]}</h1>
        {ov.isError && (
          <p role="alert" style={{ margin: "0 0 20px", padding: "12px 16px", borderRadius: "var(--r-md)", border: "1px solid var(--c-danger-text)", ...mono, fontSize: "var(--t-caption)", color: "var(--c-danger-text)" }}>
            Не удалось загрузить данные (ошибка сети или сервера).{" "}
            <button onClick={() => ov.refetch()} className="foc" style={{ ...mono, background: "none", border: "none", color: "inherit", textDecoration: "underline", cursor: "pointer", font: "inherit" }}>Повторить</button>
          </p>
        )}
        {section === "overview" && <Overview onGo={setSection} />}
        {section === "analytics" && <AnalyticsAdmin />}
        {section === "orders" && <Orders />}
        {section === "members" && <Members />}
        {section === "subs" && <PodcastSubs />}
        {section === "content" && <Content />}
        {section === "audit" && <AuditLog />}
        {section === "support" && <SupportAdmin />}
      </main>
    </div>
  );
}
