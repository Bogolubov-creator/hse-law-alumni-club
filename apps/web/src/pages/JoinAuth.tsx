import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { LEGAL_INTERESTS, MAX_INTERESTS } from "@club/shared";
import { apiPost } from "../lib/api.js";
import { useHead } from "../lib/title.js";
import { VisionCorner } from "../components/Vision.js";

/**
 * Воронка входа: /join – заявка на вступление в клуб (аккаунт + профиль pending),
 * /forgot – запрос ссылки восстановления, /reset – новый пароль по токену.
 */

const EDU_LEVELS = ["бакалавриат", "магистратура", "специалитет", "аспирантура"] as const;

function AuthShell({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <>
      <VisionCorner />
      <main className="flex min-h-screen flex-col items-center justify-center bg-kost px-4 py-10">
        <div className="w-full max-w-[520px] rounded-[22px] border border-[#E5E7EB] bg-white p-8 shadow-sm max-md:p-6">
          <Link to="/" className="foc font-mono text-xs text-ohra-deep">← На главную</Link>
          <p className="mt-5 font-mono text-xs uppercase tracking-[0.16em] text-ohra">Клуб выпускников</p>
          <h1 className="mt-2 font-display text-2xl font-bold">{title}</h1>
          {sub && <p className="mt-2 text-sm text-grafit-soft">{sub}</p>}
          {children}
        </div>
        {/* 152-ФЗ: доступ к юр-документам и на страницах входа/восстановления. */}
        <div className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[12px] text-grafit-soft">
          <Link to="/privacy" className="foc underline underline-offset-2">Политика обработки ПДн</Link>
          <Link to="/confidential" className="foc underline underline-offset-2">Конфиденциальность</Link>
          <Link to="/requisites" className="foc underline underline-offset-2">Реквизиты</Link>
        </div>
      </main>
    </>
  );
}

function Field({ label, value, onChange, type = "text", ph, required }: { label: string; value: string; onChange: (v: string) => void; type?: string; ph?: string; required?: boolean }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block font-mono text-[11px] uppercase tracking-wide text-grafit-soft">{label}{required && " *"}</label>
      <input id={id} type={type} required={required} value={value} onChange={(e) => onChange(e.target.value)} placeholder={ph} className="foc mt-1.5 w-full rounded-soft border-[1.5px] border-[#E5E7EB] px-3.5 py-3 text-[15px] outline-none focus:border-ohra" />
    </div>
  );
}

