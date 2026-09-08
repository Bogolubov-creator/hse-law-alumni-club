import { programStart } from "../lib/program-date.js";
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useHead } from "../lib/title.js";
import { useToast } from "../components/Toast.js";
import { rub, FORMAT_LABEL, type Program } from "../lib/api.js";
import { usePrograms, useMemberDiscount, useCartMutations } from "../lib/cart.js";
import ProgramCompare from "../components/ProgramCompare.js";
import { field, actionGhost } from "../styles/primitives.js";
import { V2Shell, ShowcaseHead, mono, disp } from "../v2/Shell.js";

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
      <main id="main" style={{ maxWidth: "var(--container)", margin: "0 auto", padding: "0 28px" }}>
        <ShowcaseHead
          eyebrow="витрина · дпо"
          title="Программы дополнительного образования"
          lead="Содержание, формат и ближайшие старты – в каждой карточке. Цена выпускника открывается после подтверждения выпуска учебным офисом."
          count={programs.isLoading ? "загружаем каталог" : `в каталоге ${catalog.length} · актуальный набор ${actual.length}`}
        />

        <form className="club-catalog-filters" onSubmit={(e) => e.preventDefault()} aria-label="Фильтры программ">
          <label>Поиск программы<input type="search" style={field} value={search} onChange={(e) => update("q", e.target.value)} placeholder="Название или направление" /></label>
          <label>Направление<select style={field} value={dir} onChange={(e) => update("direction", e.target.value)}><option value="">Все направления</option>{directions.map((d) => <option key={d}>{d}</option>)}</select></label>
          <label>Формат<select style={field} value={format} onChange={(e) => update("format", e.target.value)}><option value="">Все форматы</option>{formats.map((f) => <option key={f} value={f}>{FORMAT_LABEL[f] ?? f}</option>)}</select></label>
          <label>Документ<select style={field} value={document} onChange={(e) => update("document", e.target.value)}><option value="">Все документы</option>{documents.map((d) => <option key={d}>{d}</option>)}</select></label>
          <label>Порядок<select style={field} value={sort} onChange={(e) => update("sort", e.target.value)}><option value="title">По названию</option><option value="price">По цене</option><option value="start">По дате начала</option></select></label>
          <label style={{ display: "flex", gap: 10, alignItems: "center" }}><input type="checkbox" checked={showAll} onChange={(e) => update("all", e.target.checked ? "1" : "")} />Включая закрытый набор</label>
          <button type="button" className="foc" style={actionGhost} onClick={() => setParams(selected.length ? { compare: selected.join(",") } : {})}>Сбросить фильтры</button>
        </form>
        <p role="status">{programs.isLoading ? "Загружаем…" : `Найдено программ: ${list.length}`}. Для сравнения выберите от двух до трёх программ.</p>
        {selected.length > 0 && <ProgramCompare slugs={selected} onRemove={toggleCompare} />}
        {programs.isError && <p role="alert">Каталог не загрузился. <button onClick={() => programs.refetch()}>Повторить загрузку</button></p>}

        {/* Записи каталога */}
        {programs.isLoading && (
          <div style={{ padding: "56px 0", ...mono, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)", color: "var(--c-text-3)", textTransform: "none" }}>
            загружаем каталог…
          </div>
        )}

        {!programs.isLoading && !programs.isError && list.length === 0 && (
          <div style={{ padding: "56px 0" }}>
            <p style={{ ...disp, fontSize: "var(--t-h3)", fontWeight: 600, margin: 0 }}>По выбранным условиям программ нет</p>
            <p style={{ margin: "10px 0 0", color: "var(--c-text-2)" }}>Снимите фильтр или посмотрите весь каталог, включая закрытый набор.</p>
            <button onClick={() => { setParams({ all: "1" }); }} className="foc" style={{ marginTop: 18, ...mono, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)", textTransform: "none", padding: "10px 16px", borderRadius: "var(--r-md)", border: "none", background: "var(--c-accent)", color: "var(--c-on-accent)", cursor: "pointer" }}>
              показать весь каталог
            </button>
          </div>
        )}

        <div>
          {list.map((p) => {
            const closed = p.enrollment === "nonactual";
            const external = !!p.source_url;
            const priced = discount > 0 ? p.price - Math.round(p.price * discount / 100) : p.price;
            return (
              <article
                key={p.id}
                className="v2-prog club-program-row"
                style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 150px 160px", gap: 24, alignItems: "start", padding: "24px 0", borderTop: "1px solid var(--c-line)" }}
              >
                {/* Содержание сначала (для чтения и a11y), цена – рядом. */}
                <div className="club-program-description" style={{ minWidth: 0 }}>
                  <Link to={`/dpo/${p.slug}`} className="foc" style={{ textDecoration: "none", color: "inherit" }}>
                    <h2 style={{ ...disp, fontWeight: 600, fontSize: "var(--t-h3)", lineHeight: 1.22, margin: 0 }}>{p.title}</h2>
                  </Link>
                  <div style={{ ...mono, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)", color: "var(--c-text-3)", marginTop: 10, textTransform: "none" }}>
                    {[p.direction, FORMAT_LABEL[p.format] ?? p.format, p.duration].filter(Boolean).join(" · ")}
                  </div>
                  <p style={{ color: "var(--c-text-2)", margin: "10px 0" }}>{p.dates?.start ? `Начало: ${programStart(p.dates.start)}` : "Дата начала уточняется"}{p.document ? ` · ${p.document}` : ""}</p>
                  {closed && (
                    <div style={{ ...mono, fontSize: "var(--t-micro)", letterSpacing: "var(--tr-data)", color: "var(--c-danger-text)", marginTop: 8, textTransform: "none" }}>набор закрыт</div>
                  )}
                </div>

                <div className="club-program-price">
                  <div style={{ ...mono, fontSize: 21, whiteSpace: "nowrap", fontWeight: 500, color: discount > 0 ? "var(--c-accent-text)" : "var(--c-text)" }}>{rub(priced)}</div>
                  {discount > 0 && (
                    <div style={{ ...mono, fontSize: "var(--t-caption)", color: "var(--c-text-3)", textDecoration: "line-through", marginTop: 4 }}>{rub(p.price)}</div>
                  )}
                  {discount > 0 && (
                    <div style={{ ...mono, fontSize: "var(--t-micro)", letterSpacing: "var(--tr-data)", color: "var(--c-ok-text)", marginTop: 6, textTransform: "none" }}>−{discount}% выпускнику</div>
                  )}
                </div>

                {/* Действие: своё – в корзину, программа ВШЭ – на маркетплейс */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "stretch", minWidth: 160 }}>
                  <label style={{ display: "flex", gap: 8, minHeight: 44, alignItems: "center" }}><input type="checkbox" checked={selected.includes(p.slug)} disabled={!selected.includes(p.slug) && selected.length >= 3} onChange={() => toggleCompare(p.slug)} aria-label={`Сравнить: ${p.title}`} />Сравнить</label>
                  <Link to={`/dpo/${p.slug}`} className="foc tap" style={{ textAlign: "center", textDecoration: "none", color: "var(--c-text)", border: "1px solid var(--c-line-strong)", borderRadius: "var(--r-md)", padding: "10px 16px", fontSize: 14, fontWeight: 600 }}>
                    Подробнее
                  </Link>
                  {external ? (
                    <a href={p.source_url!} target="_blank" rel="noopener noreferrer" className="foc tap" style={{ textAlign: "center", textDecoration: "none", color: "var(--c-anchor)", padding: "10px 16px", fontSize: 14, fontWeight: 600 }}>
                      Запись на hse.ru<span aria-hidden="true"> ↗</span>
                    </a>
                  ) : closed ? (
                    <span style={{ textAlign: "center", color: "var(--c-text-3)", border: "1px dashed var(--c-line)", borderRadius: "var(--r-md)", padding: "10px 16px", fontSize: 14 }}>Набор закрыт</span>
                  ) : (
                    <button onClick={() => addToCart(p)} disabled={add.isPending} className="foc tap" style={{ background: "var(--c-accent)", color: "var(--c-on-accent)", border: "none", borderRadius: "var(--r-md)", padding: "10px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                      В корзину
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        {list.length > 0 && (
          <div style={{ borderTop: "1px solid var(--c-line)", paddingTop: 20, ...mono, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)", color: "var(--c-text-3)", textTransform: "none" }}>
            Показано программ: {list.length}
          </div>
        )}
      </main>
    </V2Shell>
  );
}
