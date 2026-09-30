import NewsSources from "./NewsSources.js";
import { useState, type FormEvent } from "react";
import Modal from "../components/Modal.js";
import { useNewsMutations, useAdminNews, type AdminNews } from "../lib/admin.js";
import { FormField, ConfirmDelete } from "./common.js";

export function NewsAdmin() {
  const news = useAdminNews();
  const { createNews, patchNews, deleteNews } = useNewsMutations();
  const [editing, setEditing] = useState<AdminNews | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDel, setConfirmDel] = useState<AdminNews | null>(null);
  return (
    <><NewsSources /><div className="overflow-hidden rounded-[18px] border border-[var(--c-line)] bg-[var(--c-bg-raised)]">
      <div className="flex items-center justify-between gap-3 bg-[var(--c-bg-sunken)] px-6 py-3.5">
        <span className="font-mono text-[11px] uppercase tracking-wide text-[var(--c-text-3)]">Новости · {news.data?.length ?? "…"}</span>
        <button onClick={() => setShowCreate(true)} className="foc rounded-[10px] bg-[var(--c-accent)] px-4 py-2 text-sm font-semibold text-[var(--c-on-accent)]">+ Написать новость</button>
      </div>
      {(news.data ?? []).map((n) => (
        <div key={n.id} className="grid grid-cols-[minmax(0,1fr)_36px] sm:grid-cols-[minmax(0,1fr)_130px_36px] items-center gap-3 border-t border-[var(--c-line)] px-6 py-3.5 text-sm">
          <div className="min-w-0">
            <button className="foc block max-w-full truncate text-left font-semibold" onClick={() => setEditing(n)}>{n.title}</button>
            {n.excerpt && <div className="truncate font-mono text-[11px] text-[var(--c-text-3)]">{n.excerpt}</div>}
          </div>
          <select aria-label={`Статус новости «${n.title}»`} value={n.status} disabled={patchNews.isPending} onChange={(e) => patchNews.mutate({ id: n.id, status: e.target.value })} className={`foc col-start-1 row-start-2 sm:col-auto sm:row-auto min-w-0 rounded-full border-none px-3 py-1.5 font-mono text-[11px] ${n.status === "published" ? "bg-[rgba(31,138,91,.14)] text-[var(--c-ok-text)]" : "bg-[rgba(46,111,174,.14)] text-[var(--c-link)]"}`}>
            <option value="published">Опубликована</option><option value="draft">Черновик</option>
          </select>
          <button aria-label={`Удалить ${n.title}`} onClick={() => setConfirmDel(n)} className="foc h-8 w-8 rounded-[9px] text-[var(--c-danger-text)] hover:bg-[rgba(181,51,27,.08)]">✕</button>
        </div>
      ))}
      {news.data?.length === 0 && <p className="p-10 text-center font-mono text-sm text-[var(--c-text-3)]">Новостей нет – напишите первую.</p>}
      {showCreate && <NewsForm error={createNews.error?.message} busy={createNews.isPending} onClose={() => setShowCreate(false)} onSave={(v) => createNews.mutate(v, { onSuccess: () => setShowCreate(false) })} />}
      {editing && <NewsForm error={patchNews.error?.message} initial={editing} busy={patchNews.isPending} onClose={() => setEditing(null)} onSave={(v) => patchNews.mutate({id:editing.id,...v}, {onSuccess:()=>setEditing(null)})} />}
      {confirmDel && (
        <ConfirmDelete title={confirmDel.title} busy={deleteNews.isPending} hint="Новость исчезнет с сайта безвозвратно."
          onCancel={() => setConfirmDel(null)} onConfirm={() => deleteNews.mutate(confirmDel.id, { onSuccess: () => setConfirmDel(null) })} />
      )}
    </div></>
  );
}

function NewsForm({ error, initial, busy, onClose, onSave }: { error?: string; initial?: AdminNews; busy: boolean; onClose: () => void; onSave: (v: { title: string; excerpt?: string | null; body?: string | null }) => void }) {
  const [f, setF] = useState({ title: initial?.title || "", excerpt: initial?.excerpt || "", body: initial?.body || "" });
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const valid = f.title.trim().length >= 3;
  const submit = (e: FormEvent) => { e.preventDefault(); if (valid) onSave({ title: f.title.trim(), excerpt: f.excerpt.trim() || null, body: f.body.trim() || null }); };
  return (
    <Modal onClose={onClose} labelledBy="news-form-title" maxWidth={560}>
      <form onSubmit={submit} className="rounded-[18px] bg-[var(--c-bg-raised)] p-7">
        <h3 id="news-form-title" className="font-display text-lg font-bold">{initial ? "Редактировать новость" : "Новая новость"}</h3>
        <div className="mt-4 space-y-3">
          <FormField label="Заголовок" value={f.title} onChange={(v) => set("title", v)} required />
          <FormField label="Короткий анонс" value={f.excerpt} onChange={(v) => set("excerpt", v)} />
          <FormField label="Текст новости" value={f.body} onChange={(v) => set("body", v)} textarea />
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-[var(--c-danger-text)]">{error}</p>}
        <div className="mt-5 flex gap-2">
          <button type="submit" disabled={!valid || busy} className="foc flex-1 rounded-[11px] bg-[var(--c-accent)] py-2.5 font-semibold text-[var(--c-on-accent)] disabled:opacity-50">{busy ? "Сохраняем…" : initial ? "Сохранить" : "Опубликовать"}</button>
          <button type="button" onClick={onClose} className="foc flex-1 rounded-[11px] border border-[var(--c-line)] py-2.5 font-semibold">Отмена</button>
        </div>
      </form>
    </Modal>
  );
}
