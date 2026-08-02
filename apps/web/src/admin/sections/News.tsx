import { useState, type FormEvent } from "react";
import Modal from "../../components/Modal.js";
import { useAdminNews, useAdminMutations, type AdminNews } from "../../lib/admin.js";
import { ConfirmDelete, FormField } from "../ui.js";

// ── Новости: пишутся прямо здесь ─────────────────────────────────────
export function NewsAdmin() {
  const news = useAdminNews();
  const { createNews, patchNews, deleteNews } = useAdminMutations();
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDel, setConfirmDel] = useState<AdminNews | null>(null);
  return (
    <div className="overflow-hidden rounded-[18px] border border-[#E5E7EB] bg-white">
      <div className="flex items-center justify-between gap-3 bg-[#FBF7EF] px-6 py-3.5">
        <span className="font-mono text-[11px] uppercase tracking-wide text-grafit-soft">Новости · {news.data?.length ?? "…"}</span>
        <button onClick={() => setShowCreate(true)} className="foc rounded-[10px] bg-ohra px-4 py-2 text-sm font-semibold text-kost">+ Написать новость</button>
      </div>
      {(news.data ?? []).map((n) => (
        <div key={n.id} className="grid grid-cols-[1fr_130px_36px] items-center gap-3 border-t border-[#f0ece2] px-6 py-3.5 text-sm">
          <div className="min-w-0">
            <div className="truncate font-semibold">{n.title}</div>
            {n.excerpt && <div className="truncate font-mono text-[11px] text-grafit-soft">{n.excerpt}</div>}
          </div>
          <select value={n.status} disabled={patchNews.isPending} onChange={(e) => patchNews.mutate({ id: n.id, status: e.target.value })} className={`foc rounded-full border-none px-3 py-1.5 font-mono text-[11px] ${n.status === "published" ? "bg-[rgba(31,138,91,.14)] text-[#1F8A5B]" : "bg-[rgba(46,111,174,.14)] text-[#2E6FAE]"}`}>
            <option value="published">Опубликована</option><option value="draft">Черновик</option>
          </select>
          <button aria-label={`Удалить ${n.title}`} onClick={() => setConfirmDel(n)} className="foc h-8 w-8 rounded-[9px] text-karmin hover:bg-[rgba(181,51,27,.08)]">✕</button>
        </div>
      ))}
      {news.data?.length === 0 && <p className="p-10 text-center font-mono text-sm text-grafit-soft">Новостей нет — напишите первую.</p>}
      {showCreate && <NewsForm busy={createNews.isPending} onClose={() => setShowCreate(false)} onSave={(v) => createNews.mutate(v, { onSuccess: () => setShowCreate(false) })} />}
      {confirmDel && (
        <ConfirmDelete title={confirmDel.title} busy={deleteNews.isPending} hint="Новость исчезнет с сайта безвозвратно."
          onCancel={() => setConfirmDel(null)} onConfirm={() => deleteNews.mutate(confirmDel.id, { onSuccess: () => setConfirmDel(null) })} />
      )}
    </div>
  );
}

function NewsForm({ busy, onClose, onSave }: { busy: boolean; onClose: () => void; onSave: (v: { title: string; excerpt?: string | null; body?: string | null }) => void }) {
  const [f, setF] = useState({ title: "", excerpt: "", body: "" });
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const valid = f.title.trim().length >= 3;
  const submit = (e: FormEvent) => { e.preventDefault(); if (valid) onSave({ title: f.title.trim(), excerpt: f.excerpt.trim() || null, body: f.body.trim() || null }); };
  return (
    <Modal onClose={onClose} labelledBy="news-form-title" maxWidth={560}>
      <form onSubmit={submit} className="rounded-[18px] bg-white p-7">
        <h3 id="news-form-title" className="font-display text-lg font-bold">Новая новость</h3>
        <div className="mt-4 space-y-3">
          <FormField label="Заголовок" value={f.title} onChange={(v) => set("title", v)} required />
          <FormField label="Короткий анонс" value={f.excerpt} onChange={(v) => set("excerpt", v)} />
          <FormField label="Текст новости" value={f.body} onChange={(v) => set("body", v)} textarea />
        </div>
        <div className="mt-5 flex gap-2">
          <button type="submit" disabled={!valid || busy} className="foc flex-1 rounded-[11px] bg-ohra py-2.5 font-semibold text-kost disabled:opacity-50">{busy ? "Публикуем…" : "Опубликовать"}</button>
          <button type="button" onClick={onClose} className="foc flex-1 rounded-[11px] border border-[#E5E7EB] py-2.5 font-semibold">Отмена</button>
        </div>
      </form>
    </Modal>
  );
}
