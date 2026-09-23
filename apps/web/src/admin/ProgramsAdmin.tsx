import { useState, type FormEvent } from "react";
import Modal from "../components/Modal.js";
import { rub } from "../lib/api.js";
import { useProgramMutations, useAdminPrograms, type AdminProgram, type ProgramInput } from "../lib/admin.js";
import { FormField, ConfirmDelete, StatusToggle } from "./common.js";

export const FORMAT_RU: Record<string, string> = { online: "Онлайн", offline: "Очно", blended: "Смешанный" };

export function ProgramsAdmin() {
  const programs = useAdminPrograms();
  const { createProgram, patchProgram, deleteProgram, syncDpo } = useProgramMutations();
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDel, setConfirmDel] = useState<AdminProgram | null>(null);
  const list = programs.data ?? [];
  const actualCount = list.filter((p) => p.enrollment !== "nonactual" && p.status !== "archived").length;
  const closedCount = list.filter((p) => p.enrollment === "nonactual" && p.status !== "archived").length;
  const publishedCount = list.filter((p) => p.status === "published").length;

  return (
    <div className="overflow-hidden rounded-[18px] border border-[var(--c-line)] bg-[var(--c-bg-raised)]">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--c-bg-sunken)] px-6 py-3.5">
        <div className="min-w-0">
          <span className="font-mono text-[11px] uppercase tracking-wide text-[var(--c-text-3)]">
            Каталог ДПО · {list.length ? `${publishedCount} на витрине` : "…"} · актуальный набор {list.length ? actualCount : "…"} · закрытый {list.length ? closedCount : "…"}
          </span>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-[var(--c-text-3)]">
            <a className="foc text-[var(--c-link)] underline-offset-2 hover:underline" href="https://www.hse.ru/edu/dpo/?orgUnit=22753" target="_blank" rel="noopener noreferrer">
              hse.ru · актуальный набор
            </a>
            <a className="foc text-[var(--c-link)] underline-offset-2 hover:underline" href="https://www.hse.ru/edu/dpo/?onlyActual=0&orgUnit=22753" target="_blank" rel="noopener noreferrer">
              hse.ru · весь каталог
            </a>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => syncDpo.mutate()}
            disabled={syncDpo.isPending}
            title="Синхронизация как на лендинге ДПО: актуальный набор + onlyActual=0 (весь каталог факультета права)"
            className="foc rounded-[10px] border border-[var(--c-line)] bg-[var(--c-bg-raised)] px-4 py-2 text-sm font-semibold disabled:opacity-60"
          >
            {syncDpo.isPending ? "Синхронизируем…" : "⟳ Обновить с hse.ru"}
          </button>
          <button onClick={() => setShowCreate(true)} className="foc rounded-[10px] bg-[var(--c-accent)] px-4 py-2 text-sm font-semibold text-[var(--c-on-accent)]">+ Добавить программу</button>
        </div>
      </div>
      {syncDpo.isSuccess && (
        <p className="border-t border-[var(--c-line)] bg-[rgba(31,138,91,.07)] px-6 py-2.5 font-mono text-[12px] text-[var(--c-ok-text)]">
          Синхронизировано с hse.ru: +{syncDpo.data.created} новых, {syncDpo.data.updated} обновлено, {syncDpo.data.archived} в архив
          {" "}(актуальный набор {syncDpo.data.actual} / весь каталог {syncDpo.data.total},
          {" "}закрытые {syncDpo.data.nonactual}).
          {" "}Ночная автосинхронизация – ежедневно в 05:00.
        </p>
      )}
      {syncDpo.isError && <p className="border-t border-[var(--c-line)] px-6 py-2.5 font-mono text-[12px] text-[var(--c-danger-text)]">Синхронизация не удалась: {(syncDpo.error as Error).message}</p>}
      {list.map((p) => (
        <div key={p.id} className="grid grid-cols-[1fr_150px_120px_130px_36px] items-center gap-3 border-t border-[var(--c-line)] px-6 py-3.5 text-sm max-md:grid-cols-1">
          <div className="min-w-0">
            <div className="truncate font-semibold">{p.title}</div>
            <div className="font-mono text-[11px] text-[var(--c-text-3)]">
              <span className={`mr-1.5 rounded-full px-2 py-0.5 ${p.source_url ? "bg-[rgba(17,41,107,.1)] text-hse-blue" : "bg-[rgba(236,90,19,.14)] text-[var(--c-accent-text)]"}`}>{p.source_url ? "ВШЭ · синк" : "Клуба"}</span>
              {p.direction} · {FORMAT_RU[p.format] ?? p.format} · {p.duration}{p.dates?.start ? ` · старт ${p.dates.start}` : ""}{p.enrollment === "nonactual" ? " · набор закрыт" : ""}
            </div>
          </div>
          <span className="font-mono text-[13px]">{rub(p.price)}</span>
          <span className="font-mono text-[11px] text-[var(--c-text-3)]">{p.slug}</span>
          <StatusToggle status={p.status} busy={patchProgram.isPending} onSet={(s) => patchProgram.mutate({ id: p.id, status: s })} />
          <button aria-label={`Удалить ${p.title}`} onClick={() => setConfirmDel(p)} className="foc h-8 w-8 rounded-[9px] text-[var(--c-danger-text)] hover:bg-[rgba(181,51,27,.08)]">✕</button>
        </div>
      ))}
      {list.length === 0 && <p className="p-10 text-center font-mono text-sm text-[var(--c-text-3)]">Программ нет – добавьте первую или обновите каталог с hse.ru.</p>}
      {(createProgram.isError || deleteProgram.isError || patchProgram.isError) && <p className="px-6 py-3 font-mono text-xs text-[var(--c-danger-text)]">Не удалось сохранить изменение – попробуйте ещё раз.</p>}

      {showCreate && <ProgramForm busy={createProgram.isPending} onClose={() => setShowCreate(false)} onSave={(v) => createProgram.mutate(v, { onSuccess: () => setShowCreate(false) })} />}
      {confirmDel && (
        <ConfirmDelete
          title={confirmDel.title} busy={deleteProgram.isPending}
          hint="Программа исчезнет с витрины. Уже оформленные заявки сохранятся (в них снимок позиции)."
          onCancel={() => setConfirmDel(null)}
          onConfirm={() => deleteProgram.mutate(confirmDel.id, { onSuccess: () => setConfirmDel(null) })}
        />
      )}
    </div>
  );
}

