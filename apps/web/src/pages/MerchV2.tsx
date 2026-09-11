import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import ProductImage from "../components/ProductImage.js";
import { useHead } from "../lib/title.js";
import Modal from "../components/Modal.js";
import { useToast } from "../components/Toast.js";
import { rub, type Product, type ProductVariant } from "../lib/api.js";
import { useProducts, useCartMutations } from "../lib/cart.js";
import { V2Shell, ShowcaseHead, mono, disp } from "../v2/Shell.js";

/**
 * Витрина мерча v2 – язык реестра (DESIGN.md).
 *
 * Как и в ДПО, позиция читается как запись описи: слева цена, справа название
 * и характеристики, действие в конце строки. Отличие от ДПО – остатки: они тут
 * настоящие данные, поэтому идут моноширинными и попадают под сигнатуру.
 */

const vLabel = (v: ProductVariant) => [v.size, v.color].filter(Boolean).join(" · ") || v.sku;

/** Остаток на складе: это данные, а не украшение, поэтому моноширинный и точный. */
function Stock({ n }: { n: number | null | undefined }) {
  if (typeof n !== "number") return null;
  const tone = n <= 0 ? "var(--c-danger-text)" : n <= 3 ? "var(--c-accent-text)" : "var(--c-text-3)";
  return (
    <span style={{ ...mono, fontSize: "var(--t-micro)", letterSpacing: "var(--tr-data)", color: tone, textTransform: "none" }}>
      {n <= 0 ? "нет в наличии" : n <= 3 ? `осталось ${n}` : `в наличии ${n}`}
    </span>
  );
}

