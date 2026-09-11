import { useId, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { usePrograms } from "../lib/cart.js";
import { useNewsList, formatNewsDate } from "../lib/queries.js";
import Modal from "./Modal.js";

/**
 * Поиск в шапке (решение заказчика 12.09): по программам ДПО и новостям.
 * Оба списка уже загружены витринами, поэтому ищем на клиенте – без нового
 * запроса и без задержки. Enter без выбора ведёт в каталог с тем же запросом.
 */
const LIMIT = 6;

function norm(s: string): string {
  return s.toLocaleLowerCase("ru").replace(/ё/g, "е").trim();
}

export function SiteSearch({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const programs = usePrograms();
  const news = useNewsList();
  const navigate = useNavigate();
  const titleId = useId();
  const needle = norm(q);

  const foundPrograms = useMemo(() => {
    if (needle.length < 2) return [];
    return (programs.data ?? [])
      .filter((p) => norm(`${p.title} ${p.direction}`).includes(needle))
      .slice(0, LIMIT);
  }, [programs.data, needle]);
  const foundNews = useMemo(() => {
    if (needle.length < 2) return [];
    return (news.data ?? [])
      .filter((n) => norm(`${n.title} ${n.excerpt ?? ""}`).includes(needle))
      .slice(0, LIMIT);
  }, [news.data, needle]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (needle.length < 2) return;
    onClose();
    navigate(`/dpo?q=${encodeURIComponent(q.trim())}`);
  };

  const nothing = needle.length >= 2 && foundPrograms.length === 0 && foundNews.length === 0;

  return (
    <Modal onClose={onClose} labelledBy={titleId} maxWidth={640}>
      <div className="club-search">
        <form onSubmit={submit} role="search" className="club-search__form">
          <label htmlFor={`${titleId}-q`} id={titleId} className="club-caps">Поиск по программам и новостям</label>
          <div className="club-search__row">
            <input
              id={`${titleId}-q`}
              type="search"
              autoFocus
              autoComplete="off"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Название программы, направление, новость"
              className="club-search__input"
            />
            <button type="button" onClick={onClose} className="foc club-chrome-icon-btn" aria-label="Закрыть поиск">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M6 6l12 12M6 18L18 6" /></svg>
            </button>
          </div>
        </form>

        <div className="club-search__results" aria-live="polite">
          {needle.length < 2 && <p className="club-search__hint">Введите хотя бы две буквы.</p>}
          {nothing && <p className="club-search__hint">Ничего не нашлось. Попробуйте другое слово или откройте <Link to="/dpo" onClick={onClose} className="foc">каталог целиком</Link>.</p>}
          {foundPrograms.length > 0 && (
            <section>
              <h2 className="club-caps">Программы ДПО</h2>
              <ul>
                {foundPrograms.map((p) => (
                  <li key={p.slug}>
                    <Link to={`/dpo/${p.slug}`} onClick={onClose} className="foc club-search__item">
                      <strong>{p.title}</strong>
                      <span>{p.direction}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {foundNews.length > 0 && (
            <section>
              <h2 className="club-caps">Новости</h2>
              <ul>
                {foundNews.map((n) => (
                  <li key={n.slug}>
                    <Link to={`/news/${n.slug}`} onClick={onClose} className="foc club-search__item">
                      <strong>{n.title}</strong>
                      {n.published_at && <span>{formatNewsDate(n.published_at)}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </Modal>
  );
}
