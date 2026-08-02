import { useState, type FormEvent } from "react";
import Modal from "../../components/Modal.js";
import { useAdminTimeline, useAdminMutations, type AdminTimeline } from "../../lib/admin.js";
import { ConfirmDelete, FormField } from "../ui.js";

// ── «История» на главной ─────────────────────────────────────────────
export function TimelineAdmin() {
  const timeline = useAdminTimeline();
  const { createTimeline, patchTimeline, deleteTimeline } = useAdminMutations();
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDel, setConfirmDel] = useState<AdminTimeline | null>(null);
  return (
    <div className="overflow-hidden rounded-[18px] border border-[#E5E7EB] bg-white">
      <div className="flex items-center justify-between gap-3 bg-[#FBF7EF] px-6 py-3.5">
        <span className="font-mono text-[11px] uppercase tracking-wide text-grafit-soft">История на главной · {timeline.data?.length ?? "…"} вех</span>
        <button onClick={() => setShowCreate(true)} className="foc rounded-[10px] bg-ohra px-4 py-2 text-sm font-semibold text-kost">+ Добавить веху</button>
      </div>
      {(timeline.data ?? []).map((t) => (
        <div key={t.id} className="grid grid-cols-[64px_1fr_130px_36px] items-center gap-3 border-t border-[#f0ece2] px-6 py-3.5 text-sm">
          <span className="font-display text-lg font-extrabold text-hse-blue">{t.year}</span>
          <div className="min-w-0">
            <div className="truncate font-semibold">{t.title}</div>
            <div className="truncate font-mono text-[11px] text-grafit-soft">{t.text}{t.metric ? ` · ${t.metric}` : ""}</div>
          </div>
          <select value={t.status} disabled={patchTimeline.isPending} onChange={(e) => patchTimeline.mutate({ id: t.id, status: e.target.value })} className={`foc rounded-full border-none px-3 py-1.5 font-mono text-[11px] ${t.status === "published" ? "bg-[rgba(31,138,91,.14)] text-[#1F8A5B]" : "bg-[rgba(46,111,174,.14)] text-[#2E6FAE]"}`}>
            <option value="published">На сайте</option><option value="draft">Скрыта</option>
          </select>
          <button aria-label={`Удалить ${t.title}`} onClick={() => setConfirmDel(t)} className="foc h-8 w-8 rounded-[9px] text-karmin hover:bg-[rgba(181,51,27,.08)]">✕</button>
        </div>
      ))}
      {showCreate && <TimelineForm busy={createTimeline.isPending} onClose={() => setShowCreate(false)} onSave={(v) => createTimeline.mutate(v, { onSuccess: () => setShowCreate(false) })} />}
      {confirmDel && (
        <ConfirmDelete title={confirmDel.title} busy={deleteTimeline.isPending} hint="Веха исчезнет из «Истории» на главной."
          onCancel={() => setConfirmDel(null)} onConfirm={() => deleteTimeline.mutate(confirmDel.id, { onSuccess: () => setConfirmDel(null) })} />
      )}
    </div>
  );
}

function TimelineForm({ busy, onClose, onSave }: { busy: boolean; onClose: () => void; onSave: (v: { year: string; title: string; text?: string | null; metric?: string | null }) => void }) {
  const [f, setF] = useState({ year: String(new Date().getFullYear()), title: "", text: "", metric: "" });
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const valid = /^\d{4}$/.test(f.year) && f.title.trim().length >= 2;
  const submit = (e: FormEvent) => { e.preventDefault(); if (valid) onSave({ year: f.year, title: f.title.trim(), text: f.text.trim() || null, metric: f.metric.trim() || null }); };
  return (
    <Modal onClose={onClose} labelledBy="tl-form-title" maxWidth={480}>
      <form onSubmit={submit} className="rounded-[18px] bg-white p-7">
        <h3 id="tl-form-title" className="font-display text-lg font-bold">Новая веха истории</h3>
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-[110px_1fr] gap-3">
            <FormField label="Год" value={f.year} onChange={(v) => set("year", v.replace(/[^\d]/g, "").slice(0, 4))} required />
            <FormField label="Заголовок" value={f.title} onChange={(v) => set("title", v)} required />
          </div>
          <FormField label="Текст" value={f.text} onChange={(v) => set("text", v)} textarea />
          <FormField label="Метрика (подпись)" value={f.metric} onChange={(v) => set("metric", v)} ph="напр. 2-й выпуск · мерч" />
        </div>
        <div className="mt-5 flex gap-2">
          <button type="submit" disabled={!valid || busy} className="foc flex-1 rounded-[11px] bg-ohra py-2.5 font-semibold text-kost disabled:opacity-50">{busy ? "Добавляем…" : "Добавить"}</button>
          <button type="button" onClick={onClose} className="foc flex-1 rounded-[11px] border border-[#E5E7EB] py-2.5 font-semibold">Отмена</button>
        </div>
      </form>
    </Modal>
  );
}