export function SizeDialog({ product, onClose }: { product: Product; onClose: () => void }) {
  const { add } = useCartMutations();
  const toast = useToast();
  const variants = product.variants_json ?? [];
  const hasVariants = variants.length > 0;
  const [sku, setSku] = useState<string | null>(hasVariants ? null : null);
  const [qty, setQty] = useState(1);

  const chosen = variants.find((v) => v.sku === sku);
  const stock = hasVariants ? chosen?.stock : product.stock;
  const maxQty = typeof stock === "number" ? Math.min(99, Math.max(1, stock)) : 99;
  const needsSize = hasVariants && !sku;

  const submit = () => {
    add.mutate(
      { type: "merch", ref_id: product.slug, variant_sku: sku, qty },
      { onSuccess: () => { toast(`«${product.title}» в корзине`); onClose(); }, onError: () => toast("Не удалось добавить", "err") },
    );
  };

  return (
    <Modal onClose={onClose} labelledBy="merch-v2-title" maxWidth={440}>
      <div style={{ background: "var(--c-bg-raised)", color: "var(--c-text)", borderRadius: "var(--r-lg)", padding: 28, position: "relative" }}>
        <button onClick={onClose} aria-label="Закрыть" className="foc" style={{ display: "block", marginLeft: "auto", marginBottom: 12, width: 44, height: 44, borderRadius: "var(--r-sm)", border: "1px solid var(--c-line-control)", background: "transparent", color: "var(--c-text-2)", cursor: "pointer" }}><svg width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" style={{ margin: "auto" }}><path d="M6 6l12 12M6 18L18 6"/></svg></button>

        <div style={{ ...mono, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)", textTransform: "none", color: "var(--c-text-3)" }}>{product.category}</div>
        <h2 id="merch-v2-title" style={{ ...disp, fontWeight: 600, fontSize: "var(--t-h3)", margin: "8px 0 0" }}>{product.title}</h2>
        <div style={{ ...mono, fontSize: 20, fontWeight: 500, marginTop: 12 }}>{rub(product.price)}</div>

        {hasVariants && (
          <div style={{ marginTop: 22 }}>
            <div style={{ ...mono, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)", textTransform: "none", color: "var(--c-text-3)" }}>
              {variants.some((v) => v.size) ? "Размер" : "Вариант"}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
              {variants.map((v) => (
                <button
                  key={v.sku}
                  aria-pressed={sku === v.sku}
                  disabled={v.stock <= 0}
                  onClick={() => { setSku(v.sku); setQty(1); }}
                  className="foc"
                  style={{
                    ...mono, fontSize: 13, padding: "9px 15px", borderRadius: "var(--r-sm)", cursor: v.stock <= 0 ? "not-allowed" : "pointer",
                    border: `1px solid ${sku === v.sku ? "var(--c-accent)" : "var(--c-line)"}`,
                    background: sku === v.sku ? "var(--c-accent)" : "transparent",
                    color: sku === v.sku ? "var(--c-on-accent)" : "var(--c-text)",
                    opacity: v.stock <= 0 ? 0.4 : 1,
                  }}
                >
                  {vLabel(v)}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: 14 }}><Stock n={stock} /></div>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14, marginTop: 20 }}>
          <span style={{ ...mono, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)", textTransform: "none", color: "var(--c-text-3)" }}>Количество</span>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button aria-label="Уменьшить" onClick={() => setQty((q) => Math.max(1, q - 1))} className="foc" style={{ width: 44, height: 44, borderRadius: "var(--r-sm)", border: "1px solid var(--c-line-control)", background: "transparent", color: "var(--c-text)", cursor: "pointer" }}>−</button>
            <span style={{ ...mono, minWidth: 22, textAlign: "center" }} aria-live="polite">{qty}</span>
            <button aria-label="Увеличить" onClick={() => setQty((q) => Math.min(maxQty, q + 1))} disabled={qty >= maxQty} className="foc" style={{ width: 44, height: 44, borderRadius: "var(--r-sm)", border: "1px solid var(--c-line-control)", background: "transparent", color: "var(--c-text)", cursor: "pointer", opacity: qty >= maxQty ? 0.4 : 1 }}>+</button>
          </div>
        </div>

        <button
          onClick={submit}
          disabled={needsSize || add.isPending || (typeof stock === "number" && stock <= 0)}
          className="foc"
          style={{ marginTop: 24, width: "100%", padding: "14px 20px", borderRadius: "var(--r-md)", border: "none", fontWeight: 600, fontSize: 15, cursor: needsSize ? "not-allowed" : "pointer", background: needsSize ? "var(--c-bg-sunken)" : "var(--c-accent)", color: needsSize ? "var(--c-text-3)" : "var(--c-on-accent)" }}
        >
          {typeof stock === "number" && stock <= 0 ? "Нет в наличии" : needsSize ? (variants.some((v) => v.size) ? "Выберите размер" : "Выберите вариант") : "В корзину"}
        </button>
      </div>
    </Modal>
  );
}

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
      <main id="main" style={{ maxWidth: "var(--container)", margin: "0 auto", padding: "0 28px" }}>
        <ShowcaseHead
          eyebrow="мерч"
          title="Одежда и аксессуары клуба"
          lead="Фирменные вещи с символикой клуба. Самовывоз в учебном офисе или доставка – выбирается при оформлении."
          count={products.isLoading ? "загружаем склад" : `позиций ${catalog.length} · на складе ${catalog.reduce((s, p) => s + totalStock(p), 0)}`}
        />

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
                border: `1px solid ${cat === c ? "var(--c-accent)" : "var(--c-line)"}`,
                background: cat === c ? "var(--c-accent)" : "transparent",
                color: cat === c ? "var(--c-on-accent)" : "var(--c-text-2)",
              }}
            >
              {c ?? "все категории"}
            </button>
          ))}
        </div>

        <div className="club-view-toggle" role="group" aria-label="Вид каталога" style={{ display: "flex", gap: 12, marginBlock: 22 }}><button className="foc" aria-pressed={layout === "grid"} onClick={() => change("view", "grid")}>Сетка</button><button className="foc" aria-pressed={layout === "list"} onClick={() => change("view", "list")}>Список</button></div>
        {products.isError && <p role="alert">Не удалось загрузить товары. <button onClick={() => products.refetch()}>Повторить</button></p>}
        {products.isLoading && (
          <div style={{ padding: "56px 0", ...mono, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)", color: "var(--c-text-3)", textTransform: "none" }}>загружаем склад…</div>
        )}

        {!products.isLoading && !products.isError && list.length === 0 && (
          <div style={{ padding: "56px 0" }}>
            <p style={{ ...disp, fontSize: "var(--t-h3)", fontWeight: 600, margin: 0 }}>{cat ? "В этой категории пока пусто" : "Каталог пока пуст"}</p>
            <p style={{ margin: "10px 0 0", color: "var(--c-text-2)" }}>{cat ? "Снимите фильтр, чтобы увидеть весь склад." : "Товары появятся, как только учебный офис их добавит."}</p>
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
                  onClick={() => setOpen(p)}
                  disabled={stock <= 0}
                  className="foc"
                  style={{ minWidth: 160, background: stock <= 0 ? "transparent" : "var(--c-accent)", color: stock <= 0 ? "var(--c-text-3)" : "var(--c-on-accent)", border: stock <= 0 ? "1px dashed var(--c-line)" : "none", borderRadius: "var(--r-md)", padding: "11px 18px", fontSize: 14, fontWeight: 600, cursor: stock <= 0 ? "not-allowed" : "pointer" }}
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
      </main>

      {open && <SizeDialog product={open} onClose={() => setOpen(null)} />}
    </V2Shell>
  );
}
