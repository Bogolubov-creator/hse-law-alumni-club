import { useEffect, useId, useState, type CSSProperties, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { LEVELS, loginResponseSchema } from "@club/shared";
import { apiGet, apiPost, isAuthError, rub, type LoginResponse, type AlumniBrief, type Achievement, type MyOrder } from "../lib/api.js";
import { useMe, useMyOrders, useClassmates, useAddFriend, useLkEvents } from "../lib/queries.js";
import type { Classmate, LkEvent } from "@club/shared";
import Modal from "../components/Modal.js";
import { LkShell } from "../components/LkShell.js";
import { useToast } from "../components/Toast.js";
import { useLkTokens, lkSurface } from "../lib/lk-theme.js";

const ORDER_STATUS_RU: Record<string, string> = { new: "Новая", in_progress: "В работе", confirmed: "Подтверждена", done: "Готово", canceled: "Отменена" };

/**
 * Личный кабинет – порт «Дашборд ЛК.dc.html» (B), данные из /api/me.
 * Логин выпускника → JWT-сессия apps/api. ЛК активен только после верификации.
 */

const TOKEN_KEY = "club_token";
const mono: CSSProperties = { fontFamily: "'Martian Mono', monospace" };
const disp: CSSProperties = { fontFamily: "'Unbounded', sans-serif" };

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
        <div className="mt-4 flex items-center justify-between gap-3 text-[13px]">
          <Link to="/join" className="foc font-semibold text-ohra-deep underline underline-offset-2">Вступить в клуб</Link>
          <Link to="/forgot" className="foc text-grafit-soft underline underline-offset-2">Забыли пароль?</Link>
        </div>
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

  useEffect(() => {
    if (me.isError && isAuthError(me.error)) onLogout();
  }, [me.isError, me.error, onLogout]);

  return (
    <LkShell active="overview" onLogout={onLogout}>
      {me.isLoading && <DashboardLoading />}
      {me.isError && <DashboardError onLogout={onLogout} />}
      {me.data && <DashboardBody me={me.data} token={token} onBadge={setSel} />}
      {sel && <BadgeModal a={sel} onClose={() => setSel(null)} />}
    </LkShell>
  );
}

function DashboardLoading() {
  const t = useLkTokens();
  return <p style={{ ...mono, fontSize: 13, color: t.muted }}>Загрузка кабинета…</p>;
}

function DashboardError({ onLogout }: { onLogout: () => void }) {
  const t = useLkTokens();
  return (
    <div style={{ ...lkSurface(t), padding: 28 }}>
      <p style={{ color: "#B5331B", ...mono, fontSize: 13 }}>Сессия истекла или недоступна.</p>
      <button onClick={onLogout} className="foc" style={{ marginTop: 12, ...mono, fontSize: 13, border: `1.5px solid ${t.ghostBtnBorder}`, borderRadius: 10, padding: "8px 13px", cursor: "pointer", background: t.ghostBtnBg, color: t.text }}>Войти заново</button>
    </div>
  );
}

