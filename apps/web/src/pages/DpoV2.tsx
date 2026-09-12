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
import { mediaUrl } from "../lib/public-url.js";
import { V2Shell } from "../v2/Shell.js";
import "../styles/dpo-vitrine.css";

/** Русское склонение по числу: plural(31, ["программа", "программы", "программ"]). */
function plural(n: number, forms: [string, string, string]): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1];
  return forms[2];
}

/** Обложки с логотипом факультета (просмотрены 12.09); остальные с hse.ru – сток без символики. */
const FACULTY_COVERS = new Set(["472681893", "474599435", "474776084", "494685723", "589527758", "802031223", "905186485", "906651510"]);
function hasFacultyCover(cover: string | null | undefined): boolean {
  const m = /\/programs\/(\d+)\.(?:jpe?g|png|webp)$/i.exec(cover ?? "");
  return !!m && FACULTY_COVERS.has(m[1]!);
}

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
        <header className="club-dpo-masthead club-dark">
          <div className="club-dpo-masthead__inner">
            <h1>Программы дополнительного образования</h1>
            <p className="club-dpo-lead" aria-live="polite">
              {programs.isLoading
                ? "Загружаем каталог факультета права…"
                : `В каталоге ${catalog.length} ${plural(catalog.length, ["программа", "программы", "программ"])}, с открытым набором – ${actual.length}. ${discount > 0 ? `Цена выпускника со скидкой ${discount} % уже применена.` : "Цена выпускника открывается после подтверждения выпуска учебным офисом."}`}
            </p>
          </div>
          <div className="club-dpo-masthead__media" aria-hidden="true">
            <HeroPicture
              path="assets/photos/diploma.jpg"
              className="club-dpo-masthead__photo"
              alt=""
              width={1200}
              height={700}
            />
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

          {/* Программы как предметы на белом (референс 12.09): сначала плитки с факультетской обложкой,
              затем остальные текстом в две колонки – так ряды не рвутся пустотами. Порядок сортировки
              сохраняется внутри каждой группы. */}
          {[list.filter((p) => hasFacultyCover(p.cover)), list.filter((p) => !hasFacultyCover(p.cover))].map((group, gi) => group.length === 0 ? null : (
          <div key={gi} className={gi === 0 ? "club-dpo-grid" : "club-dpo-grid club-dpo-grid--text"}>
            {gi === 1 && list.some((p) => hasFacultyCover(p.cover)) && <h2 className="club-dpo-grid__title">Ещё {group.length} {plural(group.length, ["программа", "программы", "программ"])}</h2>}
            {group.map((p) => {
              const closed = p.enrollment === "nonactual";
              const external = !!p.source_url;
              const priced = discount > 0 ? p.price - Math.round(p.price * discount / 100) : p.price;
              // Обложка только с символикой факультета (решение заказчика 12.09): сток с hse.ru не показываем.
              const cover = hasFacultyCover(p.cover) ? mediaUrl(p.cover!) : null;
              return (
                <article key={p.id} className={cover ? "club-dpo-tile" : "club-dpo-tile club-dpo-tile--text"}>
                  {cover && (
                    <Link to={`/dpo/${p.slug}`} className="foc club-dpo-tile__cover" aria-hidden="true" tabIndex={-1}>
                      <img src={cover} alt="" width={640} height={360} loading="lazy" decoding="async" />
                    </Link>
                  )}
                  <Link to={`/dpo/${p.slug}`} className="foc club-dpo-tile__link">
                    <h2>{p.title}</h2>
                  </Link>
                  <div className="club-dpo-tile__meta">
                    {[p.direction, FORMAT_LABEL[p.format] ?? p.format, p.duration, p.dates?.start ? `с ${programStart(p.dates.start)}` : null].filter(Boolean).join(" · ")}
                  </div>
                  <div className="club-dpo-tile__price">
                    <span>{rub(priced)}</span>
                    {discount > 0 && <s>{rub(p.price)}</s>}
                    {closed && <span className="club-dpo-tile__closed">набор закрыт</span>}
                  </div>
                  <div className="club-dpo-tile__actions">
                    <label className="club-dpo-tile__compare">
                      <input type="checkbox" checked={selected.includes(p.slug)} disabled={!selected.includes(p.slug) && selected.length >= 3} onChange={() => toggleCompare(p.slug)} aria-label={`Сравнить: ${p.title}`} />
                      Сравнить
                    </label>
                    {!external && !closed && (
                      <button type="button" onClick={() => addToCart(p)} disabled={add.isPending} className="foc club-btn club-btn--secondary">
                        В корзину
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          ))}

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
