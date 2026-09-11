import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useProducts } from "../lib/cart.js";
import { useHead } from "../lib/title.js";
import { rub } from "../lib/api.js";
import { V2Shell, pageTitle, mono } from "../v2/Shell.js";
import { SizeDialog } from "./MerchV2.js";
import ProductImage from "../components/ProductImage.js";
import { action } from "../styles/primitives.js";

export default function ProductV2() {
  const { slug = "" } = useParams();
  const products = useProducts();
  const product = products.data?.find((p) => p.slug === slug);
  const [open, setOpen] = useState(false);
  useHead({
    title: product?.title ?? "Товар клуба",
    description: product?.description ?? "Мерч клуба выпускников факультета права",
  });

  const images = product?.images?.length ? product.images : [undefined];
  const hasStock = product
    ? (product.variants_json?.length
      ? product.variants_json.some((v) => v.stock > 0)
      : (product.stock ?? 0) > 0)
    : false;

  return (
    <V2Shell>
      <main id="main" style={{ maxWidth: "var(--container)", margin: "0 auto", padding: "32px 28px" }}>
        <Link to="/merch" className="foc" style={{ color: "var(--c-text-2)", textDecoration: "underline", textUnderlineOffset: 4, ...mono, fontSize: "var(--t-caption)" }}>← весь мерч</Link>

        {products.isLoading && <p role="status" style={{ marginTop: 28 }}>Загружаем товар…</p>}
        {products.isError && (
          <p role="alert" style={{ marginTop: 28 }}>
            Не удалось загрузить товар.{" "}
            <button type="button" className="foc" onClick={() => products.refetch()}>Повторить</button>
          </p>
        )}
        {products.isSuccess && !product && (
          <div style={{ marginTop: 40 }}>
            <h1 style={{ ...pageTitle, fontSize: "var(--t-h2)", margin: 0 }}>Товар не найден</h1>
            <p style={{ color: "var(--c-text-2)", marginTop: 12 }}>Такой позиции нет в каталоге – возможно, адрес устарел.</p>
            <Link to="/merch" className="foc" style={{ display: "inline-block", marginTop: 20, ...action, textDecoration: "none" }}>К витрине мерча</Link>
          </div>
        )}

        {product && (
          <div className="club-product-detail">
            <div>
              {images.map((src, i) => (
                <div key={i} style={{ aspectRatio: "1", marginBottom: 20, background: "var(--c-bg-raised)", borderRadius: 16, overflow: "hidden" }}>
                  <ProductImage src={src} title={product.title} />
                </div>
              ))}
            </div>
            <section>
              <p style={{ ...mono, fontSize: "var(--t-caption)", color: "var(--c-text-3)", margin: 0 }}>{product.category}</p>
              <h1 style={{ ...pageTitle, fontSize: "var(--t-h2)", margin: "8px 0 0" }}>{product.title}</h1>
              <p style={{ fontSize: 28, fontVariantNumeric: "tabular-nums", margin: "14px 0 0" }}>{rub(product.price)}</p>
              {product.description && (
                <p style={{ whiteSpace: "pre-line", lineHeight: 1.65, color: "var(--c-text-2)", marginTop: 18 }}>{product.description}</p>
              )}
              <h2 style={{ fontSize: "var(--t-h3)", marginTop: 28 }}>Варианты и наличие</h2>
              {product.variants_json?.length ? (
                <ul style={{ paddingLeft: 18, lineHeight: 1.7 }}>
                  {product.variants_json.map((v) => (
                    <li key={v.sku}>
                      {[v.size, v.color].filter(Boolean).join(" · ") || v.sku}:{" "}
                      {v.stock > 0 ? `${v.stock} шт.` : "нет в наличии"}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>{(product.stock ?? 0) > 0 ? `В наличии: ${product.stock} шт.` : "Нет в наличии"}</p>
              )}
              <button
                className="foc"
                style={{ ...action, marginTop: 8, opacity: hasStock ? 1 : 0.55 }}
                disabled={!hasStock}
                onClick={() => setOpen(true)}
              >
                {hasStock ? "Выбрать вариант и количество" : "Сейчас нет в наличии"}
              </button>
              <p style={{ color: "var(--c-text-2)", marginTop: 16, fontSize: 14 }}>
                Способ получения выбирается в корзине. Итоговые условия заявки подтвердит учебный офис. Скидка клуба на мерч не действует.
              </p>
            </section>
          </div>
        )}
        {open && product && <SizeDialog product={product} onClose={() => setOpen(false)} />}
      </main>
    </V2Shell>
  );
}
