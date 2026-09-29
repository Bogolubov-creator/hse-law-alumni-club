import { useState } from "react";
import { Link } from "react-router-dom";
import { READING_LABELS, updateReading, useReading } from "../lib/reading-list.js";
import "../styles/reading-list.css";
function progress(id: string) {
  try { const seconds = Number(localStorage.getItem(`pod-pos-${id}`)); return Number.isFinite(seconds) && seconds > 5 ? ` · с ${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}` : ""; } catch { return ""; }
}
export default function ContinueReading() {
  const { recent, unavailable } = useReading();
  const [error, setError] = useState(false);
  if (!recent.length && !unavailable) return null;
  return <section className="reading-cabinet" aria-labelledby="continue-reading-title"><h2 id="continue-reading-title">Продолжить</h2><p>Недавно открыто в этом браузере.</p>
    {unavailable || error ? <p role="alert">Не удалось открыть или очистить историю.</p> : <ul>{recent.slice(0, 4).map(item => <li key={item.path}><span className="reading-meta">{READING_LABELS[item.kind]}{item.kind === "podcast" ? progress(item.id) : ""}</span><Link className="reading-resume" to={item.path}>{item.title} →</Link></li>)}</ul>}
    {!!recent.length && <button className="reading-button" onClick={() => setError(!updateReading(data => ({ ...data, recent: [] })))}>Очистить историю</button>}
  </section>;
}
