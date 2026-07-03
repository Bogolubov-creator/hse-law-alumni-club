import { useEffect, useId, useState, type CSSProperties, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { LEVELS, loginResponseSchema } from "@club/shared";
import { apiPost, isAuthError, rub, type LoginResponse, type AlumniBrief, type Achievement, type MyOrder } from "../lib/api.js";
import { useMe, useMyOrders, useClassmates, useAddFriend } from "../lib/queries.js";
import type { Classmate } from "@club/shared";
import Modal from "../components/Modal.js";

const ORDER_STATUS_RU: Record<string, string> = { new: "Новая", in_progress: "В работе", confirmed: "Подтверждена", done: "Готово", canceled: "Отменена" };

/**
 * Личный кабинет – порт «Дашборд ЛК.dc.html» (B), данные из /api/me.
 * Логин выпускника → JWT-сессия apps/api. ЛК активен только после верификации.
 */

const TOKEN_KEY = "club_token";
const mono: CSSProperties = { fontFamily: "'Martian Mono', monospace" };
const disp: CSSProperties = { fontFamily: "'Unbounded', sans-serif" };
const surface: CSSProperties = { background: "#fff", border: "1px solid #E5E7EB", borderRadius: 22 };

export default function Lk() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [pending, setPending] = useState<AlumniBrief | null>(null);

  const onAuthed = (resp: LoginResponse) => {
    if (resp.alumni.verification_status === "verified") {
      localStorage.setItem(TOKEN_KEY, resp.token);
      setToken(resp.token);
    } else {
      setPending(resp.alumni);
    }
  };
  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setPending(null);
  };

  if (pending) return <PendingScreen alumni={pending} onBack={() => setPending(null)} />;
  if (!token) return <Gate onAuthed={onAuthed} />;
  return <Dashboard token={token} onLogout={logout} />;
}

function Gate({ onAuthed }: { onAuthed: (r: LoginResponse) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const emailId = useId();
  const passId = useId();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      onAuthed(await apiPost<LoginResponse>("/auth/login", { email, password }, loginResponseSchema));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-kost px-6">
      <form onSubmit={submit} className="w-full max-w-[420px] rounded-[22px] border border-[#E5E7EB] bg-white p-8 shadow-sm">
        <Link to="/" className="foc font-mono text-xs text-ohra-deep">← На главную</Link>
        <p className="mt-5 font-mono text-xs uppercase tracking-[0.16em] text-ohra">Личный кабинет</p>
        <h1 className="mt-2 font-display text-2xl font-bold">Вход для выпускников</h1>
        <p className="mt-2 text-sm text-grafit-soft">Доступ открывается после верификации учебным офисом.</p>
        <label htmlFor={emailId} className="mt-5 block font-mono text-[11px] uppercase tracking-wide text-grafit-soft">Почта</label>
        <input id={emailId} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="foc mt-1.5 w-full rounded-soft border-[1.5px] border-[#E5E7EB] px-3.5 py-3 text-[15px] outline-none focus:border-ohra" placeholder="you@edu.hse.ru" />
        <label htmlFor={passId} className="mt-4 block font-mono text-[11px] uppercase tracking-wide text-grafit-soft">Пароль</label>
        <input id={passId} type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="foc mt-1.5 w-full rounded-soft border-[1.5px] border-[#E5E7EB] px-3.5 py-3 text-[15px] outline-none focus:border-ohra" />
        {err && <p className="mt-3 font-mono text-xs text-karmin">{err}</p>}
        <button type="submit" disabled={busy} className="foc mt-5 w-full rounded-[12px] bg-ohra py-3 font-semibold text-kost disabled:opacity-60">
          {busy ? "Входим…" : "Войти в кабинет"}
        </button>
        <p className="mt-3 text-[12px] leading-relaxed text-grafit-soft">
          Входя в кабинет, вы подтверждаете согласие с{" "}
          <Link to="/privacy" target="_blank" className="foc underline underline-offset-2">политикой обработки персональных данных</Link>.
        </p>
      </form>
    </main>
  );
}

