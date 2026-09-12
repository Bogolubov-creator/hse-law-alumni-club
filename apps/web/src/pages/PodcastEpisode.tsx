import { Link, useParams } from "react-router-dom";
import { usePodcasts } from "../lib/queries.js";
import { token } from "../lib/cart.js";
import { useHead } from "../lib/title.js";
import { V2Shell } from "../v2/Shell.js";
import { EpisodePlayer } from "../components/EpisodePlayer.js";
import { VideoEmbed } from "../components/VideoEmbed.js";
import { PodcastArtwork, PodcastLock } from "../components/PodcastArtwork.js";
import { rub } from "../lib/api.js";
import { action } from "../styles/primitives.js";
import "../styles/podcast-episode.css";

export default function PodcastEpisode() {
  const { id } = useParams();
  const q = usePodcasts(token());
  const items = q.data?.items ?? [];
  const index = items.findIndex(item => item.id === id);
  const episode = items[index];
  const locked = !!episode && !episode.is_free && !q.data?.subscribed;
  useHead({ title: episode?.title ?? "Выпуск подкаста", noindex: true });
  return <V2Shell><main id="main" className="episode-page">
    <Link to="/podcasts" className="foc episode-back">← Все подкасты</Link>
    {q.isLoading ? <p role="status">Загружаем выпуск…</p> : q.isError ? <div role="alert"><p>Не удалось загрузить выпуск.</p><button className="foc" style={action} onClick={() => q.refetch()}>Повторить</button></div> : !episode ? <h1>Выпуск не найден</h1> : <>
      <div className="episode-layout">
        <div className="episode-cover"><PodcastArtwork key={episode.id} cover={episode.cover} number={index + 1} locked={locked} /></div>
        <div className="episode-content">
          <p className="episode-meta">Выпуск {String(index + 1).padStart(2, "0")} · {episode.duration || "Подкаст"}{episode.is_free ? " · Бесплатно" : ""}</p>
          <h1>{episode.title}</h1>
          {episode.description && <p className="episode-description">{episode.description}</p>}
          {locked ? <section className="episode-access" aria-label="Доступ по подписке">
            <PodcastLock /><h2>Этот выпуск – по подписке</h2>
            <p>Откройте все выпуски подкастов клуба на год.</p>
            <strong>{q.data ? rub(q.data.price) : "4 999 ₽"} / год</strong>
            <Link to="/podcasts#podcast-subscription" className="foc" style={action}>Оформить подписку</Link>
          </section> : <section className="episode-player" aria-label="Плеер выпуска">
            {episode.video_url ? <VideoEmbed src={episode.video_url} title={episode.title} v2 /> : episode.audio_url ? <EpisodePlayer key={episode.id} id={episode.id} src={episode.audio_url} v2 expanded /> : <p>Запись пока недоступна.</p>}
          </section>}
          {!locked && episode.audio_url && <p className="episode-note">Слушайте в своём темпе. Плеер запоминает место, на котором вы остановились в этом браузере.</p>}
        </div>
      </div>
      <nav className="episode-neighbors" aria-label="Другие выпуски">
        {items[index - 1] && <Link className="foc" to={`/podcasts/${encodeURIComponent(items[index - 1]!.id)}`}><span>← Предыдущий выпуск</span>{items[index - 1]!.title}</Link>}
        {items[index + 1] && <Link className="foc" to={`/podcasts/${encodeURIComponent(items[index + 1]!.id)}`}><span>Следующий выпуск →</span>{items[index + 1]!.title}</Link>}
      </nav>
    </>}
  </main></V2Shell>;
}
