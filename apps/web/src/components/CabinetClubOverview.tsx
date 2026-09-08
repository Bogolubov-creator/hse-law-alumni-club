import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiGet, type Me } from '../lib/api.js';
import { useNewsList, formatNewsDate } from '../lib/queries.js';
import type { ClubEvent } from '../lib/events.js';

/** Обзор использует те же публикации и события, что публичные разделы. */
export function CabinetClubOverview({ me, token }: { me: Me; token: string }) {
  const news = useNewsList(2);
  const events = useQuery({ queryKey: ['events', token], queryFn: () => apiGet<ClubEvent[]>('/events', token) });
  const next = (events.data ?? []).filter(e => e.status === 'published' && Date.parse(e.starts_at) >= Date.now()).sort((a,b) => Date.parse(a.starts_at)-Date.parse(b.starts_at))[0];
  return <div className="cabinet-club-overview">
    <div className="cabinet-welcome"><h1>Мой кабинет</h1><p>Ваш статус, участие в клубе и всё, что происходит на факультете.</p></div>
    <section className="cabinet-next-event" aria-labelledby="cabinet-event-title">
      <div className="cabinet-block-heading"><h2 id="cabinet-event-title">Ближайшая встреча</h2><Link className="foc" to="/v2/events">Вся афиша</Link></div>
      {events.isLoading ? <p role="status">Загружаем встречи…</p> : events.isError ? <p>Не удалось загрузить афишу. <button className="foc" onClick={() => events.refetch()}>Повторить</button></p> : next ? <>
        <time dateTime={next.starts_at}>{new Date(next.starts_at).toLocaleString('ru-RU', { day:'numeric', month:'long', hour:'2-digit', minute:'2-digit', timeZone:'Europe/Moscow' })} (МСК)</time>
        <h3><Link className="foc" to={`/v2/events/${next.id}`}>{next.title}</Link></h3>
        <p>{next.format === 'online' ? 'Онлайн' : 'Очная встреча'}{next.location ? ` · ${next.location}` : ''}</p>
        <Link className="foc cabinet-event-action" to={`/v2/events/${next.id}`}>{next.my_rsvp ? 'Вы записаны – детали встречи' : 'Подробнее и запись'}</Link>
      </> : <p>Ближайшие встречи ещё не объявлены. Прошедшие события доступны в афише.</p>}
    </section>
    <section className="cabinet-latest-news" aria-labelledby="cabinet-news-title">
      <div className="cabinet-block-heading"><h2 id="cabinet-news-title">Новости клуба</h2><Link className="foc" to="/v2/news">Все новости</Link></div>
      {news.isLoading ? <p role="status">Загружаем новости…</p> : news.isError ? <p>Не удалось загрузить новости. <button className="foc" onClick={()=>news.refetch()}>Повторить</button></p> : news.data?.length ? news.data.map(n=><article key={n.slug}><time>{formatNewsDate(n.published_at)}</time><h3><Link className="foc" to={`/v2/news/${n.slug}`}>{n.title}</Link></h3>{n.excerpt && <p>{n.excerpt}</p>}</article>) : <p>Новых публикаций пока нет.</p>}
    </section>
    <section className="cabinet-opportunities" aria-label="Возможности участника">
      <Link className="foc" to="/v2/dpo"><strong>Продолжить обучение</strong><span>Ваша скидка на ДПО – {me.level.discount}%. Сравните программы и условия участия.</span></Link>
      <Link className="foc" to="/v2/merch"><strong>Мерч клуба</strong><span>Коллекция с символикой факультета: размеры, наличие и оформление заявки.</span></Link>
      <Link className="foc" to="/v2/podcasts"><strong>Послушать подкасты</strong><span>Выпуски, пробное прослушивание и условия доступа.</span></Link>
      <Link className="foc" to="/v2/lk/profile"><strong>Обновить профиль</strong><span>Фото, контакты и интересы помогут однокурсникам узнать вас.</span></Link>
    </section>
  </div>;
}
