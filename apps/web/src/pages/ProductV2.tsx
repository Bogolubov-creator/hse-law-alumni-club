import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useProducts } from "../lib/cart.js";
import { useHead } from "../lib/title.js";
import { rub } from "../lib/api.js";
import { V2Shell, pageTitle } from "../v2/Shell.js";
import { SizeDialog } from "./MerchV2.js";
import ProductImage from "../components/ProductImage.js";
import { action } from "../styles/primitives.js";

export default function ProductV2() {
  const { slug = "" } = useParams();
  const products = useProducts();
  const product = products.data?.find((p) => p.slug === slug);
  const [open, setOpen] = useState(false);
  useHead({ title: product?.title ?? "Товар клуба", description: product?.description ?? "Мерч клуба выпускников факультета права", noindex: true });
  return <V2Shell><main id="main" style={{ maxWidth: "var(--container)", margin: "0 auto", padding: "32px 28px" }}>
    <Link to="/v2/merch" className="foc">← Весь мерч</Link>
    {products.isLoading && <p role="status">Загружаем товар…</p>}
    {products.isError && <p role="alert">Не удалось загрузить товар. <button onClick={() => products.refetch()}>Повторить</button></p>}
    {products.isSuccess && !product && <h1>Товар не найден</h1>}
    {product && <div className="club-product-detail">
      <div>{(product.images?.length ? product.images : [undefined]).map((src, i) => <div key={i} style={{ aspectRatio: "1", marginBottom: 20, background: "var(--c-bg-raised)", borderRadius: 16, overflow: "hidden" }}><ProductImage src={src} title={product.title} /></div>)}</div>
      <section><p>{product.category}</p><h1 style={{ ...pageTitle, fontSize: "var(--t-h2)" }}>{product.title}</h1><p style={{ fontSize: 28, fontVariantNumeric: "tabular-nums" }}>{rub(product.price)}</p>
        {product.description && <p style={{ whiteSpace: "pre-line", lineHeight: 1.65 }}>{product.description}</p>}
        <h2>Варианты и наличие</h2>
        {product.variants_json?.length ? <ul>{product.variants_json.map((v) => <li key={v.sku}>{[v.size, v.color].filter(Boolean).join(" · ") || v.sku}: {v.stock > 0 ? `${v.stock} шт.` : "нет в наличии"}</li>)}</ul> : <p>{product.stock > 0 ? `В наличии: ${product.stock} шт.` : "Нет в наличии"}</p>}
        <button className="foc" style={action} onClick={() => setOpen(true)}>Выбрать вариант и количество</button>
        <p style={{ color: "var(--c-text-2)" }}>Способ получения выбирается в корзине. Итоговые условия заявки подтвердит учебный офис.</p>
      </section>
    </div>}
    {open && product && <SizeDialog product={product} onClose={() => setOpen(false)} />}
  </main></V2Shell>;
}
