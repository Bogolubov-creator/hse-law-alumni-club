import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { LEVELS } from "@club/shared";
import { rub, type Program, type Product } from "../lib/api.js";
import { token, usePrograms, useProducts, useCart, useMemberDiscount, useCartMutations } from "../lib/cart.js";
import { useMe, useLedger, useNewsList, usePodcasts, formatNewsDate } from "../lib/queries.js";
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
        <Link to="/lk/profile" aria-label="Профиль" style={{ width: 40, height: 40, borderRadius: 12, border: "1px solid #ECE6DA", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
        </Link>
      </header>

      <div style={{ padding: "16px 20px 2px" }}>
        <div style={{ fontSize: 15, color: "#6B7280" }}>Добрый день,</div>
        <div style={{ ...disp, fontWeight: 800, fontSize: 30, letterSpacing: "-.02em", marginTop: 1 }}>{first}</div>
      </div>

      {/* Карта выпускника */}
      <div style={{ padding: "14px 20px 2px" }}>
        <Link to="/lk/profile" style={{ display: "block", borderRadius: 24, position: "relative", overflow: "hidden", background: "linear-gradient(152deg,#1e2942 0%,#14181F 54%,#0f1c3f 100%)", boxShadow: "0 28px 52px -28px rgba(17,41,107,.95)", textDecoration: "none" }}>
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
            <Link to="/lk/profile" style={{ ...mono, fontSize: 11, color: "#C9450E" }}>Все →</Link>
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
        <QuickAction to="/lk/profile" label="История баллов" tint="rgba(236,90,19,.12)" stroke="#C9450E" icon={<><path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 5-6" /></>} />
        <QuickAction onClick={() => { void navigator.clipboard?.writeText(`${window.location.origin}/join?ref=${m.alumni.referral_code ?? ""}`); toast("Ссылка приглашения скопирована ✓"); }} label="Пригласить друга" tint="rgba(44,110,128,.12)" stroke="#2C6E80" icon={<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M17 3.13a4 4 0 0 1 0 7.75" /></>} />
        <QuickAction to="/dpo" label="Программы ДПО" tint="rgba(17,41,107,.1)" stroke="#11296B" icon={<><path d="M3 8l9-4 9 4-9 4-9-4z" /><path d="M7 10.5V15c0 1 2.2 2.2 5 2.2s5-1.2 5-2.2v-4.5" /></>} />
        <QuickAction to="/lk/profile" label="Профиль" tint="rgba(196,154,69,.16)" stroke="#B78A2E" icon={<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>} />
      </div>

      {/* Последнее — история баллов */}
      {ledger.data && ledger.data.length > 0 && (
        <div style={{ padding: "16px 20px 2px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 10 }}>
            <span style={{ ...mono, fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "#9B9584" }}>Последнее</span>
            <Link to="/lk/profile" style={{ ...mono, fontSize: 11, color: "#C9450E" }}>Вся история →</Link>
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
        <div style={{ ...disp, fontWeight: 800, fontSize: 26, letterSpacing: "-.02em", marginTop: 22 }}>Клуб выпускников</div>
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
        <div style={{ ...disp, fontWeight: 800, fontSize: 27, letterSpacing: "-.02em" }}>{title}</div>
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
        <div style={{ ...disp, fontWeight: 800, fontSize: 27, letterSpacing: "-.02em" }}>Программы ДПО</div>
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
          <Link key={p.id} to="/podcasts" style={{ display: "flex", alignItems: "center", gap: 14, ...CARD, borderRadius: 18, padding: "13px 14px", boxShadow: "0 14px 30px -28px rgba(20,24,31,.5)", textDecoration: "none", color: INK }}>
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
            <Link to="/merch" aria-label={m.title} style={{ display: "block" }}>
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

// ── Оболочка ─────────────────────────────────────────────────────────
export default function MobileApp() {
  const { pathname } = useLocation();
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
