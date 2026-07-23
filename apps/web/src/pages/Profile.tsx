import { useEffect, useId, useRef, useState, type CSSProperties, type RefObject, type Dispatch, type SetStateAction } from "react";
import { Link, Navigate } from "react-router-dom";
import { LEVELS, LEGAL_INTERESTS, MAX_INTERESTS } from "@club/shared";
import { apiPatch, apiPost, type Achievement, type LedgerEntry } from "../lib/api.js";
import { useMe, useLedger } from "../lib/queries.js";
import { useToast } from "../components/Toast.js";
import { LkShell } from "../components/LkShell.js";
import { useLkTokens, lkSurface } from "../lib/lk-theme.js";
import { useHead } from "../lib/title.js";

/** Профиль выпускника – порт «Профиль.dc.html» (C). Контакты + история баллов + правила достижений. */

const TOKEN_KEY = "club_token";
const mono: CSSProperties = { fontFamily: "'Martian Mono', monospace" };
const disp: CSSProperties = { fontFamily: "'Unbounded', sans-serif" };


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
  useHead({ title: "Профиль", noindex: true }); // приватная зона — не индексируем
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
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);

  // Загрузка фото: multipart → /me/avatar, после — обновляем /me.
  const uploadAvatar = async (file: File) => {
    setAvatarBusy(true); setSaveErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/me/avatar", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any)?.error || "Не удалось загрузить фото");
      me.refetch();
    } catch (e) {
      setSaveErr((e as Error).message);
    } finally {
      setAvatarBusy(false);
    }
  };

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
  const toast = useToast();
  const save = async () => {
    setSaveState("saving");
    setSaveErr(null);
    try {
      await apiPatch("/me/profile", { fio: fio.trim() || undefined, contacts, interests }, token);
      setSaveState("saved");
      toast("Профиль сохранён ✓"); // фидбек виден из любой точки страницы
      me.refetch(); // данные профиля сразу свежие на всех экранах
      setTimeout(() => setSaveState("idle"), 2500);
    } catch (e) {
      setSaveErr((e as Error).message || "Не удалось сохранить");
      toast("Не удалось сохранить", "err");
      setSaveState("idle");
    }
  };

  const data = me.data;
  const idx = data ? LEVELS.findIndex((l) => l.key === data.level.level) : 0;

  return (
    <LkShell active="profile" onLogout={logout}>
      <ProfileShell me={me} logout={logout} />
      {data && (
        <ProfileContent
          ledger={ledger}
          data={data}
          idx={idx}
          fio={fio}
          setFio={setFio}
          contacts={contacts}
          setContacts={setContacts}
          interests={interests}
          toggleInterest={toggleInterest}
          saveState={saveState}
          saveErr={saveErr}
          save={save}
          avatarBusy={avatarBusy}
          fileRef={fileRef}
          uploadAvatar={uploadAvatar}
        />
      )}
    </LkShell>
  );
}

function ProfileShell({ me, logout }: { me: ReturnType<typeof useMe>; logout: () => void }) {
  const t = useLkTokens();
  const surface = lkSurface(t);
  if (me.isLoading) return <p style={{ ...mono, fontSize: 13, color: t.muted }}>Загрузка профиля…</p>;
  if (me.isError) {
    return (
      <div style={{ ...surface, padding: 28 }}>
        <p style={{ color: "#B5331B", ...mono, fontSize: 13 }}>Сессия истекла.</p>
        <button onClick={logout} className="foc" style={{ marginTop: 12, ...mono, fontSize: 13, border: `1.5px solid ${t.ghostBtnBorder}`, borderRadius: 10, padding: "8px 13px", cursor: "pointer", background: t.ghostBtnBg, color: t.text }}>Войти заново</button>
      </div>
    );
  }
  return null;
}

