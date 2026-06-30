import { useState } from "react";
import SiteShell, { DiscountBadge } from "../components/SiteShell.js";
import Modal from "../components/Modal.js";
import { useToast } from "../components/Toast.js";
import { rub, type Product, type ProductVariant } from "../lib/api.js";
import { useProducts, useMemberDiscount, useCartMutations } from "../lib/cart.js";

export default function Merch() {
  const products = useProducts();
  const discount = useMemberDiscount();
  const { add } = useCartMutations();
  const toast = useToast();
  const [open, setOpen] = useState<Product | null>(null);

  const priced = (price: number) => Math.round((price * (100 - discount)) / 100 / 100) * 100;

  return (
    <SiteShell>
      <main className="mx-auto max-w-[1180px] px-7 py-12">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-ohra">Витрина мерча</p>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight">Фирменный мерч клуба</h1>
        <p className="mt-3 max-w-[560px] text-grafit-soft">Одежда и аксессуары с фасеточной Фемидой. Самовывоз или доставка – оформление через заявку.</p>

        {products.isLoading && <p className="mt-8 font-mono text-sm text-grafit-soft">Загрузка…</p>}
        {products.isError && <p className="mt-8 font-mono text-sm text-karmin">Не удалось загрузить товары. Обновите страницу.</p>}
        <div className="two-col mt-7 grid grid-cols-3 gap-5">
          {products.data?.map((p) => (
            <button key={p.id} onClick={() => setOpen(p)} className="vcard foc block overflow-hidden rounded-[18px] border border-[#E5E7EB] bg-white text-left">
              <div className="flex h-[200px] items-end bg-ohra p-5" style={{ backgroundImage: "repeating-linear-gradient(45deg,rgba(251,243,232,.1) 0 14px,transparent 14px 28px)" }}>
                <span className="font-display text-xl font-extrabold text-kost">{p.category}</span>
              </div>
              <div className="p-5">
                <div className="font-display text-[17px] font-semibold leading-tight tracking-tight">{p.title}</div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="font-mono text-[18px] font-medium">{rub(priced(p.price))}</span>
                  {discount > 0 && <span className="font-mono text-[13px] text-grafit-soft line-through">{rub(p.price)}</span>}
                </div>
                <div className="mt-3 text-sm font-semibold text-ohra-deep">Быстрый просмотр →</div>
              </div>
            </button>
          ))}
        </div>
      </main>

      {open && (
        <ProductModal
          product={open}
          discount={discount}
          onClose={() => setOpen(null)}
          onAdd={(sku) => {
            add.mutate(
              { type: "merch", ref_id: open.slug, variant_sku: sku },
              { onSuccess: () => toast(`«${open.title}» в корзине`), onError: () => toast("Не удалось добавить", "err") },
            );
            setOpen(null);
          }}
        />
      )}
    </SiteShell>
  );
}

function ProductModal({ product, discount, onClose, onAdd }: { product: Product; discount: number; onClose: () => void; onAdd: (sku: string | null) => void }) {
  const variants: ProductVariant[] = product.variants_json ?? [];
  const [sku, setSku] = useState<string | null>(variants[0]?.sku ?? null);
  const priced = Math.round((product.price * (100 - discount)) / 100 / 100) * 100;
  const vLabel = (v: ProductVariant) => [v.size, v.color].filter(Boolean).join(" · ") || v.sku;

  return (
    <Modal onClose={onClose} labelledBy="merch-modal-title" maxWidth={460}>
      <div className="relative rounded-[22px] bg-white p-8 shadow-2xl" style={{ animation: "g-pop .26s cubic-bezier(.2,.8,.2,1)" }}>
        <button onClick={onClose} aria-label="Закрыть" className="foc absolute right-4 top-4 h-9 w-9 rounded-[10px] border border-[#E5E7EB] text-grafit-soft">✕</button>
        <div className="font-mono text-[11px] uppercase tracking-wide text-ohra-deep">{product.category}</div>
        <h2 id="merch-modal-title" className="mt-2 font-display text-2xl font-bold leading-tight tracking-tight">{product.title}</h2>
        {product.description && <p className="mt-3 text-sm leading-relaxed text-grafit-soft">{product.description}</p>}
        <div className="mt-4 flex items-baseline gap-2">
          <span className="font-mono text-2xl font-medium">{rub(priced)}</span>
          {discount > 0 && <span className="font-mono text-sm text-grafit-soft line-through">{rub(product.price)}</span>}
          {discount > 0 && <DiscountBadge percent={discount} />}
        </div>
        {variants.length > 0 && (
          <div className="mt-5">
            <div className="font-mono text-[11px] uppercase tracking-wide text-grafit-soft">Вариант</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {variants.map((v) => (
                <button key={v.sku} aria-pressed={sku === v.sku} onClick={() => setSku(v.sku)} disabled={v.stock <= 0} className={`foc rounded-[10px] border px-3.5 py-2 text-sm font-medium disabled:opacity-40 ${sku === v.sku ? "border-ohra bg-ohra text-kost" : "border-[#E5E7EB] bg-white"}`}>{vLabel(v)}</button>
              ))}
            </div>
          </div>
        )}
        <button onClick={() => onAdd(sku)} className="foc mt-6 w-full rounded-[12px] bg-ohra py-3.5 font-semibold text-kost">В корзину</button>
      </div>
    </Modal>
  );
}
