import { useState, useEffect } from "react";
import Modal from "../components/Modal.js";
import { computeLevel } from "@club/shared";
import { mono, disp, label, action, actionGhost, field, Pill } from "./ui.js";
import { useOverview, useMembers, useMemberMutations, type Member } from "../lib/admin.js";
import { VERIF } from "./common.js";

export const LEVEL_RU: Record<string, string> = { graduate: "Выпускник", friend: "Друг клуба", expert: "Знаток", ambassador: "Амбассадор" };

export function Members() {
  const [sel, setSel] = useState<Member | null>(null);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [vf, setVf] = useState<string>("pending");
  const [page, setPage] = useState(1);
  const pendingCount = useOverview().data?.pending_verifications ?? 0;

  // Серверный поиск с дебаунсом (не запрос на каждую клавишу).
  useEffect(() => {
    const t = setTimeout(() => { setQ(qInput.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const membersQ = useMembers({ q: q || undefined, status: vf === "all" ? undefined : vf, page, limit: 50 });
  const data = membersQ.data;
  const list = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.page_size ?? 50;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const setFilter = (key: string) => { setVf(key); setPage(1); };

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 16 }}>
        {[
          { key: "pending", label: `заявки на вступление${pendingCount ? ` · ${pendingCount}` : ""}` },
          { key: "all", label: "все" },
          { key: "verified", label: "подтверждённые" },
          { key: "rejected", label: "отклонённые" },
        ].map((f) => {
          const on = vf === f.key;
          // Очередь на верификацию помечена акцентом, только когда в ней кто-то есть
          const urgent = f.key === "pending" && pendingCount > 0 && !on;
          return (
            <button key={f.key} onClick={() => setFilter(f.key)} aria-pressed={on} className="foc"
              style={{
                ...mono, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)", textTransform: "uppercase",
                padding: "7px 12px", borderRadius: 999, cursor: "pointer",
                border: `1px solid ${on ? "var(--c-accent)" : urgent ? "var(--c-accent-text)" : "var(--c-line)"}`,
                background: on ? "var(--c-accent)" : "transparent",
                color: on ? "var(--c-on-accent)" : urgent ? "var(--c-accent-text)" : "var(--c-text-2)",
              }}>{f.label}</button>
          );
        })}
        <input aria-label="Поиск по выпускникам" value={qInput} onChange={(e) => setQInput(e.target.value)}
          placeholder="ФИО, год, программа…" className="foc" style={{ ...field, marginLeft: "auto", width: 260, maxWidth: "100%" }} />
        <span style={label}>всего: {total}</span>
      </div>

      <div>
        <div className="adm-member-head" style={{ display: "grid", gridTemplateColumns: "1fr 78px 132px 74px 78px 74px 96px", gap: 12, padding: "0 0 10px" }}>
          <span style={label}>выпускник</span><span style={label}>выпуск</span><span style={label}>статус</span>
          <span style={label}>баллы</span><span style={label}>скидка</span><span style={label}>друзья</span><span style={label}>подкасты</span>
        </div>
        {list.map((m) => (
          <button key={m.id} onClick={() => setSel(m)} className="foc adm-member"
            style={{ display: "grid", width: "100%", gridTemplateColumns: "1fr 78px 132px 74px 78px 74px 96px", gap: 12, alignItems: "center",
              textAlign: "left", padding: "12px 0", borderTop: "1px solid var(--c-line)", border: "none", borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: "var(--c-line)", background: "transparent", color: "inherit", cursor: "pointer", font: "inherit" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.fio}</span>
              {m.duplicate && (
                <span title="Возможный дубль: тот же ФИО и год выпуска"
                  style={{ ...mono, flexShrink: 0, fontSize: 10, letterSpacing: "var(--tr-data)", color: "var(--c-status-text)", border: "1px solid var(--c-status)", borderRadius: 999, padding: "2px 7px" }}>дубль?</span>
              )}
            </span>
            <span style={{ ...mono, fontSize: 12, color: "var(--c-text-3)" }}>{m.cohort}</span>
            <span><Pill status={m.verification_status}>{VERIF[m.verification_status]}</Pill></span>
            <span style={{ ...mono, fontSize: 13 }}>{m.points_cached}</span>
            <span style={{ ...mono, fontSize: 13 }}>{m.verification_status === "verified" ? `−${computeLevel(m.points_cached ?? 0).discount_percent + (m.personal_discount ?? 0)}%` : "–"}</span>
            <span style={{ ...mono, fontSize: 13 }}>{m.friends_count ?? 0}</span>
            <span style={{ ...mono, fontSize: 11, color: m.podcast_active ? "var(--c-ok-text)" : "var(--c-text-3)" }}>{m.podcast_active ? "подписка" : "–"}</span>
          </button>
        ))}
        {list.length > 0 && <div style={{ borderTop: "1px solid var(--c-line)" }} />}
        {!membersQ.isLoading && list.length === 0 && (
          <p style={{ ...label, textTransform: "none", letterSpacing: 0, textAlign: "center", padding: "40px 0", borderTop: "1px solid var(--c-line)" }}>
            {q ? "По запросу ничего не найдено." : "Выпускников нет."}
          </p>
        )}
      </div>

      {pages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginTop: 20 }}>
          <span style={label}>показаны {from}–{to} из {total}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="foc" style={{ ...actionGhost, opacity: page <= 1 ? 0.4 : 1 }}>← назад</button>
            <span style={label}>{page} / {pages}</span>
            <button disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))} className="foc" style={{ ...actionGhost, opacity: page >= pages ? 0.4 : 1 }}>вперёд →</button>
          </div>
        </div>
      )}
      {sel && <MemberModal member={sel} onClose={() => setSel(null)} />}
    </>
  );
}

