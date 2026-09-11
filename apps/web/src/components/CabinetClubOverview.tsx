import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiGet, type Me } from "../lib/api.js";
import { useNewsList, usePodcasts, formatNewsDate } from "../lib/queries.js";
import { fmtEventDate, type ClubEvent } from "../lib/events.js";

type NextAction = { title: string; note: string; to: string; cta: string };

/** Одно действие на обзор – без равных конкурентов в первом экране. */
function pickNextAction(me: Me, next: ClubEvent | undefined): NextAction {
  const contacts = me.alumni.contacts ?? {};
  const hasContact = !!(contacts.phone || contacts.telegram || contacts.email);
  if (!hasContact) {
    return {
      title: "Добавьте контакт для связи",
      note: "Телефон или Telegram помогут офису и однокурсникам найти вас.",
      to: "/lk/profile",
      cta: "Открыть профиль",
    };
  }
  const star = me.achievements.find((a) => !a.earned && a.star);
  if (star) {
    return {
      title: `Следующее достижение: ${star.title}`,
      note: `${star.current} / ${star.target} · ${star.kind}`,
      to: "/lk?section=achievements&view=all",
      cta: "К прогрессу",
    };
  }
  if (next && !next.my_rsvp) {
    return {
      title: next.title,
      note: `${fmtEventDate(next.starts_at)} (МСК) · ещё не записаны`,
      to: `/events/${next.id}`,
      cta: "Записаться",
    };
  }
  if (next?.my_rsvp) {
    return {
      title: "Вы записаны на ближайшую встречу",
      note: next.title,
      to: `/events/${next.id}`,
      cta: "Детали встречи",
    };
  }
  return {
    title: "Продолжить обучение",
    note: `Скидка ${me.level.discount}% действует только на программы ДПО.`,
    to: "/dpo",
    cta: "Каталог ДПО",
  };
}

function podcastNote(
  loading: boolean,
  subscribed: boolean | undefined,
  until: string | null | undefined,
): string {
  if (loading) return "Проверяем подписку…";
  if (!subscribed) return "Годовая подписка открывает все выпуски";
  if (!until) return "Подписка активна";
  const untilLabel = new Date(until).toLocaleDateString("ru-RU", {
    day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Moscow",
  });
  return `Подписка до ${untilLabel}`;
}

function BenefitsStrip({ me, token }: { me: Me; token: string }) {
  const podcasts = usePodcasts(token);
  const subscribed = !!podcasts.data?.subscribed;

  return (
    <section className="cabinet-benefits" aria-label="Льготы участника">
      <div className="cabinet-benefits__row">
        <div>
          <strong>Скидка на ДПО −{me.level.discount}%</strong>
          <span>Только на программы факультета, не на мерч.</span>
        </div>
        <Link className="foc" to="/dpo">В каталог</Link>
      </div>
      <div className="cabinet-benefits__row">
        <div>
          <strong>Подкасты</strong>
          <span>{podcastNote(podcasts.isLoading, podcasts.data?.subscribed, podcasts.data?.sub_until)}</span>
        </div>
        <Link className="foc" to="/podcasts">{subscribed ? "Слушать" : "Оформить"}</Link>
      </div>
    </section>
  );
}

/** Обзор: «Сейчас» + встреча + льготы; остальное – под «Ещё в клубе». */
export function CabinetClubOverview({ me, token }: { me: Me; token: string }) {
  const news = useNewsList(2);
  const events = useQuery({ queryKey: ["events", token], queryFn: () => apiGet<ClubEvent[]>("/events", token) });
  const next = (events.data ?? [])
    .filter((e) => e.status === "published" && Date.parse(e.starts_at) >= Date.now())
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))[0];
  const action = pickNextAction(me, next);
  const earned = me.achievements.filter((a) => a.earned).length;

  return (
    <div className="cabinet-club-overview">
      <div className="cabinet-welcome">
        <h1>Мой кабинет</h1>
        <p>Одно следующее действие и ближайшая встреча.</p>
      </div>
      <BenefitsStrip me={me} token={token} />
      <section className="cabinet-next-action" aria-labelledby="cabinet-next-action-title">
        <p className="cabinet-next-action-eyebrow">Сейчас</p>
        <h2 id="cabinet-next-action-title">{action.title}</h2>
        <p>{action.note}</p>
        <Link className="foc cabinet-next-action-cta" to={action.to}>{action.cta} →</Link>
      </section>
      <section className="cabinet-next-event" aria-labelledby="cabinet-event-title">
        <div className="cabinet-block-heading">
          <h2 id="cabinet-event-title">Ближайшая встреча</h2>
          <Link className="foc" to="/events">Вся афиша</Link>
        </div>
        {events.isLoading ? (
          <p role="status">Загружаем встречи…</p>
        ) : events.isError ? (
          <p>Не удалось загрузить афишу. <button type="button" className="foc" onClick={() => events.refetch()}>Повторить</button></p>
        ) : next ? (
          <>
            <time dateTime={next.starts_at}>{fmtEventDate(next.starts_at)} (МСК)</time>
            <h3><Link className="foc" to={`/events/${next.id}`}>{next.title}</Link></h3>
            <p>{next.format === "online" ? "Онлайн" : "Очная встреча"}{next.location ? ` · ${next.location}` : ""}</p>
            <Link className="foc cabinet-event-action" to={`/events/${next.id}`}>
              {next.my_rsvp ? "Вы записаны – детали встречи" : "Подробнее и запись"}
            </Link>
          </>
        ) : (
          <p>Ближайшие встречи ещё не объявлены. Прошедшие события доступны в афише.</p>
        )}
      </section>

      <details className="cabinet-more">
        <summary className="foc">Ещё в клубе</summary>
        <section className="cabinet-latest-news" aria-labelledby="cabinet-news-title">
          <div className="cabinet-block-heading">
            <h2 id="cabinet-news-title">Новости клуба</h2>
            <Link className="foc" to="/news">Все новости</Link>
          </div>
          {news.isLoading ? (
            <p role="status">Загружаем новости…</p>
          ) : news.isError ? (
            <p>Не удалось загрузить новости. <button type="button" className="foc" onClick={() => news.refetch()}>Повторить</button></p>
          ) : news.data?.length ? (
            news.data.map((n) => (
              <article key={n.slug}>
                <time>{formatNewsDate(n.published_at)}</time>
                <h3><Link className="foc" to={`/news/${n.slug}`}>{n.title}</Link></h3>
                {n.excerpt && <p>{n.excerpt}</p>}
              </article>
            ))
          ) : (
            <p>Новых публикаций пока нет.</p>
          )}
        </section>
        <section className="cabinet-achievements-teaser" aria-label="Достижения">
          <div>
            <strong>Достижения</strong>
            <span>получено {earned} из {me.achievements.length}</span>
          </div>
          <div className="cabinet-achievements-teaser-links">
            <Link className="foc" to="/lk?section=achievements&view=all">Все достижения</Link>
            <Link className="foc" to="/lk?section=achievements&view=earned">Полученные</Link>
          </div>
        </section>
        <section className="cabinet-opportunities" aria-label="Возможности участника">
          <Link className="foc" to="/merch"><strong>Мерч клуба</strong><span>Коллекция с символикой факультета.</span></Link>
          <Link className="foc" to="/lk/profile"><strong>Обновить профиль</strong><span>Фото, контакты и интересы.</span></Link>
          <Link className="foc" to="/support"><strong>Помощь и поддержка</strong><span>Кабинет, заявки и персональные данные.</span></Link>
        </section>
      </details>
    </div>
  );
}
