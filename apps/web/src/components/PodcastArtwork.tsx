import { useState } from "react";
import "../styles/podcast-artwork.css";

export function PodcastLock() {
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /><path d="M12 14v3" /></svg>;
}

/** Одна обложка для списка и страницы выпуска; замок дублируется текстом рядом. */
export function PodcastArtwork({ cover, number, locked = false }: { cover?: string | null; number: number; locked?: boolean }) {
  const [failed, setFailed] = useState(false);
  return <div className={`podcast-artwork${locked ? " podcast-artwork--locked" : ""}`} aria-hidden="true">
    {cover && !failed ? <img src={cover} alt="" loading="lazy" onError={() => setFailed(true)} /> : <div className="podcast-artwork__type"><span>Подкасты клуба</span><strong>Право.<br /><i>Вслух.</i></strong><span>Выпуск {String(number).padStart(2, "0")}</span></div>}
    <span className="podcast-artwork__symbol">{locked ? <PodcastLock /> : <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="m8 5 11 7-11 7z" /></svg>}</span>
  </div>;
}
