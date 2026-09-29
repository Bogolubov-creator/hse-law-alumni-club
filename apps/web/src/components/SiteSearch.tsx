import { useId, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { token, usePrograms } from "../lib/cart.js";
import { useNewsList, usePodcasts, formatNewsDate } from "../lib/queries.js";
import { useQuery } from "@tanstack/react-query";
import { loadChanges, selectChanges } from "../lib/changes.js";
import { SEARCH_NAV } from "../config/navigation.js";
import Modal from "./Modal.js";

/**
 * Поиск по материалам клуба и быстрые переходы в разделы.
 * Загрузка и частичный отказ источников отображаются отдельно от пустого результата.
 */
const LIMIT = 6;

function norm(s: string): string {
  return s.toLocaleLowerCase("ru").replace(/ё/g, "е").trim();
}

export function SiteSearch({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const programs = usePrograms();
  const news = useNewsList();
  const podcasts = usePodcasts(token());
  const changes = useQuery({ queryKey: ["law-changes"], queryFn: ({ signal }) => loadChanges(signal), staleTime: 60000, retry: false });
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

  const foundChanges = needle.length < 2 ? [] : selectChanges(changes.data?.items ?? [], new URLSearchParams({ q, view: "digest" })).slice(0, LIMIT);
  const foundPodcasts = needle.length < 2 ? [] : (podcasts.data?.items ?? []).filter(p => norm(p.title).includes(needle)).slice(0, LIMIT);
  const sections = SEARCH_NAV.filter(section => !needle || norm(section.label).includes(needle));
  const loading = [programs, news, podcasts, changes].some(query => query.isPending);
  const failed = [programs, news, podcasts, changes].some(query => query.isError);
  const nothing = needle.length >= 2 && !loading && !failed && !foundPrograms.length && !foundNews.length && !foundChanges.length && !foundPodcasts.length && !sections.length;
  const submit = (e: FormEvent) => { e.preventDefault(); };

  return (
    <Modal onClose={onClose} labelledBy={titleId} maxWidth={640}>
      <div className="club-search">
        <form onSubmit={submit} role="search" className="club-search__form">
          <label htmlFor={`${titleId}-q`} id={titleId} className="club-caps">Поиск по клубу</label>
          <div className="club-search__row">
            <input
              id={`${titleId}-q`}
              type="search"
              autoFocus
              autoComplete="off"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Программа, новость или изменение в праве"
              className="club-search__input"
            />
            <button type="button" onClick={onClose} className="foc club-chrome-icon-btn" aria-label="Закрыть поиск">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M6 6l12 12M6 18L18 6" /></svg>
            </button>
          </div>
        </form>

        <div className="club-search__results" aria-live="polite">
          {needle.length < 2 && <p className="club-search__hint">Введите хотя бы две буквы.</p>}
          {sections.length > 0 && <nav aria-label="Разделы клуба" className="club-search__shortcuts">{sections.map(section => <Link key={section.to} to={section.to} onClick={onClose} className="foc">{section.label}</Link>)}</nav>}
          {needle.length >= 2 && loading && <p className="club-search__hint">Ищем материалы…</p>}
          {failed && <p className="club-search__hint">Часть материалов не загрузилась. <button type="button" className="foc" onClick={() => { void programs.refetch(); void news.refetch(); void podcasts.refetch(); void changes.refetch(); }}>Повторить</button></p>}
          {nothing && <p className="club-search__hint">Ничего не найдено. Попробуйте другое слово.</p>}
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
          {foundChanges.length > 0 && <section><h2 className="club-caps">Изменения в праве</h2><ul>{foundChanges.map(item => <li key={item.id}><Link to={`/changes/${item.id}`} onClick={onClose} className="foc club-search__item"><strong>{item.title}</strong><span>{item.kind}</span></Link></li>)}</ul></section>}
          {foundPodcasts.length > 0 && <section><h2 className="club-caps">Подкасты</h2><ul>{foundPodcasts.map(item => <li key={item.id}><Link to={`/podcasts/${item.id}`} onClick={onClose} className="foc club-search__item"><strong>{item.title}</strong></Link></li>)}</ul></section>}
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
