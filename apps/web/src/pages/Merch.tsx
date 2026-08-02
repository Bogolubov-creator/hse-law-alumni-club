import { useMemo, useState } from "react";
import { useHead } from "../lib/title.js";
import SiteShell from "../components/SiteShell.js";
import Modal from "../components/Modal.js";
import { useToast } from "../components/Toast.js";
import { rub, type Product, type ProductVariant } from "../lib/api.js";
import { useProducts, useCartMutations } from "../lib/cart.js";
import { usePaymentsEnabled } from "../lib/queries.js";

export default function Merch() {
  useHead({ title: "Мерч клуба", description: "Фирменный мерч клуба выпускников факультета права НИУ ВШЭ: одежда и аксессуары с фасеточной Фемидой. Самовывоз в учебном офисе или доставка." });
  const products = useProducts();
  const { add } = useCartMutations();
  const toast = useToast();
  const [open, setOpen] = useState<Product | null>(null);
  const [cat, setCat] = useState<string | null>(null);

  const all = products.data ?? [];
  const categories = useMemo(() => [...new Set(all.map((p) => p.category).filter(Boolean))], [all]);
  const list = cat ? all.filter((p) => p.category === cat) : all;

  // Скидка выпускника действует только на ДПО – мерч всегда по базовой цене.
  return (
    <SiteShell>
      <main className="mx-auto max-w-[1180px] px-7 py-12">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-ohra">Витрина · Брендированная одежда</p>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight">Брендированная одежда клуба</h1>
        <p className="mt-3 max-w-[560px] text-grafit-soft">Одежда и аксессуары с фасеточной Фемидой. Самовывоз в учебном офисе или доставка – выберите при оформлении.</p>

        <div className="mt-7 flex flex-wrap gap-2">
          <Chip active={!cat} onClick={() => setCat(null)}>Все</Chip>
          {categories.map((c) => <Chip key={c} active={cat === c} onClick={() => setCat(cat === c ? null : c)}>{c}</Chip>)}
        </div>

        {products.isLoading && <p className="mt-8 font-mono text-sm text-grafit-soft">Загрузка…</p>}
        {products.isError && <p className="mt-8 font-mono text-sm text-karmin">Не удалось загрузить товары. Обновите страницу.</p>}
        {!products.isLoading && !products.isError && list.length === 0 && (
          <p className="mt-8 font-mono text-sm text-grafit-soft">{cat ? "В этой категории пока нет товаров." : "Каталог пока пуст – товары скоро появятся."}</p>
        )}
        <div className="two-col mt-7 grid grid-cols-3 gap-5">
          {list.map((p) => (
            <button key={p.id} onClick={() => setOpen(p)} className="vcard foc block overflow-hidden rounded-[18px] border border-[#E5E7EB] bg-white text-left">
              {p.images?.[0] ? (
                <div className="relative flex h-[200px] items-end bg-white p-5" style={{ background: `#fff url(${p.images[0]}) center / contain no-repeat` }}>
                  <span className="rounded-full bg-grafit/70 px-3 py-1 font-display text-sm font-bold text-kost">{p.category}</span>
                </div>
              ) : (
                <div className="flex h-[200px] items-end bg-ohra p-5" style={{ backgroundImage: "repeating-linear-gradient(45deg,rgba(251,243,232,.1) 0 14px,transparent 14px 28px)" }}>
                  <span className="font-display text-xl font-extrabold text-kost">{p.category}</span>
                </div>
              )}
              <div className="p-5">
                <div className="font-mono text-[11px] uppercase tracking-wide text-grafit-soft">{p.category}</div>
                <div className="mt-1 font-display text-[17px] font-semibold leading-tight tracking-tight">{p.title}</div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="font-mono text-[18px] font-medium">{rub(p.price)}</span>
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
          onClose={() => setOpen(null)}
          onAdd={(sku, qty) => {
            add.mutate(
              { type: "merch", ref_id: open.slug, variant_sku: sku, qty },
              { onSuccess: () => toast(`«${open.title}» в корзине`), onError: () => toast("Не удалось добавить", "err") },
            );
            setOpen(null);
          }}
        />
      )}
    </SiteShell>
  );
}

function ProductModal({ product, onClose, onAdd }: { product: Product; onClose: () => void; onAdd: (sku: string | null, qty: number) => void }) {
  // Текст про оплату идёт от фичефлага, а не из жёсткой строки: при включении
  // ЮKassa прежняя формулировка «оплаты на сайте нет» становилась ложью.
  const payments = usePaymentsEnabled();
  const variants: ProductVariant[] = product.variants_json ?? [];
  const hasVariants = variants.length > 0;
  const [sku, setSku] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const vLabel = (v: ProductVariant) => [v.size, v.color].filter(Boolean).join(" · ") || v.sku;
  const selected = variants.find((v) => v.sku === sku) ?? null;
  const stock = hasVariants ? (selected?.stock ?? null) : product.stock;
  const needsSize = hasVariants && !sku;
  const maxQty = Math.max(1, stock ?? 1);

  return (
    <Modal onClose={onClose} labelledBy="merch-modal-title" maxWidth={460}>
      <div className="relative rounded-[22px] bg-white p-8 shadow-2xl" style={{ animation: "g-pop .26s cubic-bezier(.2,.8,.2,1)" }}>
        <button onClick={onClose} aria-label="Закрыть" className="foc absolute right-4 top-4 h-9 w-9 rounded-[10px] border border-[#E5E7EB] text-grafit-soft">✕</button>
        {product.images?.[0] && (
          <img src={product.images[0]} alt={product.title} className="mx-auto mb-4 max-h-[220px] rounded-[14px] object-contain" />
        )}
        <div className="font-mono text-[11px] uppercase tracking-wide text-ohra-deep">{product.category}</div>
        <h2 id="merch-modal-title" className="mt-2 font-display text-2xl font-bold leading-tight tracking-tight">{product.title}</h2>
        {product.description && <p className="mt-3 text-sm leading-relaxed text-grafit-soft">{product.description}</p>}
        <div className="mt-4 flex items-baseline gap-2">
          <span className="font-mono text-2xl font-medium">{rub(product.price)}</span>
        </div>

        {hasVariants && (
          <div className="mt-5">
            <div className="font-mono text-[11px] uppercase tracking-wide text-grafit-soft">Размер</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {variants.map((v) => (
                <button key={v.sku} aria-pressed={sku === v.sku} onClick={() => { setSku(v.sku); setQty(1); }} disabled={v.stock <= 0} className={`foc rounded-[10px] border px-3.5 py-2 text-sm font-medium disabled:opacity-40 ${sku === v.sku ? "border-ohra bg-ohra text-kost" : "border-[#E5E7EB] bg-white"}`}>{vLabel(v)}</button>
              ))}
            </div>
          </div>
        )}

        {stock != null && (
          <p className={`mt-3 font-mono text-[12px] ${stock <= 0 ? "text-karmin" : stock <= 3 ? "text-ohra-deep" : "text-grafit-soft"}`}>
            {stock <= 0 ? "Нет в наличии" : stock <= 3 ? `Осталось ${stock} шт.` : `В наличии: ${stock} шт.`}
          </p>
        )}

        <div className="mt-4 flex items-center gap-3">
          <span className="font-mono text-[12px] text-grafit-soft">Количество</span>
          <div className="flex items-center gap-2">
            <button aria-label="Уменьшить" onClick={() => setQty((q) => Math.max(1, q - 1))} className="foc h-8 w-8 rounded-[9px] border border-[#E5E7EB]">−</button>
            <span className="w-6 text-center font-mono" aria-live="polite">{qty}</span>
            <button aria-label="Увеличить" onClick={() => setQty((q) => Math.min(maxQty, q + 1))} disabled={qty >= maxQty} className="foc h-8 w-8 rounded-[9px] border border-[#E5E7EB] disabled:opacity-40">+</button>
          </div>
        </div>

        <button
          onClick={() => onAdd(sku, qty)}
          disabled={needsSize || (stock != null && stock <= 0)}
          className={`foc mt-6 w-full rounded-[12px] py-3.5 font-semibold text-kost disabled:cursor-not-allowed ${needsSize ? "bg-grafit-soft opacity-70" : "bg-ohra"}`}
        >
          {stock != null && stock <= 0 ? "Нет в наличии" : needsSize ? "Выберите размер" : "В корзину"}
        </button>
        <p className="mt-3 font-mono text-[11px] leading-relaxed text-grafit-soft">
          Самовывоз в учебном офисе или доставка – выберите при оформлении заказа.{" "}
          {payments.data?.enabled ? "Оплатить можно онлайн на шаге подтверждения." : "Оплаты на сайте нет – счёт выставит учебный офис."}
        </p>
      </div>
    </Modal>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`foc rounded-full border px-3.5 py-2 text-[13px] font-medium ${active ? "border-grafit bg-grafit text-kost" : "border-[#E5E7EB] bg-white"}`}>{children}</button>;
}
