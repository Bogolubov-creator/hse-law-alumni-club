import { useState, type FormEvent } from "react";
import Modal from "../../components/Modal.js";
import { rub } from "../../lib/api.js";
import { useAdminProducts, useAdminMutations, type AdminProduct, type ProductInput } from "../../lib/admin.js";
import { StatusToggle, ConfirmDelete, FormField } from "../ui.js";

export function ProductsAdmin() {
  const products = useAdminProducts();
  const { createProduct, patchProduct, deleteProduct } = useAdminMutations();
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDel, setConfirmDel] = useState<AdminProduct | null>(null);

  return (
    <div className="overflow-hidden rounded-[18px] border border-[#E5E7EB] bg-white">
      <div className="flex items-center justify-between gap-3 bg-[#FBF7EF] px-6 py-3.5">
        <span className="font-mono text-[11px] uppercase tracking-wide text-grafit-soft">Мерч · {products.data?.length ?? "…"} товаров</span>
        <button onClick={() => setShowCreate(true)} className="foc rounded-[10px] bg-ohra px-4 py-2 text-sm font-semibold text-kost">+ Добавить товар</button>
      </div>
      {(products.data ?? []).map((p) => (
        <div key={p.id} className="grid grid-cols-[1fr_150px_110px_130px_36px] items-center gap-3 border-t border-[#f0ece2] px-6 py-3.5 text-sm max-md:grid-cols-1">
          <div className="min-w-0">
            <div className="truncate font-semibold">{p.title}</div>
            <div className="font-mono text-[11px] text-grafit-soft">{p.category}{p.variants_json?.length ? ` · ${p.variants_json.length} вар.` : ""}</div>
          </div>
          <span className="font-mono text-[13px]">{rub(p.price)}</span>
          <span className="font-mono text-[12px] text-grafit-soft">склад: {p.stock}</span>
          <StatusToggle status={p.status} busy={patchProduct.isPending} onSet={(s) => patchProduct.mutate({ id: p.id, status: s })} />
          <button aria-label={`Удалить ${p.title}`} onClick={() => setConfirmDel(p)} className="foc h-8 w-8 rounded-[9px] text-karmin hover:bg-[rgba(181,51,27,.08)]">✕</button>
        </div>
      ))}
      {products.data?.length === 0 && <p className="p-10 text-center font-mono text-sm text-grafit-soft">Товаров нет — добавьте первый.</p>}
      {(createProduct.isError || deleteProduct.isError || patchProduct.isError) && <p className="px-6 py-3 font-mono text-xs text-karmin">Не удалось сохранить изменение — попробуйте ещё раз.</p>}

      {showCreate && <ProductForm busy={createProduct.isPending} onClose={() => setShowCreate(false)} onSave={(v) => createProduct.mutate(v, { onSuccess: () => setShowCreate(false) })} />}
      {confirmDel && (
        <ConfirmDelete
          title={confirmDel.title} busy={deleteProduct.isPending}
          hint="Товар исчезнет с витрины. Уже оформленные заявки сохранятся (в них снимок позиции)."
          onCancel={() => setConfirmDel(null)}
          onConfirm={() => deleteProduct.mutate(confirmDel.id, { onSuccess: () => setConfirmDel(null) })}
        />
      )}
    </div>
  );
}

function ProductForm({ busy, onClose, onSave }: { busy: boolean; onClose: () => void; onSave: (v: ProductInput) => void }) {
  const [f, setF] = useState({ title: "", category: "Одежда", priceRub: "", stock: "10", description: "", image: "" });
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const valid = f.title.trim().length >= 3 && Number(f.priceRub) > 0;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    onSave({
      title: f.title.trim(), category: f.category, price: Math.round(Number(f.priceRub) * 100),
      stock: Number(f.stock) || 0, description: f.description.trim() || null,
      images: f.image.trim() ? [f.image.trim()] : null,
    });
  };
  return (
    <Modal onClose={onClose} labelledBy="prod-form-title" maxWidth={480}>
      <form onSubmit={submit} className="rounded-[18px] bg-white p-7">
        <h3 id="prod-form-title" className="font-display text-lg font-bold">Новый товар</h3>
        <div className="mt-4 space-y-3">
          <FormField label="Название" value={f.title} onChange={(v) => set("title", v)} required />
          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="font-mono text-[11px] uppercase tracking-wide text-grafit-soft">Категория</span>
              <select value={f.category} onChange={(e) => set("category", e.target.value)} className="foc mt-1.5 w-full rounded-[11px] border-[1.5px] border-[#E5E7EB] bg-kost px-3 py-2.5 text-[15px]">
                <option>Одежда</option><option>Аксессуары</option><option>Канцелярия</option>
              </select>
            </label>
            <FormField label="Цена, ₽" value={f.priceRub} onChange={(v) => set("priceRub", v.replace(/[^\d]/g, ""))} ph="4200" required />
            <FormField label="Остаток, шт." value={f.stock} onChange={(v) => set("stock", v.replace(/[^\d]/g, ""))} />
          </div>
          <FormField label="Описание" value={f.description} onChange={(v) => set("description", v)} textarea />
          <FormField label="Фото (ссылка или /assets/…)" value={f.image} onChange={(v) => set("image", v)} ph="/assets/merch-hoodie.jpg" />
          <p className="font-mono text-[11px] text-grafit-soft">Размеры/варианты добавляются позже в Directus Studio (поле variants_json).</p>
        </div>
        <div className="mt-5 flex gap-2">
          <button type="submit" disabled={!valid || busy} className="foc flex-1 rounded-[11px] bg-ohra py-2.5 font-semibold text-kost disabled:opacity-50">{busy ? "Создаём…" : "Создать"}</button>
          <button type="button" onClick={onClose} className="foc flex-1 rounded-[11px] border border-[#E5E7EB] py-2.5 font-semibold">Отмена</button>
        </div>
      </form>
    </Modal>
  );
}
