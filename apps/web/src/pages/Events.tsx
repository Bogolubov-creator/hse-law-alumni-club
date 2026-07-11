import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import SiteShell from "../components/SiteShell.js";
import Modal from "../components/Modal.js";
import { useToast } from "../components/Toast.js";
import { apiGet, apiPost } from "../lib/api.js";
import { token } from "../lib/cart.js";
import { useHead } from "../lib/title.js";

interface ClubEvent {
  id: string; title: string; description: string | null; starts_at: string;
  location: string | null; cover: string | null; reg_url: string | null;
  format: "offline" | "online"; points: number;
  status: string; going: number; my_rsvp: boolean; my_attended: boolean;
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
const fmtDateFull = (iso: string) =>
  new Date(iso).toLocaleString("ru-RU", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

// Ссылка «добавить в Google Календарь» (2 часа по умолчанию, как в .ics).
function gcalUrl(e: ClubEvent): string {
  const dt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const start = new Date(e.starts_at);
  const end = new Date(start.getTime() + 2 * 3600 * 1000);
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${dt(start)}/${dt(end)}`,
    details: (e.description ?? "") + (e.reg_url ? `\nРегистрация: ${e.reg_url}` : ""),
    ...(e.location && e.format !== "online" ? { location: e.location } : {}),
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

/** Календарь событий клуба: афиша + «Пойду» (RSVP), клик по карточке — детали. */
export default function Events() {
  useHead({ title: "События и встречи клуба", description: "Афиша клуба выпускников факультета права НИУ ВШЭ: нетворкинги, лекции и встречи выпусков. Запись заранее, за участие баллы клуба." });
  const t = token();
  const toast = useToast();
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const events = useQuery({
    queryKey: ["events", t],
    queryFn: () => apiGet<ClubEvent[]>("/events", t ?? undefined),
  });
  const rsvp = useMutation({
    mutationFn: (id: string) => apiPost<{ going: boolean }>(`/events/${id}/rsvp`, {}, undefined, t ?? undefined),
    onSuccess: (r) => { toast(r.going ? "Вы записаны — ждём вас! ✓" : "Запись отменена"); qc.invalidateQueries({ queryKey: ["events"] }); },
    onError: (e) => toast((e as Error).message, "err"),
  });

  const now = Date.now();
  const list = events.data ?? [];
  const upcoming = list.filter((e) => new Date(e.starts_at).getTime() >= now && e.status === "published");
  const past = list.filter((e) => new Date(e.starts_at).getTime() < now || e.status === "done");
  const opened = openId ? list.find((e) => e.id === openId) ?? null : null;

  // Кнопка RSVP — общая для карточки и модалки.
  const rsvpButton = (e: ClubEvent, isPast: boolean) => {
    if (isPast) return null;
    if (!t) return <Link to="/lk" onClick={(ev) => ev.stopPropagation()} className="foc rounded-[11px] bg-hse-blue px-5 py-2.5 text-sm font-semibold text-kost">Войти, чтобы записаться</Link>;
    if (e.my_attended) return <span className="font-mono text-[12px] font-semibold text-[#1F8A5B]">посещение засчитано ✓</span>;
    return (
      <button
        onClick={(ev) => { ev.stopPropagation(); rsvp.mutate(e.id); }}
        disabled={rsvp.isPending}
        className={`foc rounded-[11px] px-5 py-2.5 text-sm font-semibold disabled:opacity-60 ${e.my_rsvp ? "border-[1.5px] border-[#1F8A5B] text-[#1F8A5B]" : "bg-hse-blue text-kost"}`}
      >
        {e.my_rsvp ? "Иду ✓ (отменить)" : "Пойду"}
      </button>
    );
  };

  const card = (e: ClubEvent, isPast: boolean) => (
    <div
      key={e.id} role="button" tabIndex={0} aria-label={`Подробнее: ${e.title}`}
      onClick={() => setOpenId(e.id)}
      onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setOpenId(e.id); } }}
      className="foc flex cursor-pointer flex-col overflow-hidden rounded-[18px] border border-[#E5E7EB] bg-white transition-shadow hover:shadow-[0_10px_30px_-14px_rgba(17,41,107,.35)]"
      style={{ opacity: isPast ? 0.65 : 1 }}
    >
      {e.cover ? (
        <img src={e.cover} alt={`Афиша: ${e.title}`} className="h-36 w-full object-cover" onError={(ev) => { (ev.target as HTMLImageElement).style.display = "none"; }} />
      ) : (
        <div className="flex h-2"><i className="flex-1 bg-ohra" /><i className="flex-1 bg-hse-blue" /><i className="flex-1 bg-latun" /><i className="flex-1 bg-stal" /></div>
      )}
      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-wide text-ohra-deep">
          <span>{fmtDate(e.starts_at)}</span>
          <span className="rounded-full bg-kost-2 px-2.5 py-1 normal-case text-grafit-soft">{e.format === "online" ? "Онлайн" : "Очно"}</span>
          {e.points > 0 && <span className="rounded-full bg-[rgba(196,154,69,.16)] px-2.5 py-1 normal-case text-[#a07d2e]">+{e.points} баллов</span>}
        </div>
        <h3 className="mt-2 font-display text-[17px] font-semibold leading-tight tracking-tight">{e.title}</h3>
        {e.description && <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-grafit-soft">{e.description}</p>}
        {e.location && <p className="mt-2 font-mono text-[12px] text-grafit-soft">📍 {e.location}</p>}
        <div className="mt-auto flex items-center justify-between gap-3 pt-4">
          <span className="font-mono text-[12px] text-grafit-soft">{e.going > 0 ? `пойдут: ${e.going}` : "будьте первым!"}</span>
          {rsvpButton(e, isPast)}
        </div>
      </div>
    </div>
  );

  return (
    <SiteShell>
      <main className="mx-auto max-w-[1180px] px-7 py-12">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-ohra">Календарь клуба</p>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight">События и встречи</h1>
        <p className="mt-3 max-w-[600px] text-grafit-soft">Нетворкинги, лекции и встречи выпусков. Запишитесь заранее — за участие начисляются баллы клуба.</p>

        {events.isLoading && <p className="mt-8 font-mono text-sm text-grafit-soft">Загрузка…</p>}
        {events.isError && <p className="mt-8 font-mono text-sm text-karmin">Не удалось загрузить события.</p>}

        {upcoming.length > 0 && (
          <div className="two-col mt-8 grid grid-cols-2 gap-5">{upcoming.map((e) => card(e, false))}</div>
        )}
        {!events.isLoading && upcoming.length === 0 && (
          <div className="mt-8 rounded-[18px] border border-[#E5E7EB] bg-white p-10 text-center">
            <p className="text-grafit-soft">Ближайших событий пока нет — загляните позже или следите за новостями.</p>
          </div>
        )}

        {past.length > 0 && (
          <>
            <h2 className="mt-12 font-display text-2xl font-semibold">Прошедшие</h2>
            <div className="two-col mt-5 grid grid-cols-2 gap-5">{past.map((e) => card(e, true))}</div>
          </>
        )}

        {opened && (
          <Modal onClose={() => setOpenId(null)} labelledBy="ev-modal-title" maxWidth={620}>
            <div className="overflow-hidden rounded-[18px] bg-white">
              {opened.cover && (
                <img src={opened.cover} alt={`Афиша: ${opened.title}`} className="max-h-64 w-full object-cover" onError={(ev) => { (ev.target as HTMLImageElement).style.display = "none"; }} />
              )}
              <div className="p-7">
                <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-wide text-ohra-deep">
                  <span className="rounded-full bg-kost-2 px-2.5 py-1 normal-case text-grafit-soft">{opened.format === "online" ? "Онлайн" : "Очно"}</span>
                  {opened.points > 0 && <span className="rounded-full bg-[rgba(196,154,69,.16)] px-2.5 py-1 normal-case text-[#a07d2e]">+{opened.points} баллов за участие</span>}
                </div>
                <h3 id="ev-modal-title" className="mt-3 font-display text-2xl font-bold leading-tight tracking-tight">{opened.title}</h3>
                <p className="mt-3 font-mono text-[13px] text-grafit-soft">🗓 {fmtDateFull(opened.starts_at)}</p>
                {opened.location && <p className="mt-1.5 font-mono text-[13px] text-grafit-soft">📍 {opened.location}</p>}
                {opened.description && <p className="mt-4 whitespace-pre-line text-[15px] leading-relaxed">{opened.description}</p>}
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  {rsvpButton(opened, new Date(opened.starts_at).getTime() < now || opened.status === "done")}
                  {opened.reg_url && (
                    <a href={opened.reg_url} target="_blank" rel="noopener noreferrer" className="foc rounded-[11px] bg-ohra px-5 py-2.5 text-sm font-semibold text-kost">
                      Регистрация ↗
                    </a>
                  )}
                  <span className="ml-auto font-mono text-[12px] text-grafit-soft">{opened.going > 0 ? `пойдут: ${opened.going}` : "будьте первым!"}</span>
                </div>
                {/* В календарь: .ics (Apple/Outlook и любой календарь) + быстрый Google-линк */}
                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[#f0ece2] pt-4">
                  <span className="font-mono text-[11px] uppercase tracking-wide text-grafit-soft">Добавить в календарь:</span>
                  <a href={`/api/events/${opened.id}.ics`} className="foc rounded-[10px] border-[1.5px] border-[#E5E7EB] px-3.5 py-2 text-[13px] font-semibold hover:border-hse-blue">📅 .ics</a>
                  <a href={gcalUrl(opened)} target="_blank" rel="noopener noreferrer" className="foc rounded-[10px] border-[1.5px] border-[#E5E7EB] px-3.5 py-2 text-[13px] font-semibold hover:border-hse-blue">Google Календарь ↗</a>
                </div>
              </div>
            </div>
          </Modal>
        )}
      </main>
    </SiteShell>
  );
}
