import { useState, type FormEvent } from "react";
import Modal from "../../components/Modal.js";
import { useAdminPodcasts, useAdminMutations, type AdminPodcast } from "../../lib/admin.js";
import { ConfirmDelete, FormField } from "../ui.js";

// ── Подкасты (доступ слушателям — по подписке 3 999 ₽/год) ──────────
export function PodcastsAdmin() {
  const podcasts = useAdminPodcasts();
  const { createPodcast, patchPodcast, deletePodcast } = useAdminMutations();
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDel, setConfirmDel] = useState<AdminPodcast | null>(null);
  return (
    <div className="overflow-hidden rounded-[18px] border border-[#E5E7EB] bg-white">
      <div className="flex items-center justify-between gap-3 bg-[#FBF7EF] px-6 py-3.5">
        <span className="font-mono text-[11px] uppercase tracking-wide text-grafit-soft">Подкасты · {podcasts.data?.length ?? "…"} · доступ по подписке 3 999 ₽/год</span>
        <button onClick={() => setShowCreate(true)} className="foc rounded-[10px] bg-ohra px-4 py-2 text-sm font-semibold text-kost">+ Добавить подкаст</button>
      </div>
      {(podcasts.data ?? []).map((p) => (
        <div key={p.id} className="grid grid-cols-[52px_1fr_110px_90px_130px_36px] items-center gap-3 border-t border-[#f0ece2] px-6 py-3.5 text-sm">
          {p.cover ? <img src={p.cover} alt="" className="h-12 w-12 rounded-[10px] object-cover" /> : <div className="h-12 w-12 rounded-[10px] bg-kost-2" />}
          <div className="min-w-0">
            <div className="truncate font-semibold">{p.title}</div>
            <div className="truncate font-mono text-[11px] text-grafit-soft">{p.description}</div>
          </div>
          <button
            onClick={() => patchPodcast.mutate({ id: p.id, is_free: !p.is_free })}
            disabled={patchPodcast.isPending}
            title="Пробный выпуск слушается без подписки"
            className={`foc rounded-full px-3 py-1.5 font-mono text-[11px] ${p.is_free ? "bg-[rgba(31,138,91,.14)] text-[#1F8A5B]" : "bg-kost-2 text-grafit-soft"}`}
          >
            {p.is_free ? "пробный ✓" : "по подписке"}
          </button>
          <span className="font-mono text-[12px] text-grafit-soft">{p.duration ?? "—"}</span>
          <select value={p.status} disabled={patchPodcast.isPending} onChange={(e) => patchPodcast.mutate({ id: p.id, status: e.target.value })} className={`foc rounded-full border-none px-3 py-1.5 font-mono text-[11px] ${p.status === "published" ? "bg-[rgba(31,138,91,.14)] text-[#1F8A5B]" : "bg-[rgba(46,111,174,.14)] text-[#2E6FAE]"}`}>
            <option value="published">Опубликован</option><option value="draft">Черновик</option>
          </select>
          <button aria-label={`Удалить ${p.title}`} onClick={() => setConfirmDel(p)} className="foc h-8 w-8 rounded-[9px] text-karmin hover:bg-[rgba(181,51,27,.08)]">✕</button>
        </div>
      ))}
      {podcasts.data?.length === 0 && <p className="p-10 text-center font-mono text-sm text-grafit-soft">Подкастов нет — добавьте первый.</p>}
      {showCreate && <PodcastForm busy={createPodcast.isPending} onClose={() => setShowCreate(false)} onSave={(v) => createPodcast.mutate(v, { onSuccess: () => setShowCreate(false) })} />}
      {confirmDel && (
        <ConfirmDelete title={confirmDel.title} busy={deletePodcast.isPending} hint="Подкаст исчезнет с витрины подкастов."
          onCancel={() => setConfirmDel(null)} onConfirm={() => deletePodcast.mutate(confirmDel.id, { onSuccess: () => setConfirmDel(null) })} />
      )}
    </div>
  );
}

function PodcastForm({ busy, onClose, onSave }: { busy: boolean; onClose: () => void; onSave: (v: { title: string; description?: string | null; cover?: string | null; audio_url?: string | null; duration?: string | null }) => void }) {
  const [f, setF] = useState({ title: "", description: "", cover: "", audio_url: "", duration: "" });
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const valid = f.title.trim().length >= 3;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (valid) onSave({ title: f.title.trim(), description: f.description.trim() || null, cover: f.cover.trim() || null, audio_url: f.audio_url.trim() || null, duration: f.duration.trim() || null });
  };
  return (
    <Modal onClose={onClose} labelledBy="pod-form-title" maxWidth={520}>
      <form onSubmit={submit} className="rounded-[18px] bg-white p-7">
        <h3 id="pod-form-title" className="font-display text-lg font-bold">Новый подкаст</h3>
        <div className="mt-4 space-y-3">
          <FormField label="Название" value={f.title} onChange={(v) => set("title", v)} required />
          <FormField label="Описание" value={f.description} onChange={(v) => set("description", v)} textarea />
          <FormField label="Картинка (ссылка или /assets/…)" value={f.cover} onChange={(v) => set("cover", v)} ph="/assets/dpo-hero.jpg" />
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <FormField label="Аудио (ссылка на mp3)" value={f.audio_url} onChange={(v) => set("audio_url", v)} ph="https://…/episode.mp3" />
            <FormField label="Длительность" value={f.duration} onChange={(v) => set("duration", v)} ph="42 мин" />
          </div>
        </div>
        <div className="mt-5 flex gap-2">
          <button type="submit" disabled={!valid || busy} className="foc flex-1 rounded-[11px] bg-ohra py-2.5 font-semibold text-kost disabled:opacity-50">{busy ? "Добавляем…" : "Добавить"}</button>
          <button type="button" onClick={onClose} className="foc flex-1 rounded-[11px] border border-[#E5E7EB] py-2.5 font-semibold">Отмена</button>
        </div>
      </form>
    </Modal>
  );
}
