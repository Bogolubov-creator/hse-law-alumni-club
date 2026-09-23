import "../styles/editorial.css";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import EventDetails from "../components/EventDetails.js";
import Modal from "../components/Modal.js";
import { useToast } from "../components/Toast.js";
import { apiGet, apiPost } from "../lib/api.js";
import { token } from "../lib/cart.js";
import { useHead } from "../lib/title.js";
import { fmtEventDate, type ClubEvent } from "../lib/events.js";
import { V2Shell, ShowcaseHead, mono, disp } from "../v2/Shell.js";
import { action, actionGhost, caps } from "../styles/primitives.js";

/** Афиша и прямая страница события используют общие данные и запись. */

const label = {
  ...mono, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)",
  textTransform: "none" as const, color: "var(--c-text-3)",
};

/* Бейдж: пилюля 999 – единственное место, где она уместна по канону 12.09. */
const chip = {
  ...mono, fontSize: "var(--t-micro)", letterSpacing: "var(--tr-data)", textTransform: "none" as const,
  padding: "4px 9px", borderRadius: 999, border: "1px solid var(--c-line-control)", color: "var(--c-text-2)",
};

export default function EventsV2() {
  useHead({
    title: "События и встречи клуба",
    description: "Афиша клуба выпускников факультета права Вышки: нетворкинги, лекции и встречи выпусков.",
    canonical: `${typeof window !== "undefined" ? window.location.origin : ""}/events`,
    noindex: false,
  });

  const { eventId } = useParams<{ eventId: string }>();
  const t = token();
  const toast = useToast();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const search = params.get("q") ?? "";
  const format = params.get("format") || "all";
  const setSearch = (value: string) => setParams((prev) => { const n = new URLSearchParams(prev); if (value) n.set("q", value); else n.delete("q"); return n; }, { replace: true });
  const setFormat = (value: string) => setParams((prev) => { const n = new URLSearchParams(prev); if (value && value !== "all") n.set("format", value); else n.delete("format"); return n; }, { replace: true });
  const matches = (e: ClubEvent) => (format === "all" || e.format === format) && `${e.title} ${e.location || ""}`.toLocaleLowerCase("ru").includes(search.trim().toLocaleLowerCase("ru"));
  const [openId, setOpenId] = useState<string | null>(null);

  const events = useQuery({
    queryKey: ["events", t],
    queryFn: () => apiGet<ClubEvent[]>("/events", t ?? undefined),
  });
  const rsvp = useMutation({
    mutationFn: (id: string) => apiPost<{ going: boolean }>(`/events/${id}/rsvp`, {}, undefined, t ?? undefined),
    onSuccess: (r) => { toast(r.going ? "Вы записаны – ждём вас" : "Запись отменена"); qc.invalidateQueries({ queryKey: ["events"] }); },
    onError: (e) => toast((e as Error).message, "err"),
  });

  const now = Date.now();
  const list = events.data ?? [];
  const upcoming = list.filter(matches).sort((a,b) => Date.parse(a.starts_at)-Date.parse(b.starts_at)).filter((e) => new Date(e.starts_at).getTime() >= now && e.status === "published");
  const past = list.filter(matches).filter((e) => new Date(e.starts_at).getTime() < now || e.status === "done");
  const opened = list.find((e) => e.id === (eventId ?? openId)) ?? null;

  /** Кнопка записи – одна и та же в строке афиши и в модалке. */
  const rsvpButton = (e: ClubEvent, isPast: boolean) => {
    if (isPast) return null;
    if (!t) {
      return (
        <Link to="/join" onClick={(ev) => ev.stopPropagation()} className="foc"
          style={{ ...label, textDecoration: "none", color: "var(--c-text-2)", border: "1px solid var(--c-line-control)", borderRadius: "var(--r-sm)", padding: "8px 14px", whiteSpace: "normal" }}>
          вступить, чтобы записаться
        </Link>
      );
    }
    if (e.my_attended) {
      return <span style={{ ...label, color: "var(--c-ok-text)", whiteSpace: "normal" }}>посещение засчитано</span>;
    }
    return (
      <button
        onClick={(ev) => { ev.stopPropagation(); rsvp.mutate(e.id); }}
        disabled={rsvp.isPending}
        aria-label={e.my_rsvp ? `Отменить запись: ${e.title}` : `Записаться: ${e.title}`}
        className="foc"
        style={{ ...(e.my_rsvp ? actionGhost : action), padding: "10px 16px", minHeight: 40, whiteSpace: "normal", cursor: rsvp.isPending ? "wait" : "pointer" }}
      >
        {e.my_rsvp ? "Вы идёте · отменить" : "Пойду"}
      </button>
    );
  };

  const row = (e: ClubEvent, isPast: boolean) => (
    <article
      key={e.id}
      className="v2-row club-event-row"
      style={{
        display: "grid", gridTemplateColumns: "150px minmax(0, 1fr)", gap: 24, alignItems: "start",
        padding: "22px 0", borderTop: "1px solid var(--c-line)", cursor: "pointer",
        opacity: isPast ? 0.6 : 1,
      }}
    >
      <div>
        <div style={{ ...mono, fontSize: 13, fontWeight: 500, color: isPast ? "var(--c-text-3)" : "var(--c-text)" }}>{fmtEventDate(e.starts_at)}</div>
        <div style={{ ...label, fontSize: "var(--t-micro)", marginTop: 6 }}>{e.format === "online" ? "онлайн" : "очно"}</div>
      </div>

      <div style={{ minWidth: 0 }}>
        <h3 style={{ ...disp, fontWeight: 600, fontSize: "var(--t-h3)", lineHeight: 1.25, margin: 0 }}><Link to={`/events/${e.id}`} className="foc" style={{ color: "inherit", textDecoration: "none" }}>{e.title}</Link></h3>
        {e.description && (
          <p style={{ margin: "9px 0 0", color: "var(--c-text-2)", fontSize: "var(--t-body)", lineHeight: 1.5, maxWidth: "58ch", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{e.description}</p>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 12 }}>
          {e.location && <span style={{ ...label, fontSize: "var(--t-micro)" }}>{e.location}</span>}
          {e.points > 0 && <span style={chip}>+{e.points} баллов</span>}
          <span style={{ ...label, fontSize: "var(--t-micro)" }}>{e.going > 0 ? `пойдут: ${e.going}` : "будьте первым"}</span>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>{rsvpButton(e, isPast)}<button className="foc" onClick={(ev) => { ev.currentTarget.focus(); setOpenId(e.id); }} style={{ ...caps, color: "var(--c-text-2)", background: "transparent", border: "1px solid var(--c-line-control)", padding: "10px 14px", borderRadius: "var(--r-sm)", cursor: "pointer" }}>Быстрый просмотр</button></div>
    </article>
  );

  return (
    <V2Shell>
      <main id="main">
        {!eventId && <>
        <ShowcaseHead
          photo={{ src: "assets/photos/hall-first-day.jpg", alt: "Зал факультета права в первый день учебного года" }}
          eyebrow="события"
          title="События клуба"
          lead="Встречи выпусков и лекции. Запись заранее – за участие начисляются баллы."
          count={upcoming.length ? `ближайших ${upcoming.length}` : undefined}
        />
        <div style={{ maxWidth: "var(--container)", margin: "0 auto", padding: "0 var(--page-gutter)" }}>

        {events.isLoading && <p role="status" style={{ ...label, margin: 0 }}>загружаем афишу…</p>}

        {events.isError && (
          <div style={{ borderTop: "1px solid var(--c-line)", padding: "40px 0" }}>
            <p style={{ ...label, color: "var(--c-danger-text)", margin: 0 }}>афиша не загрузилась</p>
            <button onClick={() => events.refetch()} className="foc" style={{ ...action, marginTop: 16 }}>Повторить</button>
          </div>
        )}

        <form className="club-agenda-filters" onSubmit={e=>e.preventDefault()} aria-label="Фильтры афиши">
          <label>Поиск по афише<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Название или место" /></label>
          <label>Формат<select value={format} onChange={e=>setFormat(e.target.value)}><option value="all">Все форматы</option><option value="online">Онлайн</option><option value="offline">Очно</option></select></label>
          {(search || format !== "all") && <button type="button" className="foc club-agenda-reset" onClick={() => setParams(prev => { const n = new URLSearchParams(prev); n.delete("q"); n.delete("format"); return n; }, { replace: true })}>Сбросить фильтры</button>}
        </form>
        {upcoming.length > 0 && <h2 style={{ ...caps, color: "var(--c-text-3)", margin: "0 0 4px" }}>Ближайшие</h2>}
        <div key={`${search}:${format}`} className="club-agenda-results">
          {upcoming.map((e, i) => (
            <div key={e.id} className={i === 0 ? "club-event-featured" : undefined}>
              {row(e, false)}
            </div>
          ))}
        </div>
        {upcoming.length > 0 && <div style={{ borderTop: "1px solid var(--c-line)" }} />}

        {!events.isLoading && !events.isError && upcoming.length === 0 && (
          <div style={{ borderTop: "1px solid var(--c-line)", padding: "40px 0" }}>
            <p style={{ margin: 0, color: "var(--c-text-2)", fontSize: "var(--t-body)" }}>{search || format !== "all" ? "По выбранным условиям ближайших событий нет. Измените поиск или формат." : "Ближайших событий пока нет – загляните позже или следите за новостями."}</p>
          </div>
        )}

        {past.length > 0 && (
          <section style={{ marginTop: 44 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 14, marginBottom: 10 }}>
              <h2 style={{ ...disp, fontWeight: 600, fontSize: "var(--t-h3)", margin: 0 }}>Прошедшие</h2>
              <span style={label}>записей {past.length}</span>
            </div>
            {past.map((e) => row(e, true))}
            <div style={{ borderTop: "1px solid var(--c-line)" }} />
          </section>
        )}

        </div>
        </>}
        <div style={{ maxWidth: "var(--container)", margin: "0 auto", padding: "0 var(--page-gutter)" }}>
        {eventId && events.isLoading && <div className="club-event-state" role="status">Загружаем событие…</div>}
        {eventId && events.isError && <div className="club-event-state" role="alert">Не удалось загрузить событие. <button className="foc" style={action} onClick={() => events.refetch()}>Повторить</button></div>}
        {eventId && events.isSuccess && !opened && <div className="club-event-state"><h1>Событие не найдено</h1><Link className="foc" to="/events">Вернуться к афише</Link></div>}
        {opened && (
          <EventSurface detail={!!eventId} onClose={() => setOpenId(null)}>
            <EventDetails event={opened} detail={!!eventId} onClose={() => setOpenId(null)}
              rsvp={rsvpButton(opened, new Date(opened.starts_at).getTime() < now || opened.status === "done")} />
          </EventSurface>
        )}
        </div>
      </main>
    </V2Shell>
  );
}

function EventSurface({ detail, onClose, children }: { detail: boolean; onClose: () => void; children: React.ReactNode }) {
  return detail ? <section>{children}</section> : <Modal onClose={onClose} labelledBy="ev2-modal-title" maxWidth={620}>{children}</Modal>;
}