function BadgeModal({ a, onClose }: { a: Achievement; onClose: () => void }) {
  const t = useLkTokens();
  return (
    <Modal onClose={onClose} labelledBy="badge-modal-title" maxWidth={430}>
      <div style={{ position: "relative", ...lkSurface(t), padding: "32px 32px 28px", boxShadow: "0 40px 90px -30px rgba(0,0,0,.6)", animation: "g-pop .28s cubic-bezier(.2,.8,.2,1)" }}>
        <button onClick={onClose} aria-label="Закрыть" className="foc" style={{ position: "absolute", top: 16, right: 16, width: 34, height: 34, borderRadius: 10, border: `1px solid ${t.modalBtnBorder}`, background: "transparent", color: t.muted, cursor: "pointer" }}>✕</button>
        <BadgeSquare a={a} size={64} />
        <div style={{ ...mono, fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: achColor(a), marginTop: 22 }}>{achStatus(a)}</div>
        <div id="badge-modal-title" style={{ ...disp, fontWeight: 600, fontSize: 24, letterSpacing: "-0.01em", marginTop: 8 }}>{a.title}</div>
        <p style={{ color: t.muted, fontSize: 15, lineHeight: 1.55, margin: "12px 0 0" }}>{a.description}</p>
        {!a.earned && a.target > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", ...mono, fontSize: 12, color: t.muted }}>
              <span>Прогресс · {a.kind}</span><span>{a.current} / {a.target}</span>
            </div>
            <div style={{ height: 10, borderRadius: 999, background: t.progressTrack, overflow: "hidden", marginTop: 8 }}>
              <div style={{ height: "100%", borderRadius: 999, background: "linear-gradient(90deg,#EC5A13,#C9450E)", width: `${Math.round((a.current / a.target) * 100)}%` }} />
            </div>
            <p style={{ ...mono, fontSize: 12, color: t.muted, margin: "10px 0 0" }}>Осталось ещё {Math.max(0, a.target - a.current)} — и достижение ваше.</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

function DashboardBody({ me, token, onBadge }: { me: import("../lib/api.js").Me; token: string; onBadge: (a: Achievement) => void }) {
  const t = useLkTokens();
  const surface = lkSurface(t);
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
      <Events token={token} />

      <div style={{ ...surface, display: "flex", alignItems: "center", gap: 28, padding: "28px 30px", flexWrap: "wrap", boxShadow: t.shadow }}>
        <div style={{ position: "relative", width: 84, height: 84, borderRadius: 22, flex: "none", overflow: "hidden", background: "linear-gradient(135deg,#EC5A13,#B5331B)", display: "flex", alignItems: "center", justifyContent: "center", ...disp, fontWeight: 800, fontSize: 38, color: "#FBF3E8", boxShadow: "0 12px 26px -12px rgba(201,69,14,.7)" }}>
          {me.alumni.avatar ? <img src={`/api/avatars/${me.alumni.avatar}`} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} /> : initial}
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ ...disp, fontWeight: 600, fontSize: 27, letterSpacing: "-0.01em", lineHeight: 1.1 }}>{me.alumni.fio ?? "Выпускник"}</div>
          <div style={{ ...mono, fontSize: 13, color: t.muted, marginTop: 8 }}>Выпуск {me.alumni.cohort ?? "–"}{me.alumni.edu_program ? ` · ${me.alumni.edu_level ?? "магистратура"} · ОП «${me.alumni.edu_program}»` : " · факультет права"}</div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 14, fontSize: 13, fontWeight: 600, padding: "6px 13px", borderRadius: 999, background: "rgba(196,154,69,.16)", color: "#a07d2e", border: "1px solid rgba(196,154,69,.5)" }}>
            <span style={{ width: 16, height: 16, borderRadius: "50%", background: "#C49A45", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>✓</span>Подтверждён
          </div>
        </div>
        <div style={{ width: 1, alignSelf: "stretch", background: t.divider }} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div style={{ position: "relative", width: 118, height: 118, flex: "none" }}>
            <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: `conic-gradient(from -90deg, #EC5A13 0deg, #C9450E ${deg}deg, ${t.ringTrack} ${deg}deg 360deg)` }} />
            <div style={{ position: "absolute", inset: 11, borderRadius: "50%", background: t.ringInner, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div style={{ ...disp, fontWeight: 800, fontSize: 36, lineHeight: 1, letterSpacing: "-0.02em" }}>{idx + 1}</div>
              <div style={{ ...mono, fontSize: 9, color: t.muted, marginTop: 3, letterSpacing: ".1em" }}>УРОВЕНЬ</div>
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ ...disp, fontWeight: 600, fontSize: 14 }}>{me.level.level_title}</div>
            <div style={{ ...mono, fontSize: 11, color: t.muted, marginTop: 4 }}>
              {next ? `+${me.level.to_next} баллов до «${next.title}»` : "максимальный уровень"}
            </div>
          </div>
        </div>
        <div style={{ width: 1, alignSelf: "stretch", background: t.divider }} />
        <div style={{ textAlign: "center", padding: "0 6px" }}>
          <div style={{ ...disp, fontWeight: 800, fontSize: 46, lineHeight: 1, letterSpacing: "-0.02em", color: "#EC5A13" }}>−{me.level.discount}%</div>
          <div style={{ ...mono, fontSize: 11, color: t.muted, marginTop: 10, lineHeight: 1.4 }}>скидка<br />выпускника</div>
        </div>
      </div>

      <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1.45fr 1fr", gap: 22, marginTop: 22 }}>
        <div style={{ ...surface, padding: "26px 28px", boxShadow: t.shadow }}>
          <div style={{ ...disp, fontWeight: 600, fontSize: 20, letterSpacing: "-0.01em" }}>Динамика активности</div>
          <div style={{ ...mono, fontSize: 12, color: t.muted, marginTop: 6 }}>баллы за участие · 6 месяцев</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 188, marginTop: 26 }}>
            {me.activity.map((m, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                <div style={{ width: "100%", maxWidth: 44, height: `${Math.max(4, Math.round((m.points / maxAct) * 100))}%`, borderRadius: "8px 8px 3px 3px", background: m.points > 0 ? "linear-gradient(180deg,#EC5A13,#C9450E)" : t.barEmpty }} />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
            {me.activity.map((m, i) => (
              <div key={i} style={{ flex: 1, textAlign: "center", ...mono, fontSize: 11, color: t.muted }}>{m.month}</div>
            ))}
          </div>
        </div>

        <div style={{ ...surface, padding: "26px 28px", boxShadow: t.shadow }}>
          <div style={{ ...disp, fontWeight: 600, fontSize: 20, letterSpacing: "-0.01em" }}>Достижения</div>
          <div style={{ ...mono, fontSize: 12, color: t.muted, marginTop: 6 }}>{doneCount} из {me.achievements.length} открыто</div>
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
              <div key={o.number} style={{ display: "flex", alignItems: "center", gap: 12, borderTop: `1px solid ${t.dividerSoft}`, padding: "12px 0", flexWrap: "wrap" }}>
                <span style={{ ...mono, fontSize: 12, color: t.muted, minWidth: 130 }}>{o.number}</span>
                <span style={{ flex: 1, fontSize: 14, minWidth: 80 }}>{o.type === "dpo" ? "ДПО" : o.type === "merch" ? "Мерч" : "Смешанная"}</span>
                <span style={{ ...mono, fontSize: 13 }}>{rub(o.total_estimate)}</span>
                <span style={{ ...mono, fontSize: 11, padding: "4px 10px", borderRadius: 999, background: "rgba(46,111,174,.12)", color: "#2E6FAE" }}>{ORDER_STATUS_RU[o.status] ?? o.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* СООБЩЕСТВО: найти своих */}
      <Community token={token} myInterests={me.alumni.interests ?? []} />

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

      {/* РЕФЕРАЛКА: пригласи однокурсника */}
      <Referral me={me} />

      {/* WEB-PUSH: уведомления на телефон/десктоп */}
      <PushBell />

      {/* TELEGRAM-БОТ: привязка для /points и /calendar */}
      <TgLink />

      {/* SHARE */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 28, flexWrap: "wrap" }}>
        <span style={{ ...mono, fontSize: 13, color: t.muted }}>Поделиться профилем:</span>
        <a href="https://t.me/pravohse" target="_blank" rel="noopener noreferrer" className="foc" style={{ textDecoration: "none", fontWeight: 600, fontSize: 14, padding: "11px 20px", borderRadius: 12, background: "#2E6FAE", color: "#FBF3E8" }}>↗ Telegram</a>
        <button disabled title="Шаринг в «Макс» появится позже" aria-label="Поделиться в «Макс» (скоро)" style={{ fontWeight: 600, fontSize: 14, padding: "11px 20px", borderRadius: 12, background: t.ghostBtnBg, color: t.muted, border: `1.5px solid ${t.ghostBtnBorder}`, cursor: "not-allowed" }}>↗ Макс · скоро</button>
      </div>
    </>
  );
}