export function MemberModal({ member, onClose }: { member: Member; onClose: () => void }) {
  const { patchMember, addPoints, grantPodcastSub, anonymizeMember } = useMemberMutations();
  const [discount, setDiscount] = useState(String(member.personal_discount));
  const [delta, setDelta] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);

  const sectionLabel: React.CSSProperties = { ...label, display: "block", marginTop: 20 };
  const rowBtn: React.CSSProperties = { ...action, padding: "11px 18px" };

  return (
    <Modal onClose={onClose} labelledBy="member-modal-title" maxWidth={460}>
      <div style={{ position: "relative", background: "var(--c-bg-raised)", color: "var(--c-text)", border: "1px solid var(--c-line)", borderRadius: "var(--r-lg)", padding: 26 }}>
        <button onClick={onClose} aria-label="Закрыть" className="foc"
          style={{ position: "absolute", right: 16, top: 16, width: 34, height: 34, borderRadius: "var(--r-sm)", border: "1px solid var(--c-line-control)", background: "transparent", color: "var(--c-text-3)", cursor: "pointer" }}>✕</button>

        <h2 id="member-modal-title" style={{ ...disp, fontWeight: 700, fontSize: "var(--t-h3)", margin: 0, paddingRight: 40 }}>{member.fio}</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 14 }}>
          {member.avatar
            ? <img src={`/api/avatars/${member.avatar}`} alt="" width={56} height={56} style={{ width: 56, height: 56, borderRadius: "var(--r-md)", objectFit: "cover", flexShrink: 0 }} />
            : <div aria-hidden style={{ width: 56, height: 56, borderRadius: "var(--r-md)", background: "var(--c-bg-sunken)", border: "1px solid var(--c-line)", display: "flex", alignItems: "center", justifyContent: "center", ...disp, fontWeight: 700, fontSize: 18, color: "var(--c-text-2)", flexShrink: 0 }}>{(member.fio ?? "?").trim().charAt(0).toUpperCase()}</div>}
          <div style={{ ...label, fontSize: 10, minWidth: 0 }}>
            выпуск {member.cohort} · {LEVEL_RU[member.level_cached] ?? member.level_cached} · {member.points_cached} баллов · в друзьях {member.friends_count ?? 0}
            {member.email && <div style={{ marginTop: 4, textTransform: "none", letterSpacing: 0, color: "var(--c-text-2)" }}>{member.email}</div>}
          </div>
        </div>

        {/* Анкета из формы вступления – всё, что заполнил выпускник */}
        <div style={{ marginTop: 16 }}>
          {member.email && <Fact name="почта" value={member.email} />}
          {(member.edu_level || member.edu_program) && (
            <Fact name="образование" value={[member.edu_level, member.edu_program && `ОП «${member.edu_program}»`].filter(Boolean).join(" · ")} />
          )}
          {member.contacts_json && Object.entries(member.contacts_json).filter(([, v]) => v).map(([k, v]) => <Fact key={k} name={k} value={v} />)}
          {!!member.interests_json?.length && <Fact name="интересы" value={member.interests_json.join(", ")} />}
          {member.joined_at && <Fact name="заявка подана" value={new Date(member.joined_at).toLocaleDateString("ru-RU")} />}
          <div style={{ borderTop: "1px solid var(--c-line)" }} />
        </div>

        <div style={sectionLabel}>верификация</div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button disabled={patchMember.isPending} onClick={() => patchMember.mutate({ id: member.id, verification_status: "verified" })} className="foc" style={{ ...rowBtn, flex: 1 }}>Подтвердить</button>
          <button disabled={patchMember.isPending} onClick={() => patchMember.mutate({ id: member.id, verification_status: "rejected" })} className="foc"
            style={{ ...actionGhost, flex: 1, padding: "11px 18px", color: "var(--c-danger-text)", borderColor: "var(--c-danger-text)" }}>Отклонить</button>
        </div>

        <div style={sectionLabel}>ручные баллы</div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input aria-label="Сколько баллов начислить или списать" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="напр. 60 или −30" className="foc" style={{ ...field, flex: 1 }} />
          <button disabled={addPoints.isPending} className="foc" style={rowBtn}
            onClick={() => { const d = parseInt(delta, 10); if (!isNaN(d)) { addPoints.mutate({ id: member.id, delta: d }); setDelta(""); } }}>Начислить</button>
        </div>

        <div style={sectionLabel}>персональная скидка · 0–10%</div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input aria-label="Персональная скидка, %" value={discount} onChange={(e) => setDiscount(e.target.value)} type="number" min={0} max={10} className="foc" style={{ ...field, flex: 1 }} />
          <button disabled={patchMember.isPending} className="foc" style={rowBtn}
            onClick={() => patchMember.mutate({ id: member.id, personal_discount: Math.max(0, Math.min(10, parseInt(discount, 10) || 0)) })}>Сохранить</button>
        </div>

        <div style={sectionLabel}>подкасты · подписка {member.podcast_active ? "активна" : "нет"}</div>
        <button disabled={grantPodcastSub.isPending} onClick={() => grantPodcastSub.mutate(member.id)} className="foc"
          style={{ ...actionGhost, width: "100%", marginTop: 8, padding: "11px 18px", textAlign: "center" }}>
          {grantPodcastSub.isPending ? "Продлеваем…" : "Продлить подписку на год (оплата по счёту)"}
        </button>

        {/* 152-ФЗ: исполнение запроса на удаление ПДн без разработчика */}
        <div style={{ marginTop: 24, border: "1px solid var(--c-danger-text)", borderRadius: "var(--r-md)", padding: 14 }}>
          <div style={{ ...label, color: "var(--c-danger-text)" }}>удаление данных · 152-ФЗ</div>
          {anonymizeMember.isSuccess ? (
            <p style={{ ...mono, fontSize: "var(--t-caption)", color: "var(--c-ok-text)", margin: "10px 0 0" }}>Данные участника обезличены</p>
          ) : !confirmDel ? (
            <button onClick={() => setConfirmDel(true)} className="foc"
              style={{ ...actionGhost, width: "100%", marginTop: 10, padding: "11px 18px", textAlign: "center", color: "var(--c-danger-text)", borderColor: "var(--c-danger-text)" }}>
              Обезличить и закрыть доступ
            </button>
          ) : (
            <div style={{ marginTop: 10 }}>
              <p style={{ ...mono, fontSize: 11, lineHeight: 1.6, color: "var(--c-text-3)", margin: 0 }}>
                Профиль, контакты, фото и заявки будут обезличены, аккаунт входа удалён. Необратимо.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                <button disabled={anonymizeMember.isPending} onClick={() => anonymizeMember.mutate(member.id)} className="foc"
                  style={{ ...action, flex: 1, padding: "11px 18px", background: "var(--c-danger)", color: "#fff" }}>
                  {anonymizeMember.isPending ? "Удаляем…" : "Подтвердить удаление"}
                </button>
                <button onClick={() => setConfirmDel(false)} className="foc" style={{ ...actionGhost, flex: 1, padding: "11px 18px", textAlign: "center" }}>Отмена</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Fact({ name, value }: { name: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 14, padding: "9px 0", borderTop: "1px solid var(--c-line)" }}>
      <span style={{ ...label, flexShrink: 0 }}>{name}</span>
      <span style={{ ...mono, fontSize: 12, textAlign: "right", overflowWrap: "anywhere" }}>{value}</span>
    </div>
  );
}
