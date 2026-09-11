import { useEffect, useId, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { LEGAL_INTERESTS, MAX_INTERESTS, CLUB_OPERATOR, type Achievement, type LedgerEntry } from "@club/shared";
import { apiPatch, apiPost, isAuthError, type Me } from "../lib/api.js";
import { useMe, useLedger } from "../lib/queries.js";
import { useToast } from "../components/Toast.js";
import { logout as logoutSession } from "../lib/cart.js";
import { useHead } from "../lib/title.js";
import { BlankField, mono, disp } from "../v2/Shell.js";
import { CabinetShell, Section, Initial, Progress, TOKEN_KEY, label, field, action, actionGhost } from "../v2/cabinet.js";

/**
 * Профиль выпускника v2 (/lk/profile) – тот же режим, что и кабинет:
 * плотность 7, движения нет, один акцент. Форма собрана как опись: подпись
 * реестра слева, поле справа, разделитель – линия, а не рамка карточки.
 *
 * Функционально повторяет профиль v1 целиком, включая права по 152-ФЗ
 * (выгрузка копии данных и удаление аккаунта): урезать приватную зону
 * ради красоты нельзя.
 */

const REASON_TEXT: Record<string, string> = {
  program: "Пройдена программа ДПО", event: "Участие в событии клуба", referral: "Приглашённый выпускник",
  mentorship: "Менторство младшего потока", order: "Заказ", decay: "Списание за неактивность",
  manual: "Начисление учебным офисом", achievement: "Достижение",
};

const CONTACT_FIELDS: { key: string; name: string; ph: string; type?: string; autoComplete?: string }[] = [
  { key: "phone", name: "телефон", ph: "+7 ___ ___-__-__", type: "tel", autoComplete: "tel" },
  { key: "email", name: "почта", ph: "you@mail.ru", type: "email", autoComplete: "email" },
  { key: "telegram", name: "telegram", ph: "@username" },
  { key: "vk", name: "вконтакте", ph: "vk.com/username" },
  { key: "max", name: "макс", ph: "max.ru/username" },
];

/** Поле описи: моно-подпись над полем, разделитель сверху. */
function Field({ name, value, onChange, ph, type, autoComplete }: {
  name: string; value: string; onChange: (v: string) => void; ph: string; type?: string; autoComplete?: string;
}) {
  const id = useId();
  return (
    <div style={{ padding: "12px 0", borderTop: "1px solid var(--c-line)" }}>
      <label htmlFor={id} style={{ ...label, display: "block" }}>{name}</label>
      <input id={id} type={type ?? "text"} autoComplete={autoComplete} value={value} placeholder={ph}
        onChange={(e) => onChange(e.target.value)} className="foc" style={field} />
    </div>
  );
}

function fmtDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "--.--" : `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/* ── Удостоверение с загрузкой фото ───────────────────────────────── */

function IdentityCard({ me, token, onChanged }: { me: Me; token: string; onChanged: () => void }) {
  const a = me.alumni;
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();

  const upload = async (file: File) => {
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/me/avatar", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string })?.error || "Не удалось загрузить фото");
      toast("Фото обновлено");
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
      toast("Не удалось загрузить фото", "err");
    } finally {
      setBusy(false);
    }
  };

  const sub = [a.cohort ? `выпуск ${a.cohort}` : null, a.edu_program].filter(Boolean).join(" · ") || "выпускник клуба";
  const canUpload = a.verification_status === "verified" || a.verification_status === "pending";
  const statusLabel =
    a.verification_status === "verified" ? "подтверждён"
      : a.verification_status === "rejected" ? "отклонён"
        : "на проверке";
  const statusColor =
    a.verification_status === "verified" ? "var(--c-ok-text)"
      : a.verification_status === "rejected" ? "var(--c-danger-text)"
        : "var(--c-status-text)";

  return (
    <div style={{ border: "1px solid var(--c-line)", borderRadius: "var(--r-lg)", padding: 22, background: "var(--c-bg-raised)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <button
          type="button"
          onClick={() => canUpload && !busy && fileRef.current?.click()}
          disabled={!canUpload || busy}
          className="foc"
          aria-label={a.avatar ? "Сменить фото профиля" : "Загрузить фото профиля"}
          title={canUpload ? (a.avatar ? "Нажмите, чтобы сменить фото" : "Нажмите, чтобы загрузить фото") : "Загрузка фото недоступна"}
          style={{
            padding: 0, border: "none", background: "transparent", cursor: canUpload && !busy ? "pointer" : "default",
            borderRadius: "var(--r-md)", flexShrink: 0, position: "relative",
          }}
        >
          {a.avatar
            ? <img src={`/api/avatars/${a.avatar}`} alt="" width={64} height={64} style={{ width: 64, height: 64, borderRadius: "var(--r-md)", objectFit: "cover", display: "block" }} />
            : <Initial fio={a.fio} size={64} radius="var(--r-md)" />}
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <BlankField label={sub}>
            <span style={{ ...disp, display: "block", fontWeight: 700, fontSize: 20, lineHeight: 1.2 }}>{a.fio ?? "Выпускник"}</span>
          </BlankField>
        </div>
      </div>

      {canUpload && (
        <button onClick={() => fileRef.current?.click()} disabled={busy} className="foc"
          style={{ ...actionGhost, width: "100%", marginTop: 16, padding: "10px 14px", cursor: busy ? "wait" : "pointer" }}>
          {busy ? "загружаем…" : a.avatar ? "сменить фото" : "загрузить фото"}
        </button>
      )}
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }}
        aria-label="Файл фотографии профиля"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
      {err && <p role="alert" style={{ ...mono, fontSize: "var(--t-caption)", color: "var(--c-danger-text)", margin: "10px 0 0" }}>{err}</p>}
      {a.verification_status === "rejected" && (
        <p style={{ ...mono, fontSize: "var(--t-caption)", color: "var(--c-danger-text)", margin: "10px 0 0", lineHeight: 1.45 }}>
          Заявка отклонена учебным офисом. Фото профиля недоступно для загрузки.
        </p>
      )}

      <div style={{ marginTop: 18 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, padding: "11px 0", borderTop: "1px solid var(--c-line)" }}>
          <span style={label}>баллов всего</span>
          <span style={{ ...mono, fontSize: 22, fontWeight: 500, color: "var(--c-accent-text)" }}>{me.level.points}</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, padding: "11px 0", borderTop: "1px solid var(--c-line)" }}>
          <span style={label}>уровень</span>
          <span style={{ ...mono, fontSize: 15, fontWeight: 500 }}>{me.level.level_title}</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, padding: "11px 0", borderTop: "1px solid var(--c-line)" }}>
          <span style={label}>статус</span>
          <span style={{ ...mono, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)", textTransform: "none", color: statusColor }}>
            {statusLabel}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── Контакты и интересы ──────────────────────────────────────────── */

function ContactsForm({ me, token, onSaved }: { me: Me; token: string; onSaved: () => void }) {
  const [fio, setFio] = useState(me.alumni.fio ?? "");
  const [contacts, setContacts] = useState<Record<string, string>>(me.alumni.contacts ?? {});
  const [interests, setInterests] = useState<string[]>(me.alumni.interests ?? []);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();

  // Данные могут приехать позже формы (refetch после загрузки фото) – подхватываем.
  useEffect(() => {
    setFio(me.alumni.fio ?? "");
    setContacts(me.alumni.contacts ?? {});
    setInterests(me.alumni.interests ?? []);
  }, [me.alumni]);

  const toggle = (name: string) =>
    setInterests((cur) => cur.includes(name) ? cur.filter((x) => x !== name) : cur.length >= MAX_INTERESTS ? cur : [...cur, name]);

  const save = async () => {
    setState("saving");
    setErr(null);
    try {
      await apiPatch("/me/profile", { fio: fio.trim() || undefined, contacts, interests }, token);
      setState("saved");
      toast("Профиль сохранён");
      onSaved();
      setTimeout(() => setState("idle"), 2500);
    } catch (e) {
      setErr((e as Error).message || "Не удалось сохранить");
      toast("Не удалось сохранить", "err");
      setState("idle");
    }
  };

  const full = interests.length >= MAX_INTERESTS;

  return (
    <Section title="Контакты" note={state === "saved" ? "сохранено" : undefined}>
      <Field name="фио" value={fio} onChange={setFio} ph="Имя Фамилия" autoComplete="name" />
      {CONTACT_FIELDS.map((f) => (
        <Field key={f.key} name={f.name} value={contacts[f.key] ?? ""} ph={f.ph} type={f.type} autoComplete={f.autoComplete}
          onChange={(v) => setContacts((c) => ({ ...c, [f.key]: v }))} />
      ))}

      <div style={{ padding: "14px 0", borderTop: "1px solid var(--c-line)" }}>
        <div style={label}>интересы в праве · выбрано {interests.length} из {MAX_INTERESTS}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 10 }}>
          {LEGAL_INTERESTS.map((name) => {
            const on = interests.includes(name);
            return (
              <button key={name} type="button" onClick={() => toggle(name)} aria-pressed={on}
                /* Лимит выбран – невыбранные гасим, но не прячем: иначе непонятно, куда делся список */
                disabled={!on && full} className="foc"
                style={{
                  ...mono, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)", textTransform: "none",
                  padding: "7px 12px", borderRadius: 999,
                  border: `1px solid ${on ? "var(--c-accent)" : "var(--c-line)"}`,
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

      <p style={{ fontSize: "var(--t-small)", lineHeight: 1.5, color: "var(--c-text-3)", margin: "6px 0 0" }}>
        Сохраняя, вы даёте согласие на обработку персональных данных оператору {CLUB_OPERATOR.shortName} –{" "}
        <Link to="/privacy" className="foc" style={{ color: "var(--c-accent-text)", textDecoration: "underline", textUnderlineOffset: 2 }}>политика обработки</Link>.
      </p>
      {err && <p role="alert" style={{ ...mono, fontSize: "var(--t-caption)", color: "var(--c-danger-text)", margin: "10px 0 0" }}>{err}</p>}

      <button onClick={save} disabled={state === "saving"} className="foc"
        style={{ ...action, width: "100%", marginTop: 14, padding: "13px 20px", borderRadius: "var(--r-md)", fontSize: 13, cursor: state === "saving" ? "wait" : "pointer" }}>
        {state === "saving" ? "сохраняем…" : state === "saved" ? "сохранено" : "сохранить"}
      </button>
    </Section>
  );
}

/* ── История баллов ───────────────────────────────────────────────── */

function History({ token }: { token: string }) {
  const ledger = useLedger(token);
  const list = ledger.data ?? [];
  return (
    <Section title="История баллов" note={list.length ? `записей ${list.length}` : undefined}>
      <div id="ledger">
      {ledger.isLoading && <p style={{ ...label, margin: 0 }}>загружаем…</p>}
      {!ledger.isLoading && list.length === 0 && (
        <p style={{ margin: 0, color: "var(--c-text-2)", fontSize: "var(--t-body)", borderTop: "1px solid var(--c-line)", paddingTop: 14 }}>
          Начислений пока нет. Баллы приходят за программы ДПО, события клуба и приглашённых однокурсников.
        </p>
      )}
      {list.map((p: LedgerEntry) => (
        <div key={p.id} style={{ display: "grid", gridTemplateColumns: "56px 1fr auto", gap: 14, alignItems: "baseline", padding: "11px 0", borderTop: "1px solid var(--c-line)" }}>
          <span style={{ ...mono, fontSize: "var(--t-caption)", color: "var(--c-text-3)" }}>{fmtDay(p.created_at)}</span>
          <span style={{ fontSize: "var(--t-body)", color: "var(--c-text-2)", lineHeight: 1.4 }}>{p.comment || REASON_TEXT[p.reason] || p.reason}</span>
          <span style={{ ...mono, fontSize: 15, fontWeight: 500, whiteSpace: "nowrap", color: p.delta >= 0 ? "var(--c-ok-text)" : "var(--c-danger-text)" }}>
            {p.delta >= 0 ? "+" : ""}{p.delta}
          </span>
        </div>
      ))}
      </div>
    </Section>
  );
}

/* ── Правила достижений ───────────────────────────────────────────── */

function Rules({ me }: { me: Me }) {
  const earned = me.achievements.filter((a) => a.earned).length;
  if (!me.achievements.length) return null;

  return (
    <Section title="Достижения: правила и прогресс" note={`открыто ${earned} из ${me.achievements.length}`}>
      {me.achievements.map((b: Achievement) => (
        <div key={b.key} style={{ display: "grid", gridTemplateColumns: "26px 1fr", gap: 14, padding: "14px 0", borderTop: "1px solid var(--c-line)" }}>
          <span aria-hidden style={{ fontSize: 17, lineHeight: 1.2, filter: b.earned ? "none" : "grayscale(1)", opacity: b.earned ? 1 : 0.6 }}>{b.icon}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
              <span style={{ fontSize: "var(--t-body)", fontWeight: b.earned ? 500 : 400, color: b.earned ? "var(--c-text)" : "var(--c-text-2)" }}>{b.title}</span>
              <span style={{ ...mono, fontSize: "var(--t-micro)", letterSpacing: "var(--tr-data)", textTransform: "none", whiteSpace: "nowrap", color: b.earned ? "var(--c-ok-text)" : "var(--c-text-3)" }}>
                {b.earned ? "получено" : `${b.current} / ${b.target}`}
              </span>
            </div>
            <p style={{ fontSize: "var(--t-small)", lineHeight: 1.5, color: "var(--c-text-3)", margin: "6px 0 10px" }}>{b.description}</p>
            <Progress value={b.current} target={b.target} done={b.earned} />
          </div>
        </div>
      ))}
    </Section>
  );
}

/* ── Права по 152-ФЗ ──────────────────────────────────────────────── */

function DataRights({ token }: { token: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const exportData = async () => {
    try {
      const res = await fetch("/api/me/export", { headers: { authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Не удалось выгрузить данные");
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "moi-dannye-kluba.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast("Данные выгружены");
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };

  const del = async () => {
    setBusy(true);
    try {
      await apiPost("/me/delete", { confirm: "УДАЛИТЬ" }, undefined, token);
      localStorage.removeItem(TOKEN_KEY);
      toast("Аккаунт и данные удалены");
      setTimeout(() => window.location.assign("/"), 900);
    } catch (e) {
      toast((e as Error).message, "err");
      setBusy(false);
    }
  };

  return (
    <section id="data-rights" className="profile-rights" aria-labelledby="profile-rights-title" style={{ marginTop: 48, padding: "28px 24px", background: "var(--c-bg-sunken)", border: "1px solid var(--c-line)", borderRadius: "var(--r-lg)" }}>
      <p style={{ ...label, margin: 0, color: "var(--c-text-3)" }}>права субъекта · 152-ФЗ</p>
      <h2 id="profile-rights-title" style={{ ...disp, fontWeight: 600, fontSize: "var(--t-h3)", margin: "10px 0 0", color: "var(--c-text)" }}>Ваши персональные данные</h2>
      <p style={{ color: "var(--c-text-2)", fontSize: "var(--t-body)", lineHeight: 1.55, margin: "10px 0 0", maxWidth: 620 }}>
        Этот блок отдельно от редактирования профиля. Вы вправе получить копию данных, отозвать согласие
        и потребовать удаления. После удаления профиль обезличивается, контакты и фото стираются, вход закрывается.
        Действие необратимо.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
        <button type="button" onClick={exportData} className="foc" style={{ ...actionGhost, padding: "11px 16px", borderRadius: "var(--r-md)" }}>скачать мои данные (json)</button>
        {!open && (
          <button type="button" onClick={() => setOpen(true)} className="foc"
            style={{ ...actionGhost, padding: "11px 16px", borderRadius: "var(--r-md)", borderColor: "var(--c-danger-text)", color: "var(--c-danger-text)" }}>
            удалить мой аккаунт
          </button>
        )}
      </div>

      {open && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--c-line)" }}>
          <label htmlFor="v2-del-confirm" style={{ ...label, display: "block", textTransform: "none", letterSpacing: 0, fontSize: 13, color: "var(--c-text-2)" }}>
            Введите <b style={{ color: "var(--c-danger-text)" }}>УДАЛИТЬ</b> для подтверждения
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
            <input id="v2-del-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="УДАЛИТЬ" className="foc"
              style={{ ...field, ...mono, width: "auto", marginTop: 0, minWidth: 160 }} />
            <button type="button" onClick={del} disabled={confirm !== "УДАЛИТЬ" || busy} className="foc"
              style={{ ...action, padding: "11px 16px", borderRadius: "var(--r-md)", background: "var(--c-danger)", color: "#fff",
                cursor: confirm === "УДАЛИТЬ" && !busy ? "pointer" : "not-allowed", opacity: confirm === "УДАЛИТЬ" && !busy ? 1 : 0.5 }}>
              {busy ? "удаляем…" : "удалить навсегда"}
            </button>
            <button type="button" onClick={() => { setOpen(false); setConfirm(""); }} className="foc" style={{ ...actionGhost, padding: "11px 16px", borderRadius: "var(--r-md)" }}>отмена</button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ── Экран ────────────────────────────────────────────────────────── */

function Body({ token, onLogout }: { token: string; onLogout: () => void }) {
  const me = useMe(token);
  const expired = me.isError && isAuthError(me.error);

  useEffect(() => {
    if (expired) onLogout();
  }, [expired, onLogout]);

  return (
    <CabinetShell active="profile" onLogout={onLogout}>
      {me.isLoading && <p style={{ ...label, margin: 0 }}>загружаем профиль…</p>}

      {me.isError && !expired && (
        <div style={{ border: "1px solid var(--c-line)", borderRadius: "var(--r-lg)", padding: 24 }}>
          <p style={{ ...label, color: "var(--c-danger-text)", margin: 0 }}>профиль сейчас недоступен</p>
          <p style={{ margin: "10px 0 0", color: "var(--c-text-2)", fontSize: "var(--t-body)" }}>Не удалось получить данные. Попробуйте ещё раз.</p>
          <button onClick={() => me.refetch()} className="foc" style={{ ...action, marginTop: 14, padding: "10px 16px", borderRadius: "var(--r-md)" }}>повторить</button>
        </div>
      )}

      {me.data && (
        <div className="lkv2-grid" style={{ display: "grid", gridTemplateColumns: "330px 1fr", gap: 28, alignItems: "start" }}>
          <div className="lkv2-aside" style={{ position: "sticky", top: 88 }}>
            <IdentityCard me={me.data} token={token} onChanged={() => me.refetch()} />
          </div>
          <div>
            {me.data.alumni.verification_status === "verified" ? (
              <>
                <div className="profile-edit-zone">
                  <p style={{ ...label, margin: "0 0 18px", color: "var(--c-text-3)" }}>редактирование профиля</p>
                  <ContactsForm me={me.data} token={token} onSaved={() => me.refetch()} />
                  <History token={token} />
                  <Rules me={me.data} />
                </div>
                <DataRights token={token} />
              </>
            ) : (
              <section style={{ border: "1px solid var(--c-line)", borderRadius: "var(--r-lg)", padding: 22, background: "var(--c-bg-raised)" }}>
                <p style={{ ...label, margin: 0, color: "var(--c-status-text)" }}>
                  {me.data.alumni.verification_status === "rejected" ? "заявка отклонена" : "ожидает верификации"}
                </p>
                <p style={{ margin: "12px 0 0", color: "var(--c-text-2)", fontSize: "var(--t-body)", lineHeight: 1.55, maxWidth: 520 }}>
                  {me.data.alumni.verification_status === "rejected"
                    ? "Редактирование профиля и кабинет недоступны. При необходимости свяжитесь с учебным офисом."
                    : "Пока офис проверяет выпуск, можно загрузить фото слева. Контакты, баллы и достижения откроются после подтверждения."}
                </p>
                <Link to="/lk" className="foc" style={{ ...actionGhost, display: "inline-block", marginTop: 16, textDecoration: "none" }}>к статусу заявки</Link>
              </section>
            )}
          </div>
        </div>
      )}
    </CabinetShell>
  );
}

export default function ProfileV2() {
  useHead({ title: "Профиль", noindex: true });
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return <Navigate to="/lk" replace />;
  return <Body token={token} onLogout={() => { logoutSession(); window.location.assign("/lk"); }} />;
}
