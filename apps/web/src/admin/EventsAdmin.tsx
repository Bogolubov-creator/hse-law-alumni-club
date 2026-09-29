import { useState, useEffect, type FormEvent } from "react";
import Modal from "../components/Modal.js";
import { useEventMutations, useAdminEvents, useAdminEventRoster, type AdminEvent } from "../lib/admin.js";
import { FormField, ConfirmDelete } from "./common.js";

export function EventsAdmin() {
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const events = useAdminEvents(page);
  const pageCount = Math.max(1, Math.ceil((events.data?.total ?? 0) / 20));
  useEffect(() => { if (events.data && page > pageCount) setPage(pageCount); }, [events.data, page, pageCount]);
  const { createEvent, patchEvent, deleteEvent } = useEventMutations();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<AdminEvent | null>(null);
  const [confirmDel, setConfirmDel] = useState<AdminEvent | null>(null);
  const fmt = (iso: string) => new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="overflow-hidden rounded-[18px] border border-[var(--c-line)] bg-[var(--c-bg-raised)]">
      <div className="flex items-center justify-between gap-3 bg-[var(--c-bg-sunken)] px-6 py-3.5">
        <span className="font-mono text-[11px] uppercase tracking-wide text-[var(--c-text-3)]">События · {events.data?.total ?? "…"} · отметка «был ✓» начисляет баллы автоматически</span>
        <button onClick={() => setShowCreate(true)} className="foc rounded-[10px] bg-[var(--c-accent)] px-4 py-2 text-sm font-semibold text-[var(--c-on-accent)]">+ Добавить событие</button>
      </div>
      {(events.data?.items ?? []).map((e) => (
        <div key={e.id} className="border-t border-[var(--c-line)] px-6 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[12px] text-[var(--c-text-3)]">{fmt(e.starts_at)}</span>
            <span className="min-w-0 flex-1 truncate font-semibold">{e.title}</span>
            <span className="font-mono text-[11px] text-[var(--c-status-text)]">+{e.points} б.</span>
            <select aria-label={`Статус события «${e.title}»`} value={e.status} disabled={patchEvent.isPending} onChange={(ev) => patchEvent.mutate({ id: e.id, status: ev.target.value })} className={`foc rounded-full border-none px-3 py-1.5 font-mono text-[11px] ${e.status === "published" ? "bg-[rgba(31,138,91,.14)] text-[var(--c-ok-text)]" : e.status === "done" ? "bg-[rgba(46,111,174,.14)] text-[var(--c-link)]" : "bg-[var(--c-bg-sunken)] text-[var(--c-text-3)]"}`}>
              <option value="published">Анонс</option><option value="done">Прошло</option><option value="draft">Черновик</option><option value="canceled">Отменено</option>
            </select>
            <button aria-label={`Редактировать ${e.title}`} onClick={() => setEditing(e)} className="foc h-8 w-8 rounded-[9px] text-[var(--c-text-3)] hover:bg-[var(--c-bg-sunken)]">✎</button>
            <button aria-label={`Удалить ${e.title}`} onClick={() => setConfirmDel(e)} className="foc h-8 w-8 rounded-[9px] text-[var(--c-danger-text)] hover:bg-[rgba(181,51,27,.08)]">✕</button>
          </div>
          <button className="foc mt-3 rounded-[9px] border border-[var(--c-line)] px-3 py-2 font-mono text-[12px]" aria-expanded={expanded === e.id} aria-controls={"roster-" + e.id} onClick={() => setExpanded(expanded === e.id ? null : e.id)}>
            Участники · {e.rsvp_count} {expanded === e.id ? "↑" : "↓"}
          </button>
          {expanded === e.id && <EventRoster id={e.id} />}
        </div>
      ))}
      {events.data?.total === 0 && <p className="p-10 text-center font-mono text-sm text-[var(--c-text-3)]">Событий нет – добавьте первое.</p>}
      {events.isLoading && <p role="status" className="p-6">Загрузка событий…</p>}
      {events.isError && <p role="alert" className="p-6">Не удалось загрузить события. <button className="foc underline" onClick={() => events.refetch()}>Повторить</button></p>}
      {events.data && events.data.total > 0 && <nav aria-label="Страницы событий" className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--c-line)] px-6 py-4 font-mono text-[12px]">
        <button className="foc rounded-[9px] border border-[var(--c-line)] px-3 py-2 disabled:opacity-40" disabled={page <= 1 || events.isFetching} onClick={() => { setExpanded(null); setPage(p => p - 1); }}>Назад</button>
        <span>Страница {page} из {pageCount}</span>
        <button className="foc rounded-[9px] border border-[var(--c-line)] px-3 py-2 disabled:opacity-40" disabled={page >= pageCount || events.isFetching} onClick={() => { setExpanded(null); setPage(p => p + 1); }}>Далее</button>
      </nav>}
      {showCreate && <EventForm busy={createEvent.isPending} onClose={() => setShowCreate(false)} onSave={(v) => createEvent.mutate(v, { onSuccess: () => setShowCreate(false) })} />}
      {editing && <EventForm initial={editing} busy={patchEvent.isPending} onClose={() => setEditing(null)} onSave={(v) => patchEvent.mutate({ id: editing.id, ...v }, { onSuccess: () => setEditing(null) })} />}
      {confirmDel && <ConfirmDelete title={confirmDel.title} busy={deleteEvent.isPending} hint="Событие и все записи на него будут удалены." onCancel={() => setConfirmDel(null)} onConfirm={() => deleteEvent.mutate(confirmDel.id, { onSuccess: () => setConfirmDel(null) })} />}
    </div>
  );
}

