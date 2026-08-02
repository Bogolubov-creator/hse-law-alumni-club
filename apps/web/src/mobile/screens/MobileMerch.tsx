import { Link } from "react-router-dom";
import { rub, type Product } from "../../lib/api.js";
import { useProducts, useCart, useCartMutations } from "../../lib/cart.js";
import { useToast } from "../../components/Toast.js";
import { useHead } from "../../lib/title.js";
import { INK, disp, mono, CARD, MERCH_TINTS } from "../theme.js";
import { Loader, ScreenHeader } from "../ui.js";

export function MobileMerch() {
  useHead({ title: "Мерч клуба", description: "Фирменный мерч клуба выпускников факультета права НИУ ВШЭ." });
  const products = useProducts();
  const cart = useCart();
  const { add } = useCartMutations();
  const toast = useToast();
  const count = cart.data?.count ?? 0;
  const list = products.data ?? [];

  return (
    <div>
      <ScreenHeader title="Мерч" sub="Товары без скидки выпускника" right={
        <Link to="/cart" aria-label="Корзина" style={{ position: "relative", width: 42, height: 42, borderRadius: 13, border: "1px solid #ECE6DA", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8h12l-1 12H7L6 8z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>
          {count > 0 && <span style={{ position: "absolute", top: -5, right: -5, minWidth: 18, height: 18, padding: "0 4px", borderRadius: 99, background: "#EC5A13", color: "#fff", ...mono, fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #FBF3E8" }}>{count}</span>}
        </Link>
      } />
      <div style={{ padding: "12px 20px 16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13 }}>
        {products.isLoading && <Loader />}
        {list.map((m: Product, i) => (
          <div key={m.id} style={{ ...CARD, borderRadius: 18, overflow: "hidden", boxShadow: "0 12px 28px -28px rgba(20,24,31,.5)" }}>
            <Link to={`/merch?item=${encodeURIComponent(m.slug)}`} aria-label={m.title} style={{ display: "block" }}>
              <div style={{ height: 120, position: "relative", overflow: "hidden", background: m.images?.[0] ? `#fff url(${m.images[0]}) center/cover` : MERCH_TINTS[i % MERCH_TINTS.length] }}>
                {!m.images?.[0] && <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(45deg,rgba(255,255,255,.09) 0 7px,transparent 7px 15px)" }} />}
              </div>
            </Link>
            <div style={{ padding: "11px 13px 13px" }}>
              <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.25, minHeight: 32 }}>{m.title}</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
                <span style={{ ...disp, fontWeight: 700, fontSize: 15 }}>{rub(m.price)}</span>
                <button aria-label={`Добавить «${m.title}» в корзину`} onClick={() => add.mutate({ type: "merch", ref_id: m.slug, qty: 1 }, { onSuccess: () => toast(`«${m.title}» в корзине`), onError: () => toast("Не удалось добавить", "err") })} style={{ width: 32, height: 32, borderRadius: 10, border: "none", background: "#EC5A13", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
