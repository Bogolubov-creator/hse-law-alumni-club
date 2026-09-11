import { useEffect, useId, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { LEGAL_INTERESTS, MAX_INTERESTS, CLUB_OPERATOR } from "@club/shared";
import { apiPost } from "../lib/api.js";
import { useHead } from "../lib/title.js";
import { VisionCorner } from "../components/Vision.js";
import { mono, disp } from "../v2/Shell.js";
import { Mark } from "../v2/Mark.js";

/**
 * Воронка входа v2: /join – заявка на вступление, /forgot – запрос ссылки,
 * /reset – новый пароль, /confirm – подтверждение почты.
 *
 * Язык описи, как в корзине и профиле: моно-подпись над полем, разделитель –
 * линия. Помечаем не обязательные поля, а необязательные: здесь обязательны
 * почти все, и звёздочки превратились бы в шум.
 *
 * Логика не переизобретается: те же ручки /auth/register, /auth/forgot,
 * /auth/reset, /auth/confirm и тот же honeypot, что в v1.
 */

const TOKEN_KEY = "club_token";

const label: CSSProperties = {
  ...mono, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)",
  textTransform: "none", color: "var(--c-text-3)",
};

const input: CSSProperties = {
  width: "100%", marginTop: 7, padding: "12px 14px", borderRadius: "var(--r-md)",
  border: "1px solid var(--c-line-control)", background: "var(--c-bg)", color: "var(--c-text)",
  fontSize: 15, fontFamily: "inherit",
};

const primary: CSSProperties = {
  border: "1px solid var(--c-accent)", background: "var(--c-accent)", color: "var(--c-on-accent)",
  borderRadius: 999, padding: "13px 22px", minHeight: 44, fontWeight: 600, fontSize: 15,
  cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", textAlign: "center",
};

const ghost: CSSProperties = {
  ...primary, background: "var(--c-bg)", color: "var(--c-accent-text)",
  border: "1px solid color-mix(in srgb, var(--c-accent) 35%, transparent)",
};

/** Общая оболочка экранов входа: знак, заголовок, карточка, юр-ссылки под ней. */
function AuthShell({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <main id="main" style={{ background: "var(--c-bg)", color: "var(--c-text)", fontFamily: "var(--f-body)", minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px", paddingBottom: "calc(40px + var(--cookie-h, 0px))" }}>
      <VisionCorner />
      <div style={{ width: "100%", maxWidth: 520, background: "var(--c-bg-raised)", border: "1px solid var(--c-line-control)", borderRadius: "var(--r-lg)", padding: 32 }}>
        <Link to="/" className="foc" style={{ ...label, color: "var(--c-accent-text)", textDecoration: "none" }}>← на главную</Link>
        <Mark kind="scales" size={40} style={{ color: "var(--c-accent-text)", marginTop: 18 }} />
        <h1 style={{ ...disp, fontWeight: 700, fontSize: "var(--t-h3)", lineHeight: 1.2, margin: "14px 0 0" }}>{title}</h1>
        {sub && <p style={{ margin: "10px 0 0", color: "var(--c-text-2)", fontSize: "var(--t-small)", lineHeight: 1.55 }}>{sub}</p>}
        {children}
      </div>
      {/* 152-ФЗ: юр-документы доступны и с экранов входа */}
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "8px 18px", marginTop: 20, fontSize: "var(--t-small)" }}>
        <Link to="/privacy" className="foc" style={{ color: "var(--c-text-3)" }}>Политика обработки ПДн</Link>
        <Link to="/confidential" className="foc" style={{ color: "var(--c-text-3)" }}>Конфиденциальность</Link>
        <Link to="/requisites" className="foc" style={{ color: "var(--c-text-3)" }}>Реквизиты</Link>
      </div>
    </main>
  );
}

function Field({ name, value, onChange, type = "text", ph, hint, autoComplete, inputMode }: {
  name: string; value: string; onChange: (v: string) => void; type?: string; ph?: string;
  hint?: string; autoComplete?: string; inputMode?: "numeric";
}) {
  const id = useId();
  return (
    <div style={{ padding: "12px 0", borderTop: "1px solid var(--c-line)" }}>
      <label htmlFor={id} style={{ ...label, display: "block" }}>
        {name}{hint && <span style={{ textTransform: "none", letterSpacing: 0, opacity: 0.75 }}> · {hint}</span>}
      </label>
      <input id={id} type={type} required value={value} placeholder={ph} autoComplete={autoComplete} inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)} className="foc" style={input} />
    </div>
  );
}

