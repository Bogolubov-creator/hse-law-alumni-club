import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { fmtEventDateFull, gcalUrl, type ClubEvent } from "../lib/events.js";
import "../styles/event-details.css";

/** Общие сведения и действия для прямой страницы и быстрого просмотра. */
export default function EventDetails({ event, detail, onClose, rsvp }: {
  event: ClubEvent; detail: boolean; onClose: () => void; rsvp: ReactNode;
}) {
  const [failedCover, setFailedCover] = useState<string | null>(null);
  const Heading = detail ? "h1" : "h2";
  const SectionHeading = detail ? "h2" : "h3";
  const past = event.status === "done" || Date.parse(event.starts_at) < Date.now();
  return (
    <article className={`club-event-detail${detail ? " club-event-detail--page" : ""}`}>
      <nav className="club-event-detail__nav" aria-label="Навигация события">
        <Link className="foc" to={detail ? "/events" : `/events/${event.id}`}>{detail ? "← Вся афиша" : "Открыть страницу события"}</Link>
        {!detail && <button className="foc" onClick={onClose}>Закрыть</button>}
      </nav>
      <header className="club-event-detail__header">
        <div className="club-event-detail__tags">
          <span>{event.format === "online" ? "Онлайн" : "Очно"}</span>
          {past ? <span>Событие завершено</span> : event.points > 0 && <span>+{event.points} баллов за участие</span>}
        </div>
        <Heading id="ev2-modal-title">{event.title}</Heading>
      </header>

      <div className="club-event-detail__body">
        <div className="club-event-detail__story">
      {event.cover && event.cover !== failedCover && (
        <img className="club-event-detail__cover" src={event.cover} alt={`Афиша: ${event.title}`} width={1200} height={630}
          decoding="async" onError={() => setFailedCover(event.cover)} />
      )}
          <SectionHeading>О встрече</SectionHeading>
          <p>{event.description || "Описание встречи пока не опубликовано."}</p>
        </div>
        <aside className="club-event-detail__info" aria-label="Время, место и участие">
          <dl>
            <div><dt>Когда · московское время</dt><dd><time dateTime={event.starts_at}>{fmtEventDateFull(event.starts_at)}</time></dd></div>
            {event.location && <div><dt>{event.format === "online" ? "Подключение" : "Где"}</dt><dd>{event.location}</dd></div>}
          </dl>
          <div className="club-event-detail__actions">
            {rsvp}
            {event.reg_url && <a href={event.reg_url} target="_blank" rel="noopener noreferrer" className="foc club-event-detail__registration">Регистрация ↗</a>}
          </div>
          {!past && <p className="club-event-detail__attendance">{event.going > 0 ? `Пойдут: ${event.going}` : "Будьте первым"}</p>}
          <div className="club-event-detail__calendar">
            <span>В календарь</span>
            <a href={`/api/events/${event.id}.ics`} className="foc">Файл .ics</a>
            <a href={gcalUrl(event)} target="_blank" rel="noopener noreferrer" className="foc">Google Календарь ↗</a>
          </div>
        </aside>
      </div>
    </article>
  );
}
