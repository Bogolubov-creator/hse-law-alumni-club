import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LEVELS } from "@club/shared";
import { rub, type Program, type Product, type ProductVariant, type OrderResult, type PodcastItem } from "../lib/api.js";
import { token, clearToken, usePrograms, useProducts, useProgram, useCart, useMemberDiscount, useCartMutations, submitOrder } from "../lib/cart.js";
import { useMe, useLedger, useNewsList, useNewsPost, usePodcasts, formatNewsDate } from "../lib/queries.js";
import { useToast } from "../components/Toast.js";
import { useHead } from "../lib/title.js";
import { isAndroid } from "../lib/use-mobile.js";

// Платформа фиксируется один раз (UA не меняется в рамках сессии).
const ANDROID = isAndroid();

/**
 * Мобильная native-app-оболочка (порт «Клуб выпускников.dc.html» из Claude Design).
 * Включается на телефонах (<768px, см. useIsMobile) вместо десктоп-сайта: нижние
 * табы + экраны на РЕАЛЬНЫХ данных. Экран выбирается по маршруту (deep-link/SEO/назад).
 * Детальные слайд-оверлеи (программа/плеер/оформление/профиль) — стадия 2, пока ведут
 * на существующие маршруты.
 */

const INK = "#14181F";
const disp: CSSProperties = { fontFamily: "'Unbounded', system-ui, sans-serif" };
const mono: CSSProperties = { fontFamily: "'Martian Mono', monospace" };
const CARD: CSSProperties = { background: "#fff", border: "1px solid #ECE6DA", borderRadius: 20 };
const HEADER: CSSProperties = {
  position: "sticky", top: 0, zIndex: 3,
  padding: "calc(env(safe-area-inset-top, 0px) + 16px) 20px 12px",
  background: "rgba(251,243,232,.9)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
};