function Note({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "ok" }) {
  return (
    <p style={{
      margin: "16px 0 0", padding: "13px 16px", borderRadius: "var(--r-md)",
      border: `1px solid ${tone === "ok" ? "var(--c-ok-text)" : "var(--c-line-strong)"}`,
      color: "var(--c-text-2)", fontSize: "var(--t-small)", lineHeight: 1.55,
    }}>{children}</p>
  );
}

const EDU_LEVELS = ["бакалавриат", "магистратура", "специалитет", "аспирантура"] as const;

/* ── Заявка на вступление ─────────────────────────────────────────── */

export function JoinV2() {
  useHead({
    title: "Вступить в клуб",
    description: "Заявка в клуб выпускников факультета права Вышки: проверка выпуска учебным офисом, кабинет и цена выпускника на ДПО.",
    canonical: `${typeof window !== "undefined" ? window.location.origin : ""}/join`,
    noindex: true,
  });

  // Уже в клубе? Анкета нужна только новым выпускникам – не «кидаем» молча
  // в кабинет, а объясняем и даём выбор.
  const [authed, setAuthed] = useState(() => !!localStorage.getItem(TOKEN_KEY));
  const [params] = useSearchParams();
  const ref = params.get("ref") ?? "";
  const [f, setF] = useState({ fio: "", email: "", password: "", cohort: "", edu_level: "магистратура", edu_program: "", consent: false, website: "" });
  const [interests, setInterests] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // При настроенном SMTP аккаунт неактивен до перехода по ссылке из письма –
  // экран «готово» должен вести в почту, а не в кабинет.
  const [needConfirm, setNeedConfirm] = useState(false);
  const set = (k: string, v: string | boolean) => setF((s) => ({ ...s, [k]: v }));
  const levelId = useId();
  const full = interests.length >= MAX_INTERESTS;

  const toggleInterest = (name: string) =>
    setInterests((cur) => cur.includes(name) ? cur.filter((x) => x !== name) : cur.length >= MAX_INTERESTS ? cur : [...cur, name]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await apiPost<{ confirm_required?: boolean }>("/auth/register", {
        fio: f.fio, email: f.email, password: f.password, cohort: f.cohort,
        edu_level: f.edu_level, edu_program: f.edu_program, interests,
        ref: ref || undefined,
        consent_pdn: f.consent,
        website: f.website, // honeypot
      });
      setNeedConfirm(!!res?.confirm_required);
      setDone(true);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (authed) {
    return (
      <AuthShell title="Вы уже в клубе" sub="Анкета вступления нужна только новым выпускникам. Если подаёте заявку за другого человека, сначала выйдите из аккаунта.">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 22 }}>
          <Link to="/lk" className="foc" style={primary}>В личный кабинет</Link>
          <button onClick={() => { localStorage.removeItem(TOKEN_KEY); setAuthed(false); }} className="foc" style={ghost}>
            Выйти и заполнить анкету
          </button>
        </div>
      </AuthShell>
    );
  }

  if (done && needConfirm) {
    return (
      <AuthShell title="Проверьте почту" sub={`Мы отправили письмо на ${f.email}. Ссылка действует сутки.`}>
        <ol style={{ margin: "18px 0 0", paddingLeft: 20, color: "var(--c-text-2)", fontSize: "var(--t-small)", lineHeight: 1.65 }}>
          <li><strong>Сейчас:</strong> подтвердите почту по ссылке из письма.</li>
          <li><strong>Затем:</strong> учебный офис сверит выпуск (обычно 1–2 рабочих дня).</li>
          <li><strong>После верификации:</strong> откроются кабинет и цена выпускника на ДПО.</li>
        </ol>
        <Note>Письма нет? Загляните в «Спам» – иногда оно попадает туда.</Note>
        <Link to="/" className="foc" style={{ ...ghost, marginTop: 20 }}>На главную</Link>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell title="Заявка отправлена" sub="Статус: ожидает проверки учебным офисом.">
        <ol style={{ margin: "18px 0 0", paddingLeft: 20, color: "var(--c-text-2)", fontSize: "var(--t-small)", lineHeight: 1.65 }}>
          <li>Офис сверит данные с реестром выпускников факультета.</li>
          <li>Обычно это занимает 1–2 рабочих дня.</li>
          <li>После подтверждения войдите в кабинет – откроются скидка на ДПО и разделы клуба.</li>
        </ol>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 22 }}>
          <Link to="/lk" className="foc" style={primary}>Войти в кабинет</Link>
          <Link to="/" className="foc" style={ghost}>На главную</Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Вступить в клуб" sub="Заполните анкету. Учебный офис подтвердит выпуск – после этого откроются кабинет и цена выпускника на ДПО.">
      {ref && <Note tone="ok">Вы пришли по приглашению однокурсника – после подтверждения выпуска он получит баллы клуба.</Note>}

      <form onSubmit={submit} style={{ marginTop: 18 }}>
        {/* Honeypot: убран за экран и от скринридеров; боты заполняют – отказ */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true"
          value={f.website} onChange={(e) => set("website", e.target.value)}
          style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />

        <Field name="фио" value={f.fio} onChange={(v) => set("fio", v)} ph="Иван Иванов" autoComplete="name" />
        <Field name="почта" type="email" value={f.email} onChange={(v) => set("email", v)} ph="you@mail.ru" autoComplete="email" />
        <Field name="пароль" type="password" value={f.password} onChange={(v) => set("password", v)} hint="от 8 символов" autoComplete="new-password" />
        <Field name="год выпуска" value={f.cohort} onChange={(v) => set("cohort", v.replace(/[^\d]/g, "").slice(0, 4))} ph="2026" inputMode="numeric" />

        <div style={{ padding: "12px 0", borderTop: "1px solid var(--c-line)" }}>
          <label htmlFor={levelId} style={{ ...label, display: "block" }}>уровень образования</label>
          <select id={levelId} value={f.edu_level} onChange={(e) => set("edu_level", e.target.value)} className="foc" style={input}>
            {EDU_LEVELS.map((l) => <option key={l}>{l}</option>)}
          </select>
        </div>

        <Field name="образовательная программа" value={f.edu_program} onChange={(v) => set("edu_program", v)} ph="напр. Публичное право" />

        <div style={{ padding: "14px 0", borderTop: "1px solid var(--c-line)" }}>
          <div style={label}>интересы в праве · необязательно, до {MAX_INTERESTS}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 10 }}>
            {LEGAL_INTERESTS.map((name) => {
              const on = interests.includes(name);
              return (
                <button key={name} type="button" onClick={() => toggleInterest(name)} aria-pressed={on}
                  disabled={!on && full} className="foc"
                  style={{
                    ...mono, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)", textTransform: "none",
                    padding: "7px 12px", borderRadius: 999,
                    border: `1px solid ${on ? "var(--c-accent)" : "var(--c-line-control)"}`,
                    background: on ? "var(--c-accent)" : "transparent",
                    color: on ? "var(--c-on-accent)" : "var(--c-text-2)",
                    opacity: !on && full ? 0.4 : 1,
                    cursor: !on && full ? "not-allowed" : "pointer",
                  }}>
                  {name}
                </button>
              );
            })}
          </div>
        </div>

        <label style={{ display: "flex", alignItems: "flex-start", gap: 10, marginTop: 14, cursor: "pointer", fontSize: "var(--t-small)", lineHeight: 1.5, color: "var(--c-text-2)" }}>
          <input type="checkbox" checked={f.consent} required onChange={(e) => set("consent", e.target.checked)}
            style={{ marginTop: 3, width: 17, height: 17, flexShrink: 0, accentColor: "var(--c-accent)" }} />
          <span>
            Даю согласие на обработку персональных данных оператору {CLUB_OPERATOR.shortName} –{" "}
            <Link to="/privacy" target="_blank" className="foc" style={{ color: "var(--c-accent-text)", textDecoration: "underline", textUnderlineOffset: 2 }}>политика обработки</Link>
          </span>
        </label>

        {err && <p role="alert" style={{ ...mono, margin: "12px 0 0", fontSize: "var(--t-caption)", color: "var(--c-danger-text)" }}>{err}</p>}

        <button type="submit" disabled={busy || !f.consent} className="foc"
          style={{
            ...primary, width: "100%", marginTop: 16,
            ...(busy || !f.consent
              ? { background: "transparent", color: "var(--c-text-3)", border: "1px solid var(--c-line-control)", cursor: busy ? "wait" : "not-allowed" }
              : {}),
          }}>
          {busy ? "Отправляем…" : f.consent ? "Подать заявку на вступление" : "Нужно согласие на обработку данных"}
        </button>

        <p style={{ textAlign: "center", margin: "14px 0 0", fontSize: "var(--t-small)", color: "var(--c-text-3)" }}>
          Уже в клубе? <Link to="/lk" className="foc" style={{ color: "var(--c-accent-text)", fontWeight: 600 }}>Войти</Link>
        </p>
      </form>
    </AuthShell>
  );
}

