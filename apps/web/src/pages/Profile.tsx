import { useEffect, useId, useState, type CSSProperties } from "react";
import { Link, Navigate } from "react-router-dom";
import { LEVELS, LEGAL_INTERESTS, MAX_INTERESTS } from "@club/shared";
import { apiPatch, type Achievement, type LedgerEntry } from "../lib/api.js";
import { useMe, useLedger } from "../lib/queries.js";

/** Профиль выпускника – порт «Профиль.dc.html» (C). Контакты + история баллов + правила достижений. */

const TOKEN_KEY = "club_token";
const mono: CSSProperties = { fontFamily: "'Martian Mono', monospace" };
const disp: CSSProperties = { fontFamily: "'Unbounded', sans-serif" };
const surface: CSSProperties = { background: "#fff", border: "1px solid #E5E7EB", borderRadius: 22 };

const REASON_TEXT: Record<string, string> = {
  program: "Пройдена программа ДПО", event: "Участие в событии клуба", referral: "Приглашённый выпускник",
  mentorship: "Менторство младшего потока", order: "Заказ", decay: "Списание за неактивность",
  manual: "Начисление учебным офисом", achievement: "Достижение",
};
const CONTACT_FIELDS: { key: string; label: string; ph: string }[] = [
  { key: "phone", label: "Телефон", ph: "+7 ___ ___-__-__" },
  { key: "email", label: "Email", ph: "you@mail.ru" },
  { key: "telegram", label: "Telegram", ph: "@username" },
  { key: "vk", label: "ВКонтакте", ph: "vk.com/username" },
  { key: "max", label: "Макс", ph: "max.ru/username" },
];

export default function Profile() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return <Navigate to="/lk" replace />;
  return <ProfileBody token={token} />;
}