function PendingScreen({ alumni, onBack }: { alumni: AlumniBrief; onBack: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-kost px-6">
      <div className="w-full max-w-[420px] rounded-[22px] border border-[#E5E7EB] bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-latun/20 font-display text-2xl text-[#a07d2e]">⏳</div>
        <h1 className="mt-4 font-display text-xl font-bold">Ожидает верификации</h1>
        <p className="mt-2 text-sm text-grafit-soft">
          {alumni.fio ?? "Выпускник"}, ваш выпуск ещё подтверждается учебным офисом. Кабинет активируется после сверки с реестром.
        </p>
        <button onClick={onBack} className="foc mt-5 w-full rounded-[12px] border-[1.5px] border-[#E5E7EB] py-3 font-semibold">Назад</button>
      </div>
    </main>
  );
}

function Dashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const me = useMe(token);
  const [sel, setSel] = useState<Achievement | null>(null);

  // Истёкшая/битая сессия (401) — не тупик с ошибкой, а возврат к окну логина.
  useEffect(() => {
    if (me.isError && isAuthError(me.error)) onLogout();
  }, [me.isError, me.error, onLogout]);

  const vars: CSSProperties = { background: "#FBF3E8", color: "#14181F", minHeight: "100vh", fontFamily: "'Onest', system-ui, sans-serif" };

  return (
    <div style={vars}>
      {/* DARK HEADER */}
      <header style={{ background: "#14181F", color: "#FBF3E8", position: "sticky", top: 0, zIndex: 50, borderBottom: "1px solid rgba(251,243,232,.08)" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20 }}>
          <Link to="/" className="foc" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none", color: "inherit" }}>
            <img src="/assets/themis.jpeg" alt="Логотип" width={38} height={38} style={{ borderRadius: 9, objectFit: "cover" }} />
            <div style={{ ...disp, fontWeight: 800, fontSize: 15, letterSpacing: "-0.01em" }}>Личный кабинет</div>
          </Link>
          <nav style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#FBF3E8", fontWeight: 600, fontSize: 14, padding: "8px 14px", borderRadius: 10, background: "rgba(236,90,19,.16)" }}>Обзор</span>
            <Link to="/lk/profile" className="foc" style={{ textDecoration: "none", color: "#c8cdd6", fontWeight: 500, fontSize: 14, padding: "8px 14px", borderRadius: 10 }}>Профиль</Link>
            <Link to="/dpo" className="foc" style={{ textDecoration: "none", color: "#c8cdd6", fontWeight: 500, fontSize: 14, padding: "8px 14px", borderRadius: 10 }}>Витрины</Link>
            <button onClick={onLogout} className="foc" style={{ ...mono, fontSize: 13, color: "#FBF3E8", background: "rgba(251,243,232,.08)", border: "1px solid rgba(251,243,232,.14)", borderRadius: 10, padding: "8px 13px", cursor: "pointer" }}>Выйти</button>
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "32px 28px 80px" }}>
        {me.isLoading && <p style={{ ...mono, fontSize: 13, color: "#6B7280" }}>Загрузка кабинета…</p>}
        {me.isError && (
          <div style={{ ...surface, padding: 28 }}>
            <p style={{ color: "#B5331B", ...mono, fontSize: 13 }}>Сессия истекла или недоступна.</p>
            <button onClick={onLogout} className="foc" style={{ marginTop: 12, ...mono, fontSize: 13, border: "1.5px solid #E5E7EB", borderRadius: 10, padding: "8px 13px", cursor: "pointer" }}>Войти заново</button>
          </div>
        )}
        {me.data && <DashboardBody me={me.data} token={token} onBadge={setSel} />}
      </main>

      {sel && (
        <Modal onClose={() => setSel(null)} labelledBy="badge-modal-title" maxWidth={430}>
          <div style={{ position: "relative", ...surface, padding: "32px 32px 28px", boxShadow: "0 40px 90px -30px rgba(0,0,0,.6)", animation: "g-pop .28s cubic-bezier(.2,.8,.2,1)" }}>
            <button onClick={() => setSel(null)} aria-label="Закрыть" className="foc" style={{ position: "absolute", top: 16, right: 16, width: 34, height: 34, borderRadius: 10, border: "1px solid #E5E7EB", background: "transparent", color: "#6B7280", cursor: "pointer" }}>✕</button>
            <BadgeSquare a={sel} size={64} />
            <div style={{ ...mono, fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: achColor(sel), marginTop: 22 }}>{achStatus(sel)}</div>
            <div id="badge-modal-title" style={{ ...disp, fontWeight: 600, fontSize: 24, letterSpacing: "-0.01em", marginTop: 8 }}>{sel.title}</div>
            <p style={{ color: "#6B7280", fontSize: 15, lineHeight: 1.55, margin: "12px 0 0" }}>{sel.description}</p>
            {!sel.earned && sel.target > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", ...mono, fontSize: 12, color: "#6B7280" }}>
                  <span>Прогресс · {sel.kind}</span><span>{sel.current} / {sel.target}</span>
                </div>
                <div style={{ height: 10, borderRadius: 999, background: "#F2E3CF", overflow: "hidden", marginTop: 8 }}>
                  <div style={{ height: "100%", borderRadius: 999, background: "linear-gradient(90deg,#EC5A13,#C9450E)", width: `${Math.round((sel.current / sel.target) * 100)}%` }} />
                </div>
                <p style={{ ...mono, fontSize: 12, color: "#6B7280", margin: "10px 0 0" }}>Осталось ещё {Math.max(0, sel.target - sel.current)} — и достижение ваше.</p>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

function DashboardBody({ me, token, onBadge }: { me: import("../lib/api.js").Me; token: string; onBadge: (a: Achievement) => void }) {
  const orders = useMyOrders(token);
  const cur = LEVELS.find((l) => l.key === me.level.level) ?? LEVELS[0]!;
  const idx = LEVELS.findIndex((l) => l.key === cur.key);
  const next = LEVELS[idx + 1] ?? null;
  const prog = next ? Math.min(1, Math.max(0, (me.level.points - cur.min_points) / (next.min_points - cur.min_points))) : 1;
  const deg = Math.round(prog * 360);
  const initial = (me.alumni.fio?.trim()?.[0] ?? "В").toUpperCase();
  const doneCount = me.achievements.filter((a) => a.earned).length;
  const maxAct = Math.max(1, ...me.activity.map((a) => a.points));

  return (
    <>
      {/* PROFILE CARD */}
      <div style={{ ...surface, display: "flex", alignItems: "center", gap: 28, padding: "28px 30px", flexWrap: "wrap", boxShadow: "0 18px 40px -28px rgba(20,24,31,.35)" }}>
        <div style={{ width: 84, height: 84, borderRadius: 22, flex: "none", background: "linear-gradient(135deg,#EC5A13,#B5331B)", display: "flex", alignItems: "center", justifyContent: "center", ...disp, fontWeight: 800, fontSize: 38, color: "#FBF3E8", boxShadow: "0 12px 26px -12px rgba(201,69,14,.7)" }}>{initial}</div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ ...disp, fontWeight: 600, fontSize: 27, letterSpacing: "-0.01em", lineHeight: 1.1 }}>{me.alumni.fio ?? "Выпускник"}</div>
          <div style={{ ...mono, fontSize: 13, color: "#6B7280", marginTop: 8 }}>Выпуск {me.alumni.cohort ?? "–"}{me.alumni.edu_program ? ` · ${me.alumni.edu_level ?? "магистратура"} · ОП «${me.alumni.edu_program}»` : " · факультет права"}</div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 14, fontSize: 13, fontWeight: 600, padding: "6px 13px", borderRadius: 999, background: "rgba(196,154,69,.16)", color: "#a07d2e", border: "1px solid rgba(196,154,69,.5)" }}>
            <span style={{ width: 16, height: 16, borderRadius: "50%", background: "#C49A45", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>✓</span>Подтверждён
          </div>
        </div>
        <div style={{ width: 1, alignSelf: "stretch", background: "#E5E7EB" }} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div style={{ position: "relative", width: 118, height: 118, flex: "none" }}>
            <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: `conic-gradient(from -90deg, #EC5A13 0deg, #C9450E ${deg}deg, #E5E7EB ${deg}deg 360deg)` }} />
            <div style={{ position: "absolute", inset: 11, borderRadius: "50%", background: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div style={{ ...disp, fontWeight: 800, fontSize: 36, lineHeight: 1, letterSpacing: "-0.02em" }}>{idx + 1}</div>
              <div style={{ ...mono, fontSize: 9, color: "#6B7280", marginTop: 3, letterSpacing: ".1em" }}>УРОВЕНЬ</div>
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ ...disp, fontWeight: 600, fontSize: 14 }}>{me.level.level_title}</div>
            <div style={{ ...mono, fontSize: 11, color: "#6B7280", marginTop: 4 }}>
              {next ? `+${me.level.to_next} баллов до «${next.title}»` : "максимальный уровень"}
            </div>
          </div>
        </div>
        <div style={{ width: 1, alignSelf: "stretch", background: "#E5E7EB" }} />
        <div style={{ textAlign: "center", padding: "0 6px" }}>
          <div style={{ ...disp, fontWeight: 800, fontSize: 46, lineHeight: 1, letterSpacing: "-0.02em", color: "#EC5A13" }}>−{me.level.discount}%</div>
          <div style={{ ...mono, fontSize: 11, color: "#6B7280", marginTop: 10, lineHeight: 1.4 }}>скидка<br />выпускника</div>
        </div>
      </div>

      {/* ACTIVITY + ACHIEVEMENTS */}
      <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1.45fr 1fr", gap: 22, marginTop: 22 }}>
        <div style={{ ...surface, padding: "26px 28px", boxShadow: "0 18px 40px -30px rgba(20,24,31,.3)" }}>
          <div style={{ ...disp, fontWeight: 600, fontSize: 20, letterSpacing: "-0.01em" }}>Динамика активности</div>
          <div style={{ ...mono, fontSize: 12, color: "#6B7280", marginTop: 6 }}>баллы за участие · 6 месяцев</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 188, marginTop: 26 }}>
            {me.activity.map((m, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                <div style={{ width: "100%", maxWidth: 44, height: `${Math.max(4, Math.round((m.points / maxAct) * 100))}%`, borderRadius: "8px 8px 3px 3px", background: m.points > 0 ? "linear-gradient(180deg,#EC5A13,#C9450E)" : "#E5E7EB" }} />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
            {me.activity.map((m, i) => (
              <div key={i} style={{ flex: 1, textAlign: "center", ...mono, fontSize: 11, color: "#6B7280" }}>{m.month}</div>
            ))}
          </div>
        </div>

        <div style={{ ...surface, padding: "26px 28px", boxShadow: "0 18px 40px -30px rgba(20,24,31,.3)" }}>
          <div style={{ ...disp, fontWeight: 600, fontSize: 20, letterSpacing: "-0.01em" }}>Достижения</div>
          <div style={{ ...mono, fontSize: 12, color: "#6B7280", marginTop: 6 }}>{doneCount} из {me.achievements.length} открыто</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "18px 10px", marginTop: 24 }}>
            {me.achievements.map((a) => (
              <button key={a.key} onClick={() => onBadge(a)} className="foc" style={{ textAlign: "center", opacity: a.earned || a.star ? 1 : achInProgress(a) ? 0.85 : 0.4, background: "none", border: "none", padding: "6px 2px", cursor: "pointer", color: "inherit" }}>
                <BadgeSquare a={a} size={50} />
                <div style={{ fontSize: 12, fontWeight: 600, marginTop: 14, lineHeight: 1.2 }}>{a.title}</div>
                <div style={{ ...mono, fontSize: 10, color: achColor(a), marginTop: 4 }}>{a.earned ? "получено" : achInProgress(a) ? `${a.current} / ${a.target}` : "закрыто"}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* МОИ ЗАЯВКИ */}
      {orders.data && orders.data.length > 0 && (
        <div style={{ ...surface, padding: "26px 28px", marginTop: 22 }}>
          <div style={{ ...disp, fontWeight: 600, fontSize: 20, letterSpacing: "-0.01em" }}>Мои заявки</div>
          <div style={{ marginTop: 12 }}>
            {orders.data.map((o: MyOrder) => (
              <div key={o.number} style={{ display: "flex", alignItems: "center", gap: 12, borderTop: "1px solid #f0ece2", padding: "12px 0", flexWrap: "wrap" }}>
                <span style={{ ...mono, fontSize: 12, color: "#6B7280", minWidth: 130 }}>{o.number}</span>
                <span style={{ flex: 1, fontSize: 14, minWidth: 80 }}>{o.type === "dpo" ? "ДПО" : o.type === "merch" ? "Мерч" : "Смешанная"}</span>
                <span style={{ ...mono, fontSize: 13 }}>{rub(o.total_estimate)}</span>
                <span style={{ ...mono, fontSize: 11, padding: "4px 10px", borderRadius: 999, background: "rgba(46,111,174,.12)", color: "#2E6FAE" }}>{ORDER_STATUS_RU[o.status] ?? o.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* СООБЩЕСТВО: найти своих */}
      <Community token={token} />

      {/* PERSONAL OFFER */}
      <div style={{ position: "relative", overflow: "hidden", marginTop: 44, borderRadius: 22, background: "#11296B", color: "#FBF3E8", padding: "34px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 28, flexWrap: "wrap" }}>
        <div style={{ position: "absolute", right: -30, top: -30, width: 200, height: 200, background: "radial-gradient(circle,rgba(236,90,19,.55),transparent 65%)", filter: "blur(6px)" }} />
        <div style={{ position: "relative", maxWidth: 560 }}>
          <div style={{ ...mono, fontSize: 12, letterSpacing: ".14em", color: "#E3C272", textTransform: "uppercase" }}>Персональное предложение</div>
          <div style={{ ...disp, fontWeight: 600, fontSize: 24, letterSpacing: "-0.01em", marginTop: 12, lineHeight: 1.2 }}>Программы ДПО со скидкой выпускника −{me.level.discount}%</div>
          <p style={{ fontSize: 15, color: "rgba(251,243,232,.82)", lineHeight: 1.5, margin: "12px 0 0" }}>Учебный офис подбирает программы под вашу активность. Загляните в витрину ДПО.</p>
        </div>
        <Link to="/dpo" className="foc" style={{ position: "relative", textDecoration: "none", ...{ fontFamily: "'Onest'" }, fontWeight: 600, fontSize: 16, padding: "15px 30px", borderRadius: 13, background: "#EC5A13", color: "#FBF3E8", flex: "none", boxShadow: "0 14px 30px -14px rgba(0,0,0,.5)" }}>В витрину ДПО</Link>
      </div>

      {/* SHARE */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 28, flexWrap: "wrap" }}>
        <span style={{ ...mono, fontSize: 13, color: "#6B7280" }}>Поделиться профилем:</span>
        <a href="https://t.me/pravohse" target="_blank" rel="noopener noreferrer" className="foc" style={{ textDecoration: "none", fontWeight: 600, fontSize: 14, padding: "11px 20px", borderRadius: 12, background: "#2E6FAE", color: "#FBF3E8" }}>↗ Telegram</a>
        <button disabled title="Шаринг в «Макс» появится позже" aria-label="Поделиться в «Макс» (скоро)" style={{ fontWeight: 600, fontSize: 14, padding: "11px 20px", borderRadius: 12, background: "#fff", color: "#6B7280", border: "1.5px solid #E5E7EB", cursor: "not-allowed" }}>↗ Макс · скоро</button>
      </div>
    </>
  );
}

const MATCH_LABEL: Record<Classmate["match"], string> = {
  both: "выпуск и ОП", cohort: "тот же выпуск", program: "та же ОП",
};
const FRIEND_LABEL: Record<Classmate["friend_status"], string> = {
  none: "В друзья", pending: "Заявка отправлена", incoming: "Принять заявку", accepted: "В друзьях ✓",
};

/** «Сообщество» — однокурсники того же выпуска или ОП с кнопкой «В друзья». */
function Community({ token }: { token: string }) {
  const classmates = useClassmates(token);
  const addFriend = useAddFriend(token);
  const list = classmates.data ?? [];
  const friendsCount = list.filter((c) => c.friend_status === "accepted").length;
  if (classmates.isLoading || classmates.isError || list.length === 0) return null;

  return (
    <div style={{ ...surface, padding: "26px 28px", marginTop: 22 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ ...disp, fontWeight: 600, fontSize: 20, letterSpacing: "-0.01em" }}>Мои однокурсники</div>
          <div style={{ ...mono, fontSize: 12, color: "#6B7280", marginTop: 6 }}>Тот же выпуск или образовательная программа</div>
        </div>
        <span style={{ ...mono, fontSize: 12, color: "#6B7280" }}>{list.length} чел. · в друзьях: <b style={{ color: "#1F8A5B" }}>{friendsCount}</b></span>
      </div>
      <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 18 }}>
        {list.map((c) => (
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 14, border: "1px solid #E5E7EB", borderRadius: 16, padding: "14px 16px" }}>
            <div style={{ width: 46, height: 46, borderRadius: 13, flex: "none", background: "linear-gradient(135deg,#2C6E80,#11296B)", display: "flex", alignItems: "center", justifyContent: "center", ...disp, fontWeight: 800, fontSize: 19, color: "#FBF3E8" }}>
              {(c.fio?.trim()?.[0] ?? "?").toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.2 }}>{c.fio ?? "Выпускник"}</div>
              <div style={{ ...mono, fontSize: 11, color: "#6B7280", marginTop: 3 }}>
                {MATCH_LABEL[c.match]}{c.cohort ? ` · ${c.cohort}` : ""}{c.edu_program ? ` · ${c.edu_program}` : ""}
              </div>
              {c.interests.length > 0 && (
                <div style={{ ...mono, fontSize: 10, color: "#a07d2e", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.interests.join(" · ")}</div>
              )}
            </div>
            <button
              onClick={() => addFriend.mutate(c.id)}
              disabled={(addFriend.isPending && addFriend.variables === c.id) || c.friend_status === "pending" || c.friend_status === "accepted"}
              className="foc"
              style={{
                flex: "none", fontWeight: 600, fontSize: 13, padding: "9px 14px", borderRadius: 10, cursor: c.friend_status === "none" || c.friend_status === "incoming" ? "pointer" : "default",
                border: "1.5px solid " + (c.friend_status === "accepted" ? "#1F8A5B" : c.friend_status === "pending" ? "#E5E7EB" : "#EC5A13"),
                background: c.friend_status === "none" || c.friend_status === "incoming" ? "#EC5A13" : "#fff",
                color: c.friend_status === "accepted" ? "#1F8A5B" : c.friend_status === "pending" ? "#6B7280" : "#FBF3E8",
              }}
            >
              {FRIEND_LABEL[c.friend_status]}
            </button>
          </div>
        ))}
      </div>
      {addFriend.isError && <p style={{ ...mono, fontSize: 12, color: "#B5331B", margin: "12px 0 0" }}>Не удалось отправить заявку — попробуйте ещё раз.</p>}
    </div>
  );
}

function achInProgress(a: Achievement): boolean {
  return !a.earned && a.current > 0;
}
function achStatus(a: Achievement): string {
  return a.earned ? "● Достижение получено" : achInProgress(a) ? "◐ В процессе" : "○ Ещё не открыто";
}
function achColor(a: Achievement): string {
  return a.earned ? "#1F8A5B" : achInProgress(a) ? "#EC5A13" : "#6B7280";
}

// Оформление «ромба» повторяет Claude Design: получено — teal→navy, следующее — оранжевый, закрыто — soft.
function BadgeSquare({ a, size }: { a: Achievement; size: number }) {
  const star = !a.earned && a.star;
  const bg = a.earned ? "linear-gradient(140deg,#2C6E80,#11296B)" : star ? "#EC5A13" : "#F2E3CF";
  const ink = a.earned || star ? "#FBF3E8" : "#b8a98a";
  const glow = a.earned
    ? "0 10px 24px -12px rgba(17,41,107,.65)"
    : star
      ? "0 0 0 4px rgba(236,90,19,.18), 0 12px 26px -10px rgba(236,90,19,.7)"
      : "inset 0 0 0 1px #E5E7EB";
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.28, transform: "rotate(45deg)", margin: size <= 50 ? "0 auto" : 0, background: bg, boxShadow: glow, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ transform: "rotate(-45deg)", ...disp, fontWeight: 800, fontSize: a.icon.length > 1 ? size * 0.24 : size * 0.32, color: ink }}>{a.icon}</span>
    </div>
  );
}