const ORDER_EVENT_RU: Record<string, string> = {
  in_progress: "взята в работу", confirmed: "подтверждена", done: "готова", canceled: "отменена",
};

/** Блок «События» вверху ЛК — то, что требует внимания или радует. */
function Events({ token }: { token: string }) {
  const t = useLkTokens();
  const surface = lkSurface(t);
  const events = useLkEvents(token);
  const addFriend = useAddFriend(token);
  const list = events.data ?? [];
  if (events.isLoading || events.isError || list.length === 0) return null;

  const line = (e: LkEvent, i: number) => {
    switch (e.kind) {
      case "friend_request":
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", flexWrap: "wrap" }}>
            <span style={{ fontSize: 18 }}>🤝</span>
            <span style={{ flex: 1, fontSize: 14.5, minWidth: 200 }}><b>{e.from_fio ?? "Выпускник"}</b> хочет добавить вас в друзья</span>
            <button
              onClick={() => addFriend.mutate(e.from_id)}
              disabled={addFriend.isPending && addFriend.variables === e.from_id}
              className="foc"
              style={{ fontWeight: 600, fontSize: 13, padding: "8px 16px", borderRadius: 10, border: "none", background: "#1F8A5B", color: "#FBF3E8", cursor: "pointer" }}
            >
              {addFriend.isPending && addFriend.variables === e.from_id ? "…" : "Принять"}
            </button>
          </div>
        );
      case "friend_accepted":
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0" }}>
            <span style={{ fontSize: 18 }}>✅</span>
            <span style={{ fontSize: 14.5 }}><b>{e.by_fio ?? "Выпускник"}</b> теперь у вас в друзьях</span>
          </div>
        );
      case "order_status":
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", flexWrap: "wrap" }}>
            <span style={{ fontSize: 18 }}>📋</span>
            <span style={{ fontSize: 14.5 }}>Заявка <b style={mono}>{e.number}</b> {ORDER_EVENT_RU[e.status] ?? e.status}{e.paid && " · оплата прошла ✓"}</span>
          </div>
        );
      case "podcast_expiring":
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", flexWrap: "wrap" }}>
            <span style={{ fontSize: 18 }}>🎧</span>
            <span style={{ flex: 1, fontSize: 14.5, minWidth: 200 }}>Подписка на подкасты истекает через <b>{e.days_left} {e.days_left === 1 ? "день" : e.days_left < 5 ? "дня" : "дней"}</b></span>
            <Link to="/podcasts" className="foc" style={{ fontWeight: 600, fontSize: 13, padding: "8px 16px", borderRadius: 10, background: "#EC5A13", color: "#FBF3E8", textDecoration: "none" }}>Продлить</Link>
          </div>
        );
    }
  };

  return (
    <div style={{ ...surface, padding: "20px 28px", marginBottom: 22, borderLeft: "4px solid #EC5A13" }}>
      <div style={{ ...mono, fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: "#C9450E" }}>События</div>
      <div style={{ marginTop: 4 }}>
        {list.map((e, i) => (
          <div key={i} style={{ borderTop: i ? `1px solid ${t.dividerSoft}` : "none" }}>{line(e, i)}</div>
        ))}
      </div>
    </div>
  );
}