// ── Заявка на вступление ────────────────────────────────────────────
export function Join() {
  useHead({
    title: "Вступить в клуб",
    description: "Подайте заявку в клуб выпускников факультета права НИУ ВШЭ: подтвердите выпуск и получите статус, скидку на ДПО и доступ к сообществу.",
  });
  // Уже в клубе? Анкета нужна только новым выпускникам – не «кидаем» молча в ЛК,
  // а объясняем и даём выбор (в кабинет / выйти и заполнить за другого человека).
  const [authed, setAuthed] = useState(() => !!localStorage.getItem("club_token"));
  const [params] = useSearchParams();
  const ref = params.get("ref") ?? ""; // реферальный код пригласившего
  const [f, setF] = useState({ fio: "", email: "", password: "", cohort: "", edu_level: "магистратура", edu_program: "", consent: false, website: "" });
  const [interests, setInterests] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // Когда на сервере настроен SMTP, аккаунт до перехода по ссылке из письма неактивен –
  // экран «готово» должен вести человека в почту, а не в кабинет.
  const [needConfirm, setNeedConfirm] = useState(false);
  const set = (k: string, v: string | boolean) => setF((s) => ({ ...s, [k]: v }));
  const levelId = useId();

  const toggleInterest = (name: string) =>
    setInterests((cur) => cur.includes(name) ? cur.filter((x) => x !== name) : cur.length >= MAX_INTERESTS ? cur : [...cur, name]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      const res = await apiPost<{ confirm_required?: boolean }>("/auth/register", {
        fio: f.fio, email: f.email, password: f.password, cohort: f.cohort,
        edu_level: f.edu_level, edu_program: f.edu_program, interests,
        ref: ref || undefined,
        consent_pdn: f.consent, website: f.website,
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
      <AuthShell title="Вы уже в клубе ✓" sub="Вы вошли в личный кабинет – анкета вступления нужна только новым выпускникам. Если хотите подать заявку за другого человека, сначала выйдите из аккаунта.">
        <div className="mt-6 flex flex-wrap gap-3">
          <Link to="/lk" className="foc rounded-[12px] bg-ohra px-6 py-3 font-semibold text-kost">В личный кабинет</Link>
          <button
            onClick={() => { localStorage.removeItem("club_token"); setAuthed(false); }}
            className="foc rounded-[12px] border border-[#E5E7EB] px-6 py-3 font-semibold"
          >
            Выйти и заполнить анкету
          </button>
        </div>
      </AuthShell>
    );
  }

  if (done && needConfirm) {
    return (
      <AuthShell title="Проверьте почту" sub={`Мы отправили письмо на ${f.email}. Откройте ссылку из него – она действует сутки. После подтверждения заявку проверит учебный офис (1–2 рабочих дня).`}>
        <p className="mt-4 rounded-[12px] bg-[rgba(46,111,174,.1)] px-4 py-3 text-sm text-[#2E6FAE]">
          Письма нет? Загляните в «Спам» – иногда оно там.
        </p>
        <Link to="/" className="foc mt-6 inline-block rounded-[12px] border border-[#E5E7EB] px-6 py-3 font-semibold">На главную</Link>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell title="Заявка отправлена!" sub="Учебный офис сверит данные с реестром выпускников и активирует кабинет. Обычно это занимает 1–2 рабочих дня.">
        <div className="mt-6 flex flex-wrap gap-3">
          <Link to="/lk" className="foc rounded-[12px] bg-ohra px-6 py-3 font-semibold text-kost">Войти в кабинет</Link>
          <Link to="/" className="foc rounded-[12px] border border-[#E5E7EB] px-6 py-3 font-semibold">На главную</Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Вступить в клуб" sub="Заполните анкету – учебный офис подтвердит ваш выпуск, и кабинет со скидками, сообществом и подкастами станет доступен.">
      {ref && (
        <p className="mt-4 rounded-[12px] bg-[rgba(31,138,91,.1)] px-4 py-3 text-sm text-[#1F8A5B]">
          🤝 Вы пришли по приглашению однокурсника – после подтверждения выпуска он получит баллы клуба.
        </p>
      )}
      <form onSubmit={submit} className="mt-6 space-y-4">
        {/* Honeypot: люди его не видят, боты заполняют → отказ */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.website} onChange={(e) => set("website", e.target.value)} style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />
        <Field label="ФИО" value={f.fio} onChange={(v) => set("fio", v)} ph="Иван Иванов" required />
        <Field label="Почта" type="email" value={f.email} onChange={(v) => set("email", v)} ph="you@mail.ru" required />
        <Field label="Пароль (от 8 символов)" type="password" value={f.password} onChange={(v) => set("password", v)} required />
        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          <Field label="Год выпуска" value={f.cohort} onChange={(v) => set("cohort", v.replace(/[^\d]/g, "").slice(0, 4))} ph="2026" required />
          <div>
            <label htmlFor={levelId} className="block font-mono text-[11px] uppercase tracking-wide text-grafit-soft">Уровень *</label>
            <select id={levelId} value={f.edu_level} onChange={(e) => set("edu_level", e.target.value)} className="foc mt-1.5 w-full rounded-soft border-[1.5px] border-[#E5E7EB] bg-white px-3.5 py-3 text-[15px]">
              {EDU_LEVELS.map((l) => <option key={l}>{l}</option>)}
            </select>
          </div>
        </div>
        <Field label="Образовательная программа" value={f.edu_program} onChange={(v) => set("edu_program", v)} ph="напр. Публичное право" required />
        <div>
          <div className="font-mono text-[11px] uppercase tracking-wide text-grafit-soft">Интересы в юриспруденции <span className="normal-case">· до {MAX_INTERESTS}</span></div>
          <div className="mt-2 flex flex-wrap gap-2">
            {LEGAL_INTERESTS.map((name) => {
              const on = interests.includes(name);
              return (
                <button key={name} type="button" onClick={() => toggleInterest(name)} aria-pressed={on} className={`foc rounded-full border-[1.5px] px-3 py-1.5 text-[12.5px] font-medium ${on ? "border-ohra bg-[rgba(236,90,19,.12)] text-ohra-deep" : "border-[#E5E7EB] bg-white"}`}>
                  {name}
                </button>
              );
            })}
          </div>
        </div>
        <label className="flex cursor-pointer items-start gap-2.5 text-[13px] text-grafit-soft">
          <input type="checkbox" checked={f.consent} onChange={(e) => set("consent", e.target.checked)} required className="mt-0.5" />
          <span>Даю согласие на обработку персональных данных – <Link to="/privacy" target="_blank" className="foc underline underline-offset-2">политика обработки</Link></span>
        </label>
        {err && <p className="font-mono text-xs text-karmin">{err}</p>}
        <button type="submit" disabled={busy || !f.consent} className="foc w-full rounded-[12px] bg-ohra py-3.5 font-semibold text-kost disabled:opacity-60">
          {busy ? "Отправляем…" : "Подать заявку на вступление"}
        </button>
        <p className="text-center text-[13px] text-grafit-soft">Уже в клубе? <Link to="/lk" className="foc font-semibold text-ohra-deep underline underline-offset-2">Войти</Link></p>
      </form>
    </AuthShell>
  );
}

// ── Восстановление пароля ───────────────────────────────────────────
export function Forgot() {
  useHead({ title: "Восстановление пароля", noindex: true });
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try { await apiPost("/auth/forgot", { email }); } catch { /* ответ всегда одинаковый */ }
    setSent(true); setBusy(false);
  };
  return (
    <AuthShell title="Восстановление пароля" sub="Укажите почту от аккаунта – пришлём ссылку для смены пароля (действует 30 минут).">
      {sent ? (
        <>
          <p className="mt-6 rounded-[12px] bg-[rgba(31,138,91,.1)] px-4 py-3.5 text-sm text-[#1F8A5B]">Если такой аккаунт существует, письмо со ссылкой уже отправлено. Проверьте почту (и «Спам»).</p>
          <Link to="/lk" className="foc mt-5 inline-block rounded-[12px] bg-ohra px-6 py-3 font-semibold text-kost">К входу</Link>
        </>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label="Почта" type="email" value={email} onChange={setEmail} ph="you@mail.ru" required />
          <button type="submit" disabled={busy} className="foc w-full rounded-[12px] bg-ohra py-3.5 font-semibold text-kost disabled:opacity-60">{busy ? "Отправляем…" : "Прислать ссылку"}</button>
        </form>
      )}
    </AuthShell>
  );
}

/**
 * Подтверждение почты по ссылке из письма (`/confirm?token=…`). Открывается один раз
 * сразу после регистрации: до подтверждения аккаунт в Directus неактивен и войти нельзя.
 */
export function ConfirmEmail() {
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
    return (
      <AuthShell title="Не удалось подтвердить" sub={err ?? "Ссылка недействительна или истекла."}>
        <Link to="/join" className="foc mt-5 inline-block rounded-[12px] bg-ohra px-6 py-3 font-semibold text-kost">Подать заявку заново</Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Почта подтверждена ✓" sub="Заявка ушла в учебный офис – он сверит данные с реестром выпускников и активирует кабинет. Обычно 1–2 рабочих дня.">
      <div className="mt-6 flex flex-wrap gap-3">
        <Link to="/lk" className="foc rounded-[12px] bg-ohra px-6 py-3 font-semibold text-kost">Войти в кабинет</Link>
        <Link to="/" className="foc rounded-[12px] border border-[#E5E7EB] px-6 py-3 font-semibold">На главную</Link>
      </div>
    </AuthShell>
  );
}

export function Reset() {
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
    setErr(null); setBusy(true);
    try {
      await apiPost("/auth/reset", { token, password: p1 });
      setDone(true);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  if (!token) return <AuthShell title="Ссылка неполная" sub="Откройте ссылку из письма целиком или запросите новую."><Link to="/forgot" className="foc mt-5 inline-block rounded-[12px] bg-ohra px-6 py-3 font-semibold text-kost">Запросить новую</Link></AuthShell>;
  if (done) return <AuthShell title="Пароль обновлён ✓" sub="Теперь войдите с новым паролем."><Link to="/lk" className="foc mt-5 inline-block rounded-[12px] bg-ohra px-6 py-3 font-semibold text-kost">Войти в кабинет</Link></AuthShell>;

  return (
    <AuthShell title="Новый пароль">
      <form onSubmit={submit} className="mt-6 space-y-4">
        <Field label="Новый пароль (от 8 символов)" type="password" value={p1} onChange={setP1} required />
        <Field label="Повторите пароль" type="password" value={p2} onChange={setP2} required />
        {err && <p className="font-mono text-xs text-karmin">{err}</p>}
        <button type="submit" disabled={busy} className="foc w-full rounded-[12px] bg-ohra py-3.5 font-semibold text-kost disabled:opacity-60">{busy ? "Сохраняем…" : "Сохранить пароль"}</button>
      </form>
    </AuthShell>
  );
}