function ProfileContent({
  ledger, data, idx, fio, setFio, contacts, setContacts, interests, toggleInterest,
  saveState, saveErr, save, avatarBusy, fileRef, uploadAvatar,
}: {
  ledger: ReturnType<typeof useLedger>;
  data: NonNullable<ReturnType<typeof useMe>["data"]>;
  idx: number;
  fio: string; setFio: (v: string) => void;
  contacts: Record<string, string>; setContacts: Dispatch<SetStateAction<Record<string, string>>>;
  interests: string[]; toggleInterest: (name: string) => void;
  saveState: "idle" | "saving" | "saved"; saveErr: string | null; save: () => void;
  avatarBusy: boolean; fileRef: RefObject<HTMLInputElement>;
  uploadAvatar: (file: File) => void;
}) {
  const t = useLkTokens();
  const surface = lkSurface(t);

  return (
    <>
            <div style={{ ...surface, display: "flex", alignItems: "center", gap: 24, padding: "26px 28px", flexWrap: "wrap", boxShadow: t.shadow }}>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={avatarBusy}
                title="Сменить фото"
                aria-label="Загрузить фото профиля"
                className="foc"
                style={{ position: "relative", width: 88, height: 88, borderRadius: 22, flex: "none", border: "none", cursor: "pointer", overflow: "hidden", background: "linear-gradient(135deg,#EC5A13,#B5331B)", display: "flex", alignItems: "center", justifyContent: "center", ...disp, fontWeight: 800, fontSize: 38, color: "#FBF3E8", boxShadow: "0 12px 26px -12px rgba(201,69,14,.7)" }}
              >
                {data.alumni.avatar
                  ? <img src={`/api/avatars/${data.alumni.avatar}`} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                  : (data.alumni.fio?.trim()?.[0] ?? "В").toUpperCase()}
                <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, background: "rgba(20,24,31,.65)", color: "#FBF3E8", fontFamily: "'Onest'", fontWeight: 600, fontSize: 10, padding: "3px 0", textAlign: "center" }}>
                  {avatarBusy ? "…" : data.alumni.avatar ? "Сменить" : "Фото"}
                </span>
              </button>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); e.target.value = ""; }} />
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ ...disp, fontWeight: 600, fontSize: 27, letterSpacing: "-0.01em", lineHeight: 1.1 }}>{data.alumni.fio ?? "Выпускник"}</div>
                <div style={{ ...mono, fontSize: 13, color: t.muted, marginTop: 8 }}>Выпуск {data.alumni.cohort ?? "–"}{data.alumni.edu_program ? ` · ${data.alumni.edu_level ?? "магистратура"} · ОП «${data.alumni.edu_program}»` : " · факультет права"}</div>
                <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 14 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600, padding: "6px 13px", borderRadius: 999, background: "rgba(196,154,69,.16)", color: "#a07d2e", border: "1px solid rgba(196,154,69,.5)" }}><span style={{ width: 16, height: 16, borderRadius: "50%", background: "#C49A45", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>✓</span>Подтверждён</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, padding: "6px 13px", borderRadius: 999, background: t.levelChipBg, color: t.levelChipText }}>Уровень {idx + 1} · {data.level.level_title}</span>
                </div>
              </div>
              <div style={{ textAlign: "center", padding: "0 6px" }}>
                <div style={{ ...disp, fontWeight: 800, fontSize: 40, lineHeight: 1, letterSpacing: "-0.02em", color: "#EC5A13" }}>{data.level.points}</div>
                <div style={{ ...mono, fontSize: 11, color: t.muted, marginTop: 8 }}>баллов всего</div>
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
                  <Field label="ФИО" value={fio} onChange={setFio} ph="Имя Фамилия" tokens={t} />
                  {CONTACT_FIELDS.map((f) => (
                    <Field key={f.key} label={f.label} value={contacts[f.key] ?? ""} onChange={(v) => setContacts((c) => ({ ...c, [f.key]: v }))} ph={f.ph} tokens={t} />
                  ))}
                  <div>
                    <div style={{ ...mono, fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: t.muted }}>Интересы в юриспруденции <span style={{ textTransform: "none" }}>· до {MAX_INTERESTS}</span></div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                      {LEGAL_INTERESTS.map((name) => {
                        const on = interests.includes(name);
                        return (
                          <button key={name} type="button" onClick={() => toggleInterest(name)} aria-pressed={on} className="foc"
                            style={{ fontSize: 12.5, fontWeight: 500, padding: "7px 12px", borderRadius: 999, cursor: "pointer", border: "1.5px solid " + (on ? "#EC5A13" : t.chipBorder), background: on ? "rgba(236,90,19,.12)" : t.chipBg, color: on ? "#C9450E" : t.text }}>
                            {name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <p style={{ fontSize: 12, lineHeight: 1.5, color: t.muted, margin: 0 }}>
                    Сохраняя, вы даёте согласие на обработку персональных данных —{" "}
                    <Link to="/privacy" className="foc" style={{ color: "#C9450E", textDecoration: "underline", textUnderlineOffset: 2 }}>политика обработки</Link>.
                  </p>
                  {saveErr && <p style={{ ...mono, fontSize: 12, color: "#B5331B", margin: 0 }}>{saveErr}</p>}
                  <button onClick={save} disabled={saveState === "saving"} className="foc" style={{ width: "100%", fontWeight: 600, fontSize: 15, padding: 13, borderRadius: 12, border: "none", background: saveState === "saved" ? "#1F8A5B" : "#EC5A13", color: "#FBF3E8", cursor: "pointer", transition: "background .2s" }}>
                    {saveState === "saving" ? "Сохраняем…" : saveState === "saved" ? "Сохранено ✓" : "Сохранить"}
                  </button>
                </div>
              </div>

              {/* HISTORY */}
              <div style={{ ...surface, padding: "26px 28px" }}>
                <div style={{ ...disp, fontWeight: 600, fontSize: 20, letterSpacing: "-0.01em" }}>История баллов</div>
                <div style={{ display: "flex", flexDirection: "column", marginTop: 18 }}>
                  {ledger.isLoading && <p style={{ ...mono, fontSize: 12, color: t.muted }}>Загрузка…</p>}
                  {ledger.data?.length === 0 && <p style={{ ...mono, fontSize: 12, color: t.muted }}>Пока нет начислений.</p>}
                  {ledger.data?.map((p: LedgerEntry) => (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 0", borderBottom: `1px solid ${t.dividerSoft}` }}>
                      <span style={{ ...mono, fontSize: 11, color: t.muted, width: 54, flex: "none" }}>{fmtShort(p.created_at)}</span>
                      <span style={{ flex: 1, fontSize: 14, color: t.textSoft, lineHeight: 1.35 }}>{p.comment || REASON_TEXT[p.reason] || p.reason}</span>
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
              <p style={{ color: t.muted, fontSize: 15, margin: "0 0 22px" }}>{data.achievements.filter((a) => a.earned).length} из {data.achievements.length} открыто · достижения отражают вашу активность в клубе.</p>
              <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
                {data.achievements.map((b: Achievement) => {
                  const inProg = !b.earned && b.current > 0;
                  const star = !b.earned && b.star;
                  const statusColor = b.earned ? "#1F8A5B" : inProg ? "#EC5A13" : "#6B7280";
                  const badgeBg = b.earned ? "linear-gradient(140deg,#2C6E80,#11296B)" : star ? "#EC5A13" : t.badgeLocked;
                  const badgeInk = b.earned || star ? "#FBF3E8" : "#b8a98a";
                  return (
                  <div key={b.key} style={{ display: "flex", gap: 18, ...surface, borderRadius: 18, padding: 22, opacity: b.earned || star ? 1 : inProg ? 0.85 : 0.55 }}>
                    <div style={{ width: 52, height: 52, borderRadius: 15, transform: "rotate(45deg)", flex: "none", background: badgeBg, boxShadow: b.earned ? "0 10px 24px -12px rgba(17,41,107,.65)" : star ? "0 0 0 4px rgba(236,90,19,.18), 0 12px 26px -12px rgba(236,90,19,.7)" : `inset 0 0 0 1px ${t.surfaceBorder}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ transform: "rotate(-45deg)", ...disp, fontWeight: 800, fontSize: b.icon.length > 1 ? 13 : 17, color: badgeInk }}>{b.icon}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ ...disp, fontWeight: 600, fontSize: 16, letterSpacing: "-0.01em" }}>{b.title}</div>
                        <span style={{ ...mono, fontSize: 10, letterSpacing: ".04em", color: statusColor, whiteSpace: "nowrap" }}>{b.earned ? "ПОЛУЧЕНО" : inProg ? `${b.current} / ${b.target}` : "ЗАКРЫТО"}</span>
                      </div>
                      <p style={{ fontSize: 13, lineHeight: 1.5, color: t.muted, margin: "8px 0 0" }}>{b.description}</p>
                      <div style={{ height: 8, borderRadius: 999, background: t.progressTrack, overflow: "hidden", marginTop: 12 }}>
                        <div style={{ height: "100%", borderRadius: 999, background: "linear-gradient(90deg,#EC5A13,#C9450E)", width: `${b.earned ? 100 : b.target ? Math.round((b.current / b.target) * 100) : 0}%` }} />
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>

            <DeleteAccount />
    </>
  );
}

/** 152-ФЗ: самоудаление аккаунта и обезличивание данных (с подтверждением «УДАЛИТЬ»). */
function DeleteAccount() {
  const t = useLkTokens();
  const surface = lkSurface(t);
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const del = async () => {
    setBusy(true);
    try {
      await apiPost("/me/delete", { confirm: "УДАЛИТЬ" }, undefined, localStorage.getItem(TOKEN_KEY) ?? undefined);
      localStorage.removeItem(TOKEN_KEY);
      toast("Аккаунт и данные удалены");
      setTimeout(() => window.location.assign("/"), 900);
    } catch (e) {
      toast((e as Error).message, "err");
      setBusy(false);
    }
  };
  // 152-ФЗ (ст. 14): выгрузка копии своих данных одним JSON.
  const exportData = async () => {
    try {
      const res = await fetch("/api/me/export", { headers: { authorization: `Bearer ${localStorage.getItem(TOKEN_KEY) ?? ""}` } });
      if (!res.ok) throw new Error("Не удалось выгрузить данные");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "moi-dannye-kluba.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast("Данные выгружены ✓");
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  return (
    <div style={{ marginTop: 44, ...surface, padding: "26px 28px", border: "1.5px solid rgba(181,51,27,.35)" }}>
      <div style={{ ...disp, fontWeight: 600, fontSize: 18, color: "#B5331B" }}>Удаление аккаунта и данных</div>
      <p style={{ color: t.muted, fontSize: 14, lineHeight: 1.5, margin: "10px 0 0", maxWidth: 620 }}>
        По 152-ФЗ вы вправе получить копию своих данных, отозвать согласие и потребовать удаления персональных данных. Профиль будет обезличен, контакты и аватар стёрты, вход в аккаунт закрыт. Действие необратимо.
      </p>
      <button onClick={exportData} className="foc" style={{ marginTop: 14, fontWeight: 600, fontSize: 14, padding: "11px 20px", borderRadius: 12, border: `1.5px solid ${t.ghostBtnBorder}`, background: t.ghostBtnBg, color: t.text, cursor: "pointer" }}>Скачать мои данные (JSON)</button>
      {!open ? (
        <button onClick={() => setOpen(true)} className="foc" style={{ marginTop: 16, fontWeight: 600, fontSize: 14, padding: "11px 20px", borderRadius: 12, border: "1.5px solid #B5331B", background: "transparent", color: "#B5331B", cursor: "pointer" }}>Удалить мой аккаунт</button>
      ) : (
        <div style={{ marginTop: 16 }}>
          <div style={{ ...mono, fontSize: 12, color: t.muted, marginBottom: 8 }}>Введите <b style={{ color: "#B5331B" }}>УДАЛИТЬ</b> для подтверждения:</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="УДАЛИТЬ" aria-label="Подтверждение удаления — введите слово УДАЛИТЬ" className="foc" style={{ ...mono, fontSize: 14, padding: "10px 14px", borderRadius: 10, border: `1.5px solid ${t.ghostBtnBorder}`, background: t.ghostBtnBg, color: t.text }} />
            <button onClick={del} disabled={confirm !== "УДАЛИТЬ" || busy} className="foc" style={{ fontWeight: 600, fontSize: 14, padding: "11px 20px", borderRadius: 12, border: "none", background: "#B5331B", color: "#fff", cursor: confirm === "УДАЛИТЬ" && !busy ? "pointer" : "not-allowed", opacity: confirm === "УДАЛИТЬ" && !busy ? 1 : 0.5 }}>{busy ? "Удаляем…" : "Удалить навсегда"}</button>
            <button onClick={() => { setOpen(false); setConfirm(""); }} className="foc" style={{ fontWeight: 600, fontSize: 14, padding: "11px 20px", borderRadius: 12, border: `1.5px solid ${t.ghostBtnBorder}`, background: t.ghostBtnBg, color: t.text, cursor: "pointer" }}>Отмена</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, ph, tokens: t }: { label: string; value: string; onChange: (v: string) => void; ph: string; tokens: import("../lib/lk-theme.js").LkTokens }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 7 }}>{label}</label>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={ph} className="foc" style={{ width: "100%", fontSize: 15, padding: "12px 14px", borderRadius: 11, border: `1.5px solid ${t.inputBorder}`, background: t.inputBg, color: t.text, outline: "none" }} />
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