const MATCH_LABEL: Record<Classmate["match"], string> = {
  both: "выпуск и ОП", cohort: "тот же выпуск", program: "та же ОП",
};
const FRIEND_LABEL: Record<Classmate["friend_status"], string> = {
  none: "В друзья", pending: "Заявка отправлена", incoming: "Принять заявку", accepted: "В друзьях ✓",
};

function ClassmateAvatar({ c, size }: { c: Classmate; size: number }) {
  return (
    <div style={{ position: "relative", width: size, height: size, borderRadius: size * 0.28, flex: "none", overflow: "hidden", background: "linear-gradient(135deg,#2C6E80,#11296B)", display: "flex", alignItems: "center", justifyContent: "center", ...disp, fontWeight: 800, fontSize: size * 0.4, color: "#FBF3E8" }}>
      {c.avatar ? <img src={`/api/avatars/${c.avatar}`} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} /> : (c.fio?.trim()?.[0] ?? "?").toUpperCase()}
    </div>
  );
}

/** Мини-профиль однокурсника: фото, уровень, интересы с общими пересечениями. */
function ClassmateModal({ c, myInterests, token, onClose }: { c: Classmate; myInterests: string[]; token: string; onClose: () => void }) {
  const t = useLkTokens();
  const surface = lkSurface(t);
  const addFriend = useAddFriend(token);
  const common = new Set(myInterests);
  return (
    <Modal onClose={onClose} labelledBy="cm-modal-title" maxWidth={430}>
      <div style={{ position: "relative", ...surface, padding: "30px 30px 26px", boxShadow: "0 40px 90px -30px rgba(0,0,0,.6)", animation: "g-pop .28s cubic-bezier(.2,.8,.2,1)" }}>
        <button onClick={onClose} aria-label="Закрыть" className="foc" style={{ position: "absolute", top: 16, right: 16, width: 34, height: 34, borderRadius: 10, border: `1px solid ${t.modalBtnBorder}`, background: "transparent", color: t.muted, cursor: "pointer" }}>✕</button>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <ClassmateAvatar c={c} size={72} />
          <div style={{ minWidth: 0 }}>
            <div id="cm-modal-title" style={{ ...disp, fontWeight: 600, fontSize: 20, letterSpacing: "-0.01em", lineHeight: 1.15 }}>{c.fio ?? "Выпускник"}</div>
            <div style={{ ...mono, fontSize: 12, color: t.muted, marginTop: 6 }}>Выпуск {c.cohort ?? "–"}{c.edu_program ? ` · ${c.edu_program}` : ""}</div>
            <div style={{ display: "inline-flex", marginTop: 8, fontSize: 12, fontWeight: 600, padding: "4px 11px", borderRadius: 999, background: t.levelChipBg, color: t.levelChipText }}>{c.level_title}</div>
          </div>
        </div>
        {c.interests.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <div style={{ ...mono, fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: t.muted }}>Интересы {c.interests.some((i) => common.has(i)) && <span style={{ color: "#1F8A5B", textTransform: "none" }}>· зелёные — общие с вами</span>}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 10 }}>
              {c.interests.map((i) => (
                <span key={i} style={{ fontSize: 12.5, fontWeight: 500, padding: "6px 12px", borderRadius: 999, border: "1.5px solid " + (common.has(i) ? "#1F8A5B" : t.chipBorder), background: common.has(i) ? "rgba(31,138,91,.1)" : t.chipBg, color: common.has(i) ? "#1F8A5B" : t.text }}>{i}</span>
              ))}
            </div>
          </div>
        )}
        <button
          onClick={() => addFriend.mutate(c.id)}
          disabled={addFriend.isPending || c.friend_status === "pending" || c.friend_status === "accepted"}
          className="foc"
          style={{ marginTop: 22, width: "100%", fontWeight: 600, fontSize: 15, padding: 13, borderRadius: 12, cursor: c.friend_status === "none" || c.friend_status === "incoming" ? "pointer" : "default", border: "none", background: c.friend_status === "accepted" ? "rgba(31,138,91,.12)" : c.friend_status === "pending" ? t.pendingBg : "#EC5A13", color: c.friend_status === "accepted" ? "#1F8A5B" : c.friend_status === "pending" ? t.muted : "#FBF3E8" }}
        >
          {FRIEND_LABEL[c.friend_status]}
        </button>
      </div>
    </Modal>
  );
}

