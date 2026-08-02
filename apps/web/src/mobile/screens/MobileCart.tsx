import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { rub, type OrderResult } from "../../lib/api.js";
import { useCart, useMemberDiscount, useCartMutations, submitOrder } from "../../lib/cart.js";
import { useToast } from "../../components/Toast.js";
import { useHead } from "../../lib/title.js";
import { INK, disp, mono, CARD, HEADER, roundLight, primaryBtn, BackInk } from "../theme.js";
import { Loader } from "../ui.js";

function CartField({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={label} style={{ height: 48, borderRadius: 13, border: "1px solid #E4DCCC", background: "#fff", padding: "0 15px", fontFamily: "'Onest'", fontSize: 15, color: INK, outline: "none" }} />;
}

export function MobileCart() {
  useHead({ title: "Заявка", noindex: true });
  const nav = useNavigate();
  const cart = useCart();
  const discount = useMemberDiscount();
  const { setQty } = useCartMutations();
  const toast = useToast();
  const [form, setForm] = useState({ fio: "", phone: "", email: "", fulfillment: "pickup" as "pickup" | "delivery", address: "", consent: false, website: "" });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<OrderResult | null>(null);
  const items = cart.data?.items ?? [];
  const subtotal = cart.data?.subtotal ?? 0;
  const dpoSub = items.filter((i) => i.type === "dpo").reduce((s, i) => s + i.price * i.qty, 0);
  const discAmt = Math.round((dpoSub * discount) / 100);
  const total = subtotal - discAmt;
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    submitOrder({ contact_fio: form.fio, contact_phone: form.phone, contact_email: form.email, fulfillment: form.fulfillment, address: form.address || null, comment: null, consent_pdn: form.consent, website: form.website })
      .then((res) => { setResult(res); cart.refetch(); })
      .catch((err) => toast((err as Error).message, "err"))
      .finally(() => setBusy(false));
  };

  if (result) {
    return (
      <div style={{ height: "100dvh", background: "#FBF3E8", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 34px", textAlign: "center", color: INK, fontFamily: "'Onest', system-ui, sans-serif" }}>
        <div style={{ width: 96, height: 96, borderRadius: 99, background: "linear-gradient(140deg,#2C6E80,#15375E)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 24px 46px -20px rgba(21,55,94,.8)" }}><svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="#FBF3E8" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg></div>
        <div style={{ ...disp, fontWeight: 800, fontSize: 24, marginTop: 26 }}>Заявка отправлена</div>
        <div style={{ ...mono, fontSize: 12, letterSpacing: ".06em", color: "#C9450E", marginTop: 12, background: "#F2E3CF", padding: "8px 14px", borderRadius: 10 }}>{result.number}</div>
        <div style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.55, marginTop: 18, maxWidth: 280 }}>Менеджер учебного офиса свяжется с вами в течение рабочего дня.{result.payment_url ? " Оплатить можно онлайн – кнопка ниже." : ""}</div>
        {result.payment_url && <a href={result.payment_url} style={{ ...primaryBtn, marginTop: 20, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", padding: "0 26px", background: "#1F8A5B", boxShadow: "none" }}>Оплатить онлайн</a>}
        <button onClick={() => nav("/")} style={{ marginTop: 22, height: 52, padding: "0 34px", borderRadius: 15, border: "none", background: INK, color: "#FBF3E8", fontFamily: "'Onest'", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>На главную</button>
      </div>
    );
  }

  return (
    <div style={{ height: "100dvh", background: "#FBF3E8", display: "flex", flexDirection: "column", overflow: "hidden", color: INK, fontFamily: "'Onest', system-ui, sans-serif" }}>
      <header style={{ ...HEADER, display: "flex", alignItems: "center", gap: 12, padding: "calc(env(safe-area-inset-top, 0px) + 14px) 18px 12px" }}>
        <button onClick={() => nav(-1)} aria-label="Назад" style={roundLight}>{BackInk}</button>
        <div style={{ ...disp, fontWeight: 800, fontSize: 21, letterSpacing: "-.01em" }}>Заявка</div>
      </header>
      <div className="noscroll" style={{ flex: 1, overflowY: "auto" }}>
        {cart.isLoading && <Loader />}
        {cart.isError && <p style={{ padding: 20, ...mono, fontSize: 13, color: "#C9450E" }}>Не удалось загрузить корзину.</p>}
        {!cart.isLoading && !cart.isError && items.length === 0 && (
          <div style={{ padding: "70px 40px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
            <div style={{ width: 78, height: 78, borderRadius: 99, background: "#F2E3CF", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#C49A45" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8h12l-1 12H7L6 8z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg></div>
            <div style={{ ...disp, fontWeight: 700, fontSize: 17, marginTop: 18 }}>Заявка пуста</div>
            <div style={{ fontSize: 13.5, color: "#6B7280", marginTop: 6, lineHeight: 1.5 }}>Добавьте программу ДПО или мерч – и оформите заявку в пару касаний.</div>
            <button onClick={() => nav("/dpo")} style={{ ...primaryBtn, flex: "none", marginTop: 22, height: 48, padding: "0 26px" }}>К программам</button>
          </div>
        )}
        {items.length > 0 && (
          <form onSubmit={submit} style={{ padding: "8px 20px 30px", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              {items.map((c) => (
                <div key={`${c.ref_id}-${c.variant_sku ?? ""}`} style={{ display: "flex", gap: 13, ...CARD, borderRadius: 16, padding: "13px 14px", alignItems: "center" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.25 }}>{c.title}</div>
                    {c.type === "dpo" && <div style={{ ...mono, fontSize: 10, color: "#2C6E80", marginTop: 3 }}>ДПО · скидка выпускника</div>}
                    <div style={{ ...mono, fontSize: 12, color: "#9B9584", marginTop: 5 }}>{rub(c.price)}</div>
                  </div>
                  {c.type === "merch" ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 9, flexShrink: 0 }}>
                      <button type="button" aria-label="Меньше" disabled={setQty.isPending} onClick={() => setQty.mutate({ ref_id: c.ref_id, variant_sku: c.variant_sku, qty: c.qty - 1 })} style={{ width: 28, height: 28, borderRadius: 9, border: "1px solid #E4DCCC", background: "#fff", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>–</button>
                      <span style={{ ...mono, fontSize: 13, minWidth: 14, textAlign: "center" }}>{c.qty}</span>
                      <button type="button" aria-label="Больше" disabled={setQty.isPending || c.qty >= 99} onClick={() => setQty.mutate({ ref_id: c.ref_id, variant_sku: c.variant_sku, qty: c.qty + 1 })} style={{ width: 28, height: 28, borderRadius: 9, border: "1px solid #E4DCCC", background: "#fff", cursor: "pointer", fontSize: 15, lineHeight: 1 }}>+</button>
                    </div>
                  ) : (
                    <button type="button" aria-label="Убрать" disabled={setQty.isPending} onClick={() => setQty.mutate({ ref_id: c.ref_id, variant_sku: c.variant_sku, qty: 0 })} style={{ background: "none", border: "none", color: "#C9450E", cursor: "pointer", fontSize: 16, flexShrink: 0 }}>✕</button>
                  )}
                </div>
              ))}
            </div>
            <div style={{ ...CARD, borderRadius: 16, padding: "15px 16px", display: "flex", flexDirection: "column", gap: 9 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, color: "#3a3f49" }}><span>Подытог</span><span style={mono}>{rub(subtotal)}</span></div>
              {discAmt > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, color: "#2C6E80" }}><span>Скидка выпускника −{discount}% (ДПО)</span><span style={mono}>−{rub(discAmt)}</span></div>}
              <div style={{ height: 1, background: "#F0E9DC", margin: "2px 0" }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><span style={{ ...disp, fontWeight: 700, fontSize: 15 }}>Итого</span><span style={{ ...disp, fontWeight: 800, fontSize: 19, color: "#EC5A13" }}>{rub(total)}</span></div>
              <div style={{ ...mono, fontSize: 9.5, color: "#9B9584", marginTop: 2 }}>Оценочно. С вами свяжется менеджер учебного офиса.</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              <div style={{ ...mono, fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "#9B9584" }}>Контакты</div>
              <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={form.website} onChange={(e) => set("website", e.target.value)} style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }} />
              <CartField label="ФИО" value={form.fio} onChange={(v) => set("fio", v)} />
              <CartField label="Телефон" value={form.phone} onChange={(v) => set("phone", v)} />
              <CartField label="E-mail" type="email" value={form.email} onChange={(v) => set("email", v)} />
              <div style={{ display: "flex", gap: 9 }}>
                {(["pickup", "delivery"] as const).map((f) => (
                  <button type="button" key={f} onClick={() => set("fulfillment", f)} style={{ flex: 1, height: 46, borderRadius: 13, cursor: "pointer", fontFamily: "'Onest'", fontWeight: 600, fontSize: 13.5, border: "1.5px solid " + (form.fulfillment === f ? "#EC5A13" : "#E4DCCC"), background: "#fff", color: INK }}>{f === "pickup" ? "Самовывоз" : "Доставка"}</button>
                ))}
              </div>
              {form.fulfillment === "delivery" && <CartField label="Адрес доставки" value={form.address} onChange={(v) => set("address", v)} />}
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 12.5, color: "#3a3f49", lineHeight: 1.45, marginTop: 2, cursor: "pointer" }}>
                <input type="checkbox" checked={form.consent} onChange={(e) => set("consent", e.target.checked)} required style={{ width: 20, height: 20, margin: 0, flexShrink: 0, accentColor: "#EC5A13" }} />
                <span>Согласен на обработку персональных данных согласно <Link to="/privacy" target="_blank" style={{ color: "#C9450E" }}>политике</Link> (152-ФЗ).</span>
              </label>
            </div>
            <button type="submit" disabled={busy || !form.consent} style={{ ...primaryBtn, height: 54, opacity: busy || !form.consent ? 0.6 : 1 }}>{busy ? "Отправляем…" : "Отправить заявку"}</button>
          </form>
        )}
      </div>
    </div>
  );
}
