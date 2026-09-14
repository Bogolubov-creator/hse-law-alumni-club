import SizeDialog, { Stock, vLabel } from "../components/MerchSelection.js";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import ProductImage from "../components/ProductImage.js";
import { useHead } from "../lib/title.js";
import { rub, type Product } from "../lib/api.js";
import { useProducts } from "../lib/cart.js";
import { V2Shell, ShowcaseHead, mono, disp } from "../v2/Shell.js";

/**
 * Витрина мерча v2 – язык реестра (DESIGN.md).
 *
 * Как и в ДПО, позиция читается как запись описи: слева цена, справа название
 * и характеристики, действие в конце строки. Отличие от ДПО – остатки: они тут
 * настоящие данные, поэтому идут моноширинными и попадают под сигнатуру.
 */


export default function MerchV2() {
  useHead({
    title: "Мерч клуба",
    description: "Фирменная одежда и аксессуары клуба выпускников факультета права Вышки.",
    /* indexable: канон */
  });
  const products = useProducts();
  const [params, setParams] = useSearchParams();
  const cat = params.get("category");
  const layout = params.get("view") === "list" ? "list" : "grid";
  const change = (key: string, value: string | null) => setParams((previous) => { const next = new URLSearchParams(previous); if (value) next.set(key, value); else next.delete(key); return next; });
  const [open, setOpen] = useState<Product | null>(null);

  const catalog = products.data ?? [];
  const categories = useMemo(() => [...new Set(catalog.map((p) => p.category).filter(Boolean))], [catalog]);
  const list = useMemo(() => (cat ? catalog.filter((p) => p.category === cat) : catalog), [catalog, cat]);

  const totalStock = (p: Product) =>
    (p.variants_json?.length ? p.variants_json.reduce((s, v) => s + (v.stock || 0), 0) : p.stock) ?? 0;

  return (
    <V2Shell>
      <main id="main">
        <ShowcaseHead
          photo={{ src: "assets/photos/alumni-field.jpg", alt: "Выпускники и студенты факультета права на спортивном поле" }}
          eyebrow="мерч"
          title="Одежда и аксессуары клуба"
          lead="Фирменные вещи с символикой клуба. Самовывоз в учебном офисе или доставка – выбирается при оформлении."
          count={products.isError ? undefined : products.isLoading ? "загружаем склад" : `позиций ${catalog.length} · на складе ${catalog.reduce((s, p) => s + totalStock(p), 0)}`}
        />
        <div style={{ maxWidth: "var(--container)", margin: "0 auto", padding: "0 28px" }}>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", paddingBottom: 22, borderBottom: "1px solid var(--c-line)" }}>
          {[null, ...categories].map((c) => (
            <button
              key={c ?? "all"}
              onClick={() => change("category", c)}
              aria-pressed={cat === c}
              className="foc"
              style={{
                ...mono, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)", textTransform: "none",
                padding: "7px 12px", borderRadius: 999, cursor: "pointer",
                border: `1px solid ${cat === c ? "var(--c-bg-inverse)" : "var(--c-line-control)"}`,
                background: cat === c ? "var(--c-bg-inverse)" : "transparent",
                color: cat === c ? "var(--c-text-inverse)" : "var(--c-text-2)",
              }}
            >
              {c ?? "все категории"}
            </button>
          ))}
        </div>

        <div className="club-view-toggle" role="group" aria-label="Вид каталога" style={{ display: "flex", gap: 12, marginBlock: 22 }}><button className="foc" aria-pressed={layout === "grid"} onClick={() => change("view", "grid")}>Сетка</button><button className="foc" aria-pressed={layout === "list"} onClick={() => change("view", "list")}>Список</button></div>
        {products.isError && <p role="alert">Не удалось загрузить товары. <button className="foc club-btn club-btn--secondary" onClick={() => products.refetch()}>Повторить</button></p>}
        {products.isLoading && (
          <div role="status" style={{ padding: "56px 0", ...mono, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)", color: "var(--c-text-3)", textTransform: "none" }}>загружаем склад…</div>
        )}

        {!products.isLoading && !products.isError && list.length === 0 && (
          <div style={{ padding: "56px 0" }}>
            <p style={{ ...disp, fontSize: "var(--t-h3)", fontWeight: 600, margin: 0 }}>{cat ? "В этой категории пока пусто" : "Каталог пока пуст"}</p>
            <p style={{ margin: "10px 0 0", color: "var(--c-text-2)" }}>{cat ? "Снимите фильтр, чтобы увидеть все товары." : "Товары появятся, как только учебный офис их добавит."}</p>
            {cat && <button className="foc club-btn club-btn--secondary" style={{ marginTop: 16 }} onClick={() => change("category", null)}>Все категории</button>}
          </div>
        )}

        <div className={`club-merch-${layout}`}>
          {list.map((p) => {
            const stock = totalStock(p);
            const sizes = (p.variants_json ?? []).filter((v) => v.stock > 0).map(vLabel);
            // У части товаров вариант – это цвет, а не размер (шоппер). Подпись кнопки
            // идёт от данных, иначе просим выбрать размер там, где размеров нет.
            const hasSizes = (p.variants_json ?? []).some((v) => !!v.size);
            return (
              <article key={p.id} className="club-merch-item" style={{ display: "grid", gridTemplateColumns: "150px 96px 1fr auto", gap: 22, alignItems: "center", padding: "20px 0", borderTop: "1px solid var(--c-line)" }}>
                <div style={{ ...mono, fontSize: 17, fontWeight: 500 }}>{rub(p.price)}</div>

                <Link to={`/merch/${p.slug}`} className="foc club-merch-image"><ProductImage src={p.images?.[0]} title={p.title} /></Link>

                <div style={{ minWidth: 0 }}>
                  <h2 style={{ ...disp, fontWeight: 600, fontSize: "var(--t-h3)", lineHeight: 1.22, margin: 0 }}><Link className="foc" to={`/merch/${p.slug}`} style={{ color: "inherit", textDecoration: "none" }}>{p.title}</Link></h2>
                  <div style={{ ...mono, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)", color: "var(--c-text-3)", marginTop: 8, textTransform: "none" }}>
                    {p.category}{sizes.length ? ` · ${sizes.join(" / ")}` : ""}
                  </div>
                  <div style={{ marginTop: 6 }}><Stock n={stock} /></div>
                </div>

                <button
                  onClick={(event) => { event.currentTarget.focus(); setOpen(p); }}
                  disabled={stock <= 0}
                  className="foc"
                  style={{ minWidth: 160, background: stock <= 0 ? "transparent" : "var(--c-accent)", color: stock <= 0 ? "var(--c-text-3)" : "var(--c-on-accent)", border: stock <= 0 ? "1px dashed var(--c-line-control)" : "1px solid var(--c-accent)", borderRadius: "var(--r-sm)", padding: "11px 18px", fontSize: "var(--t-caps)", letterSpacing: "var(--tr-caps)", textTransform: "uppercase", fontWeight: 600, cursor: stock <= 0 ? "not-allowed" : "pointer" }}
                >
                  {stock <= 0 ? "Нет в наличии" : p.variants_json?.length ? (hasSizes ? "Выбрать размер" : "Выбрать вариант") : "В корзину"}
                </button>
              </article>
            );
          })}
        </div>

        {list.length > 0 && (
          <div style={{ borderTop: "1px solid var(--c-line)", paddingTop: 20, ...mono, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)", color: "var(--c-text-3)", textTransform: "none" }}>
            показано позиций: {list.length}
          </div>
        )}
        </div>
      </main>

      {open && <SizeDialog product={open} onClose={() => setOpen(null)} />}
    </V2Shell>
  );
}
