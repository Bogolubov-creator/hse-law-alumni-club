import SaveMaterial from "../components/SaveMaterial.js";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { V2Shell } from "../v2/Shell.js";
import ChangesStatus from "../components/ChangesStatus.js";
import { changeDate, loadChanges, selectChanges, type LawChange } from "../lib/changes.js";
import { useHead } from "../lib/title.js";
import "../styles/changes.css";

const listPositions = new Map<string, { y: number; id: string }>();
const PAGE_SIZE = 20;
const filterLabels: Record<string, string> = { kind: "Тип материала", topic: "Рубрика", from: "Опубликовано с", to: "Опубликовано по" };

export default function Changes() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [copied, setCopied] = useState("");
  const [manualLink, setManualLink] = useState("");
  const q = useQuery({ queryKey: ["law-changes"], queryFn: ({ signal }) => loadChanges(signal), staleTime: 60000, refetchInterval: 60000, retry: false });
  const items = q.data?.items ?? [];
  const loaded = !!q.data;
  const view = params.get("view") || (q.data?.mode === "channel" ? "digest" : "all");
  const selection = new URLSearchParams(params); selection.set("view", view);
  const matches = selectChanges(items, selection);
  const maxPage = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const page = Math.min(maxPage, Math.max(1, Number.parseInt(params.get("page") || "1", 10) || 1));
  const visible = matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const selected = items.find(item => item.id === id);
  const filters = Object.entries(filterLabels).filter(([key]) => params.has(key));
  const listUrl = `/changes${location.search}`;
  useHead({ title: selected ? selected.title : "Изменения в праве", description: "Краткие справки и пояснения LegisDigest: что изменилось, кого касается, ссылки на источники.", noindex: true });

  useEffect(() => {
    setCopied(""); setManualLink("");
    if (id && loaded) {
      heading.current?.focus({ preventScroll: true });
      document.querySelector(".changes-workspace")?.scrollIntoView({ block: "start", behavior: "instant" });
    }
    if (!id && loaded) {
      const position = listPositions.get(listUrl);
      if (position) {
        const frame = requestAnimationFrame(() => {
          document.getElementById(`change-${position.id}`)?.focus({ preventScroll: true });
          window.scrollTo({ top: position.y, behavior: "instant" });
        });
        return () => cancelAnimationFrame(frame);
      }
    }
  }, [id, loaded, listUrl]);

  function update(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next, { replace: true });
  }
  function remember(item: LawChange) {
    if (listPositions.size > 30) listPositions.clear();
    listPositions.set(listUrl, { y: window.scrollY, id: item.id });
  }
  async function copyLink() {
    const url = new URL(window.location.href);
    url.search = ""; url.hash = "";
    try { await navigator.clipboard.writeText(url.href); setCopied("Ссылка скопирована"); }
    catch { setManualLink(url.href); setCopied("Скопируйте адрес из поля ниже"); }
  }
  const back = () => navigate(listUrl);

  return <V2Shell><main id="main" className={`changes-page${id ? " changes-page--reading" : ""}`}>
    <header className="changes-head">
      <div><p className="changes-eyebrow">Правовая библиотека клуба</p>
        <h1>Изменения<br className="changes-title-break" /> в праве</h1>
        <p className="changes-lead">Что изменилось и кого касается.<br />Краткие справки, пояснения и источники.</p>
      </div>
      <aside className="changes-edition"><span className="changes-eyebrow">Материалы LegisDigest</span>
        {q.data && <><strong>{items.filter(i => i.entryType === "digest").length} справок и выпусков</strong><span>{items.filter(i => i.entryType === "act").length} записей в архиве актов</span></>}
        <a href="https://t.me/LegisDigest" target="_blank" rel="noopener noreferrer">LegisDigest в Telegram ↗</a>
      </aside>
    </header>
    {q.data && <ChangesStatus data={q.data} />}

    <section className="changes-controls" aria-label="Поиск и фильтры">
      <div className="changes-views" role="group" aria-label="Материалы и документы">{[["digest", "Справки и обзоры"], ["act", "Архив актов"], ["all", "Всё"]].map(([value, label]) => <button key={value} aria-pressed={view === value} onClick={() => { const next = new URLSearchParams(params); next.set("view", value!); next.delete("page"); next.delete("kind"); next.delete("topic"); setParams(next, { replace: true }); }}>{label}</button>)}</div>
      <div className="changes-search-row"><label className="changes-search">Название, номер акта или ключевые слова
        <input type="search" value={params.get("q") || ""} onChange={e => update("q", e.target.value)} placeholder="Например, налоги, перевозки или номер акта" />
      </label><button className="changes-button" onClick={() => {
        dialog.current?.querySelector("form")?.reset();
        dialog.current?.querySelectorAll("input").forEach(input => input.setCustomValidity(""));
        dialog.current?.showModal();
      }}>Фильтры{filters.length ? ` · ${filters.length}` : ""}</button></div>
      <div className="changes-result-bar"><span role="status" aria-live="polite">{q.isPending ? "Загружаем документы…" : q.isError ? "Результаты недоступны" : `Найдено: ${matches.length}`}</span>
        <label>Порядок <select aria-label="Порядок" value={params.get("sort") || "newest"} onChange={e => update("sort", e.target.value)}><option value="newest">Сначала новые</option><option value="oldest">Сначала старые</option></select></label>
      </div>
      {(filters.length > 0 || params.get("q")) && <div className="changes-chips">
        {filters.map(([key, label]) => <button key={key} onClick={() => update(key, "")} aria-label={`Снять фильтр ${label}`}>{label}: {params.get(key)} ×</button>)}
        <button onClick={() => setParams({ view }, { replace: true })}>Сбросить всё</button>
      </div>}
    </section>

    <dialog ref={dialog} className="changes-dialog" aria-labelledby="changes-filter-title">
      <form key={location.search} onSubmit={e => {
        e.preventDefault(); const form = new FormData(e.currentTarget); const next = new URLSearchParams(params);
        Object.keys(filterLabels).forEach(key => { const value = String(form.get(key) || ""); if (value) next.set(key, value); else next.delete(key); });
        if (next.get("from") && next.get("to") && next.get("from")! > next.get("to")!) {
          (e.currentTarget.elements.namedItem("to") as HTMLInputElement).setCustomValidity("Конец периода должен быть не раньше начала");
          e.currentTarget.reportValidity(); return;
        }
        next.delete("page"); setParams(next, { replace: true }); dialog.current?.close();
      }}>
        <div className="changes-dialog-head"><h2 id="changes-filter-title">Фильтры</h2><button type="button" className="changes-button" onClick={() => dialog.current?.close()} aria-label="Закрыть фильтры">×</button></div>
        <label>Тип материала<select name="kind" defaultValue={params.get("kind") || ""}><option value="">Все типы</option>{[...new Set(items.filter(i => view === "all" || i.entryType === view).map(item => item.kind))].sort().map(kind => <option key={kind}>{kind}</option>)}</select></label>
        <label>Рубрика<select name="topic" defaultValue={params.get("topic") || ""}><option value="">Все рубрики</option>{[...new Set(items.filter(i => view === "all" || i.entryType === view).map(item => item.topic))].sort().map(topic => <option key={topic}>{topic}</option>)}</select></label>
        <p className="changes-muted">Для справок используется дата сообщения в Telegram, для актов – дата официального опубликования. Это не даты вступления норм в силу.</p>
        <label>Опубликовано с<input type="date" name="from" defaultValue={params.get("from") || ""} onChange={e => (e.currentTarget.form?.elements.namedItem("to") as HTMLInputElement)?.setCustomValidity("")} /></label>
        <label>Опубликовано по<input type="date" name="to" defaultValue={params.get("to") || ""} onChange={e => e.currentTarget.setCustomValidity("")} /></label>
        <div className="changes-actions"><button className="changes-button changes-button--primary">Показать результаты</button><button type="button" className="changes-button" onClick={() => { const next = new URLSearchParams(params); Object.keys(filterLabels).forEach(key => next.delete(key)); next.delete("page"); setParams(next, { replace: true }); }}>Сбросить фильтры</button></div>
      </form>
    </dialog>

    {q.isPending && <div className="changes-empty" role="status">Загружаем архив документов…</div>}
    {q.isError && <div className="changes-empty" role="alert"><h2>Архив не загрузился</h2><p>Проверьте соединение и повторите загрузку.</p><button className="changes-button" onClick={() => q.refetch()}>Повторить</button></div>}
    {q.data && <div className="changes-workspace">
      <section className="changes-list" aria-label="Документы">
        {visible.map(item => <article key={item.id} className={`changes-row${item.id === id ? " is-selected" : ""}`}>
          <div className="changes-row-meta"><time dateTime={item.published}>{changeDate(item.published)}</time><span>{item.kind}</span></div>
          <h2><Link id={`change-${item.id}`} to={`/changes/${item.id}${location.search}`} onClick={() => remember(item)} aria-current={item.id === id ? "page" : undefined}>{item.title}</Link></h2>
          {item.summary && <p className="changes-row-summary">{item.summary}</p>}
          <p className="changes-row-foot">{item.entryType === "digest" ? "LegisDigest · Telegram" : `№ ${item.number || "не указан"}`}<span>{item.entryType === "digest" ? "Читать материал ↗" : "Открыть запись ↗"}</span></p>
        </article>)}
        {matches.length === 0 && <div className="changes-empty"><h2>{items.length ? "Совпадений нет" : "В архиве пока нет документов"}</h2><p>{items.length ? "Попробуйте другое слово или снимите фильтры." : "Документы появятся после загрузки среза."}</p>{items.length > 0 && <button className="changes-button" onClick={() => setParams({ view }, { replace: true })}>Сбросить всё</button>}</div>}
        {maxPage > 1 && <nav className="changes-pagination" aria-label="Страницы документов"><button className="changes-button" disabled={page === 1} onClick={() => update("page", String(page - 1))}>Назад</button><span>{page} / {maxPage}</span><button className="changes-button" disabled={page === maxPage} onClick={() => update("page", String(page + 1))}>Далее</button></nav>}
      </section>
      <section className="changes-reader" aria-label="Чтение документа">
        {selected ? <article>
          <button onClick={back} className="changes-back">← К списку изменений</button>
          <p className="changes-eyebrow">{selected.kind}{selected.entryType === "act" ? ` · № ${selected.number || "не указан"}` : " · LegisDigest"}</p>
          <h2 ref={heading} tabIndex={-1}>{selected.title}</h2>
          <SaveMaterial item={{ kind: "change", id: selected.id, title: selected.title, path: `/changes/${selected.id}` }} />
          {selected.entryType === "digest" ? <>
            <div className="changes-attribution"><strong>Автоматический материал LegisDigest</strong><span>Опубликован в Telegram {changeDate(selected.published)}. Пояснения перенесены из канала; проверка человеком не подтверждена.</span></div>
            <div className="changes-brief">{selected.blocks.map((block, i) => { const content = block.segments.map((segment, j) => segment.url ? <a key={j} href={segment.url} target="_blank" rel="noopener noreferrer">{segment.text}</a> : <span key={j}>{segment.text}</span>); return block.heading ? <h3 key={i}>{content}</h3> : <p key={i}>{content}</p>; })}</div>
          </> : <><dl className="changes-facts"><div><dt>Дата акта</dt><dd>{changeDate(selected.date)}</dd></div><div><dt>Опубликован</dt><dd>{changeDate(selected.published)}</dd></div><div><dt>Вступление в силу</dt><dd>Дата не установлена</dd></div><div><dt>Источник</dt><dd>Официальный портал опубликования</dd></div></dl>
          <h3>О документе</h3><p>Полный текст доступен на портале официального опубликования.</p>
          <p className="changes-muted">Дата опубликования не заменяет дату вступления в силу.</p></>}
          <div className="changes-actions"><a className="changes-button changes-button--primary" href={selected.url} target="_blank" rel="noopener noreferrer">{selected.entryType === "digest" ? "Оригинал в Telegram ↗" : "Открыть первоисточник ↗"}</a><button className="changes-button" onClick={copyLink}>Скопировать ссылку</button></div>
          <p role="status" className="changes-muted">{copied}</p>
          {manualLink && <label className="changes-copy">Постоянная ссылка<input readOnly value={manualLink} onFocus={e => e.currentTarget.select()} /></label>}
          <footer className="changes-reader-footer">{selected.entryType === "digest" ? "Ссылки в тексте сохранены из исходного сообщения. Информация не является индивидуальной юридической консультацией; перед применением нормы проверьте официальный документ." : "Архив реквизитов. Текущая редакция и действие акта здесь не подтверждаются."}</footer>
        </article> : id ? <div className="changes-empty"><h2 ref={heading} tabIndex={-1}>Документ не найден</h2><p>В загруженном архиве такой записи нет.</p><button className="changes-button" onClick={back}>К списку изменений</button></div>
        : <div className="changes-reader-hint"><span aria-hidden="true">§</span><h2>Выберите материал</h2><p>Откройте справку или обзор из списка.</p></div>}
      </section>
    </div>}
  </main></V2Shell>;
}
