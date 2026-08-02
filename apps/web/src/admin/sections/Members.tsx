import { useState, useEffect } from "react";
import Modal from "../../components/Modal.js";
import { computeLevel } from "@club/shared";
import { useOverview, useMembers, useAdminMutations, type Member } from "../../lib/admin.js";
import { stPill } from "../ui.js";

const VERIF: Record<string, string> = { pending: "На проверке", verified: "Верифицирован", rejected: "Отклонён" };
const LEVEL_RU: Record<string, string> = { graduate: "Выпускник", friend: "Друг клуба", expert: "Знаток", ambassador: "Амбассадор" };

export function Members() {
  const [sel, setSel] = useState<Member | null>(null);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [vf, setVf] = useState<string>("all");
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
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[
          { key: "all", label: "Все" },
          { key: "pending", label: `Заявки на вступление${pendingCount ? ` · ${pendingCount}` : ""}` },
          { key: "verified", label: "Подтверждённые" },
          { key: "rejected", label: "Отклонённые" },
        ].map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)} className={`foc rounded-full px-3.5 py-2 text-[13px] font-semibold ${vf === f.key ? "bg-grafit text-kost" : f.key === "pending" && pendingCount ? "border border-ohra bg-[rgba(236,90,19,.1)] text-ohra-deep" : "border border-[#E5E7EB] bg-white"}`}>{f.label}</button>
        ))}
        <input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Поиск: ФИО, год, программа…" className="foc ml-auto w-72 max-w-full rounded-[11px] border-[1.5px] border-[#E5E7EB] px-3.5 py-2.5 text-sm outline-none focus:border-ohra" />
        <span className="font-mono text-[12px] text-grafit-soft">всего: {total}</span>
      </div>
      <div className="overflow-hidden rounded-[18px] border border-[#E5E7EB] bg-white">
        <div className="grid grid-cols-[1fr_80px_120px_80px_80px_80px_90px] gap-3 bg-[#FBF7EF] px-6 py-3.5 font-mono text-[11px] uppercase tracking-wide text-grafit-soft">
          <span>Выпускник</span><span>Выпуск</span><span>Статус</span><span>Баллы</span><span>Скидка</span><span>Друзья</span><span>Подкасты</span>
        </div>
        {list.map((m) => (
          <button key={m.id} onClick={() => setSel(m)} className="arow foc grid w-full grid-cols-[1fr_80px_120px_80px_80px_80px_90px] items-center gap-3 border-t border-[#f0ece2] px-6 py-3.5 text-left text-sm">
            <span className="flex items-center gap-2 font-semibold">
              {m.fio}
              {m.duplicate && <span title="Возможный дубль: тот же ФИО и год выпуска" className="rounded-full bg-[rgba(196,154,69,.18)] px-2 py-0.5 font-mono text-[10px] font-semibold text-[#a07d2e]">⚠ дубль?</span>}
            </span>
            <span className="font-mono text-[12px] text-grafit-soft">{m.cohort}</span>
            <span><span className={`rounded-full px-2.5 py-1 font-mono text-[11px] ${stPill(m.verification_status)}`}>{VERIF[m.verification_status]}</span></span>
            <span className="font-mono text-[13px]">{m.points_cached}</span>
            <span className="font-mono text-[13px]">{m.verification_status === "verified" ? `−${computeLevel(m.points_cached ?? 0).discount_percent + (m.personal_discount ?? 0)}%` : "–"}</span>
            <span className="font-mono text-[13px]">{m.friends_count ?? 0}</span>
            <span className={`font-mono text-[11px] ${m.podcast_active ? "text-[#1F8A5B]" : "text-grafit-soft"}`}>{m.podcast_active ? "подписка ✓" : "–"}</span>
          </button>
        ))}
        {!membersQ.isLoading && list.length === 0 && <p className="p-10 text-center font-mono text-sm text-grafit-soft">{q ? "По запросу ничего не найдено." : "Выпускников нет."}</p>}
      </div>
      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <span className="font-mono text-[12px] text-grafit-soft">показаны {from}–{to} из {total}</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="foc rounded-[10px] border border-[#E5E7EB] px-4 py-2 text-sm font-semibold disabled:opacity-40">← Назад</button>
            <span className="px-2 py-2 font-mono text-[12px] text-grafit-soft">{page} / {pages}</span>
            <button disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))} className="foc rounded-[10px] border border-[#E5E7EB] px-4 py-2 text-sm font-semibold disabled:opacity-40">Вперёд →</button>
          </div>
        </div>
      )}
      {sel && <MemberModal member={sel} onClose={() => setSel(null)} />}
    </>
  );
}