function ProfileBody({ token }: { token: string }) {
  const me = useMe(token);
  const ledger = useLedger(token);
  const [fio, setFio] = useState("");
  const [contacts, setContacts] = useState<Record<string, string>>({});
  const [interests, setInterests] = useState<string[]>([]);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [saveErr, setSaveErr] = useState<string | null>(null);

  useEffect(() => {
    if (me.data) {
      setFio(me.data.alumni.fio ?? "");
      setContacts(me.data.alumni.contacts ?? {});
      setInterests(me.data.alumni.interests ?? []);
    }
  }, [me.data]);

  const toggleInterest = (name: string) =>
    setInterests((cur) => cur.includes(name) ? cur.filter((x) => x !== name) : cur.length >= MAX_INTERESTS ? cur : [...cur, name]);

  const logout = () => { localStorage.removeItem(TOKEN_KEY); window.location.assign("/lk"); };
  const save = async () => {
    setSaveState("saving");
    setSaveErr(null);
    try {
      await apiPatch("/me/profile", { fio: fio.trim() || undefined, contacts, interests }, token);
      setSaveState("saved");
      me.refetch(); // данные профиля сразу свежие на всех экранах
      setTimeout(() => setSaveState("idle"), 2000);
    } catch (e) {
      setSaveErr((e as Error).message || "Не удалось сохранить");
      setSaveState("idle");
    }
  };

  const data = me.data;
  const idx = data ? LEVELS.findIndex((l) => l.key === data.level.level) : 0;

  return (
    <div style={{ background: "#FBF3E8", color: "#14181F", minHeight: "100vh", fontFamily: "'Onest', system-ui, sans-serif" }}>
      <header style={{ background: "#14181F", color: "#FBF3E8", position: "sticky", top: 0, zIndex: 50, borderBottom: "1px solid rgba(251,243,232,.08)" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20 }}>
          <Link to="/" className="foc" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none", color: "inherit" }}>
            <img src="/assets/themis.jpeg" alt="Логотип" width={38} height={38} style={{ borderRadius: 9, objectFit: "cover" }} />
            <div style={{ ...disp, fontWeight: 800, fontSize: 15, letterSpacing: "-0.01em" }}>Личный кабинет</div>
          </Link>
          <nav style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Link to="/lk" className="foc" style={{ textDecoration: "none", color: "#c8cdd6", fontWeight: 500, fontSize: 14, padding: "8px 14px", borderRadius: 10 }}>Обзор</Link>
            <span style={{ color: "#FBF3E8", fontWeight: 600, fontSize: 14, padding: "8px 14px", borderRadius: 10, background: "rgba(236,90,19,.16)" }}>Профиль</span>
            <button onClick={logout} className="foc" style={{ ...mono, fontSize: 13, color: "#FBF3E8", background: "rgba(251,243,232,.08)", border: "1px solid rgba(251,243,232,.14)", borderRadius: 10, padding: "8px 13px", cursor: "pointer" }}>Выйти</button>
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "32px 28px 80px" }}>
        {me.isLoading && <p style={{ ...mono, fontSize: 13, color: "#6B7280" }}>Загрузка профиля…</p>}
        {me.isError && (
          <div style={{ ...surface, padding: 28 }}>
            <p style={{ color: "#B5331B", ...mono, fontSize: 13 }}>Сессия истекла.</p>
            <button onClick={logout} className="foc" style={{ marginTop: 12, ...mono, fontSize: 13, border: "1.5px solid #E5E7EB", borderRadius: 10, padding: "8px 13px", cursor: "pointer" }}>Войти заново</button>
          </div>
        )}

        {data && (
          <>
            {/* PROFILE HEADER */}
            <div style={{ ...surface, display: "flex", alignItems: "center", gap: 24, padding: "26px 28px", flexWrap: "wrap", boxShadow: "0 18px 40px -30px rgba(20,24,31,.35)" }}>
              <div style={{ width: 88, height: 88, borderRadius: 22, flex: "none", background: "linear-gradient(135deg,#EC5A13,#B5331B)", display: "flex", alignItems: "center", justifyContent: "center", ...disp, fontWeight: 800, fontSize: 38, color: "#FBF3E8", boxShadow: "0 12px 26px -12px rgba(201,69,14,.7)" }}>{(data.alumni.fio?.trim()?.[0] ?? "В").toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ ...disp, fontWeight: 600, fontSize: 27, letterSpacing: "-0.01em", lineHeight: 1.1 }}>{data.alumni.fio ?? "Выпускник"}</div>
                <div style={{ ...mono, fontSize: 13, color: "#6B7280", marginTop: 8 }}>Выпуск {data.alumni.cohort ?? "–"}{data.alumni.edu_program ? ` · ${data.alumni.edu_level ?? "магистратура"} · ОП «${data.alumni.edu_program}»` : " · факультет права"}</div>
                <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 14 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600, padding: "6px 13px", borderRadius: 999, background: "rgba(196,154,69,.16)", color: "#a07d2e", border: "1px solid rgba(196,154,69,.5)" }}><span style={{ width: 16, height: 16, borderRadius: "50%", background: "#C49A45", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>✓</span>Подтверждён</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, padding: "6px 13px", borderRadius: 999, background: "rgba(17,41,107,.1)", color: "#11296B" }}>Уровень {idx + 1} · {data.level.level_title}</span>
                </div>
              </div>
              <div style={{ textAlign: "center", padding: "0 6px" }}>
                <div style={{ ...disp, fontWeight: 800, fontSize: 40, lineHeight: 1, letterSpacing: "-0.02em", color: "#EC5A13" }}>{data.level.points}</div>
                <div style={{ ...mono, fontSize: 11, color: "#6B7280", marginTop: 8 }}>баллов всего</div>
              </div>
            </div>

            {/* CONTACTS + HISTORY */}
            <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22, marginTop: 22 }}>
              {/* CONTACTS */}
              <div style={{ ...surface, padding: "26px 28px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ ...disp, fontWeight: 600, fontSize: 20, letterSpacing: "-0.01em" }}>Контакты</div>
                  {saveState === "saved" && <span style={{ ...mono, fontSize: 11, color: "#1F8A5B" }}>сохранено ✓</span>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 20 }}>
                  <Field label="ФИО" value={fio} onChange={setFio} ph="Имя Фамилия" />
                  {CONTACT_FIELDS.map((f) => (
                    <Field key={f.key} label={f.label} value={contacts[f.key] ?? ""} onChange={(v) => setContacts((c) => ({ ...c, [f.key]: v }))} ph={f.ph} />
                  ))}
                  {/* ИНТЕРЕСЫ В ЮРИСПРУДЕНЦИИ */}
                  <div>
                    <div style={{ ...mono, fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "#6B7280" }}>Интересы в юриспруденции <span style={{ textTransform: "none" }}>· до {MAX_INTERESTS}</span></div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                      {LEGAL_INTERESTS.map((name) => {
                        const on = interests.includes(name);
                        return (
                          <button key={name} type="button" onClick={() => toggleInterest(name)} aria-pressed={on} className="foc"
                            style={{ fontSize: 12.5, fontWeight: 500, padding: "7px 12px", borderRadius: 999, cursor: "pointer", border: "1.5px solid " + (on ? "#EC5A13" : "#E5E7EB"), background: on ? "rgba(236,90,19,.12)" : "#fff", color: on ? "#C9450E" : "#14181F" }}>
                            {name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <p style={{ fontSize: 12, lineHeight: 1.5, color: "#6B7280", margin: 0 }}>
                    Сохраняя, вы даёте согласие на обработку персональных данных —{" "}
                    <a href="/privacy" target="_blank" className="foc" style={{ color: "#C9450E", textDecoration: "underline", textUnderlineOffset: 2 }}>политика обработки</a>.
                  </p>
                  {saveErr && <p style={{ ...mono, fontSize: 12, color: "#B5331B", margin: 0 }}>{saveErr}</p>}
                  <button onClick={save} disabled={saveState === "saving"} className="foc" style={{ width: "100%", fontWeight: 600, fontSize: 15, padding: 13, borderRadius: 12, border: "none", background: "#EC5A13", color: "#FBF3E8", cursor: "pointer" }}>
                    {saveState === "saving" ? "Сохраняем…" : "Сохранить"}
                  </button>
                </div>
              </div>

              {/* HISTORY */}
              <div style={{ ...surface, padding: "26px 28px" }}>
                <div style={{ ...disp, fontWeight: 600, fontSize: 20, letterSpacing: "-0.01em" }}>История баллов</div>
                <div style={{ display: "flex", flexDirection: "column", marginTop: 18 }}>
                  {ledger.isLoading && <p style={{ ...mono, fontSize: 12, color: "#6B7280" }}>Загрузка…</p>}
                  {ledger.data?.length === 0 && <p style={{ ...mono, fontSize: 12, color: "#6B7280" }}>Пока нет начислений.</p>}
                  {ledger.data?.map((p: LedgerEntry) => (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 0", borderBottom: "1px solid #f0ece2" }}>
                      <span style={{ ...mono, fontSize: 11, color: "#6B7280", width: 54, flex: "none" }}>{fmtShort(p.created_at)}</span>
                      <span style={{ flex: 1, fontSize: 14, color: "#3a3f49", lineHeight: 1.35 }}>{p.comment || REASON_TEXT[p.reason] || p.reason}</span>
                      <span style={{ ...mono, fontSize: 14, fontWeight: 500, color: p.delta >= 0 ? "#1F8A5B" : "#B5331B", whiteSpace: "nowrap" }}>{p.delta >= 0 ? "+" : ""}{p.delta}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ACHIEVEMENT RULES */}
            <div style={{ marginTop: 44 }}>
              <div style={{ ...mono, fontSize: 12, letterSpacing: ".16em", color: "#EC5A13", textTransform: "uppercase" }}>Достижения</div>
              <h2 style={{ ...disp, fontWeight: 600, fontSize: 26, letterSpacing: "-0.01em", margin: "10px 0 4px" }}>Правила и прогресс</h2>
              <p style={{ color: "#6B7280", fontSize: 15, margin: "0 0 22px" }}>{data.achievements.filter((a) => a.earned).length} из {data.achievements.length} открыто · достижения отражают вашу активность в клубе.</p>
              <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
                {data.achievements.map((b: Achievement) => {
                  const inProg = !b.earned && b.current > 0;
                  const star = !b.earned && b.star;
                  const statusColor = b.earned ? "#1F8A5B" : inProg ? "#EC5A13" : "#6B7280";
                  const badgeBg = b.earned ? "linear-gradient(140deg,#2C6E80,#11296B)" : star ? "#EC5A13" : "#F2E3CF";
                  const badgeInk = b.earned || star ? "#FBF3E8" : "#b8a98a";
                  return (
                  <div key={b.key} style={{ display: "flex", gap: 18, ...surface, borderRadius: 18, padding: 22, opacity: b.earned || star ? 1 : inProg ? 0.85 : 0.55 }}>
                    <div style={{ width: 52, height: 52, borderRadius: 15, transform: "rotate(45deg)", flex: "none", background: badgeBg, boxShadow: b.earned ? "0 10px 24px -12px rgba(17,41,107,.65)" : star ? "0 0 0 4px rgba(236,90,19,.18), 0 12px 26px -12px rgba(236,90,19,.7)" : "inset 0 0 0 1px #E5E7EB", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ transform: "rotate(-45deg)", ...disp, fontWeight: 800, fontSize: b.icon.length > 1 ? 13 : 17, color: badgeInk }}>{b.icon}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ ...disp, fontWeight: 600, fontSize: 16, letterSpacing: "-0.01em" }}>{b.title}</div>
                        <span style={{ ...mono, fontSize: 10, letterSpacing: ".04em", color: statusColor, whiteSpace: "nowrap" }}>{b.earned ? "ПОЛУЧЕНО" : inProg ? `${b.current} / ${b.target}` : "ЗАКРЫТО"}</span>
                      </div>
                      <p style={{ fontSize: 13, lineHeight: 1.5, color: "#6B7280", margin: "8px 0 0" }}>{b.description}</p>
                      <div style={{ height: 8, borderRadius: 999, background: "#F2E3CF", overflow: "hidden", marginTop: 12 }}>
                        <div style={{ height: "100%", borderRadius: 999, background: "linear-gradient(90deg,#EC5A13,#C9450E)", width: `${b.earned ? 100 : b.target ? Math.round((b.current / b.target) * 100) : 0}%` }} />
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Field({ label, value, onChange, ph }: { label: string; value: string; onChange: (v: string) => void; ph: string }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 7 }}>{label}</label>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={ph} className="foc" style={{ width: "100%", fontSize: 15, padding: "12px 14px", borderRadius: 11, border: "1.5px solid #E5E7EB", background: "#FBF3E8", outline: "none" }} />
    </div>
  );
}

function fmtShort(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
  } catch {
    return "";
  }
}
