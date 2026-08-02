import { Link } from "react-router-dom";
import { LEVELS } from "@club/shared";
import { rub } from "../../lib/api.js";
import { token, usePrograms, useMemberDiscount } from "../../lib/cart.js";
import { useMe, useLedger, formatNewsDate } from "../../lib/queries.js";
import { useToast } from "../../components/Toast.js";
import { useHead } from "../../lib/title.js";
import { INK, disp, mono, CARD, HEADER, REASON_RU } from "../theme.js";
import { Loader, QuickAction } from "../ui.js";

export function MobileHome() {
  useHead({ title: null, description: "Личный кабинет выпускника факультета права НИУ ВШЭ: карта, баллы, скидка на ДПО." });
  const t = token();
  const me = useMe(t);
  const ledger = useLedger(t);
  const programs = usePrograms();
  const discount = useMemberDiscount();
  const toast = useToast();

  // Гость или недоступная сессия – приглашение (/me отдаётся только верифицированному
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
              <span style={{ ...mono, fontSize: 10, letterSpacing: ".16em", color: "rgba(251,243,232,.55)" }}>ВЫПУСК {m.alumni.cohort ?? "–"}</span>
            </div>
            <div style={{ ...disp, fontWeight: 700, fontSize: 23, letterSpacing: "-.01em", marginTop: 28 }}>{m.alumni.fio ?? "Выпускник"}</div>
            <div style={{ ...mono, fontSize: 11, letterSpacing: ".1em", color: "rgba(251,243,232,.55)", marginTop: 5 }}>№ {m.alumni.referral_code ?? "–"}</div>
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

      {/* Последнее – история баллов */}
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

function GuestHome() {
  useHead({ title: null });
  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 30px", textAlign: "center" }}>
        <img src="/assets/themis.jpeg" alt="" width={76} height={76} style={{ borderRadius: 20, objectFit: "cover", boxShadow: "0 14px 30px -12px rgba(236,90,19,.7)" }} />
        <h1 style={{ ...disp, fontWeight: 800, fontSize: 26, letterSpacing: "-.02em", margin: "22px 0 0" }}>Клуб выпускников</h1>
        <div style={{ ...mono, fontSize: 10, letterSpacing: ".14em", color: "#9B9584", marginTop: 6 }}>ФАКУЛЬТЕТ ПРАВА · ВЫШКА</div>
        <p style={{ fontSize: 15, color: "#6B7280", lineHeight: 1.55, marginTop: 18, maxWidth: 300 }}>
          Войдите, чтобы открыть карту выпускника – баллы, уровень и скидку на программы ДПО.
        </p>
        <Link to="/lk" style={{ marginTop: 24, width: "100%", maxWidth: 300, height: 52, borderRadius: 15, background: "#EC5A13", color: "#FBF3E8", ...disp, fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", boxShadow: "0 14px 28px -14px rgba(236,90,19,.85)" }}>Войти в кабинет</Link>
        <Link to="/join" style={{ marginTop: 12, width: "100%", maxWidth: 300, height: 52, borderRadius: 15, border: "1.5px solid #14181F", color: INK, fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", background: "#fff" }}>Вступить в клуб</Link>
        <div style={{ ...mono, fontSize: 11, color: "#9B9584", marginTop: 20 }}>Витрины ниже открыты всем →</div>
      </div>
    </div>
  );
}
