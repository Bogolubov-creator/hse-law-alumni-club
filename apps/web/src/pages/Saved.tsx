import { useState } from "react";
import { Link } from "react-router-dom";
import { V2Shell } from "../v2/Shell.js";
import { useHead } from "../lib/title.js";
import { READING_LABELS, toggleSaved, useReading } from "../lib/reading-list.js";
import "../styles/reading-list.css";
export default function Saved() {
  const { saved, unavailable } = useReading();
  const [kind, setKind] = useState("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState(false);
  const [removed, setRemoved] = useState<(typeof saved)[number] | null>(null);
  useHead({ title: "Сохранённое", noindex: true });
  const items = saved.filter(i => (kind === "all" || kind === i.kind) && i.title.toLocaleLowerCase("ru").includes(query.toLocaleLowerCase("ru").trim()));
  return <V2Shell><main id="main" className="reading-page"><h1>Сохранённое</h1><p>Материалы, которые вы сохранили в этом браузере.</p>
    <div className="reading-filters"><label>Найти материал<input type="search" value={query} onChange={e => setQuery(e.target.value)} /></label><label>Раздел<select value={kind} onChange={e => setKind(e.target.value)}><option value="all">Все разделы</option>{Object.entries(READING_LABELS).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>
    {(error || unavailable) && <p role="alert">Не удалось открыть или изменить сохранённое. Проверьте настройки хранилища браузера.</p>}
    {removed && <p role="status">Материал удалён. <button className="reading-button" onClick={() => { if (!saved.some(i => i.path === removed.path) && !toggleSaved(removed)) setError(true); else { setError(false); setRemoved(null); } }}>Отменить</button></p>}
    <p role="status">Найдено: {items.length}</p>
    {items.map(item => <article key={item.path} className="reading-row"><div><span>{READING_LABELS[item.kind]}</span><h2><Link to={item.path}>{item.title}</Link></h2></div><button className="reading-button" aria-label={`Удалить из сохранённого: ${item.title}`} onClick={() => { const ok = toggleSaved(item); setError(!ok); if (ok) setRemoved(item); }}>Удалить</button></article>)}
    {!items.length && !unavailable && <section className="reading-empty"><h2>{saved.length ? "Ничего не найдено" : "Сохраните первый материал"}</h2><p>{saved.length ? "Измените запрос или выберите другой раздел." : "Нажмите «Сохранить» в справке, программе, подкасте или событии."}</p><Link to="/changes">Открыть правовую базу →</Link></section>}
  </main></V2Shell>;
}