/** «Мои однокурсники» — тот же выпуск или ОП; клик по карточке — мини-профиль. */
function Community({ token, myInterests }: { token: string; myInterests: string[] }) {
  const t = useLkTokens();
  const surface = lkSurface(t);
  const classmates = useClassmates(token);
  const addFriend = useAddFriend(token);
  const [sel, setSel] = useState<Classmate | null>(null);
  const list = classmates.data ?? [];
  const friendsCount = list.filter((c) => c.friend_status === "accepted").length;
  if (classmates.isLoading || classmates.isError || list.length === 0) return null;

  return (
    <div style={{ ...surface, padding: "26px 28px", marginTop: 22 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ ...disp, fontWeight: 600, fontSize: 20, letterSpacing: "-0.01em" }}>Мои однокурсники</div>
          <div style={{ ...mono, fontSize: 12, color: t.muted, marginTop: 6 }}>Тот же выпуск или образовательная программа</div>
        </div>
        <span style={{ ...mono, fontSize: 12, color: t.muted }}>{list.length} чел. · в друзьях: <b style={{ color: "#1F8A5B" }}>{friendsCount}</b></span>
      </div>
      <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 18 }}>
        {list.map((c) => (
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 14, border: `1px solid ${t.surfaceBorder}`, borderRadius: 16, padding: "14px 16px" }}>
            {/* Клик по человеку — мини-профиль */}
            <button onClick={() => setSel(c)} className="foc" style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", color: "inherit" }}>
              <ClassmateAvatar c={c} size={46} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontWeight: 600, fontSize: 15, lineHeight: 1.2 }}>{c.fio ?? "Выпускник"}</span>
                <span style={{ display: "block", ...mono, fontSize: 11, color: t.muted, marginTop: 3 }}>
                  {MATCH_LABEL[c.match]}{c.cohort ? ` · ${c.cohort}` : ""}{c.edu_program ? ` · ${c.edu_program}` : ""}
                </span>
                {c.interests.length > 0 && (
                  <span style={{ display: "block", ...mono, fontSize: 10, color: "#a07d2e", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.interests.join(" · ")}</span>
                )}
              </span>
            </button>
            <button
              onClick={() => addFriend.mutate(c.id)}
              disabled={(addFriend.isPending && addFriend.variables === c.id) || c.friend_status === "pending" || c.friend_status === "accepted"}
              className="foc"
              style={{
                flex: "none", fontWeight: 600, fontSize: 13, padding: "9px 14px", borderRadius: 10, cursor: c.friend_status === "none" || c.friend_status === "incoming" ? "pointer" : "default",
                border: "1.5px solid " + (c.friend_status === "accepted" ? "#1F8A5B" : c.friend_status === "pending" ? t.ghostBtnBorder : "#EC5A13"),
                background: c.friend_status === "none" || c.friend_status === "incoming" ? "#EC5A13" : t.ghostBtnBg,
                color: c.friend_status === "accepted" ? "#1F8A5B" : c.friend_status === "pending" ? t.muted : "#FBF3E8",
              }}
            >
              {FRIEND_LABEL[c.friend_status]}
            </button>
          </div>
        ))}
      </div>
      {addFriend.isError && <p style={{ ...mono, fontSize: 12, color: "#B5331B", margin: "12px 0 0" }}>Не удалось отправить заявку — попробуйте ещё раз.</p>}
      {sel && <ClassmateModal c={list.find((x) => x.id === sel.id) ?? sel} myInterests={myInterests} token={token} onClose={() => setSel(null)} />}
    </div>
  );
}