/* ── Восстановление пароля ────────────────────────────────────────── */

export function ForgotV2() {
  useHead({ title: "Восстановление пароля", noindex: true });
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    // Ответ всегда одинаковый: по нему нельзя узнать, есть ли такой аккаунт.
    try { await apiPost("/auth/forgot", { email }); } catch { /* намеренно молча */ }
    setSent(true);
    setBusy(false);
  };

  return (
    <AuthShell title="Восстановление пароля" sub="Укажите почту от аккаунта – пришлём ссылку для смены пароля, она действует 30 минут.">
      {sent ? (
        <>
          <Note tone="ok">Если такой аккаунт существует, письмо со ссылкой уже отправлено. Проверьте почту и папку «Спам».</Note>
          <Link to="/lk" className="foc" style={{ ...primary, marginTop: 20 }}>К входу</Link>
        </>
      ) : (
        <form onSubmit={submit} style={{ marginTop: 18 }}>
          <Field name="почта" type="email" value={email} onChange={setEmail} ph="you@mail.ru" autoComplete="email" />
          <button type="submit" disabled={busy} className="foc" style={{ ...primary, width: "100%", marginTop: 16, cursor: busy ? "wait" : "pointer" }}>
            {busy ? "Отправляем…" : "Прислать ссылку"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}

/* ── Новый пароль по ссылке ───────────────────────────────────────── */

export function ResetV2() {
  useHead({ title: "Новый пароль", noindex: true });
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (p1 !== p2) { setErr("Пароли не совпадают"); return; }
    setErr(null);
    setBusy(true);
    try {
      await apiPost("/auth/reset", { token, password: p1 });
      setDone(true);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <AuthShell title="Ссылка неполная" sub="Откройте ссылку из письма целиком или запросите новую.">
        <Link to="/forgot" className="foc" style={{ ...primary, marginTop: 20 }}>Запросить новую</Link>
      </AuthShell>
    );
  }
  if (done) {
    return (
      <AuthShell title="Пароль обновлён" sub="Теперь войдите с новым паролем.">
        <Link to="/lk" className="foc" style={{ ...primary, marginTop: 20 }}>Войти в кабинет</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Новый пароль">
      <form onSubmit={submit} style={{ marginTop: 18 }}>
        <Field name="новый пароль" type="password" value={p1} onChange={setP1} hint="от 8 символов" autoComplete="new-password" />
        <Field name="повторите пароль" type="password" value={p2} onChange={setP2} autoComplete="new-password" />
        {err && <p role="alert" style={{ ...mono, margin: "12px 0 0", fontSize: "var(--t-caption)", color: "var(--c-danger-text)" }}>{err}</p>}
        <button type="submit" disabled={busy} className="foc" style={{ ...primary, width: "100%", marginTop: 16, cursor: busy ? "wait" : "pointer" }}>
          {busy ? "Сохраняем…" : "Сохранить пароль"}
        </button>
      </form>
    </AuthShell>
  );
}

/* ── Подтверждение почты ──────────────────────────────────────────── */

export function ConfirmEmailV2() {
  useHead({ title: "Подтверждение почты", noindex: true });
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<"work" | "ok" | "fail">("work");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setState("fail"); setErr("Ссылка неполная – откройте её из письма целиком."); return; }
    let alive = true;
    apiPost("/auth/confirm", { token })
      .then(() => { if (alive) setState("ok"); })
      .catch((e: Error) => { if (alive) { setErr(e.message); setState("fail"); } });
    return () => { alive = false; };
  }, [token]);

  if (state === "work") return <AuthShell title="Подтверждаем почту…" sub="Секунду."><span /></AuthShell>;

  if (state === "fail") {
    // Ссылка без токена – это неполный адрес, а не провал подтверждения.
    return (
      <AuthShell title={token ? "Не удалось подтвердить" : "Ссылка неполная"} sub={err ?? "Ссылка недействительна или истекла."}>
        <Link to="/join" className="foc" style={{ ...primary, marginTop: 20 }}>Подать заявку заново</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Почта подтверждена" sub="Заявка ушла в учебный офис – он сверит данные с реестром выпускников и активирует кабинет. Обычно 1–2 рабочих дня.">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 22 }}>
        <Link to="/lk" className="foc" style={primary}>Войти в кабинет</Link>
        <Link to="/" className="foc" style={ghost}>На главную</Link>
      </div>
    </AuthShell>
  );
}