function EventRoster({ id }: { id: string }) {
  const roster = useAdminEventRoster(id);
  const { markAttended } = useEventMutations();
  return <div id={"roster-" + id} className="mt-3 flex flex-wrap gap-2">
    {roster.isLoading && <p role="status">Загрузка участников…</p>}
    {roster.isError && <p role="alert">Не удалось загрузить участников. <button className="foc underline" onClick={() => roster.refetch()}>Повторить</button></p>}
    {roster.data?.length === 0 && <p className="font-mono text-[12px] text-[var(--c-text-3)]">Записей пока нет.</p>}
    {roster.data?.map(r => <button key={r.id} disabled={r.attended || markAttended.isPending} onClick={() => markAttended.mutate(r.id)}
      title={r.attended ? "Баллы начислены" : "Отметить посещение (+баллы)"}
      className={"foc rounded-full px-3 py-1.5 font-mono text-[11px] " + (r.attended ? "bg-[rgba(31,138,91,.14)] text-[var(--c-ok-text)]" : "border border-[var(--c-line)] bg-[var(--c-bg-raised)] hover:border-ohra")}>
      {r.fio} {r.attended ? "✓" : "· был?"}
    </button>)}
    {markAttended.isError && <p role="alert">Не удалось отметить посещение. Попробуйте ещё раз.</p>}
  </div>;
}

function EventForm({ initial, busy, onClose, onSave }: { initial?: AdminEvent; busy: boolean; onClose: () => void; onSave: (v: { title: string; description?: string | null; starts_at: string; location?: string | null; cover?: string | null; reg_url?: string | null; format?: string; points?: number }) => void }) {
  const d = initial ? new Date(initial.starts_at) : null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const [f, setF] = useState({
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    date: d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : "",
    time: d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : "19:00",
    location: initial?.location ?? "",
    cover: initial?.cover ?? "",
    reg_url: initial?.reg_url ?? "",
    format: initial?.format ?? "offline",
    points: String(initial?.points ?? 60),
  });
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const regOk = !f.reg_url.trim() || /^https?:\/\/.+/.test(f.reg_url.trim());
  const valid = f.title.trim().length >= 3 && /^\d{4}-\d{2}-\d{2}$/.test(f.date) && regOk;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    onSave({
      title: f.title.trim(), description: f.description.trim() || null,
      starts_at: `${f.date}T${f.time || "19:00"}:00+03:00`, location: f.location.trim() || null,
      cover: f.cover.trim() || null, reg_url: f.reg_url.trim() || null,
      format: f.format, points: Number(f.points) || 60,
    });
  };
  return (
    <Modal onClose={onClose} labelledBy="ev-form-title" maxWidth={520}>
      <form onSubmit={submit} className="rounded-[18px] bg-[var(--c-bg-raised)] p-7">
        <h3 id="ev-form-title" className="font-display text-lg font-bold">{initial ? "Редактировать событие" : "Новое событие"}</h3>
        <div className="mt-4 space-y-3">
          <FormField label="Название" value={f.title} onChange={(v) => set("title", v)} required />
          <FormField label="Краткое описание (видно в карточке и анонсе)" value={f.description} onChange={(v) => set("description", v)} textarea />
          <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
            <FormField label="Дата (ГГГГ-ММ-ДД)" value={f.date} onChange={(v) => set("date", v)} ph="2026-09-18" required />
            <FormField label="Время" value={f.time} onChange={(v) => set("time", v)} ph="19:00" />
            <FormField label="Баллы за участие" value={f.points} onChange={(v) => set("points", v.replace(/[^\d]/g, ""))} />
          </div>
          <div className="grid grid-cols-[1fr_140px] gap-3">
            <FormField label="Место / ссылка" value={f.location} onChange={(v) => set("location", v)} ph="Милютинский пер., 13" />
            <label className="block">
              <span className="font-mono text-[11px] uppercase tracking-wide text-[var(--c-text-3)]">Формат</span>
              <select value={f.format} onChange={(e) => set("format", e.target.value)} className="foc mt-1.5 w-full rounded-[11px] border-[1.5px] border-[var(--c-line)] bg-[var(--c-bg)] px-3 py-2.5 text-[15px]">
                <option value="offline">Очно</option><option value="online">Онлайн</option>
              </select>
            </label>
          </div>
          <FormField label="Картинка-анонс (ссылка или /assets/…)" value={f.cover} onChange={(v) => set("cover", v)} ph="/assets/event-networking.jpg" />
          {f.cover.trim() && <img src={f.cover.trim()} alt="Предпросмотр анонса" className="h-24 w-full rounded-[10px] object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />}
          <FormField label="Ссылка на регистрацию (если есть внешняя форма)" value={f.reg_url} onChange={(v) => set("reg_url", v)} ph="https://hse-law.timepad.ru/event/…" />
          {!regOk && <p className="font-mono text-[11px] text-[var(--c-danger-text)]">Ссылка должна начинаться с http(s)://</p>}
        </div>
        <div className="mt-5 flex gap-2">
          <button type="submit" disabled={!valid || busy} className="foc flex-1 rounded-[11px] bg-[var(--c-accent)] py-2.5 font-semibold text-[var(--c-on-accent)] disabled:opacity-50">{busy ? "Сохраняем…" : initial ? "Сохранить" : "Создать"}</button>
          <button type="button" onClick={onClose} className="foc flex-1 rounded-[11px] border border-[var(--c-line)] py-2.5 font-semibold">Отмена</button>
        </div>
      </form>
    </Modal>
  );
}