function ProgramForm({ busy, onClose, onSave }: { busy: boolean; onClose: () => void; onSave: (v: ProgramInput) => void }) {
  const [f, setF] = useState({ title: "", direction: "", format: "online", duration: "", priceRub: "", start: "", description: "", cover: "" });
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const valid = f.title.trim().length >= 3 && f.direction.trim().length >= 2 && f.duration.trim() && Number(f.priceRub) > 0;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    onSave({
      title: f.title.trim(), direction: f.direction.trim(), format: f.format, duration: f.duration.trim(),
      price: Math.round(Number(f.priceRub) * 100),
      start: f.start.trim() || null, description: f.description.trim() || null,
      cover: f.cover.trim() || null,
      document: "Удостоверение о повышении квалификации НИУ ВШЭ",
    });
  };
  return (
    <Modal onClose={onClose} labelledBy="prog-form-title" maxWidth={520}>
      <form onSubmit={submit} className="rounded-[18px] bg-[var(--c-bg-raised)] p-7">
        <h3 id="prog-form-title" className="font-display text-lg font-bold">Новая программа клуба</h3>
        <p className="mt-1 font-mono text-[11px] leading-relaxed text-[var(--c-text-3)]">Собственная программа клуба выпускников: запись и оплата – через сайт (корзина, скидка выпускника). Программы ВШЭ добавлять не нужно – они приходят из синка с hse.ru и ведут на маркетплейс.</p>
        <div className="mt-4 space-y-3">
          <FormField label="Название" value={f.title} onChange={(v) => set("title", v)} required />
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Направление" value={f.direction} onChange={(v) => set("direction", v)} required />
            <label className="block">
              <span className="font-mono text-[11px] uppercase tracking-wide text-[var(--c-text-3)]">Формат</span>
              <select value={f.format} onChange={(e) => set("format", e.target.value)} className="foc mt-1.5 w-full rounded-[11px] border-[1.5px] border-[var(--c-line)] bg-[var(--c-bg)] px-3 py-2.5 text-[15px]">
                {Object.entries(FORMAT_RU).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Длительность" value={f.duration} onChange={(v) => set("duration", v)} ph="напр. 6 недель" required />
            <FormField label="Цена, ₽" value={f.priceRub} onChange={(v) => set("priceRub", v.replace(/[^\d]/g, ""))} ph="50000" required />
          </div>
          <FormField label="Старт (дата словами)" value={f.start} onChange={(v) => set("start", v)} ph="напр. 15 сентября 2026" />
          <FormField label="Обложка (ссылка или /assets/…)" value={f.cover} onChange={(v) => set("cover", v)} ph="/assets/dpo-hero.jpg" />
          <FormField label="Описание" value={f.description} onChange={(v) => set("description", v)} textarea />
        </div>
        <div className="mt-5 flex gap-2">
          <button type="submit" disabled={!valid || busy} className="foc flex-1 rounded-[11px] bg-[var(--c-accent)] py-2.5 font-semibold text-[var(--c-on-accent)] disabled:opacity-50">{busy ? "Создаём…" : "Создать"}</button>
          <button type="button" onClick={onClose} className="foc flex-1 rounded-[11px] border border-[var(--c-line)] py-2.5 font-semibold">Отмена</button>
        </div>
      </form>
    </Modal>
  );
}
