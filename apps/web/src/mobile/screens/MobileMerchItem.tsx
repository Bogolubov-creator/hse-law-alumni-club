import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { rub, type ProductVariant } from "../../lib/api.js";
import { useProducts, useCartMutations } from "../../lib/cart.js";
import { useToast } from "../../components/Toast.js";
import { useHead } from "../../lib/title.js";
import { INK, disp, mono, MERCH_TINTS, roundDark, stickyBar, primaryBtn, BackWhite } from "../theme.js";
import { Loader } from "../ui.js";

export function MobileMerchItem({ slug }: { slug: string }) {
  const nav = useNavigate();
  const products = useProducts();
  const { add } = useCartMutations();
  const toast = useToast();
  const m = (products.data ?? []).find((p) => p.slug === slug) ?? null;
  useHead({ title: m?.title ?? "Мерч", description: m?.description ?? undefined });
  const variants: ProductVariant[] = m?.variants_json ?? [];
  const [sku, setSku] = useState<string | null>(null);
  const selected = variants.find((v) => v.sku === sku) ?? null;
  const stock = variants.length ? (selected?.stock ?? null) : (m?.stock ?? null);
  const needsSize = variants.length > 0 && !sku;
  const i = (products.data ?? []).findIndex((p) => p.slug === slug);
  const tint = MERCH_TINTS[(i >= 0 ? i : 0) % MERCH_TINTS.length];
  const buy = () => {
    if (!m) return;
    add.mutate({ type: "merch", ref_id: m.slug, variant_sku: sku, qty: 1 }, {
      onSuccess: () => { toast("Добавлено – оформите заявку"); nav("/cart"); },
      onError: (e) => toast((e as Error).message, "err"),
    });
  };
  return (
    <div style={{ height: "100dvh", background: "#FBF3E8", display: "flex", flexDirection: "column", overflow: "hidden", color: INK, fontFamily: "'Onest', system-ui, sans-serif" }}>
      <div className="noscroll" style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ position: "relative", height: 300, overflow: "hidden", background: m?.images?.[0] ? `#EDE4D2 url(${m.images[0]}) center/cover no-repeat` : tint }}>
          {!m?.images?.[0] && <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(45deg,rgba(255,255,255,.09) 0 9px,transparent 9px 19px)" }} />}
          <button onClick={() => nav("/merch")} aria-label="Назад" style={{ ...roundDark, position: "absolute", top: "calc(env(safe-area-inset-top, 0px) + 14px)", left: 16 }}>{BackWhite}</button>
        </div>
        {products.isLoading && <Loader />}
        {!products.isLoading && !m && <p style={{ padding: 20, ...mono, fontSize: 13, color: "#C9450E" }}>Товар не найден.</p>}
        {m && (
          <div style={{ padding: "20px 20px 30px" }}>
            <div style={{ ...disp, fontWeight: 700, fontSize: 21, lineHeight: 1.2 }}>{m.title}</div>
            <div style={{ ...disp, fontWeight: 800, fontSize: 24, marginTop: 12 }}>{rub(m.price)}</div>
            <div style={{ fontSize: 13.5, color: "#6B7280", lineHeight: 1.55, marginTop: 12 }}>{m.description || "Официальный мерч клуба выпускников факультета права."} На мерч скидка выпускника не распространяется.</div>
            {variants.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ ...mono, fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "#9B9584", marginBottom: 10 }}>Размер</div>
                <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
                  {variants.map((v) => {
                    const on = sku === v.sku;
                    const label = [v.size, v.color].filter(Boolean).join(" · ") || v.sku;
                    return <button key={v.sku} disabled={v.stock <= 0} aria-pressed={on} onClick={() => setSku(v.sku)} style={{ minWidth: 52, height: 48, padding: "0 12px", borderRadius: 13, cursor: "pointer", fontFamily: "'Onest'", fontWeight: 600, fontSize: 15, border: "1.5px solid " + (on ? "#EC5A13" : "#E4DCCC"), background: on ? "rgba(236,90,19,.08)" : "#fff", color: INK, opacity: v.stock <= 0 ? .4 : 1 }}>{label}</button>;
                  })}
                </div>
              </div>
            )}
            {stock != null && <p style={{ ...mono, fontSize: 12, marginTop: 14, color: stock <= 0 ? "#B5331B" : stock <= 3 ? "#C9450E" : "#9B9584" }}>{stock <= 0 ? "Нет в наличии" : stock <= 3 ? `Осталось ${stock} шт.` : `В наличии: ${stock} шт.`}</p>}
          </div>
        )}
      </div>
      {m && (
        <div style={stickyBar}>
          <button onClick={buy} disabled={add.isPending || needsSize || (stock != null && stock <= 0)} style={{ ...primaryBtn, opacity: needsSize || (stock != null && stock <= 0) ? .6 : 1 }}>
            {stock != null && stock <= 0 ? "Нет в наличии" : needsSize ? "Выберите размер" : `Добавить в заявку · ${rub(m.price)}`}
          </button>
        </div>
      )}
    </div>
  );
}