function MemberModal({ member, onClose }: { member: Member; onClose: () => void }) {
  const { patchMember, addPoints, grantPodcastSub, anonymizeMember } = useAdminMutations();
  const [discount, setDiscount] = useState(String(member.personal_discount));
  const [delta, setDelta] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  return (
    <Modal onClose={onClose} labelledBy="member-modal-title" maxWidth={460}>
      <div className="relative rounded-[22px] bg-white p-7 shadow-2xl" style={{ animation: "g-pop .26s cubic-bezier(.2,.8,.2,1)" }}>
        <button onClick={onClose} aria-label="Закрыть" className="foc absolute right-4 top-4 h-9 w-9 rounded-[10px] border border-[#E5E7EB] text-grafit-soft">✕</button>
        <div id="member-modal-title" className="font-display text-2xl font-bold">{member.fio}</div>
        <div className="mt-1 font-mono text-[12px] text-grafit-soft">Выпуск {member.cohort} · {LEVEL_RU[member.level_cached] ?? member.level_cached} · {member.points_cached} баллов · в друзьях: {member.friends_count ?? 0}</div>

        {/* Анкета из формы вступления – всё, что заполнил выпускник */}
        <div className="mt-4 rounded-[14px] bg-[#FBF7EF] px-4 py-3 font-mono text-[12px] leading-relaxed text-grafit-soft">
          {member.email && <div>Почта: <b className="text-grafit">{member.email}</b></div>}
          {(member.edu_level || member.edu_program) && <div>Образование: <b className="text-grafit">{[member.edu_level, member.edu_program && `ОП «${member.edu_program}»`].filter(Boolean).join(" · ")}</b></div>}
          {member.contacts_json && Object.entries(member.contacts_json).filter(([, v]) => v).map(([k, v]) => <div key={k}>{k}: <b className="text-grafit">{v}</b></div>)}
          {!!member.interests_json?.length && <div>Интересы: <b className="text-grafit">{member.interests_json.join(", ")}</b></div>}
          {member.joined_at && <div>Заявка подана: {new Date(member.joined_at).toLocaleDateString("ru-RU")}</div>}
        </div>

        <div className="mt-5 font-mono text-[11px] uppercase text-grafit-soft">Верификация</div>
        <div className="mt-2 flex gap-2">
          <button disabled={patchMember.isPending} onClick={() => patchMember.mutate({ id: member.id, verification_status: "verified" })} className="foc flex-1 rounded-[10px] bg-[#1F8A5B] py-2.5 text-sm font-semibold text-white disabled:opacity-60">Подтвердить</button>
          <button disabled={patchMember.isPending} onClick={() => patchMember.mutate({ id: member.id, verification_status: "rejected" })} className="foc flex-1 rounded-[10px] border-[1.5px] border-[#E5E7EB] py-2.5 text-sm font-semibold text-karmin disabled:opacity-60">Отклонить</button>
        </div>

        <div className="mt-5 font-mono text-[11px] uppercase text-grafit-soft">Ручные баллы</div>
        <div className="mt-2 flex gap-2">
          <input value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="напр. 60 или −30" className="foc flex-1 rounded-[10px] border-[1.5px] border-[#E5E7EB] px-3 py-2.5 text-sm outline-none focus:border-ohra" />
          <button disabled={addPoints.isPending} onClick={() => { const d = parseInt(delta, 10); if (!isNaN(d)) { addPoints.mutate({ id: member.id, delta: d }); setDelta(""); } }} className="foc rounded-[10px] bg-hse-blue px-5 text-sm font-semibold text-kost disabled:opacity-60">Начислить</button>
        </div>

        <div className="mt-5 font-mono text-[11px] uppercase text-grafit-soft">Персональная скидка (0–10%)</div>
        <div className="mt-2 flex gap-2">
          <input value={discount} onChange={(e) => setDiscount(e.target.value)} type="number" min={0} max={10} className="foc flex-1 rounded-[10px] border-[1.5px] border-[#E5E7EB] px-3 py-2.5 text-sm outline-none focus:border-ohra" />
          <button disabled={patchMember.isPending} onClick={() => patchMember.mutate({ id: member.id, personal_discount: Math.max(0, Math.min(10, parseInt(discount, 10) || 0)) })} className="foc rounded-[10px] bg-ohra px-5 text-sm font-semibold text-kost disabled:opacity-60">Сохранить</button>
        </div>

        <div className="mt-5 font-mono text-[11px] uppercase text-grafit-soft">Подкасты · подписка {member.podcast_active ? "активна ✓" : "нет"}</div>
        <button disabled={grantPodcastSub.isPending} onClick={() => grantPodcastSub.mutate(member.id)} className="foc mt-2 w-full rounded-[10px] border-[1.5px] border-[#E5E7EB] py-2.5 text-sm font-semibold disabled:opacity-60">
          {grantPodcastSub.isPending ? "Продлеваем…" : "Продлить подписку на год (оплата по счёту)"}
        </button>

        {/* 152-ФЗ: исполнение запроса на удаление/стирание ПДн (без разработчика) */}
        <div className="mt-6 rounded-[12px] border border-[rgba(181,51,27,.3)] p-3">
          <div className="font-mono text-[11px] uppercase text-karmin">Удаление данных (152-ФЗ)</div>
          {anonymizeMember.isSuccess ? (
            <p className="mt-2 font-mono text-[12px] text-[#1F8A5B]">Данные участника обезличены ✓</p>
          ) : !confirmDel ? (
            <button onClick={() => setConfirmDel(true)} className="foc mt-2 w-full rounded-[10px] border-[1.5px] border-karmin py-2.5 text-sm font-semibold text-karmin">Обезличить и закрыть доступ</button>
          ) : (
            <div className="mt-2">
              <p className="font-mono text-[11px] leading-relaxed text-grafit-soft">Профиль, контакты, аватар и заявки будут обезличены, аккаунт входа удалён. Необратимо.</p>
              <div className="mt-2 flex gap-2">
                <button disabled={anonymizeMember.isPending} onClick={() => anonymizeMember.mutate(member.id)} className="foc flex-1 rounded-[10px] bg-karmin py-2.5 text-sm font-semibold text-white disabled:opacity-60">{anonymizeMember.isPending ? "Удаляем…" : "Подтвердить удаление"}</button>
                <button onClick={() => setConfirmDel(false)} className="foc flex-1 rounded-[10px] border-[1.5px] border-[#E5E7EB] py-2.5 text-sm font-semibold">Отмена</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
