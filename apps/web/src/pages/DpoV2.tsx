import { programStart } from "../lib/program-date.js";
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useHead } from "../lib/title.js";
import { useToast } from "../components/Toast.js";
import { rub, FORMAT_LABEL, type Program } from "../lib/api.js";
import { usePrograms, useMemberDiscount, useCartMutations } from "../lib/cart.js";
import ProgramCompare from "../components/ProgramCompare.js";
import { field } from "../styles/primitives.js";
import { HeroPicture } from "../components/HeroPicture.js";
import { programThumbUrl } from "../lib/public-url.js";
import { V2Shell, mono, disp } from "../v2/Shell.js";
import "../styles/dpo-vitrine.css";

export default function DpoV2() {
  useHead({
    title: "Программы ДПО",
    description: "Каталог программ дополнительного образования факультета права НИУ ВШЭ с ценой выпускника.",
    /* indexable: канон */
  });
  const programs = usePrograms();
  const discount = useMemberDiscount();
  const { add } = useCartMutations();
  const toast = useToast();

  const [params, setParams] = useSearchParams();
  const update = (key: string, value: string) => setParams((previous) => {
    const next = new URLSearchParams(previous);
    if (value) next.set(key, value); else next.delete(key);
    return next;
  });
  const catalog = programs.data ?? [];
  const actual = catalog.filter((p) => p.enrollment !== "nonactual");
  const directions = [...new Set(catalog.map((p) => p.direction).filter(Boolean))];
  const formats = [...new Set(catalog.map((p) => p.format).filter(Boolean))];
  const documents = [...new Set(catalog.map((p) => p.document).filter((s): s is string => !!s))];
  const dir = params.get("direction") ?? "";
  const format = params.get("format") ?? "";
  const document = params.get("document") ?? "";
  const search = params.get("q") ?? "";
  const sort = params.get("sort") ?? "title";
  const showAll = params.get("all") === "1";
  const selected = [...new Set((params.get("compare") ?? "").split(",").filter((slug) => catalog.some((p) => p.slug === slug)))].slice(0, 3);
  const toggleCompare = (slug: string) => update("compare", (selected.includes(slug) ? selected.filter((s) => s !== slug) : [...selected, slug].slice(0, 3)).join(","));
  const list = useMemo(() => {
    const found = catalog.filter((p) => (showAll || p.enrollment !== "nonactual") && (!dir || p.direction === dir) && (!format || p.format === format) && (!document || p.document === document) && (!search.trim() || `${p.title} ${p.direction}`.toLocaleLowerCase("ru").includes(search.trim().toLocaleLowerCase("ru"))));
    return found.sort((a, b) => sort === "price" ? a.price - b.price : sort === "start" ? (Date.parse(a.dates?.start ?? "") || Infinity) - (Date.parse(b.dates?.start ?? "") || Infinity) : a.title.localeCompare(b.title, "ru"));
  }, [catalog, showAll, dir, format, document, search, sort]);

  const addToCart = (p: Program) =>
    add.mutate(
      { type: "dpo", ref_id: p.slug },
      { onSuccess: () => toast(`«${p.title}» в корзине`), onError: () => toast("Не удалось добавить", "err") },
    );

  return (
    <V2Shell>
      <main id="main" className="club-dpo-vitrine">
        <header className="club-dpo-masthead">
          <div className="club-dpo-masthead__atmosphere" aria-hidden="true">
            <HeroPicture
              path="assets/dpo-masthead.jpg"
              className="club-dpo-masthead__photo"
              alt=""
              width={1200}
              height={700}
            />
            <div className="club-dpo-masthead__veil" />
          </div>
          <div className="club-dpo-masthead__inner">
            <p className="club-dpo-eyebrow">Витрина ДПО</p>
            <h1>Программы дополнительного образования</h1>
            <p className="club-dpo-lead">
              Содержание, формат и ближайшие старты – в каждой записи. Цена выпускника открывается после подтверждения выпуска учебным офисом.
            </p>
            <div className="club-dpo-meta" aria-live="polite">
              <div className="club-dpo-meta__item">
                <span className="club-dpo-meta__value">{programs.isLoading ? "…" : catalog.length}</span>
                <span className="club-dpo-meta__label">в каталоге</span>
              </div>
              <div className="club-dpo-meta__item">
                <span className="club-dpo-meta__value">{programs.isLoading ? "…" : actual.length}</span>
                <span className="club-dpo-meta__label">актуальный набор</span>
              </div>
              {discount > 0 && (
                <div className="club-dpo-meta__item">
                  <span className="club-dpo-meta__value" style={{ color: "var(--c-accent-text)" }}>−{discount}%</span>
                  <span className="club-dpo-meta__label">скидка выпускника</span>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="club-dpo-body">
          <div className="club-dpo-toolbar">
            <div className="club-dpo-mode" role="tablist" aria-label="Режим каталога">
              <button type="button" role="tab" aria-selected={!showAll} className={`foc club-dpo-mode__btn${!showAll ? " is-on" : ""}`} onClick={() => update("all", "")}>
                Актуальный набор
                <span className="club-dpo-mode__count">{programs.isLoading ? "…" : actual.length}</span>
              </button>
              <button type="button" role="tab" aria-selected={showAll} className={`foc club-dpo-mode__btn${showAll ? " is-on" : ""}`} onClick={() => update("all", "1")}>
                Весь каталог
                <span className="club-dpo-mode__count">{programs.isLoading ? "…" : catalog.length}</span>
              </button>
            </div>
            <p className="club-dpo-toolbar__hint">
              {showAll
                ? "Показаны все программы, включая закрытый набор."
                : "Только программы с открытым набором."}
            </p>
          </div>

          <form className="club-catalog-filters" onSubmit={(e) => e.preventDefault()} aria-label="Фильтры программ">
            <label>Поиск программы<input type="search" style={field} value={search} onChange={(e) => update("q", e.target.value)} placeholder="Название или направление" /></label>
            <label>Направление<select style={field} value={dir} onChange={(e) => update("direction", e.target.value)}><option value="">Все направления</option>{directions.map((d) => <option key={d}>{d}</option>)}</select></label>
            <label>Формат<select style={field} value={format} onChange={(e) => update("format", e.target.value)}><option value="">Все форматы</option>{formats.map((f) => <option key={f} value={f}>{FORMAT_LABEL[f] ?? f}</option>)}</select></label>
            <label>Документ<select style={field} value={document} onChange={(e) => update("document", e.target.value)}><option value="">Все документы</option>{documents.map((d) => <option key={d}>{d}</option>)}</select></label>
            <label>Порядок<select style={field} value={sort} onChange={(e) => update("sort", e.target.value)}><option value="title">По названию</option><option value="price">По цене</option><option value="start">По дате начала</option></select></label>
            <button type="button" className="foc club-btn club-btn--secondary" onClick={() => setParams(selected.length ? { compare: selected.join(",") } : {})}>Сбросить фильтры</button>
          </form>

          <p className="club-dpo-status" role="status">
            <span>{programs.isLoading ? "Загружаем каталог…" : <>Найдено программ: <strong>{list.length}</strong></>}</span>
            <span>Для сравнения выберите от двух до трёх программ.</span>
          </p>

          {selected.length > 0 && <ProgramCompare slugs={selected} onRemove={toggleCompare} />}

          {programs.isError && (
            <div className="club-dpo-error" role="alert">
              <p style={{ margin: 0 }}>Каталог не загрузился.</p>
              <button type="button" className="foc club-btn club-btn--secondary" style={{ marginTop: 14 }} onClick={() => programs.refetch()}>
                Повторить загрузку
              </button>
            </div>
          )}

          {programs.isLoading && (
            <div className="club-dpo-loading" aria-busy="true">
              загружаем каталог…
              <div className="club-dpo-loading__bars" aria-hidden="true">
                <div className="club-dpo-loading__bar" />
                <div className="club-dpo-loading__bar" />
                <div className="club-dpo-loading__bar" />
              </div>
            </div>
          )}

          {!programs.isLoading && !programs.isError && list.length === 0 && (
            <div className="club-dpo-empty">
              <h2>По выбранным условиям программ нет</h2>
              <p>Снимите фильтр или посмотрите весь каталог, включая закрытый набор.</p>
              <button type="button" onClick={() => { setParams({ all: "1" }); }} className="foc club-btn club-btn--primary" style={{ marginTop: 18 }}>
                Показать весь каталог
              </button>
            </div>
          )}

          <div>
            {list.map((p) => {
              const closed = p.enrollment === "nonactual";
              const external = !!p.source_url;
              const priced = discount > 0 ? p.price - Math.round(p.price * discount / 100) : p.price;
              const thumb = programThumbUrl(p.cover);
              return (
                <article key={p.id} className="v2-prog club-program-row club-dpo-row">
                  <Link to={`/dpo/${p.slug}`} className="foc club-dpo-row__thumb" aria-hidden="true" tabIndex={-1}>
                    {thumb ? (
                      <img src={thumb} alt="" width={240} height={180} loading="lazy" decoding="async" />
                    ) : (
                      <span className="club-dpo-row__thumb-fallback" />
                    )}
                  </Link>
                  <div className="club-program-description" style={{ minWidth: 0 }}>
                    <Link to={`/dpo/${p.slug}`} className="foc" style={{ textDecoration: "none", color: "inherit" }}>
                      <h2 style={{ ...disp, fontWeight: 600, fontSize: "var(--t-h3)", lineHeight: 1.22, margin: 0 }}>{p.title}</h2>
                    </Link>
                    <div style={{ ...mono, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)", color: "var(--c-text-3)", marginTop: 10, textTransform: "none" }}>
                      {[p.direction, FORMAT_LABEL[p.format] ?? p.format, p.duration].filter(Boolean).join(" · ")}
                    </div>
                    <p style={{ color: "var(--c-text-2)", margin: "10px 0" }}>{p.dates?.start ? `Начало: ${programStart(p.dates.start)}` : "Дата начала уточняется"}{p.document ? ` · ${p.document}` : ""}</p>
                    <div style={{ ...mono, fontSize: "var(--t-micro)", letterSpacing: "var(--tr-data)", marginTop: 8, textTransform: "none", color: closed ? "var(--c-danger-text)" : "var(--c-ok-text)" }}>
                      {closed ? "набор закрыт" : "актуальный набор"}
                    </div>
                  </div>

                  <div className="club-program-price club-dpo-row__price" style={{ color: discount > 0 ? "var(--c-accent-text)" : "var(--c-text)" }}>
                    <div>{rub(priced)}</div>
                    {discount > 0 && (
                      <div style={{ ...mono, fontSize: "var(--t-caption)", color: "var(--c-text-3)", textDecoration: "line-through", marginTop: 4 }}>{rub(p.price)}</div>
                    )}
                    {discount > 0 && (
                      <div style={{ ...mono, fontSize: "var(--t-micro)", letterSpacing: "var(--tr-data)", color: "var(--c-ok-text)", marginTop: 6, textTransform: "none" }}>−{discount}% выпускнику</div>
                    )}
                  </div>

                  <div className="club-dpo-row__actions">
                    <label className="club-dpo-row__compare">
                      <input type="checkbox" checked={selected.includes(p.slug)} disabled={!selected.includes(p.slug) && selected.length >= 3} onChange={() => toggleCompare(p.slug)} aria-label={`Сравнить: ${p.title}`} />
                      Сравнить
                    </label>
                    <Link to={`/dpo/${p.slug}`} className="foc tap club-btn club-btn--secondary">
                      Подробнее
                    </Link>
                    {external ? (
                      <a href={p.source_url!} target="_blank" rel="noopener noreferrer" className="foc tap club-dpo-external">
                        Запись на hse.ru<span aria-hidden="true"> ↗</span>
                      </a>
                    ) : closed ? (
                      <span className="club-dpo-closed">Набор закрыт</span>
                    ) : (
                      <button type="button" onClick={() => addToCart(p)} disabled={add.isPending} className="foc tap club-btn club-btn--primary">
                        В корзину
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          {list.length > 0 && (
            <div className="club-dpo-foot">
              Показано программ: {list.length}
            </div>
          )}
        </div>
      </main>
    </V2Shell>
  );
}
