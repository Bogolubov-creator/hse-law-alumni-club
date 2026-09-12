import { Link, useParams } from "react-router-dom";
import { usePodcasts } from "../lib/queries.js";
import { token } from "../lib/cart.js";
import { useHead } from "../lib/title.js";
import { V2Shell } from "../v2/Shell.js";
import { EpisodePlayer } from "../components/EpisodePlayer.js";
import { VideoEmbed } from "../components/VideoEmbed.js";
import { Mark } from "../v2/Mark.js";
import { action } from "../styles/primitives.js";
import "../styles/podcast-episode.css";

export default function PodcastEpisode() {
  const { id } = useParams();
  const q = usePodcasts(token());
  const items = q.data?.items ?? [];
  const index = items.findIndex(item => item.id === id);
  const episode = items[index];
  useHead({ title: episode?.title ?? "Выпуск подкаста", noindex: true });
  return <V2Shell><main id="main" className="episode-page">
    <Link to="/podcasts" className="foc episode-back">← Все подкасты</Link>
    {q.isLoading ? <p role="status">Загружаем выпуск…</p> : q.isError ? <div role="alert"><p>Не удалось загрузить выпуск.</p><button className="foc" style={action} onClick={() => q.refetch()}>Повторить</button></div> : !episode ? <h1>Выпуск не найден</h1> : <>
      <div className="episode-layout">
        <div className="episode-cover">
          {episode.cover ? <img src={episode.cover} alt={`Обложка: ${episode.title}`} /> : <div className="episode-cover__type">
            <div className="episode-cover__brand"><Mark kind="scales" size={30} /><span>Клуб выпускников<br />факультета права Вышки</span></div>
            <div className="episode-cover__title">Право.<br /><i>Вслух.</i></div>
            <div className="episode-cover__foot"><span>Подкасты клуба</span><span>{String(index + 1).padStart(2, "0")}</span></div>
          </div>}
        </div>
        <div className="episode-content">
          <p className="episode-meta">Выпуск {String(index + 1).padStart(2, "0")} · {episode.duration || "Подкаст"}{episode.is_free ? " · Бесплатно" : ""}</p>
          <h1>{episode.title}</h1>
          {episode.description && <p className="episode-description">{episode.description}</p>}
          <section className="episode-player" aria-label="Плеер выпуска">
            {episode.video_url ? <VideoEmbed src={episode.video_url} title={episode.title} v2 /> : episode.audio_url ? <EpisodePlayer key={episode.id} id={episode.id} src={episode.audio_url} v2 expanded /> : <><p>{episode.is_free || q.data?.subscribed ? "Запись пока недоступна." : "Этот выпуск доступен по подписке."}</p><Link to="/podcasts" className="foc">К списку выпусков и подписке</Link></>}
          </section>
          {episode.audio_url && <p className="episode-note">Слушайте в своём темпе. Плеер запоминает место, на котором вы остановились в этом браузере.</p>}
        </div>
      </div>
      <nav className="episode-neighbors" aria-label="Другие выпуски">
        {items[index - 1] && <Link className="foc" to={`/podcasts/${encodeURIComponent(items[index - 1]!.id)}`}><span>← Предыдущий выпуск</span>{items[index - 1]!.title}</Link>}
        {items[index + 1] && <Link className="foc" to={`/podcasts/${encodeURIComponent(items[index + 1]!.id)}`}><span>Следующий выпуск →</span>{items[index + 1]!.title}</Link>}
      </nav>
    </>}
  </main></V2Shell>;
}
