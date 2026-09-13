import { useState } from "react";
import Modal from "./Modal.js";
import { useToast } from "./Toast.js";
import { rub, type Product, type ProductVariant } from "../lib/api.js";
import { useCartMutations } from "../lib/cart.js";
import { mono, pageTitle } from "../styles/primitives.js";
import "../styles/merch-selection.css";

export const vLabel = (v: ProductVariant) => [v.size, v.color].filter(Boolean).join(" · ") || v.sku;

/** Остаток на складе: это данные, а не украшение, поэтому моноширинный и точный. */
export function Stock({ n }: { n: number | null | undefined }) {
  if (typeof n !== "number") return null;
  const tone = n <= 0 ? "var(--c-danger-text)" : n <= 3 ? "var(--c-accent-text)" : "var(--c-text-3)";
  return (
    <span style={{ ...mono, fontSize: "var(--t-micro)", letterSpacing: "var(--tr-data)", color: tone, textTransform: "none" }}>
      {n <= 0 ? "нет в наличии" : n <= 3 ? `осталось ${n}` : `в наличии ${n}`}
    </span>
  );
}

export default function SizeDialog({ product, onClose }: { product: Product; onClose: () => void }) {
  const { add } = useCartMutations();
  const toast = useToast();
  const variants = product.variants_json ?? [];
  const hasVariants = variants.length > 0;
  const [sku, setSku] = useState<string | null>(null);
  const [qty, setQty] = useState(1);

  const chosen = variants.find((v) => v.sku === sku);
  const stock = hasVariants ? chosen?.stock : product.stock;
  const maxQty = typeof stock === "number" ? Math.min(99, Math.max(1, stock)) : 99;
  const needsSize = hasVariants && !sku;

  const submit = () => {
    add.mutate(
      { type: "merch", ref_id: product.slug, variant_sku: sku, qty },
      { onSuccess: () => { toast(`«${product.title}» в корзине`); onClose(); } },
    );
  };

  return (
    <Modal onClose={onClose} labelledBy="merch-v2-title" maxWidth={440}>
      <div className="club-merch-selection" style={{ background: "var(--c-bg-raised)", color: "var(--c-text)", borderRadius: "var(--r-lg)", padding: 28, position: "relative" }}>
        <button onClick={onClose} aria-label="Закрыть" className="foc" style={{ display: "block", marginLeft: "auto", marginBottom: 12, width: 44, height: 44, borderRadius: "var(--r-sm)", border: "1px solid var(--c-line-control)", background: "transparent", color: "var(--c-text-2)", cursor: "pointer" }}><svg width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" style={{ margin: "auto" }}><path d="M6 6l12 12M6 18L18 6"/></svg></button>

        <div style={{ ...mono, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)", textTransform: "none", color: "var(--c-text-3)" }}>{product.category}</div>
        <h2 id="merch-v2-title" style={{ ...pageTitle, fontSize: "var(--t-h3)", margin: "8px 0 0" }}>{product.title}</h2>
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
                  disabled={v.stock <= 0 || add.isPending}
                  onClick={() => { setSku(v.sku); setQty(1); add.reset(); }}
                  className="foc"
                  style={{
                    ...mono, fontSize: 13, padding: "9px 15px", borderRadius: "var(--r-sm)", cursor: v.stock <= 0 ? "not-allowed" : "pointer",
                    border: `1px solid ${sku === v.sku ? "var(--c-bg-inverse)" : "var(--c-line-control)"}`,
                    background: sku === v.sku ? "var(--c-bg-inverse)" : "transparent",
                    color: sku === v.sku ? "var(--c-text-inverse)" : "var(--c-text)",
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
            <button aria-label="Уменьшить" disabled={qty <= 1 || add.isPending} onClick={() => setQty((q) => Math.max(1, q - 1))} className="foc" style={{ width: 44, height: 44, borderRadius: "var(--r-sm)", border: "1px solid var(--c-line-control)", background: "transparent", color: "var(--c-text)", cursor: "pointer" }}>−</button>
            <span style={{ ...mono, minWidth: 22, textAlign: "center" }} aria-live="polite">{qty}</span>
            <button aria-label="Увеличить" onClick={() => setQty((q) => Math.min(maxQty, q + 1))} disabled={qty >= maxQty || needsSize || add.isPending} className="foc" style={{ width: 44, height: 44, borderRadius: "var(--r-sm)", border: "1px solid var(--c-line-control)", background: "transparent", color: "var(--c-text)", cursor: "pointer", opacity: qty >= maxQty ? 0.4 : 1 }}>+</button>
          </div>
        </div>

        {add.isError && <p role="alert" className="club-merch-selection__error">Не удалось добавить товар. Повторите попытку; если ошибка сохраняется, обратитесь в поддержку.</p>}
        <button
          aria-busy={add.isPending}
          onClick={submit}
          disabled={needsSize || add.isPending || (typeof stock === "number" && stock <= 0)}
          className="foc"
          style={{ marginTop: 24, width: "100%", padding: "14px 20px", borderRadius: "var(--r-sm)", border: "1px solid transparent", fontWeight: 600, fontSize: "var(--t-caps)", letterSpacing: "var(--tr-caps)", textTransform: "uppercase", cursor: needsSize ? "not-allowed" : "pointer", background: needsSize ? "var(--c-bg-sunken)" : "var(--c-accent)", color: needsSize ? "var(--c-text-3)" : "var(--c-on-accent)" }}
        >
          {add.isPending ? "Добавляем…" : typeof stock === "number" && stock <= 0 ? "Нет в наличии" : needsSize ? (variants.some((v) => v.size) ? "Выберите размер" : "Выберите вариант") : "В корзину"}
        </button>
      </div>
    </Modal>
  );
}

