import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useHead } from "../lib/title.js";
import { useToast } from "../components/Toast.js";
import { rub, FORMAT_LABEL, type Program } from "../lib/api.js";
import { usePrograms, useMemberDiscount, useCartMutations } from "../lib/cart.js";
import { V2Shell, ShowcaseHead, mono, disp } from "../v2/Shell.js";

/**
 * Витрина ДПО v2 – язык реестра (DESIGN.md).
 *
 * Каталог из двух десятков программ – это перечень записей, а не витрина
 * одинаковых карточек. Слева моноширинная цена (данные, по которым принимают
 * решение), справа название и метаданные. Строка-запись читается по вертикали
 * как опись, а не как сетка плиток.
 */

/** Компактный фильтр: моно-метка, а не кнопка-таблетка. */
function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className="foc"
      style={{
        ...mono, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)", textTransform: "uppercase",
        padding: "7px 12px", borderRadius: 999, cursor: "pointer",
        border: `1px solid ${active ? "var(--c-accent)" : "var(--c-line)"}`,
        background: active ? "var(--c-accent)" : "transparent",
        color: active ? "var(--c-on-accent)" : "var(--c-text-2)",
        transition: "background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out)",
      }}
    >
      {children}
    </button>
  );
}

export default function DpoV2() {
  useHead({
    title: "Программы ДПО",
    description: "Каталог программ дополнительного образования факультета права НИУ ВШЭ с ценой выпускника.",
    noindex: true, // превью нового языка витрин
  });
  const programs = usePrograms();
  const discount = useMemberDiscount();
  const { add } = useCartMutations();
  const toast = useToast();

  const [dir, setDir] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const catalog = programs.data ?? [];
  const actual = catalog.filter((p) => p.enrollment !== "nonactual");
  const base = showAll ? catalog : actual;
  const directions = useMemo(() => [...new Set(base.map((p) => p.direction).filter(Boolean))], [base]);
  const list = useMemo(() => (dir ? base.filter((p) => p.direction === dir) : base), [base, dir]);

  const addToCart = (p: Program) =>
    add.mutate(
      { type: "dpo", ref_id: p.slug },
      { onSuccess: () => toast(`«${p.title}» в корзине`), onError: () => toast("Не удалось добавить", "err") },
    );

  return (
    <V2Shell>
      <main style={{ maxWidth: "var(--container)", margin: "0 auto", padding: "0 28px" }}>
        <ShowcaseHead
          eyebrow="витрина · дпо"
          title="Программы по праву с ценой выпускника"
          lead="Каталог программ дополнительного образования факультета. Цена выпускника применяется автоматически после верификации."
          count={programs.isLoading ? "загружаем каталог" : `в каталоге ${catalog.length} · актуальный набор ${actual.length}`}
        />

        {/* Фильтры: одна строка моно-меток, без таблиц и выпадающих списков */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", paddingBottom: 22, borderBottom: "1px solid var(--c-line)" }}>
          <FilterChip active={!dir} onClick={() => setDir(null)}>все направления</FilterChip>
          {directions.map((d) => (
            <FilterChip key={d} active={dir === d} onClick={() => setDir(dir === d ? null : d)}>{d}</FilterChip>
          ))}
          <span style={{ marginLeft: "auto" }} />
          <FilterChip active={showAll} onClick={() => setShowAll((v) => !v)}>
            {showAll ? "показаны все" : "только актуальный набор"}
          </FilterChip>
        </div>

        {/* Записи каталога */}
        {programs.isLoading && (
          <div style={{ padding: "56px 0", ...mono, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)", color: "var(--c-text-3)", textTransform: "uppercase" }}>
            загружаем каталог…
          </div>
        )}

        {!programs.isLoading && list.length === 0 && (
          <div style={{ padding: "56px 0" }}>
            <p style={{ ...disp, fontSize: "var(--t-h3)", fontWeight: 600, margin: 0 }}>По этому направлению записей нет</p>
            <p style={{ margin: "10px 0 0", color: "var(--c-text-2)" }}>Снимите фильтр или посмотрите весь каталог, включая закрытый набор.</p>
            <button onClick={() => { setDir(null); setShowAll(true); }} className="foc" style={{ marginTop: 18, ...mono, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)", textTransform: "uppercase", padding: "10px 16px", borderRadius: "var(--r-md)", border: "none", background: "var(--c-accent)", color: "var(--c-on-accent)", cursor: "pointer" }}>
              показать весь каталог
            </button>
          </div>
        )}

        <div>
          {list.map((p) => {
            const closed = p.enrollment === "nonactual";
            const external = !!p.source_url;
            const priced = discount > 0 ? Math.round((p.price * (100 - discount)) / 100) : p.price;
            return (
              <article
                key={p.id}
                className="v2-row v2-prog"
                style={{ display: "grid", gridTemplateColumns: "150px 1fr auto", gap: 24, alignItems: "start", padding: "24px 0", borderTop: "1px solid var(--c-line)" }}
              >
                {/* Цена – главные данные записи */}
                <div>
                  <div style={{ ...mono, fontSize: 17, fontWeight: 500, color: discount > 0 ? "var(--c-accent-text)" : "var(--c-text)" }}>{rub(priced)}</div>
                  {discount > 0 && (
                    <div style={{ ...mono, fontSize: "var(--t-caption)", color: "var(--c-text-3)", textDecoration: "line-through", marginTop: 4 }}>{rub(p.price)}</div>
                  )}
                  {discount > 0 && (
                    <div style={{ ...mono, fontSize: 10, letterSpacing: "var(--tr-data)", color: "var(--c-ok-text)", marginTop: 6, textTransform: "uppercase" }}>−{discount}% выпускнику</div>
                  )}
                </div>

                {/* Содержание записи */}
                <div style={{ minWidth: 0 }}>
                  <Link to={`/dpo/${p.slug}`} className="foc" style={{ textDecoration: "none", color: "inherit" }}>
                    <h2 style={{ ...disp, fontWeight: 600, fontSize: "var(--t-h3)", lineHeight: 1.22, margin: 0 }}>{p.title}</h2>
                  </Link>
                  <div style={{ ...mono, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)", color: "var(--c-text-3)", marginTop: 10, textTransform: "uppercase" }}>
                    {[p.direction, FORMAT_LABEL[p.format] ?? p.format, p.duration].filter(Boolean).join(" · ")}
                  </div>
                  {closed && (
                    <div style={{ ...mono, fontSize: 10, letterSpacing: "var(--tr-data)", color: "var(--c-danger-text)", marginTop: 8, textTransform: "uppercase" }}>набор закрыт</div>
                  )}
                </div>

                {/* Действие: своё – в корзину, программа ВШЭ – на маркетплейс */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "stretch", minWidth: 160 }}>
                  <Link to={`/dpo/${p.slug}`} className="foc" style={{ textAlign: "center", textDecoration: "none", color: "var(--c-text-2)", border: "1px solid var(--c-line)", borderRadius: "var(--r-md)", padding: "10px 16px", fontSize: 14, fontWeight: 600 }}>
                    Подробнее
                  </Link>
                  {external ? (
                    <a href={p.source_url!} target="_blank" rel="noopener noreferrer" className="foc" style={{ textAlign: "center", textDecoration: "none", background: "var(--c-anchor)", color: "#fff", borderRadius: "var(--r-md)", padding: "10px 16px", fontSize: 14, fontWeight: 600 }}>
                      Запись на hse.ru
                    </a>
                  ) : closed ? (
                    <span style={{ textAlign: "center", color: "var(--c-text-3)", border: "1px dashed var(--c-line)", borderRadius: "var(--r-md)", padding: "10px 16px", fontSize: 14 }}>Набор закрыт</span>
                  ) : (
                    <button onClick={() => addToCart(p)} disabled={add.isPending} className="foc" style={{ background: "var(--c-accent)", color: "var(--c-on-accent)", border: "none", borderRadius: "var(--r-md)", padding: "10px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                      В корзину
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        {list.length > 0 && (
          <div style={{ borderTop: "1px solid var(--c-line)", paddingTop: 20, ...mono, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)", color: "var(--c-text-3)", textTransform: "uppercase" }}>
            показано записей: {list.length}
          </div>
        )}
      </main>
    </V2Shell>
  );
}
