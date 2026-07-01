import { useId, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import SiteShell from "../components/SiteShell.js";
import { rub, type OrderResult } from "../lib/api.js";
import { useCart, useMemberDiscount, useCartMutations, submitOrder } from "../lib/cart.js";

export default function Cart() {
  const cart = useCart();
  const discount = useMemberDiscount();
  const { setQty } = useCartMutations();
  const qc = useQueryClient();
  const [form, setForm] = useState({ contact_fio: "", contact_phone: "", contact_email: "", fulfillment: "pickup" as "pickup" | "delivery", address: "", comment: "", consent: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<OrderResult | null>(null);

  const items = cart.data?.items ?? [];
  const subtotal = cart.data?.subtotal ?? 0;
  // Скидка выпускника — только на ДПО; мерч по базовой цене.
  const dpoSubtotal = items.filter((i) => i.type === "dpo").reduce((s, i) => s + i.price * i.qty, 0);
  const discountAmount = Math.round((dpoSubtotal * discount) / 100);
  const total = subtotal - discountAmount;
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      const res = await submitOrder({
        contact_fio: form.contact_fio, contact_phone: form.contact_phone, contact_email: form.contact_email,
        fulfillment: form.fulfillment, address: form.address || null, comment: form.comment || null, consent_pdn: form.consent,
      });
      setResult(res);
      qc.invalidateQueries({ queryKey: ["cart"] });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <SiteShell>
        <main className="mx-auto max-w-[620px] px-7 py-16 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[20px] bg-[rgba(31,138,91,.14)] text-3xl text-[#1F8A5B]">✓</div>
          <h1 className="mt-5 font-display text-3xl font-bold">Заявка отправлена</h1>
          <p className="mt-3 text-grafit-soft">Номер вашей заявки – <b className="font-mono text-grafit">{result.number}</b>. Менеджер учебного офиса свяжется с вами по указанным контактам, чтобы подтвердить детали. Оплаты на сайте нет.</p>
          {!result.notified.ok && (
            <p className="mx-auto mt-4 max-w-[440px] rounded-[12px] bg-[rgba(181,51,27,.08)] px-4 py-3 text-sm text-karmin">
              Заявка сохранена, но автоматическое уведомление офиса не прошло. Пожалуйста, продублируйте заявку в Telegram <a className="underline" href="https://t.me/pravohse" target="_blank" rel="noopener noreferrer">@pravohse</a> – так офис точно увидит её.
            </p>
          )}
          <div className="mx-auto mt-6 max-w-[360px] rounded-[16px] border border-[#E5E7EB] bg-white p-5 text-left font-mono text-[13px]">
            <Row k="Сумма (справочно)" v={rub(result.subtotal)} />
            {result.subtotal > result.total_estimate && <Row k="Скидка выпускника (ДПО)" v={`−${result.member_discount}%`} />}
            <Row k="Итого (оценочно)" v={rub(result.total_estimate)} bold />
          </div>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link to="/lk" className="foc rounded-[12px] bg-ohra px-6 py-3 font-semibold text-kost">В личный кабинет</Link>
            <Link to="/" className="foc rounded-[12px] border border-[#E5E7EB] px-6 py-3 font-semibold">На главную</Link>
          </div>
        </main>
      </SiteShell>
    );
  }

  return (
    <SiteShell>
      <main className="mx-auto max-w-[1180px] px-7 py-12">
        <h1 className="font-display text-4xl font-bold tracking-tight">Корзина</h1>
        {cart.isLoading && <p className="mt-8 font-mono text-sm text-grafit-soft">Загрузка…</p>}
        {!cart.isLoading && items.length === 0 && (
          <div className="mt-8 rounded-[18px] border border-[#E5E7EB] bg-white p-10 text-center">
            <h2 className="font-display text-2xl font-bold">Корзина пуста</h2>
            <p className="mt-2 text-grafit-soft">Выберите программу ДПО со скидкой выпускника или брендированную одежду клуба.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Link to="/dpo" className="foc rounded-[12px] bg-ohra px-6 py-3 font-semibold text-kost">В витрину ДПО</Link>
              <Link to="/merch" className="foc rounded-[12px] border border-[#E5E7EB] px-6 py-3 font-semibold">Одежда клуба</Link>
            </div>
          </div>
        )}

        {items.length > 0 && (
          <div className="grid-2 mt-8 grid grid-cols-[1.4fr_1fr] gap-7">
            {/* ITEMS */}
            <div className="flex flex-col gap-3">
              {items.map((it) => (
                <div key={`${it.ref_id}-${it.variant_sku ?? ""}`} className="flex items-center gap-4 rounded-[16px] border border-[#E5E7EB] bg-white p-4">
                  <span className={`rounded-full px-2.5 py-1 font-mono text-[10px] ${it.type === "dpo" ? "bg-[rgba(17,41,107,.1)] text-hse-blue" : "bg-[rgba(236,90,19,.14)] text-ohra-deep"}`}>{it.type === "dpo" ? "ДПО" : "Одежда"}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold leading-tight">{it.title}</div>
                    {it.variant_sku && <div className="font-mono text-[11px] text-grafit-soft">{it.variant_sku}</div>}
                  </div>
                  {it.type === "dpo" ? (
                    <span className="font-mono text-[11px] text-grafit-soft">заявка · 1 место</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button aria-label="Уменьшить количество" onClick={() => setQty.mutate({ ref_id: it.ref_id, variant_sku: it.variant_sku, qty: it.qty - 1 })} className="foc h-8 w-8 rounded-[9px] border border-[#E5E7EB]">−</button>
                      <span className="w-6 text-center font-mono" aria-live="polite">{it.qty}</span>
                      <button aria-label="Увеличить количество" onClick={() => setQty.mutate({ ref_id: it.ref_id, variant_sku: it.variant_sku, qty: it.qty + 1 })} className="foc h-8 w-8 rounded-[9px] border border-[#E5E7EB]">+</button>
                    </div>
                  )}
                  <div className="w-24 text-right font-mono text-sm">{rub(it.price * it.qty)}</div>
                  <button aria-label="Удалить из корзины" onClick={() => setQty.mutate({ ref_id: it.ref_id, variant_sku: it.variant_sku, qty: 0 })} className="foc text-karmin">✕</button>
                </div>
              ))}
            </div>

            {/* SUMMARY + CHECKOUT */}
            <form onSubmit={submit} className="h-fit rounded-[18px] border border-[#E5E7EB] bg-white p-6">
              <div className="space-y-1.5 font-mono text-[13px]">
                <Row k="Подытог" v={rub(subtotal)} />
                {discountAmount > 0 && <Row k={`Скидка выпускника (ДПО) −${discount}%`} v={`−${rub(discountAmount)}`} />}
                <div className="my-2 border-t border-[#f0ece2]" />
                <Row k="Итого (справочно)" v={rub(total)} bold />
              </div>
              <p className="mt-2 font-mono text-[11px] text-grafit-soft">Оплаты на сайте нет – сумма справочная. После оформления заявки с вами свяжется менеджер учебного офиса и подтвердит детали. Скидка выпускника действует только на программы ДПО.</p>

              <div className="mt-5 space-y-3">
                <Input label="ФИО" value={form.contact_fio} onChange={(v) => set("contact_fio", v)} required />
                <Input label="Телефон" value={form.contact_phone} onChange={(v) => set("contact_phone", v)} required />
                <Input label="Email" type="email" value={form.contact_email} onChange={(v) => set("contact_email", v)} required />
                <div>
                  <Label>Получение</Label>
                  <div className="mt-1.5 flex gap-2">
                    {(["pickup", "delivery"] as const).map((f) => (
                      <button type="button" key={f} onClick={() => set("fulfillment", f)} className={`foc flex-1 rounded-[10px] border py-2.5 text-sm font-medium ${form.fulfillment === f ? "border-ohra bg-ohra text-kost" : "border-[#E5E7EB]"}`}>{f === "pickup" ? "Самовывоз" : "Доставка"}</button>
                    ))}
                  </div>
                </div>
                {form.fulfillment === "delivery" && <Input label="Адрес" value={form.address} onChange={(v) => set("address", v)} required />}
                <Input label="Комментарий" value={form.comment} onChange={(v) => set("comment", v)} />
                <label className="flex cursor-pointer items-start gap-2.5 text-[13px] text-grafit-soft">
                  <input type="checkbox" checked={form.consent} onChange={(e) => set("consent", e.target.checked)} required className="mt-0.5" />
                  Согласен на обработку персональных данных
                </label>
              </div>

              {err && <p className="mt-3 font-mono text-xs text-karmin">{err}</p>}
              <button type="submit" disabled={busy || !form.consent} className="foc mt-4 w-full rounded-[12px] bg-ohra py-3.5 font-semibold text-kost disabled:opacity-60">
                {busy ? "Отправляем…" : "Оформить заявку"}
              </button>
            </form>
          </div>
        )}
      </main>
    </SiteShell>
  );
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return <div className={`flex justify-between gap-3 ${bold ? "font-semibold text-grafit" : "text-grafit-soft"}`}><span>{k}</span><span className="text-grafit">{v}</span></div>;
}
function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-[13px] font-semibold">{children}</label>;
}
function Input({ label, value, onChange, type = "text", required }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-[13px] font-semibold">{label}</label>
      <input id={id} type={type} required={required} value={value} onChange={(e) => onChange(e.target.value)} className="foc mt-1.5 w-full rounded-[11px] border-[1.5px] border-[#E5E7EB] bg-kost px-3.5 py-2.5 text-[15px] outline-none focus:border-ohra" />
    </div>
  );
}