/** «Пригласи однокурсника»: персональная ссылка на анкету + счётчик приглашённых. */
function Referral({ me }: { me: import("../lib/api.js").Me }) {
  const t = useLkTokens();
  const surface = lkSurface(t);
  const toast = useToast();
  const code = me.alumni.referral_code;
  if (!code) return null;
  const link = `${window.location.origin}/join?ref=${encodeURIComponent(code)}`;
  const shareText = "Вступай в клуб выпускников факультета права Вышки — скидки на ДПО, сообщество и подкасты:";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast("Ссылка скопирована ✓");
    } catch {
      toast("Не удалось скопировать", "err");
    }
  };
  const invited = (me.alumni.referrals_verified ?? 0) + (me.alumni.referrals_pending ?? 0);
  return (
    <div style={{ ...surface, padding: "26px 28px", marginTop: 22 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ ...disp, fontWeight: 600, fontSize: 20, letterSpacing: "-0.01em" }}>Пригласи однокурсника</div>
          <div style={{ ...mono, fontSize: 12, color: t.muted, marginTop: 6 }}>+80 баллов за каждого подтверждённого выпускника по вашей ссылке</div>
        </div>
        {invited > 0 && (
          <span style={{ ...mono, fontSize: 12, color: t.muted }}>
            приглашено: <b style={{ color: "#1F8A5B" }}>{me.alumni.referrals_verified ?? 0}</b>
            {(me.alumni.referrals_pending ?? 0) > 0 && <> · на проверке: {me.alumni.referrals_pending}</>}
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap", alignItems: "center" }}>
        <code style={{ ...mono, fontSize: 12.5, background: t.codeBg, border: `1px solid ${t.codeBorder}`, borderRadius: 10, padding: "11px 14px", flex: 1, minWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: t.text }}>{link}</code>
        <button onClick={copy} className="foc" style={{ fontWeight: 600, fontSize: 14, padding: "11px 20px", borderRadius: 12, border: "none", background: "#EC5A13", color: "#FBF3E8", cursor: "pointer", flex: "none" }}>Скопировать</button>
        <a href={`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer" className="foc" style={{ textDecoration: "none", fontWeight: 600, fontSize: 14, padding: "11px 20px", borderRadius: 12, background: "#2E6FAE", color: "#FBF3E8", flex: "none" }}>↗ В Telegram</a>
      </div>
    </div>
  );
}

/** Кнопка «🔔 Включить уведомления»: подписывает браузер на web-push (заявки в
    друзья, события, подкасты). Прячется, если пуши не сконфигурированы на
    сервере или браузер их не умеет (например, Safari без установки на экран). */
function PushBell() {
  const t = useLkTokens();
  const surface = lkSurface(t);
  const toast = useToast();
  const [state, setState] = useState<"hidden" | "off" | "on" | "busy">("hidden");

  useEffect(() => {
    void (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
      try {
        const cfg = await apiGet<{ enabled: boolean; key: string | null }>("/push/vapid");
        if (!cfg.enabled || !cfg.key) return;
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setState(sub && Notification.permission === "granted" ? "on" : "off");
      } catch {
        /* API недоступен — просто не показываем кнопку */
      }
    })();
  }, []);

  if (state === "hidden") return null;

  const b64ToU8 = (b64: string) => {
    const pad = "=".repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  };

  const enable = async () => {
    setState("busy");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { toast("Уведомления запрещены в браузере", "err"); setState("off"); return; }
      const cfg = await apiGet<{ enabled: boolean; key: string | null }>("/push/vapid");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(cfg.key!) });
      const j = sub.toJSON();
      await apiPost("/me/push/subscribe", { endpoint: sub.endpoint, keys: j.keys }, undefined, localStorage.getItem(TOKEN_KEY) ?? undefined);
      setState("on");
      toast("Уведомления включены ✓");
    } catch {
      toast("Не удалось включить уведомления", "err");
      setState("off");
    }
  };

  const disable = async () => {
    setState("busy");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await apiPost("/me/push/unsubscribe", { endpoint: sub.endpoint }, undefined, localStorage.getItem(TOKEN_KEY) ?? undefined).catch(() => undefined);
        await sub.unsubscribe();
      }
      setState("off");
      toast("Уведомления выключены");
    } catch {
      setState("on");
    }
  };

  return (
    <div style={{ ...surface, padding: "20px 28px", marginTop: 22, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
      <div>
        <div style={{ ...disp, fontWeight: 600, fontSize: 17 }}>🔔 Уведомления клуба</div>
        <div style={{ ...mono, fontSize: 12, color: t.muted, marginTop: 5 }}>Заявки в друзья, новые события и подкасты — сразу на устройство</div>
      </div>
      {state === "on" ? (
        <button onClick={disable} className="foc" style={{ fontWeight: 600, fontSize: 14, padding: "11px 20px", borderRadius: 12, border: "1.5px solid #1F8A5B", background: t.ghostBtnBg, color: "#1F8A5B", cursor: "pointer", flex: "none" }}>Включены ✓ (выключить)</button>
      ) : (
        <button onClick={enable} disabled={state === "busy"} className="foc" style={{ fontWeight: 600, fontSize: 14, padding: "11px 20px", borderRadius: 12, border: "none", background: "#EC5A13", color: "#FBF3E8", cursor: state === "busy" ? "wait" : "pointer", flex: "none" }}>{state === "busy" ? "Включаем…" : "Включить уведомления"}</button>
      )}
    </div>
  );
}

/** «Привязать Telegram»: deep-link t.me/бот?start=<код> из /me/tg-link.
    После привязки бот отвечает на /points и /calendar по данным выпускника. */
function TgLink() {
  const t = useLkTokens();
  const surface = lkSurface(t);
  const [data, setData] = useState<{ linked: boolean; url: string } | null>(null);
  useEffect(() => {
    apiGet<{ linked: boolean; url: string }>("/me/tg-link", localStorage.getItem(TOKEN_KEY) ?? undefined)
      .then(setData)
      .catch(() => setData(null));
  }, []);
  if (!data) return null;
  return (
    <div style={{ ...surface, padding: "20px 28px", marginTop: 22, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
      <div>
        <div style={{ ...disp, fontWeight: 600, fontSize: 17 }}>🤖 Telegram-бот клуба</div>
        <div style={{ ...mono, fontSize: 12, color: t.muted, marginTop: 5 }}>
          {data.linked ? "Привязан ✓ — команды /points и /calendar показывают ваши данные" : "Привяжите аккаунт — бот покажет ваши баллы (/points) и события (/calendar)"}
        </div>
      </div>
      <a href={data.url} target="_blank" rel="noopener noreferrer" className="foc" style={{ textDecoration: "none", fontWeight: 600, fontSize: 14, padding: "11px 20px", borderRadius: 12, flex: "none", ...(data.linked ? { border: "1.5px solid #2E6FAE", background: t.ghostBtnBg, color: "#2E6FAE" } : { background: "#2E6FAE", color: "#FBF3E8" }) }}>
        {data.linked ? "↗ Открыть бота" : "↗ Привязать Telegram"}
      </a>
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
  const t = useLkTokens();
  const star = !a.earned && a.star;
  const bg = a.earned ? "linear-gradient(140deg,#2C6E80,#11296B)" : star ? "#EC5A13" : t.badgeLocked;
  const ink = a.earned || star ? "#FBF3E8" : "#b8a98a";
  const glow = a.earned
    ? "0 10px 24px -12px rgba(17,41,107,.65)"
    : star
      ? "0 0 0 4px rgba(236,90,19,.18), 0 12px 26px -10px rgba(236,90,19,.7)"
      : `inset 0 0 0 1px ${t.surfaceBorder}`;
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.28, transform: "rotate(45deg)", margin: size <= 50 ? "0 auto" : 0, background: bg, boxShadow: glow, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ transform: "rotate(-45deg)", ...disp, fontWeight: 800, fontSize: a.icon.length > 1 ? size * 0.24 : size * 0.32, color: ink }}>{a.icon}</span>
    </div>
  );
}