// ── Нижняя таб-навигация ──────────────────────────────────────────────
const TABS = [
  { to: "/", label: "Карта", icon: (<><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M3 10h18" /><path d="M7 15h5" /></>) },
  { to: "/news", label: "Лента", icon: (<><rect x="4" y="4" width="16" height="16" rx="2.5" /><path d="M8 9h8M8 13h8M8 17h5" /></>) },
  { to: "/dpo", label: "ДПО", icon: (<><path d="M3 8l9-4 9 4-9 4-9-4z" /><path d="M7 10.5V15c0 1 2.2 2.2 5 2.2s5-1.2 5-2.2v-4.5" /><path d="M21 8.5v5" /></>) },
  { to: "/podcasts", label: "Подкасты", icon: (<path d="M5 10v4M9 6v12M13 8.5v7M17 5v14M21 10.5v3" />) },
  { to: "/merch", label: "Мерч", icon: (<><path d="M6 8h12l-1 12H7L6 8z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>) },
];

function TabBar({ active }: { active: string }) {
  if (ANDROID) {
    // Material 3 NavigationBar: pill-индикатор активного таба, сплошной фон без блюра.
    return (
      <nav style={{ flexShrink: 0, display: "flex", alignItems: "stretch", padding: "6px 6px calc(env(safe-area-inset-bottom, 0px) + 8px)", background: "#FBF3E8", borderTop: "1px solid #E7E0D0" }}>
        {TABS.map((t) => {
          const on = t.to === active;
          const col = on ? "#C9450E" : "#5C5648";
          return (
            <Link key={t.to} to={t.to} aria-label={t.label} aria-current={on ? "page" : undefined}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "6px 0", textDecoration: "none" }}>
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 62, height: 32, borderRadius: 16, background: on ? "rgba(236,90,19,.16)" : "transparent", transition: "background .2s" }}>
                <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{t.icon}</svg>
              </span>
              <span style={{ ...mono, fontSize: 8.5, letterSpacing: ".02em", color: col }}>{t.label}</span>
            </Link>
          );
        })}
      </nav>
    );
  }
  // iOS / прочее — Cupertino-стиль: блюр-фон, активный цвет без «таблетки».
  return (
    <nav style={{ flexShrink: 0, display: "flex", alignItems: "stretch", padding: "9px 6px calc(env(safe-area-inset-bottom, 0px) + 12px)", background: "rgba(251,243,232,.95)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderTop: "1px solid #E7E0D0" }}>
      {TABS.map((t) => {
        const on = t.to === active;
        return (
          <Link key={t.to} to={t.to} aria-label={t.label} aria-current={on ? "page" : undefined}
            style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "5px 0", textDecoration: "none", color: on ? "#EC5A13" : "#9B9584", transition: "color .2s" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{t.icon}</svg>
            <span style={{ ...mono, fontSize: 8.5, letterSpacing: ".02em" }}>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

// ── Экран «Карта» (главная) ──────────────────────────────────────────
const REASON_RU: Record<string, string> = {
  program: "Пройдена программа ДПО", event: "Участие в событии", referral: "Приглашённый выпускник",
  mentorship: "Менторство", order: "Заказ", decay: "Списание за неактивность", manual: "Начисление офисом", achievement: "Достижение",
};

function MobileHome() {
  useHead({ title: null, description: "Личный кабинет выпускника факультета права НИУ ВШЭ: карта, баллы, скидка на ДПО." });
  const t = token();
  const me = useMe(t);
  const ledger = useLedger(t);
  const programs = usePrograms();
  const discount = useMemberDiscount();
  const toast = useToast();

  // Гость или недоступная сессия — приглашение (/me отдаётся только верифицированному
  // выпускнику, поэтому неверифицированные попадают в isError → тоже видят приглашение).
  if (!t || me.isError) return <GuestHome />;
  if (!me.data) return <Loader />;
  const m = me.data;
  const first = (m.alumni.fio ?? "Выпускник").trim().split(" ")[0];
  const cur = LEVELS.find((l) => l.key === m.level.level) ?? LEVELS[0]!;
  const idx = LEVELS.findIndex((l) => l.key === cur.key);
  const next = LEVELS[idx + 1] ?? null;
  const prog = next ? Math.min(1, Math.max(0, (m.level.points - cur.min_points) / (next.min_points - cur.min_points))) : 1;
  const circ = 2 * Math.PI * 54;
  const disc = `−${m.level.discount}%`;
  const rec = (programs.data ?? []).find((p) => !p.source_url) ?? null;

  return (
    <div style={{ paddingBottom: 16 }}>
      <header style={{ ...HEADER, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/assets/themis.jpeg" alt="" width={36} height={36} style={{ borderRadius: 10, objectFit: "cover", boxShadow: "0 3px 10px -3px rgba(236,90,19,.7)" }} />
          <div style={{ lineHeight: 1.2 }}>
            <div style={{ ...disp, fontWeight: 700, fontSize: 13 }}>Клуб выпускников</div>
            <div style={{ ...mono, fontSize: 8.5, letterSpacing: ".12em", color: "#9B9584" }}>ФАКУЛЬТЕТ ПРАВА · ВЫШКА</div>
          </div>
        </div>
        <Link to="/?screen=profile" aria-label="Профиль" style={{ width: 40, height: 40, borderRadius: 12, border: "1px solid #ECE6DA", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
        </Link>
      </header>

      <div style={{ padding: "16px 20px 2px" }}>
        <div style={{ fontSize: 15, color: "#6B7280" }}>Добрый день,</div>
        <h1 style={{ ...disp, fontWeight: 800, fontSize: 30, letterSpacing: "-.02em", margin: "1px 0 0" }}>{first}</h1>
      </div>

      {/* Карта выпускника */}
      <div style={{ padding: "14px 20px 2px" }}>
        <Link to="/?screen=profile" style={{ display: "block", borderRadius: 24, position: "relative", overflow: "hidden", background: "linear-gradient(152deg,#1e2942 0%,#14181F 54%,#0f1c3f 100%)", boxShadow: "0 28px 52px -28px rgba(17,41,107,.95)", textDecoration: "none" }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: 24, border: "1px solid rgba(196,154,69,.42)", pointerEvents: "none" }} />
          <img src="/assets/themis.jpeg" alt="" style={{ position: "absolute", right: -34, top: -22, width: 196, height: 196, objectFit: "cover", opacity: .15, borderRadius: 22, transform: "rotate(7deg)" }} />
          <div style={{ position: "relative", padding: "20px 20px 18px", color: "#FBF3E8" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ ...mono, fontSize: 9.5, letterSpacing: ".24em", color: "rgba(227,194,114,.92)" }}>КАРТА ВЫПУСКНИКА</span>
              <span style={{ ...mono, fontSize: 10, letterSpacing: ".16em", color: "rgba(251,243,232,.55)" }}>ВЫПУСК {m.alumni.cohort ?? "—"}</span>
            </div>
            <div style={{ ...disp, fontWeight: 700, fontSize: 23, letterSpacing: "-.01em", marginTop: 28 }}>{m.alumni.fio ?? "Выпускник"}</div>
            <div style={{ ...mono, fontSize: 11, letterSpacing: ".1em", color: "rgba(251,243,232,.55)", marginTop: 5 }}>№ {m.alumni.referral_code ?? "—"}</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 22 }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg,#E3C272,#C49A45)", color: INK, padding: "7px 13px", borderRadius: 11 }}>
                <span style={{ ...disp, fontWeight: 700, fontSize: 12 }}>{m.level.level_title}</span>
                <span style={{ width: 1, height: 12, background: "rgba(20,24,31,.35)" }} />
                <span style={{ ...mono, fontWeight: 600, fontSize: 12 }}>{disc}</span>
              </div>
              <span style={{ ...mono, fontSize: 11, color: "rgba(251,243,232,.82)" }}>Открыть →</span>
            </div>
          </div>
        </Link>
      </div>

      {/* Кольцо баллов */}
      <div style={{ padding: "14px 20px 2px" }}>
        <div style={{ ...CARD, borderRadius: 22, boxShadow: "0 14px 34px -26px rgba(20,24,31,.55)", display: "flex", gap: 16, alignItems: "center", padding: "16px 18px" }}>
          <div style={{ position: "relative", width: 98, height: 98, flexShrink: 0 }}>
            <svg width="98" height="98" viewBox="0 0 120 120" style={{ transform: "rotate(-90deg)" }}>
              <circle cx="60" cy="60" r="54" fill="none" stroke="#F2E3CF" strokeWidth="11" />
              <circle cx="60" cy="60" r="54" fill="none" stroke="#EC5A13" strokeWidth="11" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - prog)} style={{ transition: "stroke-dashoffset 1s cubic-bezier(.4,0,.2,1)" }} />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div style={{ ...disp, fontWeight: 800, fontSize: 23, lineHeight: 1 }}>{m.level.points}</div>
              <div style={{ ...mono, fontSize: 8.5, letterSpacing: ".12em", color: "#9B9584", marginTop: 2 }}>БАЛЛОВ</div>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...mono, fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "#9B9584" }}>Уровень</div>
            <div style={{ ...disp, fontWeight: 700, fontSize: 18, marginTop: 2 }}>{m.level.level_title}</div>
            <div style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>Скидка {disc} на ДПО</div>
            <div style={{ marginTop: 11, height: 7, borderRadius: 99, background: "#F2E3CF", overflow: "hidden" }}>
              <div style={{ width: `${Math.round(prog * 100)}%`, height: "100%", borderRadius: 99, background: "linear-gradient(90deg,#EC5A13,#C49A45)", transition: "width 1s cubic-bezier(.4,0,.2,1)" }} />
            </div>
            <div style={{ ...mono, fontSize: 9.5, color: "#9B9584", marginTop: 7 }}>{next ? `+${m.level.to_next} до «${next.title}»` : "максимальный уровень"}</div>
          </div>
        </div>
      </div>

      {/* Достижения */}
      {m.achievements.length > 0 && (
        <div style={{ padding: "16px 0 2px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 20px 11px" }}>
            <span style={{ ...mono, fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "#9B9584" }}>Достижения · {m.achievements.filter((a) => a.earned).length}/{m.achievements.length}</span>
            <Link to="/?screen=ach" style={{ ...mono, fontSize: 11, color: "#C9450E" }}>Все →</Link>
          </div>
          <div className="noscroll" style={{ display: "flex", gap: 14, overflowX: "auto", padding: "4px 20px 6px" }}>
            {m.achievements.map((a) => {
              const active = a.earned || a.star;
              const bg = a.earned ? "linear-gradient(140deg,#2C6E80,#11296B)" : a.star ? "#EC5A13" : "#EDE4D3";
              return (
                <div key={a.key} style={{ flexShrink: 0, width: 64, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, opacity: active ? 1 : 0.42 }}>
                  <div style={{ width: 54, height: 54, transform: "rotate(45deg)", borderRadius: 15, background: bg, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: a.earned ? "0 8px 18px -10px rgba(17,41,107,.6)" : "none" }}>
                    <span style={{ transform: "rotate(-45deg)", fontSize: 19, lineHeight: 1, color: active ? "#FBF3E8" : "#b8a98a" }}>{a.icon}</span>
                  </div>
                  <span style={{ fontSize: 9.5, textAlign: "center", color: "#6B7280", lineHeight: 1.15 }}>{a.title}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Быстрые действия */}
      <div style={{ padding: "14px 20px 2px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11 }}>
        <QuickAction to="/?screen=ledger" label="История баллов" tint="rgba(236,90,19,.12)" stroke="#C9450E" icon={<><path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 5-6" /></>} />
        <QuickAction onClick={() => { void navigator.clipboard?.writeText(`${window.location.origin}/join?ref=${m.alumni.referral_code ?? ""}`); toast("Ссылка приглашения скопирована ✓"); }} label="Пригласить друга" tint="rgba(44,110,128,.12)" stroke="#2C6E80" icon={<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M17 3.13a4 4 0 0 1 0 7.75" /></>} />
        <QuickAction to="/dpo" label="Программы ДПО" tint="rgba(17,41,107,.1)" stroke="#11296B" icon={<><path d="M3 8l9-4 9 4-9 4-9-4z" /><path d="M7 10.5V15c0 1 2.2 2.2 5 2.2s5-1.2 5-2.2v-4.5" /></>} />
        <QuickAction to="/?screen=profile" label="Профиль" tint="rgba(196,154,69,.16)" stroke="#B78A2E" icon={<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>} />
      </div>

      {/* Последнее — история баллов */}
      {ledger.data && ledger.data.length > 0 && (
        <div style={{ padding: "16px 20px 2px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 10 }}>
            <span style={{ ...mono, fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "#9B9584" }}>Последнее</span>
            <Link to="/?screen=ledger" style={{ ...mono, fontSize: 11, color: "#C9450E" }}>Вся история →</Link>
          </div>
          <div style={{ ...CARD, borderRadius: 18, overflow: "hidden" }}>
            {ledger.data.slice(0, 3).map((l, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", borderTop: i ? "1px solid #F3EDE1" : "none" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>{REASON_RU[l.reason] ?? l.reason}</div>
                  <div style={{ ...mono, fontSize: 10, color: "#9B9584", marginTop: 2 }}>{formatNewsDate(l.created_at)}</div>
                </div>
                <div style={{ ...mono, fontWeight: 600, fontSize: 14, color: l.delta >= 0 ? "#1F8A5B" : "#C9450E", flexShrink: 0 }}>{l.delta >= 0 ? "+" : ""}{l.delta}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Рекомендуем */}
      {rec && (
        <div style={{ padding: "16px 20px 4px" }}>
          <span style={{ ...mono, fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "#9B9584" }}>Рекомендуем вам</span>
          <Link to={`/dpo/${rec.slug}`} style={{ display: "block", marginTop: 11, background: INK, borderRadius: 20, overflow: "hidden", position: "relative", padding: "18px 18px 16px", color: "#FBF3E8", boxShadow: "0 18px 36px -26px rgba(20,24,31,.9)", textDecoration: "none" }}>
            <div style={{ position: "absolute", right: -20, bottom: -30, width: 130, height: 130, borderRadius: 99, background: "radial-gradient(circle,rgba(236,90,19,.34),transparent 70%)" }} />
            <div style={{ position: "relative" }}>
              <span style={{ display: "inline-block", ...mono, fontSize: 9, letterSpacing: ".1em", padding: "4px 8px", borderRadius: 7, background: "rgba(251,243,232,.12)", color: "#E3C272" }}>{rec.direction}</span>
              <div style={{ ...disp, fontWeight: 700, fontSize: 18, lineHeight: 1.15, marginTop: 12 }}>{rec.title}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 9, marginTop: 12 }}>
                <span style={{ ...disp, fontWeight: 700, fontSize: 20, color: "#EC5A13" }}>{rub(Math.round(rec.price * (1 - discount / 100)))}</span>
                {discount > 0 && <span style={{ ...mono, fontSize: 12, color: "rgba(251,243,232,.5)", textDecoration: "line-through" }}>{rub(rec.price)}</span>}
                <span style={{ ...mono, fontSize: 11, color: "#E3C272", marginLeft: "auto" }}>{disc} выпускнику</span>
              </div>
            </div>
          </Link>
        </div>
      )}
    </div>
  );
}

function QuickAction({ to, onClick, label, tint, stroke, icon }: { to?: string; onClick?: () => void; label: string; tint: string; stroke: string; icon: ReactNode }) {
  const inner = (
    <>
      <span style={{ width: 36, height: 36, borderRadius: 11, background: tint, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
      </span>
      <span style={{ fontWeight: 600, fontSize: 13.5, textAlign: "left" }}>{label}</span>
    </>
  );
  const st: CSSProperties = { display: "flex", alignItems: "center", gap: 11, ...CARD, borderRadius: 16, padding: "13px 14px", textDecoration: "none", color: INK, width: "100%", cursor: "pointer" };
  return to ? <Link to={to} style={st}>{inner}</Link> : <button onClick={onClick} style={{ ...st, border: st.border as string, textAlign: "left", background: "#fff" }}>{inner}</button>;
}

function GuestHome() {
  useHead({ title: null });
  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 30px", textAlign: "center" }}>
        <img src="/assets/themis.jpeg" alt="" width={76} height={76} style={{ borderRadius: 20, objectFit: "cover", boxShadow: "0 14px 30px -12px rgba(236,90,19,.7)" }} />
        <h1 style={{ ...disp, fontWeight: 800, fontSize: 26, letterSpacing: "-.02em", margin: "22px 0 0" }}>Клуб выпускников</h1>
        <div style={{ ...mono, fontSize: 10, letterSpacing: ".14em", color: "#9B9584", marginTop: 6 }}>ФАКУЛЬТЕТ ПРАВА · ВЫШКА</div>
        <p style={{ fontSize: 15, color: "#6B7280", lineHeight: 1.55, marginTop: 18, maxWidth: 300 }}>
          Войдите, чтобы открыть карту выпускника — баллы, уровень и скидку на программы ДПО.
        </p>
        <Link to="/lk" style={{ marginTop: 24, width: "100%", maxWidth: 300, height: 52, borderRadius: 15, background: "#EC5A13", color: "#FBF3E8", ...disp, fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", boxShadow: "0 14px 28px -14px rgba(236,90,19,.85)" }}>Войти в кабинет</Link>
        <Link to="/join" style={{ marginTop: 12, width: "100%", maxWidth: 300, height: 52, borderRadius: 15, border: "1.5px solid #14181F", color: INK, fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", background: "#fff" }}>Вступить в клуб</Link>
        <div style={{ ...mono, fontSize: 11, color: "#9B9584", marginTop: 20 }}>Витрины ниже открыты всем →</div>
      </div>
    </div>
  );
}

function Loader() {
  return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }} role="status" aria-label="Загрузка">
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#EC5A13" strokeWidth="2.5" style={{ animation: "spin .8s linear infinite" }}><circle cx="12" cy="12" r="9" strokeOpacity="0.2" /><path d="M21 12a9 9 0 0 0-9-9" /></svg>
    </div>
  );
}

function ScreenHeader({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <header style={{ ...HEADER, display: right ? "flex" : "block", alignItems: "flex-end", justifyContent: "space-between", padding: "calc(env(safe-area-inset-top, 0px) + 18px) 20px 12px" }}>
      <div>
        {/* Настоящий <h1>: экран мобильной оболочки — самостоятельная страница, скринридер
            должен находить её заголовок навигацией по заголовкам (как на десктопе). */}
        <h1 style={{ ...disp, fontWeight: 800, fontSize: 27, letterSpacing: "-.02em", margin: 0 }}>{title}</h1>
        {sub && <div style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>{sub}</div>}
      </div>
      {right}
    </header>
  );
}

// ── Лента (новости) ──────────────────────────────────────────────────
const NEWS_TINTS = ["#2C6E80", "#11296B", "#C9450E", "#7A5CA8", "#1F8A5B"];
function MobileFeed() {
  useHead({ title: "Новости клуба", description: "Новости клуба выпускников факультета права НИУ ВШЭ." });
  const news = useNewsList();
  return (
    <div>
      <ScreenHeader title="Лента" sub="Новости клуба · t.me/pravohse" />
      <div style={{ padding: "8px 20px 16px", display: "flex", flexDirection: "column", gap: 15 }}>
        {news.isLoading && <Loader />}
        {news.isError && <p style={{ ...mono, fontSize: 13, color: "#C9450E" }}>Не удалось загрузить новости.</p>}
        {news.data?.length === 0 && <p style={{ ...mono, fontSize: 13, color: "#9B9584" }}>Пока нет публикаций.</p>}
        {news.data?.map((n, i) => (
          <Link key={n.id} to={`/news/${n.slug}`} style={{ ...CARD, overflow: "hidden", boxShadow: "0 14px 32px -26px rgba(20,24,31,.5)", textDecoration: "none", color: INK }}>
            <div style={{ height: 96, position: "relative", background: NEWS_TINTS[i % NEWS_TINTS.length], overflow: "hidden" }}>
              <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(115deg,rgba(255,255,255,.08) 0 2px,transparent 2px 13px)" }} />
              <div style={{ position: "absolute", left: 14, top: 12, ...mono, fontSize: 9, letterSpacing: ".12em", color: "rgba(255,255,255,.92)", background: "rgba(0,0,0,.22)", padding: "4px 9px", borderRadius: 7 }}>НОВОСТЬ</div>
            </div>
            <div style={{ padding: "14px 16px 16px" }}>
              <div style={{ ...disp, fontWeight: 600, fontSize: 16, lineHeight: 1.25 }}>{n.title}</div>
              {n.excerpt && <div style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.45, marginTop: 8 }}>{n.excerpt}</div>}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
                <span style={{ ...mono, fontSize: 10, color: "#9B9584" }}>{formatNewsDate(n.published_at)}</span>
                <span style={{ ...mono, fontSize: 11, color: "#C9450E" }}>Читать →</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── ДПО ──────────────────────────────────────────────────────────────
const FMT_COL: Record<string, string> = { online: "#2C6E80", offline: "#C9450E", blended: "#11296B" };
const FMT_RU: Record<string, string> = { online: "онлайн", offline: "очно", blended: "смешанный" };
function MobileDpo() {
  useHead({ title: "Программы ДПО со скидкой выпускника", description: "Каталог программ ДПО факультета права НИУ ВШЭ со скидкой выпускника." });
  const programs = usePrograms();
  const discount = useMemberDiscount();
  const [dir, setDir] = useState<string | null>(null);
  const list = programs.data ?? [];
  const dirs = useMemo(() => [...new Set(list.map((p) => p.direction).filter(Boolean))], [list]);
  const shown = dir ? list.filter((p) => p.direction === dir) : list;

  return (
    <div>
      <header style={{ ...HEADER, padding: "calc(env(safe-area-inset-top, 0px) + 18px) 20px 12px" }}>
        <h1 style={{ ...disp, fontWeight: 800, fontSize: 27, letterSpacing: "-.02em", margin: 0 }}>Программы ДПО</h1>
        <div style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>Скидка выпускника на программы ДПО</div>
        <div className="noscroll" style={{ display: "flex", gap: 8, overflowX: "auto", margin: "14px -20px 0", padding: "0 20px 2px" }}>
          <Chip on={!dir} onClick={() => setDir(null)}>Все</Chip>
          {dirs.map((d) => <Chip key={d} on={dir === d} onClick={() => setDir(dir === d ? null : d)}>{d}</Chip>)}
        </div>
      </header>
      <div style={{ padding: "12px 20px 16px", display: "flex", flexDirection: "column", gap: 13 }}>
        {programs.isLoading && <Loader />}
        {shown.map((p: Program) => {
          const mem = Math.round(p.price * (1 - discount / 100));
          return (
            <Link key={p.id} to={`/dpo/${p.slug}`} style={{ ...CARD, padding: "16px 17px", boxShadow: "0 14px 32px -28px rgba(20,24,31,.5)", textDecoration: "none", color: INK }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ ...mono, fontSize: 9, letterSpacing: ".06em", color: "#fff", background: FMT_COL[p.format] ?? "#11296B", padding: "4px 8px", borderRadius: 6 }}>{FMT_RU[p.format] ?? p.format}</span>
                <span style={{ ...mono, fontSize: 10, color: "#9B9584", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.direction}</span>
              </div>
              <div style={{ ...disp, fontWeight: 600, fontSize: 16.5, lineHeight: 1.2, marginTop: 11 }}>{p.title}</div>
              {p.duration && <div style={{ ...mono, fontSize: 10.5, color: "#9B9584", marginTop: 8 }}>{p.duration}</div>}
              <div style={{ display: "flex", alignItems: "baseline", gap: 9, marginTop: 13 }}>
                <span style={{ ...disp, fontWeight: 700, fontSize: 18, color: "#EC5A13" }}>{rub(mem)}</span>
                {discount > 0 && <span style={{ ...mono, fontSize: 12, color: "#B8B0A0", textDecoration: "line-through" }}>{rub(p.price)}</span>}
                {discount > 0 && <span style={{ marginLeft: "auto", ...mono, fontSize: 11, color: "#C9450E" }}>−{discount}%</span>}
              </div>
            </Link>
          );
        })}
        {!programs.isLoading && shown.length === 0 && <p style={{ ...mono, fontSize: 13, color: "#9B9584" }}>Нет программ в этом направлении.</p>}
      </div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  // Android — Material-чип (тёмный активный); iOS — оранжевый активный.
  const brd = on ? (ANDROID ? "#14181F" : "#EC5A13") : "#E4DCCC";
  const bg = on ? (ANDROID ? "#14181F" : "rgba(236,90,19,.1)") : "#fff";
  const col = on ? (ANDROID ? "#FBF3E8" : "#C9450E") : INK;
  return <button onClick={onClick} style={{ flexShrink: 0, fontFamily: "'Onest'", fontWeight: 600, fontSize: 13, padding: "8px 15px", borderRadius: 99, border: "1px solid " + brd, background: bg, color: col, cursor: "pointer" }}>{children}</button>;
}

// ── Подкасты ─────────────────────────────────────────────────────────
function MobilePodcasts() {
  useHead({ title: "Подкасты клуба", description: "Подкасты клуба выпускников факультета права НИУ ВШЭ." });
  const q = usePodcasts(token());
  const items = q.data?.items ?? [];
  return (
    <div>
      <ScreenHeader title="Подкасты" sub="Разговоры с практиками права" />
      <div style={{ padding: "10px 20px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
        {q.isLoading && <Loader />}
        {items.length === 0 && !q.isLoading && <p style={{ ...mono, fontSize: 13, color: "#9B9584" }}>Выпусков пока нет.</p>}
        {items.map((p, i) => (
          <Link key={p.id} to={`/podcasts?ep=${encodeURIComponent(p.id)}`} style={{ display: "flex", alignItems: "center", gap: 14, ...CARD, borderRadius: 18, padding: "13px 14px", boxShadow: "0 14px 30px -28px rgba(20,24,31,.5)", textDecoration: "none", color: INK }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, flexShrink: 0, background: p.cover ? `#11296B url(${p.cover}) center/cover` : "linear-gradient(140deg,#1e2942,#11296B)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {!p.cover && <svg width="17" height="17" viewBox="0 0 24 24" fill="#FBF3E8"><path d="M8 5v14l11-7z" /></svg>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...mono, fontSize: 9.5, letterSpacing: ".08em", color: "#9B9584" }}>ВЫПУСК {i + 1}{p.duration ? ` · ${p.duration}` : ""}{p.is_free ? " · беспл." : ""}</div>
              <div style={{ ...disp, fontWeight: 600, fontSize: 14.5, lineHeight: 1.2, marginTop: 4 }}>{p.title}</div>
              {p.description && <div style={{ fontSize: 12, color: "#6B7280", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.description}</div>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Мерч ─────────────────────────────────────────────────────────────
const MERCH_TINTS = ["#C9450E", "#2C6E80", "#11296B", "#7A5CA8"];
function MobileMerch() {
  useHead({ title: "Мерч клуба", description: "Фирменный мерч клуба выпускников факультета права НИУ ВШЭ." });
  const products = useProducts();
  const cart = useCart();
  const { add } = useCartMutations();
  const toast = useToast();
  const count = cart.data?.count ?? 0;
  const list = products.data ?? [];

  return (
    <div>
      <ScreenHeader title="Мерч" sub="Товары без скидки выпускника" right={
        <Link to="/cart" aria-label="Корзина" style={{ position: "relative", width: 42, height: 42, borderRadius: 13, border: "1px solid #ECE6DA", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8h12l-1 12H7L6 8z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>
          {count > 0 && <span style={{ position: "absolute", top: -5, right: -5, minWidth: 18, height: 18, padding: "0 4px", borderRadius: 99, background: "#EC5A13", color: "#fff", ...mono, fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #FBF3E8" }}>{count}</span>}
        </Link>
      } />
      <div style={{ padding: "12px 20px 16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13 }}>
        {products.isLoading && <Loader />}
        {list.map((m: Product, i) => (
          <div key={m.id} style={{ ...CARD, borderRadius: 18, overflow: "hidden", boxShadow: "0 12px 28px -28px rgba(20,24,31,.5)" }}>
            <Link to={`/merch?item=${encodeURIComponent(m.slug)}`} aria-label={m.title} style={{ display: "block" }}>
              <div style={{ height: 120, position: "relative", overflow: "hidden", background: m.images?.[0] ? `#fff url(${m.images[0]}) center/cover` : MERCH_TINTS[i % MERCH_TINTS.length] }}>
                {!m.images?.[0] && <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(45deg,rgba(255,255,255,.09) 0 7px,transparent 7px 15px)" }} />}
              </div>
            </Link>
            <div style={{ padding: "11px 13px 13px" }}>
              <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.25, minHeight: 32 }}>{m.title}</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
                <span style={{ ...disp, fontWeight: 700, fontSize: 15 }}>{rub(m.price)}</span>
                <button aria-label={`Добавить «${m.title}» в корзину`} onClick={() => add.mutate({ type: "merch", ref_id: m.slug, qty: 1 }, { onSuccess: () => toast(`«${m.title}» в корзине`), onError: () => toast("Не удалось добавить", "err") })} style={{ width: 32, height: 32, borderRadius: 10, border: "none", background: "#EC5A13", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Детальные экраны (стадия 2): full-screen без нижней навигации ─────
const roundDark: CSSProperties = { width: 40, height: 40, borderRadius: 99, border: "none", background: "rgba(20,24,31,.42)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, textDecoration: "none" };
const roundLight: CSSProperties = { width: 40, height: 40, borderRadius: 12, border: "1px solid #ECE6DA", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 };
const secTitle: CSSProperties = { ...disp, fontWeight: 600, fontSize: 15, marginBottom: 8 };
const factChip: CSSProperties = { ...mono, fontSize: 10.5, color: INK, background: "#fff", border: "1px solid #ECE6DA", padding: "7px 11px", borderRadius: 9 };
const stickyBar: CSSProperties = { flexShrink: 0, padding: "12px 20px calc(env(safe-area-inset-bottom, 0px) + 16px)", background: "#FBF3E8", borderTop: "1px solid #EFE7D8", display: "flex", gap: 11 };
const primaryBtn: CSSProperties = { flex: 1, height: 52, borderRadius: 15, border: "none", background: "#EC5A13", color: "#FBF3E8", fontFamily: "'Onest'", fontWeight: 700, fontSize: 15, cursor: "pointer", boxShadow: "0 12px 24px -12px rgba(236,90,19,.8)" };
const ghostBtn: CSSProperties = { flex: 1, height: 52, borderRadius: 15, border: "1.5px solid #14181F", background: "#fff", color: INK, fontFamily: "'Onest'", fontWeight: 700, fontSize: 15, cursor: "pointer" };
const BackWhite = <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>;
const BackInk = <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>;

function MobileProgram() {
  // Оболочка рендерится вне <Route path="/dpo/:slug">, поэтому useParams пуст —
  // берём slug прямо из пути.
  const { pathname } = useLocation();
  const slug = decodeURIComponent(pathname.replace(/^\/dpo\//, ""));
  const nav = useNavigate();
  const q = useProgram(slug);
  const discount = useMemberDiscount();
  const { add } = useCartMutations();
  const cart = useCart();
  const toast = useToast();
  const p = q.data;
  useHead({ title: p?.title ?? "Программа ДПО", description: p?.description ?? undefined, canonical: typeof window !== "undefined" ? `${window.location.origin}/dpo/${slug}` : undefined });
  const count = cart.data?.count ?? 0;
  const mem = p ? Math.round(p.price * (1 - discount / 100)) : 0;
  const modules = (Array.isArray(p?.modules) && p!.modules) || [];
  const teacher = (Array.isArray(p?.teachers) && p!.teachers && p!.teachers[0]) || null;
  const doAdd = (goCart: boolean) => {
    if (!p) return;
    add.mutate({ type: "dpo", ref_id: p.slug, qty: 1 }, {
      onSuccess: () => { toast(goCart ? "Добавлено — оформите заявку" : `«${p.title}» в корзине`); if (goCart) nav("/cart"); },
      onError: (e) => toast((e as Error).message, "err"),
    });
  };
  return (
    <div style={{ height: "100dvh", background: "#FBF3E8", display: "flex", flexDirection: "column", overflow: "hidden", color: INK, fontFamily: "'Onest', system-ui, sans-serif" }}>
      <div className="noscroll" style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ position: "relative", height: 200, overflow: "hidden", background: "linear-gradient(150deg,#1e2942,#11296B 60%,#0f1c3f)" }}>
          <img src="/assets/themis.jpeg" alt="" style={{ position: "absolute", right: -30, bottom: -30, width: 190, height: 190, objectFit: "cover", opacity: .16, transform: "rotate(8deg)" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(20,24,31,.15),rgba(20,24,31,.86))" }} />
          <div style={{ position: "absolute", top: "calc(env(safe-area-inset-top, 0px) + 14px)", left: 16, right: 16, display: "flex", justifyContent: "space-between" }}>
            <button onClick={() => nav("/dpo")} aria-label="Назад" style={roundDark}>{BackWhite}</button>
            <Link to="/cart" aria-label="Корзина" style={{ ...roundDark, position: "relative" }}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8h12l-1 12H7L6 8z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>
              {count > 0 && <span style={{ position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, padding: "0 4px", borderRadius: 99, background: "#EC5A13", color: "#fff", ...mono, fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #0f1c3f" }}>{count}</span>}
            </Link>
          </div>
          {p && <div style={{ position: "absolute", left: 20, right: 20, bottom: 16 }}>
            <span style={{ ...mono, fontSize: 9, letterSpacing: ".08em", color: "#fff", background: FMT_COL[p.format] ?? "#11296B", padding: "4px 8px", borderRadius: 6 }}>{FMT_RU[p.format] ?? p.format}</span>
            <div style={{ ...disp, fontWeight: 700, fontSize: 22, lineHeight: 1.15, color: "#FBF3E8", marginTop: 10 }}>{p.title}</div>
          </div>}
        </div>
        {q.isLoading && <Loader />}
        {q.isError && <p style={{ padding: 20, ...mono, fontSize: 13, color: "#C9450E" }}>Программа не найдена.</p>}
        {p && (
          <div style={{ padding: "18px 20px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {p.duration && <span style={factChip}>{p.duration}</span>}
              {p.document && <span style={factChip}>Документ: {p.document}</span>}
              {p.direction && <span style={factChip}>{p.direction}</span>}
            </div>
            <div style={{ ...CARD, borderRadius: 18, padding: "16px 17px" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span style={{ ...disp, fontWeight: 800, fontSize: 26, color: "#EC5A13" }}>{rub(mem)}</span>
                {discount > 0 && <span style={{ ...mono, fontSize: 14, color: "#B8B0A0", textDecoration: "line-through" }}>{rub(p.price)}</span>}
              </div>
              <div style={{ ...mono, fontSize: 10.5, color: "#9B9584", marginTop: 6 }}>{discount > 0 ? `Цена члена клуба (−${discount}%) · справочно` : "Цена · справочно"}</div>
            </div>
            {p.description && <div><div style={secTitle}>О программе</div><div style={{ fontSize: 14, lineHeight: 1.55, color: "#3a3f49" }}>{p.description}</div></div>}
            {modules.length > 0 && <div><div style={secTitle}>Модули</div><div style={{ display: "flex", flexDirection: "column", gap: 9 }}>{modules.map((m, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 11, ...CARD, borderRadius: 13, padding: "12px 14px" }}><span style={{ width: 22, height: 22, borderRadius: 99, background: "rgba(236,90,19,.12)", color: "#C9450E", ...mono, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</span><span style={{ fontSize: 13.5 }}>{m.title}</span></div>
            ))}</div></div>}
            {teacher && <div style={{ display: "flex", alignItems: "center", gap: 12, background: INK, borderRadius: 16, padding: "15px 16px" }}><span style={{ width: 42, height: 42, borderRadius: 12, background: "linear-gradient(135deg,#E3C272,#C49A45)", color: INK, ...disp, fontWeight: 700, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{teacher.name.trim()[0] ?? "≡"}</span><div style={{ minWidth: 0 }}><div style={{ ...mono, fontSize: 9.5, letterSpacing: ".1em", color: "rgba(251,243,232,.5)" }}>ПРЕПОДАВАТЕЛЬ</div><div style={{ fontWeight: 600, fontSize: 14, color: "#FBF3E8", marginTop: 2 }}>{teacher.name}{teacher.role ? ` · ${teacher.role}` : ""}</div></div></div>}
          </div>
        )}
      </div>
      {p && (p.source_url ? (
        <div style={stickyBar}><a href={p.source_url} target="_blank" rel="noopener noreferrer" style={{ ...primaryBtn, textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>Запись на hse.ru ↗</a></div>
      ) : (
        <div style={stickyBar}>
          <button onClick={() => doAdd(false)} disabled={add.isPending} style={ghostBtn}>В корзину</button>
          <button onClick={() => doAdd(true)} disabled={add.isPending} style={{ ...primaryBtn, flex: 1.3 }}>Оставить заявку</button>
        </div>
      ))}
    </div>
  );
}

function CartField({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={label} style={{ height: 48, borderRadius: 13, border: "1px solid #E4DCCC", background: "#fff", padding: "0 15px", fontFamily: "'Onest'", fontSize: 15, color: INK, outline: "none" }} />;
}

function MobileCart() {
  useHead({ title: "Заявка", noindex: true });
  const nav = useNavigate();
  const cart = useCart();
  const discount = useMemberDiscount();
  const { setQty } = useCartMutations();
  const toast = useToast();
  const [form, setForm] = useState({ fio: "", phone: "", email: "", fulfillment: "pickup" as "pickup" | "delivery", address: "", consent: false, website: "" });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<OrderResult | null>(null);
  const items = cart.data?.items ?? [];
  const subtotal = cart.data?.subtotal ?? 0;
  const dpoSub = items.filter((i) => i.type === "dpo").reduce((s, i) => s + i.price * i.qty, 0);
  const discAmt = Math.round((dpoSub * discount) / 100);
  const total = subtotal - discAmt;
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    submitOrder({ contact_fio: form.fio, contact_phone: form.phone, contact_email: form.email, fulfillment: form.fulfillment, address: form.address || null, comment: null, consent_pdn: form.consent, website: form.website })
      .then((res) => { setResult(res); cart.refetch(); })
      .catch((err) => toast((err as Error).message, "err"))
      .finally(() => setBusy(false));
  };

  if (result) {
    return (
      <div style={{ height: "100dvh", background: "#FBF3E8", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 34px", textAlign: "center", color: INK, fontFamily: "'Onest', system-ui, sans-serif" }}>
        <div style={{ width: 96, height: 96, borderRadius: 99, background: "linear-gradient(140deg,#2C6E80,#15375E)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 24px 46px -20px rgba(21,55,94,.8)" }}><svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="#FBF3E8" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg></div>
        <div style={{ ...disp, fontWeight: 800, fontSize: 24, marginTop: 26 }}>Заявка отправлена</div>
        <div style={{ ...mono, fontSize: 12, letterSpacing: ".06em", color: "#C9450E", marginTop: 12, background: "#F2E3CF", padding: "8px 14px", borderRadius: 10 }}>{result.number}</div>
        <div style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.55, marginTop: 18, maxWidth: 280 }}>Менеджер учебного офиса свяжется с вами в течение рабочего дня.{result.payment_url ? " Оплатить можно онлайн — кнопка ниже." : ""}</div>
        {result.payment_url && <a href={result.payment_url} style={{ ...primaryBtn, marginTop: 20, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", padding: "0 26px", background: "#1F8A5B", boxShadow: "none" }}>Оплатить онлайн</a>}
        <button onClick={() => nav("/")} style={{ marginTop: 22, height: 52, padding: "0 34px", borderRadius: 15, border: "none", background: INK, color: "#FBF3E8", fontFamily: "'Onest'", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>На главную</button>
      </div>
    );
  }

  return (
    <div style={{ height: "100dvh", background: "#FBF3E8", display: "flex", flexDirection: "column", overflow: "hidden", color: INK, fontFamily: "'Onest', system-ui, sans-serif" }}>
      <header style={{ ...HEADER, display: "flex", alignItems: "center", gap: 12, padding: "calc(env(safe-area-inset-top, 0px) + 14px) 18px 12px" }}>
        <button onClick={() => nav(-1)} aria-label="Назад" style={roundLight}>{BackInk}</button>
        <div style={{ ...disp, fontWeight: 800, fontSize: 21, letterSpacing: "-.01em" }}>Заявка</div>
      </header>
      <div className="noscroll" style={{ flex: 1, overflowY: "auto" }}>
        {cart.isLoading && <Loader />}
        {cart.isError && <p style={{ padding: 20, ...mono, fontSize: 13, color: "#C9450E" }}>Не удалось загрузить корзину.</p>}
        {!cart.isLoading && !cart.isError && items.length === 0 && (
          <div style={{ padding: "70px 40px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
            <div style={{ width: 78, height: 78, borderRadius: 99, background: "#F2E3CF", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#C49A45" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8h12l-1 12H7L6 8z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg></div>
            <div style={{ ...disp, fontWeight: 700, fontSize: 17, marginTop: 18 }}>Заявка пуста</div>
            <div style={{ fontSize: 13.5, color: "#6B7280", marginTop: 6, lineHeight: 1.5 }}>Добавьте программу ДПО или мерч — и оформите заявку в пару касаний.</div>
            <button onClick={() => nav("/dpo")} style={{ ...primaryBtn, flex: "none", marginTop: 22, height: 48, padding: "0 26px" }}>К программам</button>
          </div>
        )}
        {items.length > 0 && (
          <form onSubmit={submit} style={{ padding: "8px 20px 30px", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              {items.map((c) => (
                <div key={`${c.ref_id}-${c.variant_sku ?? ""}`} style={{ display: "flex", gap: 13, ...CARD, borderRadius: 16, padding: "13px 14px", alignItems: "center" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.25 }}>{c.title}</div>
                    {c.type === "dpo" && <div style={{ ...mono, fontSize: 10, color: "#2C6E80", marginTop: 3 }}>ДПО · скидка выпускника</div>}
                    <div style={{ ...mono, fontSize: 12, color: "#9B9584", marginTop: 5 }}>{rub(c.price)}</div>
                  </div>
                  {c.type === "merch" ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 9, flexShrink: 0 }}>
                      <button type="button" aria-label="Меньше" disabled={setQty.isPending} onClick={() => setQty.mutate({ ref_id: c.ref_id, variant_sku: c.variant_sku, qty: c.qty - 1 })} style={{ width: 28, height: 28, borderRadius: 9, border: "1px solid #E4DCCC", background: "#fff", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>–</button>
                      <span style={{ ...mono, fontSize: 13, minWidth: 14, textAlign: "center" }}>{c.qty}</span>
                      <button type="button" aria-label="Больше" disabled={setQty.isPending || c.qty >= 99} onClick={() => setQty.mutate({ ref_id: c.ref_id, variant_sku: c.variant_sku, qty: c.qty + 1 })} style={{ width: 28, height: 28, borderRadius: 9, border: "1px solid #E4DCCC", background: "#fff", cursor: "pointer", fontSize: 15, lineHeight: 1 }}>+</button>
                    </div>
                  ) : (
                    <button type="button" aria-label="Убрать" disabled={setQty.isPending} onClick={() => setQty.mutate({ ref_id: c.ref_id, variant_sku: c.variant_sku, qty: 0 })} style={{ background: "none", border: "none", color: "#C9450E", cursor: "pointer", fontSize: 16, flexShrink: 0 }}>✕</button>
                  )}
                </div>
              ))}
            </div>
            <div style={{ ...CARD, borderRadius: 16, padding: "15px 16px", display: "flex", flexDirection: "column", gap: 9 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, color: "#3a3f49" }}><span>Подытог</span><span style={mono}>{rub(subtotal)}</span></div>
              {discAmt > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, color: "#2C6E80" }}><span>Скидка выпускника −{discount}% (ДПО)</span><span style={mono}>−{rub(discAmt)}</span></div>}
              <div style={{ height: 1, background: "#F0E9DC", margin: "2px 0" }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><span style={{ ...disp, fontWeight: 700, fontSize: 15 }}>Итого</span><span style={{ ...disp, fontWeight: 800, fontSize: 19, color: "#EC5A13" }}>{rub(total)}</span></div>
              <div style={{ ...mono, fontSize: 9.5, color: "#9B9584", marginTop: 2 }}>Оценочно. С вами свяжется менеджер учебного офиса.</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              <div style={{ ...mono, fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "#9B9584" }}>Контакты</div>
              <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={form.website} onChange={(e) => set("website", e.target.value)} style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }} />
              <CartField label="ФИО" value={form.fio} onChange={(v) => set("fio", v)} />
              <CartField label="Телефон" value={form.phone} onChange={(v) => set("phone", v)} />
              <CartField label="E-mail" type="email" value={form.email} onChange={(v) => set("email", v)} />
              <div style={{ display: "flex", gap: 9 }}>
                {(["pickup", "delivery"] as const).map((f) => (
                  <button type="button" key={f} onClick={() => set("fulfillment", f)} style={{ flex: 1, height: 46, borderRadius: 13, cursor: "pointer", fontFamily: "'Onest'", fontWeight: 600, fontSize: 13.5, border: "1.5px solid " + (form.fulfillment === f ? "#EC5A13" : "#E4DCCC"), background: "#fff", color: INK }}>{f === "pickup" ? "Самовывоз" : "Доставка"}</button>
                ))}
              </div>
              {form.fulfillment === "delivery" && <CartField label="Адрес доставки" value={form.address} onChange={(v) => set("address", v)} />}
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 12.5, color: "#3a3f49", lineHeight: 1.45, marginTop: 2, cursor: "pointer" }}>
                <input type="checkbox" checked={form.consent} onChange={(e) => set("consent", e.target.checked)} required style={{ width: 20, height: 20, margin: 0, flexShrink: 0, accentColor: "#EC5A13" }} />
                <span>Согласен на обработку персональных данных согласно <Link to="/privacy" target="_blank" style={{ color: "#C9450E" }}>политике</Link> (152-ФЗ).</span>
              </label>
            </div>
            <button type="submit" disabled={busy || !form.consent} style={{ ...primaryBtn, height: 54, opacity: busy || !form.consent ? 0.6 : 1 }}>{busy ? "Отправляем…" : "Отправить заявку"}</button>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Новость (/news/:slug) ────────────────────────────────────────────
function MobileNewsPost() {
  const { pathname } = useLocation();
  const slug = decodeURIComponent(pathname.replace(/^\/news\//, ""));
  const nav = useNavigate();
  const post = useNewsPost(slug);
  const d = post.data;
  useHead({ title: d?.title ?? "Новость", description: d?.excerpt ?? undefined, canonical: typeof window !== "undefined" ? `${window.location.origin}/news/${slug}` : undefined });
  // Оттенок героя — стабильный по slug (как цветные карточки ленты).
  const tint = NEWS_TINTS[Math.abs([...slug].reduce((s, c) => s + c.charCodeAt(0), 0)) % NEWS_TINTS.length];
  return (
    <div style={{ height: "100dvh", background: "#FBF3E8", display: "flex", flexDirection: "column", overflow: "hidden", color: INK, fontFamily: "'Onest', system-ui, sans-serif" }}>
      <div className="noscroll" style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ position: "relative", height: 150, background: tint, overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(115deg,rgba(255,255,255,.08) 0 2px,transparent 2px 14px)" }} />
          <button onClick={() => nav("/news")} aria-label="Назад" style={{ ...roundDark, position: "absolute", top: "calc(env(safe-area-inset-top, 0px) + 14px)", left: 16, background: "rgba(20,24,31,.34)" }}>{BackWhite}</button>
          <div style={{ position: "absolute", left: 20, bottom: 14, ...mono, fontSize: 9.5, letterSpacing: ".12em", color: "rgba(255,255,255,.95)", background: "rgba(0,0,0,.24)", padding: "5px 10px", borderRadius: 7 }}>НОВОСТЬ</div>
        </div>
        {post.isLoading && <Loader />}
        {post.isError && <p style={{ padding: 20, ...mono, fontSize: 13, color: "#C9450E" }}>Новость не найдена.</p>}
        {d && (
          <div style={{ padding: "18px 20px 40px" }}>
            <div style={{ ...mono, fontSize: 10, color: "#9B9584" }}>{formatNewsDate(d.published_at)}</div>
            <h1 style={{ ...disp, fontWeight: 700, fontSize: 22, lineHeight: 1.2, margin: "8px 0 0" }}>{d.title}</h1>
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 13 }}>
              {(d.body ?? d.excerpt ?? "").split(/\n{2,}/).filter(Boolean).map((para, i) => (
                <p key={i} style={{ fontSize: 14.5, lineHeight: 1.6, color: "#3a3f49", margin: 0 }}>{para}</p>
              ))}
            </div>
            <a href="https://t.me/pravohse" target="_blank" rel="noopener noreferrer" style={{ marginTop: 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 9, height: 50, borderRadius: 14, background: "#15375E", color: "#FBF3E8", fontWeight: 600, fontSize: 14, textDecoration: "none" }}>Открыть в Telegram · t.me/pravohse</a>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Плеер подкаста (/podcasts?ep=id) ─────────────────────────────────
function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function MobilePodcastPlayer({ epId }: { epId: string }) {
  const nav = useNavigate();
  const q = usePodcasts(token());
  const items: PodcastItem[] = q.data?.items ?? [];
  const idx = items.findIndex((p) => p.id === epId);
  const item = idx >= 0 ? items[idx]! : null;
  useHead({ title: item?.title ?? "Подкаст", noindex: true });
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const posKey = `pod-pos-${epId}`;

  // Смена выпуска — сбрасываем локальный прогресс UI (audio сам перезагрузится по key).
  useEffect(() => { setPlaying(false); setPos(0); setDur(0); }, [epId]);

  if (q.isLoading) return <div style={{ height: "100dvh", background: "#14181F" }}><Loader /></div>;
  if (!item) return (
    <div style={{ height: "100dvh", background: "#14181F", color: "#FBF3E8", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, fontFamily: "'Onest', system-ui, sans-serif" }}>
      <p style={{ ...mono, fontSize: 13 }}>Выпуск не найден</p>
      <button onClick={() => nav("/podcasts")} style={{ ...primaryBtn, flex: "none", padding: "0 26px", height: 48 }}>К списку</button>
    </div>
  );
  const locked = !item.audio_url;
  const goEp = (i: number) => { const t2 = items[i]; if (t2) nav(`/podcasts?ep=${encodeURIComponent(t2.id)}`, { replace: true }); };
  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) { void a.play().catch(() => undefined); } else { a.pause(); }
  };
  const seek = (e: { currentTarget: HTMLDivElement; clientX: number }) => {
    const a = audioRef.current;
    if (!a || !dur) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = Math.max(0, Math.min(dur, ((e.clientX - r.left) / r.width) * dur));
  };
  return (
    <div style={{ height: "100dvh", background: "linear-gradient(180deg,#1a2338 0%,#14181F 60%,#0f131a 100%)", display: "flex", flexDirection: "column", color: "#FBF3E8", overflow: "hidden", fontFamily: "'Onest', system-ui, sans-serif" }}>
      <div style={{ padding: "calc(env(safe-area-inset-top, 0px) + 14px) 16px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button onClick={() => nav("/podcasts")} aria-label="Назад" style={{ ...roundDark, background: "rgba(251,243,232,.12)", backdropFilter: "none", WebkitBackdropFilter: "none" }}>{BackWhite}</button>
        <span style={{ ...mono, fontSize: 10, letterSpacing: ".14em", color: "rgba(251,243,232,.55)" }}>{locked ? "ПО ПОДПИСКЕ" : "СЕЙЧАС ИГРАЕТ"}</span>
        <div style={{ width: 40 }} />
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 30px", minHeight: 0 }}>
        <div style={{ width: 210, height: 210, borderRadius: 28, background: item.cover ? `#11296B url(${item.cover}) center/cover` : "linear-gradient(145deg,#20325c,#11296B)", position: "relative", overflow: "hidden", boxShadow: "0 40px 70px -30px rgba(0,0,0,.8)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {!item.cover && <img src="/assets/themis.jpeg" alt="" style={{ position: "absolute", right: -24, bottom: -24, width: 150, height: 150, objectFit: "cover", opacity: .22, transform: "rotate(8deg)" }} />}
          {!locked && (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 64, position: "relative" }}>
              {["#E3C272", "#EC5A13", "#E3C272", "#EC5A13"].map((c, i) => (
                <span key={i} style={{ width: 7, height: "100%", borderRadius: 9, background: c, transformOrigin: "bottom", animation: playing ? `eq 900ms ease-in-out infinite ${i * 0.15}s` : "none", transform: playing ? undefined : "scaleY(.35)" }} />
              ))}
            </div>
          )}
          {locked && <span style={{ position: "relative", fontSize: 40 }} aria-hidden>🔒</span>}
        </div>
        <div style={{ ...mono, fontSize: 10, letterSpacing: ".1em", color: "#E3C272", marginTop: 28 }}>ВЫПУСК {idx + 1} · ПОДКАСТЫ КЛУБА</div>
        <div style={{ ...disp, fontWeight: 700, fontSize: 20, textAlign: "center", lineHeight: 1.25, marginTop: 12 }}>{item.title}</div>
        {item.description && <div style={{ fontSize: 13.5, color: "rgba(251,243,232,.6)", marginTop: 6, textAlign: "center", maxWidth: 300, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{item.description}</div>}
      </div>
      <div style={{ padding: "0 30px calc(env(safe-area-inset-bottom, 0px) + 34px)" }}>
        {locked ? (
          <button onClick={() => nav("/podcasts")} style={{ ...primaryBtn, width: "100%", flex: "none" }}>Оформить подписку на подкасты</button>
        ) : (
          <>
            <audio key={item.id} ref={audioRef} src={item.audio_url ?? undefined} preload="metadata"
              onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
              onTimeUpdate={(e) => { const a = e.currentTarget; setPos(a.currentTime); try { localStorage.setItem(posKey, String(a.currentTime)); } catch { /* приватный режим */ } }}
              onLoadedMetadata={(e) => { const a = e.currentTarget; setDur(a.duration || 0); const saved = Number(localStorage.getItem(posKey) || 0); if (saved > 5 && saved < (a.duration || Infinity) - 5) a.currentTime = saved; }}
              onEnded={() => { setPlaying(false); try { localStorage.removeItem(posKey); } catch { /* ок */ } }} />
            <div onClick={seek} role="slider" aria-label="Перемотка" aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(pos)} style={{ height: 5, borderRadius: 99, background: "rgba(251,243,232,.16)", overflow: "hidden", cursor: "pointer" }}>
              <div style={{ width: dur ? `${(pos / dur) * 100}%` : "0%", height: "100%", borderRadius: 99, background: "#EC5A13" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", ...mono, fontSize: 10, color: "rgba(251,243,232,.5)", marginTop: 8 }}><span>{fmtTime(pos)}</span><span>{fmtTime(dur)}</span></div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 30, marginTop: 22 }}>
              <button onClick={() => goEp(idx - 1)} disabled={idx <= 0} aria-label="Предыдущий выпуск" style={{ background: "none", border: "none", cursor: "pointer", opacity: idx <= 0 ? .35 : 1 }}><svg width="30" height="30" viewBox="0 0 24 24" fill="#FBF3E8"><path d="M11 6L4 12l7 6zM19 6l-7 6 7 6z" /></svg></button>
              <button onClick={toggle} aria-label={playing ? "Пауза" : "Играть"} style={{ width: 74, height: 74, borderRadius: 99, border: "none", cursor: "pointer", background: "#EC5A13", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 16px 34px -12px rgba(236,90,19,.9)" }}>
                {playing
                  ? <svg width="26" height="26" viewBox="0 0 24 24" fill="#FBF3E8"><rect x="6" y="5" width="4" height="14" rx="1.3" /><rect x="14" y="5" width="4" height="14" rx="1.3" /></svg>
                  : <svg width="28" height="28" viewBox="0 0 24 24" fill="#FBF3E8"><path d="M8 5v14l11-7z" /></svg>}
              </button>
              <button onClick={() => goEp(idx + 1)} disabled={idx >= items.length - 1} aria-label="Следующий выпуск" style={{ background: "none", border: "none", cursor: "pointer", opacity: idx >= items.length - 1 ? .35 : 1 }}><svg width="30" height="30" viewBox="0 0 24 24" fill="#FBF3E8"><path d="M13 6l7 6-7 6zM5 6l7 6-7 6z" /></svg></button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Мерч-карточка (/merch?item=slug) ─────────────────────────────────
function MobileMerchItem({ slug }: { slug: string }) {
  const nav = useNavigate();
  const products = useProducts();
  const { add } = useCartMutations();
  const toast = useToast();
  const m = (products.data ?? []).find((p) => p.slug === slug) ?? null;
  useHead({ title: m?.title ?? "Мерч", description: m?.description ?? undefined });
  const variants: ProductVariant[] = m?.variants_json ?? [];
  const [sku, setSku] = useState<string | null>(null);
  const selected = variants.find((v) => v.sku === sku) ?? null;
  const stock = variants.length ? (selected?.stock ?? null) : (m?.stock ?? null);
  const needsSize = variants.length > 0 && !sku;
  const i = (products.data ?? []).findIndex((p) => p.slug === slug);
  const tint = MERCH_TINTS[(i >= 0 ? i : 0) % MERCH_TINTS.length];
  const buy = () => {
    if (!m) return;
    add.mutate({ type: "merch", ref_id: m.slug, variant_sku: sku, qty: 1 }, {
      onSuccess: () => { toast("Добавлено — оформите заявку"); nav("/cart"); },
      onError: (e) => toast((e as Error).message, "err"),
    });
  };
  return (
    <div style={{ height: "100dvh", background: "#FBF3E8", display: "flex", flexDirection: "column", overflow: "hidden", color: INK, fontFamily: "'Onest', system-ui, sans-serif" }}>
      <div className="noscroll" style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ position: "relative", height: 300, overflow: "hidden", background: m?.images?.[0] ? `#EDE4D2 url(${m.images[0]}) center/cover no-repeat` : tint }}>
          {!m?.images?.[0] && <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(45deg,rgba(255,255,255,.09) 0 9px,transparent 9px 19px)" }} />}
          <button onClick={() => nav("/merch")} aria-label="Назад" style={{ ...roundDark, position: "absolute", top: "calc(env(safe-area-inset-top, 0px) + 14px)", left: 16 }}>{BackWhite}</button>
        </div>
        {products.isLoading && <Loader />}
        {!products.isLoading && !m && <p style={{ padding: 20, ...mono, fontSize: 13, color: "#C9450E" }}>Товар не найден.</p>}
        {m && (
          <div style={{ padding: "20px 20px 30px" }}>
            <div style={{ ...disp, fontWeight: 700, fontSize: 21, lineHeight: 1.2 }}>{m.title}</div>
            <div style={{ ...disp, fontWeight: 800, fontSize: 24, marginTop: 12 }}>{rub(m.price)}</div>
            <div style={{ fontSize: 13.5, color: "#6B7280", lineHeight: 1.55, marginTop: 12 }}>{m.description || "Официальный мерч клуба выпускников факультета права."} На мерч скидка выпускника не распространяется.</div>
            {variants.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ ...mono, fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "#9B9584", marginBottom: 10 }}>Размер</div>
                <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
                  {variants.map((v) => {
                    const on = sku === v.sku;
                    const label = [v.size, v.color].filter(Boolean).join(" · ") || v.sku;
                    return <button key={v.sku} disabled={v.stock <= 0} aria-pressed={on} onClick={() => setSku(v.sku)} style={{ minWidth: 52, height: 48, padding: "0 12px", borderRadius: 13, cursor: "pointer", fontFamily: "'Onest'", fontWeight: 600, fontSize: 15, border: "1.5px solid " + (on ? "#EC5A13" : "#E4DCCC"), background: on ? "rgba(236,90,19,.08)" : "#fff", color: INK, opacity: v.stock <= 0 ? .4 : 1 }}>{label}</button>;
                  })}
                </div>
              </div>
            )}
            {stock != null && <p style={{ ...mono, fontSize: 12, marginTop: 14, color: stock <= 0 ? "#B5331B" : stock <= 3 ? "#C9450E" : "#9B9584" }}>{stock <= 0 ? "Нет в наличии" : stock <= 3 ? `Осталось ${stock} шт.` : `В наличии: ${stock} шт.`}</p>}
          </div>
        )}
      </div>
      {m && (
        <div style={stickyBar}>
          <button onClick={buy} disabled={add.isPending || needsSize || (stock != null && stock <= 0)} style={{ ...primaryBtn, opacity: needsSize || (stock != null && stock <= 0) ? .6 : 1 }}>
            {stock != null && stock <= 0 ? "Нет в наличии" : needsSize ? "Выберите размер" : `Добавить в заявку · ${rub(m.price)}`}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Оверлеи ЛК: достижения / журнал / профиль (/?screen=…) ───────────
/** Экран «сессия недоступна» для приватных оверлеев (истёк/отозван токен). */
function OverlaySignIn() {
  return (
    <div style={{ padding: "60px 34px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
      <div style={{ width: 72, height: 72, borderRadius: 99, background: "#F2E3CF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }} aria-hidden>🔐</div>
      <div style={{ ...disp, fontWeight: 700, fontSize: 17, marginTop: 18 }}>Нужен вход</div>
      <div style={{ fontSize: 13.5, color: "#6B7280", marginTop: 6, lineHeight: 1.5 }}>Сессия истекла или недоступна — войдите, чтобы открыть этот раздел.</div>
      <Link to="/lk" style={{ ...primaryBtn, flex: "none", marginTop: 20, padding: "0 26px", height: 48, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>Войти в кабинет</Link>
    </div>
  );
}

function OverlayHeader({ title, sub, onBack }: { title: string; sub?: string; onBack: () => void }) {
  return (
    <header style={{ ...HEADER, display: "flex", alignItems: "center", gap: 12, padding: "calc(env(safe-area-inset-top, 0px) + 14px) 18px 12px" }}>
      <button onClick={onBack} aria-label="Назад" style={roundLight}>{BackInk}</button>
      <div>
        <div style={{ ...disp, fontWeight: 800, fontSize: 20 }}>{title}</div>
        {sub && <div style={{ ...mono, fontSize: 10, color: "#9B9584", marginTop: 1 }}>{sub}</div>}
      </div>
    </header>
  );
}

function MobileAch() {
  useHead({ title: "Достижения", noindex: true });
  const nav = useNavigate();
  const me = useMe(token());
  const list = me.data?.achievements ?? [];
  const earned = list.filter((a) => a.earned).length;
  return (
    <div style={{ height: "100dvh", background: "#FBF3E8", display: "flex", flexDirection: "column", overflow: "hidden", color: INK, fontFamily: "'Onest', system-ui, sans-serif" }}>
      <OverlayHeader title="Достижения" sub={me.data ? `${earned}/${list.length} · ${me.data.level.points} баллов` : undefined} onBack={() => nav("/")} />
      <div className="noscroll" style={{ flex: 1, overflowY: "auto" }}>
        {me.isLoading && <Loader />}
        {me.isError && <OverlaySignIn />}
        <div style={{ padding: "14px 20px 40px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13 }}>
          {list.map((a) => {
            const active = a.earned || a.star;
            const bg = a.earned ? "linear-gradient(140deg,#2C6E80,#11296B)" : a.star ? "#EC5A13" : "#EDE4D3";
            return (
              <div key={a.key} style={{ ...CARD, borderRadius: 18, padding: "16px 14px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", opacity: active ? 1 : .55 }}>
                <div style={{ width: 56, height: 56, transform: "rotate(45deg)", borderRadius: 15, background: bg, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: a.earned ? "0 10px 22px -10px rgba(17,41,107,.6)" : "none", marginTop: 6 }}>
                  <span style={{ transform: "rotate(-45deg)", fontSize: 20, lineHeight: 1, color: active ? "#FBF3E8" : "#b8a98a" }}>{a.icon}</span>
                </div>
                <div style={{ ...disp, fontWeight: 600, fontSize: 13, marginTop: 16 }}>{a.title}</div>
                <div style={{ fontSize: 11, color: "#6B7280", lineHeight: 1.35, marginTop: 5 }}>{a.description}</div>
                <div style={{ ...mono, fontSize: 9, letterSpacing: ".08em", textTransform: "uppercase", color: a.earned ? "#1F8A5B" : "#9B9584", marginTop: 9 }}>
                  {a.earned ? "Получено" : a.target > 0 ? `${a.current} / ${a.target}` : "Закрыто"}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MobileLedger() {
  useHead({ title: "История баллов", noindex: true });
  const nav = useNavigate();
  const me = useMe(token());
  const ledger = useLedger(token());
  return (
    <div style={{ height: "100dvh", background: "#FBF3E8", display: "flex", flexDirection: "column", overflow: "hidden", color: INK, fontFamily: "'Onest', system-ui, sans-serif" }}>
      <OverlayHeader title="История баллов" sub={me.data ? `Баланс · ${me.data.level.points} баллов` : undefined} onBack={() => nav("/")} />
      <div className="noscroll" style={{ flex: 1, overflowY: "auto" }}>
        {ledger.isLoading && <Loader />}
        {(ledger.isError || me.isError) && <OverlaySignIn />}
        {ledger.data?.length === 0 && <p style={{ padding: 20, ...mono, fontSize: 13, color: "#9B9584" }}>Пока нет начислений.</p>}
        <div style={{ padding: "12px 20px 40px", display: "flex", flexDirection: "column", gap: 10 }}>
          {(ledger.data ?? []).map((l, i) => {
            const plus = l.delta >= 0;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 13, ...CARD, borderRadius: 15, padding: "14px 15px" }}>
                <span style={{ width: 40, height: 40, borderRadius: 12, background: plus ? "rgba(31,138,91,.12)" : "rgba(181,51,27,.1)", color: plus ? "#1F8A5B" : "#B5331B", ...mono, fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{plus ? "+" : ""}{l.delta}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{REASON_RU[l.reason] ?? l.reason}</div>
                  <div style={{ ...mono, fontSize: 10, color: "#9B9584", marginTop: 2 }}>{formatNewsDate(l.created_at)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MobileProfile() {
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

// ── Оболочка ─────────────────────────────────────────────────────────
export default function MobileApp() {
  const { pathname, search } = useLocation();
  const qs = new URLSearchParams(search);
  // Детальные экраны — full-screen без нижней навигации (слайд-оверлеи макета).
  if (pathname.startsWith("/dpo/")) return <MobileProgram />;
  if (pathname.startsWith("/news/")) return <MobileNewsPost />;
  if (pathname === "/cart") return <MobileCart />;
  const ep = pathname === "/podcasts" ? qs.get("ep") : null;
  if (ep) return <MobilePodcastPlayer epId={ep} />;
  const item = pathname === "/merch" ? qs.get("item") : null;
  if (item) return <MobileMerchItem slug={item} />;
  // Приватные оверлеи ЛК — только для вошедшего: гость по прямой ссылке иначе
  // получал пустой тупиковый экран. Без токена показываем обычную «Карту»
  // (для гостя это приглашение войти/вступить).
  const screen = pathname === "/" && token() ? qs.get("screen") : null;
  if (screen === "ach") return <MobileAch />;
  if (screen === "ledger") return <MobileLedger />;
  if (screen === "profile") return <MobileProfile />;
  const active = TABS.some((t) => t.to === pathname) ? pathname : "/";
  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", background: "#FBF3E8", color: INK, fontFamily: "'Onest', system-ui, sans-serif", overflow: "hidden" }}>
      <div className="noscroll" style={{ flex: 1, overflowY: "auto", overflowX: "hidden", WebkitOverflowScrolling: "touch" }}>
        {pathname === "/news" ? <MobileFeed />
          : pathname === "/dpo" ? <MobileDpo />
            : pathname === "/podcasts" ? <MobilePodcasts />
              : pathname === "/merch" ? <MobileMerch />
                : <MobileHome />}
      </div>
      <TabBar active={active} />
    </div>
  );
}
