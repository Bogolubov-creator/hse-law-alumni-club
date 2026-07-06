import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import SiteShell from "../components/SiteShell.js";
import { useToast } from "../components/Toast.js";
import { apiGet, apiPost } from "../lib/api.js";
import { token } from "../lib/cart.js";
import { usePageTitle } from "../lib/title.js";

interface ClubEvent {
  id: string; title: string; description: string | null; starts_at: string;
  location: string | null; format: "offline" | "online"; points: number;
  status: string; going: number; my_rsvp: boolean; my_attended: boolean;
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

/** Календарь событий клуба: афиша + «Пойду» (RSVP) для участников. */
export default function Events() {
  usePageTitle("События клуба");
  const t = token();
  const toast = useToast();
  const qc = useQueryClient();
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

  const card = (e: ClubEvent, isPast: boolean) => (
    <div key={e.id} className="flex flex-col overflow-hidden rounded-[18px] border border-[#E5E7EB] bg-white" style={{ opacity: isPast ? 0.65 : 1 }}>
      <div className="flex h-2"><i className="flex-1 bg-ohra" /><i className="flex-1 bg-hse-blue" /><i className="flex-1 bg-latun" /><i className="flex-1 bg-stal" /></div>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-wide text-ohra-deep">
          <span>{fmtDate(e.starts_at)}</span>
          <span className="rounded-full bg-kost-2 px-2.5 py-1 normal-case text-grafit-soft">{e.format === "online" ? "Онлайн" : "Очно"}</span>
          {e.points > 0 && <span className="rounded-full bg-[rgba(196,154,69,.16)] px-2.5 py-1 normal-case text-[#a07d2e]">+{e.points} баллов</span>}
        </div>
        <h3 className="mt-2 font-display text-[17px] font-semibold leading-tight tracking-tight">{e.title}</h3>
        {e.description && <p className="mt-2 text-sm leading-relaxed text-grafit-soft">{e.description}</p>}
        {e.location && <p className="mt-2 font-mono text-[12px] text-grafit-soft">📍 {e.location}</p>}
        <div className="mt-auto flex items-center justify-between gap-3 pt-4">
          <span className="font-mono text-[12px] text-grafit-soft">{e.going > 0 ? `пойдут: ${e.going}` : "будьте первым!"}</span>
          {!isPast && (
            t ? (
              e.my_attended ? (
                <span className="font-mono text-[12px] font-semibold text-[#1F8A5B]">посещение засчитано ✓</span>
              ) : (
                <button
                  onClick={() => rsvp.mutate(e.id)}
                  disabled={rsvp.isPending}
                  className={`foc rounded-[11px] px-5 py-2.5 text-sm font-semibold disabled:opacity-60 ${e.my_rsvp ? "border-[1.5px] border-[#1F8A5B] text-[#1F8A5B]" : "bg-hse-blue text-kost"}`}
                >
                  {e.my_rsvp ? "Иду ✓ (отменить)" : "Пойду"}
                </button>
              )
            ) : (
              <Link to="/lk" className="foc rounded-[11px] bg-hse-blue px-5 py-2.5 text-sm font-semibold text-kost">Войти, чтобы записаться</Link>
            )
          )}
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
      </main>
    </SiteShell>
  );
}
