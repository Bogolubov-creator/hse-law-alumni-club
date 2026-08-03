import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useHead } from "../lib/title.js";
import { rub, type CartLine, type OrderResult } from "../lib/api.js";
import { useCart, useMemberDiscount, useCartMutations, submitOrder } from "../lib/cart.js";
import { V2Shell, ShowcaseHead, mono, disp } from "../v2/Shell.js";
import { Mark } from "../v2/Mark.js";

/**
 * Корзина v2 (/v2/cart) – заявка в учебный офис на языке реестра.
 *
 * Режим смешанный и это осознанно: оболочка внешняя (V2Shell), потому что
 * корзина – часть публичного пути, а вот сама страница строгая, как опись:
 * движения нет, данные моноширинные, позиции разделяются линиями. На экране,
 * где человек оставляет свои контакты и деньги, украшения мешают.
 *
 * Логика заявки не переизобретается: те же хуки и тот же submitOrder, что и в
 * корзине v1, включая honeypot и правило «доставка только когда есть мерч».
 */

const label = {
  ...mono, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)",
  textTransform: "uppercase" as const, color: "var(--c-text-3)",
};

const field = {
  width: "100%", marginTop: 7, padding: "12px 14px", borderRadius: "var(--r-md)",
  border: "1px solid var(--c-line)", background: "var(--c-bg)", color: "var(--c-text)",
  fontSize: 15, fontFamily: "inherit",
};

const primary = {
  border: "none", background: "var(--c-accent)", color: "var(--c-on-accent)",
  borderRadius: "var(--r-md)", padding: "13px 22px", fontWeight: 600, fontSize: 15, cursor: "pointer",
};

const ghost = {
  border: "1px solid var(--c-line)", background: "transparent", color: "var(--c-text)",
  borderRadius: "var(--r-md)", padding: "13px 22px", fontWeight: 600, fontSize: 15,
  cursor: "pointer", textDecoration: "none", display: "inline-block",
};

/** Строка итога: подпись слева, число справа, разделитель – линия. */
function Total({ name, value, strong, tone }: { name: string; value: string; strong?: boolean; tone?: "ok" | "accent" }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, padding: strong ? "14px 0 0" : "9px 0", borderTop: strong ? "1px solid var(--c-line-strong)" : undefined }}>
      <span style={label}>{name}</span>
      <span style={{
        ...mono, fontWeight: strong ? 600 : 500, fontSize: strong ? 19 : 14,
        color: tone === "ok" ? "var(--c-ok-text)" : tone === "accent" ? "var(--c-accent-text)" : "var(--c-text)",
      }}>{value}</span>
    </div>
  );
}

function Field({ name, value, onChange, type = "text", required, ph }: {
  name: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; ph?: string;
}) {
  const id = useId();
  return (
    <div style={{ padding: "12px 0", borderTop: "1px solid var(--c-line)" }}>
      {/* Помечаем необязательное, а не обязательное: обязательных тут почти все,
          а звёздочка в Martian Mono рисуется снежинкой и читается как украшение. */}
      <label htmlFor={id} style={{ ...label, display: "block" }}>
        {name}{!required && <span style={{ textTransform: "none", letterSpacing: 0, opacity: 0.75 }}> · необязательно</span>}
      </label>
      <input id={id} type={type} required={required} value={value} placeholder={ph}
        onChange={(e) => onChange(e.target.value)} className="foc" style={field} />
    </div>
  );
}

function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ borderTop: "1px solid var(--c-line)", padding: "48px 0" }}>
      <h2 style={{ ...disp, fontWeight: 600, fontSize: "var(--t-h3)", margin: 0 }}>{title}</h2>
      {children}
    </div>
  );
}

/* ── Экран подтверждения ──────────────────────────────────────────── */

function Submitted({ result }: { result: OrderResult }) {
  return (
    <V2Shell>
      <main style={{ maxWidth: 620, margin: "0 auto", padding: "0 28px" }}>
        <div style={{ paddingTop: 64 }}>
          <Mark kind="scales" size={44} style={{ color: "var(--c-accent-text)" }} />
          <div style={{ ...label, color: "var(--c-ok-text)", marginTop: 20 }}>заявка принята</div>
          <h1 style={{ ...disp, fontWeight: 800, fontSize: "var(--t-h2)", lineHeight: 1.1, margin: "12px 0 0" }}>
            Учебный офис получил заявку
          </h1>

          {/* Номер – главные данные экрана, поэтому он крупный и моноширинный */}
          <div style={{ marginTop: 26, paddingTop: 16, borderTop: "1px solid var(--c-line-strong)" }}>
            <div style={label}>номер заявки</div>
            <div style={{ ...mono, fontSize: 28, fontWeight: 600, marginTop: 6, letterSpacing: "0.04em" }}>{result.number}</div>
          </div>

          <p style={{ margin: "20px 0 0", color: "var(--c-text-2)", fontSize: "var(--t-body)", lineHeight: 1.6 }}>
            Менеджер свяжется с вами по указанным контактам и подтвердит детали.
            {result.payment_url ? " Оплатить можно сразу, кнопкой ниже." : " Оплата – через учебный офис после подтверждения."}
          </p>

          {/* Уведомление офиса не прошло – это надо сказать, а не спрятать */}
          {!result.notified.ok && (
            <p role="alert" style={{ margin: "18px 0 0", padding: "14px 16px", borderRadius: "var(--r-md)", border: "1px solid var(--c-danger-text)", color: "var(--c-text-2)", fontSize: "var(--t-small)", lineHeight: 1.55 }}>
              Заявка сохранена, но автоматическое уведомление офиса не прошло. Продублируйте её в Telegram{" "}
              <a href="https://t.me/pravohse" target="_blank" rel="noopener noreferrer" className="foc" style={{ color: "var(--c-accent-text)", fontWeight: 600 }}>@pravohse</a> – так офис точно увидит заявку.
            </p>
          )}

          <div style={{ marginTop: 26 }}>
            <Total name="сумма (справочно)" value={rub(result.subtotal)} />
            {result.subtotal > result.total_estimate && (
              <Total name={`скидка выпускника (дпо) −${result.member_discount}%`} value={`−${rub(result.subtotal - result.total_estimate)}`} tone="ok" />
            )}
            <Total name="итого (оценочно)" value={rub(result.total_estimate)} strong />
          </div>

          {result.payment_url && (
            <a href={result.payment_url} className="foc" style={{ ...primary, display: "block", marginTop: 24, textAlign: "center", textDecoration: "none" }}>
              Оплатить через ЮKassa · {rub(result.total_estimate)}
            </a>
          )}

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18 }}>
            <Link to="/v2/lk" className="foc" style={{ ...ghost, borderColor: "var(--c-accent)" }}>В личный кабинет</Link>
            <Link to="/v2" className="foc" style={ghost}>На главную</Link>
          </div>
        </div>
      </main>
    </V2Shell>
  );
}

/* ── Корзина ──────────────────────────────────────────────────────── */

export default function CartV2() {
  useHead({ title: "Корзина", noindex: true });
  const cart = useCart();
  const discount = useMemberDiscount();
  const { setQty } = useCartMutations();
  const qc = useQueryClient();

  const [form, setForm] = useState({
    contact_fio: "", contact_phone: "", contact_email: "",
    fulfillment: "pickup" as "pickup" | "delivery",
    address: "", comment: "", consent: false, website: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<OrderResult | null>(null);

  const items = cart.data?.items ?? [];
  const subtotal = cart.data?.subtotal ?? 0;
  // Скидка выпускника – только на ДПО; мерч идёт по базовой цене.
  const dpoSubtotal = items.filter((i) => i.type === "dpo").reduce((s, i) => s + i.price * i.qty, 0);
  // Доставлять физически нечего, если в корзине одни программы: выбор способа
  // получения и обязательный адрес в этом случае только сбивают с толку.
  const hasShippable = items.some((i) => i.type === "merch");
  const discountAmount = Math.round((dpoSubtotal * discount) / 100);
  const total = subtotal - discountAmount;
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await submitOrder({
        contact_fio: form.contact_fio, contact_phone: form.contact_phone, contact_email: form.contact_email,
        fulfillment: hasShippable ? form.fulfillment : "pickup",
        address: hasShippable && form.fulfillment === "delivery" ? form.address || null : null,
        comment: form.comment || null,
        consent_pdn: form.consent,
        website: form.website, // honeypot – живой человек оставит поле пустым
      });
      setResult(res);
      qc.invalidateQueries({ queryKey: ["cart"] });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (result) return <Submitted result={result} />;

  return (
    <V2Shell>
      <main style={{ maxWidth: "var(--container)", margin: "0 auto", padding: "0 28px" }}>
        <ShowcaseHead
          eyebrow="корзина · заявка"
          title="Заявка в учебный офис"
          lead="Заявка не списывает деньги: менеджер подтвердит детали, а оплата пройдёт после подтверждения. Скидка выпускника применяется к программам ДПО автоматически."
          count={items.length ? `позиций ${items.length} · на сумму ${rub(total)}` : undefined}
        />

        {cart.isLoading && <p style={{ ...label, margin: 0, paddingTop: 20 }}>загружаем корзину…</p>}

        {cart.isError && (
          <Empty title="Корзина не загрузилась">
            <p style={{ margin: "10px 0 0", color: "var(--c-text-2)", fontSize: "var(--t-body)" }}>Проверьте соединение и попробуйте ещё раз.</p>
            <button onClick={() => cart.refetch()} className="foc" style={{ ...primary, marginTop: 18 }}>Повторить</button>
          </Empty>
        )}

        {!cart.isLoading && !cart.isError && items.length === 0 && (
          <Empty title="В корзине пока пусто">
            <p style={{ margin: "10px 0 0", color: "var(--c-text-2)", fontSize: "var(--t-body)", maxWidth: 520, lineHeight: 1.55 }}>
              Выберите программу ДПО – цена выпускника применится сама – или одежду клуба.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 20 }}>
              <Link to="/v2/dpo" className="foc" style={{ ...primary, textDecoration: "none", display: "inline-block" }}>Программы ДПО</Link>
              <Link to="/v2/merch" className="foc" style={ghost}>Одежда клуба</Link>
            </div>
          </Empty>
        )}

        {items.length > 0 && (
          <div className="v2-cart" style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 32, alignItems: "start" }}>
            {/* ── Позиции как записи описи ── */}
            <div>
              {items.map((it: CartLine) => (
                <article key={`${it.ref_id}-${it.variant_sku ?? ""}`} className="v2-cart-row"
                  style={{ display: "grid", gridTemplateColumns: "72px 1fr auto auto 32px", gap: 16, alignItems: "center", padding: "16px 0", borderTop: "1px solid var(--c-line)" }}>
                  <span style={{ ...label, color: it.type === "dpo" ? "var(--c-anchor)" : "var(--c-accent-text)" }}>
                    {it.type === "dpo" ? "дпо" : "мерч"}
                  </span>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "var(--t-body)", fontWeight: 500, lineHeight: 1.3 }}>{it.title}</div>
                    {it.variant_sku && <div style={{ ...label, fontSize: 10, marginTop: 4 }}>{it.variant_sku}</div>}
                  </div>

                  {it.type === "dpo" ? (
                    <span style={{ ...label, fontSize: 10 }}>1 место</span>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <button aria-label={`Уменьшить количество: ${it.title}`} disabled={setQty.isPending}
                        onClick={() => setQty.mutate({ ref_id: it.ref_id, variant_sku: it.variant_sku, qty: it.qty - 1 })}
                        className="foc" style={{ width: 32, height: 32, borderRadius: "var(--r-sm)", border: "1px solid var(--c-line)", background: "transparent", color: "var(--c-text)", cursor: "pointer", fontSize: 16 }}>−</button>
                      <span aria-live="polite" style={{ ...mono, minWidth: 24, textAlign: "center", fontSize: 15 }}>{it.qty}</span>
                      <button aria-label={`Увеличить количество: ${it.title}`} disabled={setQty.isPending || it.qty >= 99}
                        onClick={() => setQty.mutate({ ref_id: it.ref_id, variant_sku: it.variant_sku, qty: it.qty + 1 })}
                        className="foc" style={{ width: 32, height: 32, borderRadius: "var(--r-sm)", border: "1px solid var(--c-line)", background: "transparent", color: "var(--c-text)", cursor: "pointer", fontSize: 16 }}>+</button>
                    </div>
                  )}

                  <span style={{ ...mono, fontSize: 15, fontWeight: 500, whiteSpace: "nowrap" }}>{rub(it.price * it.qty)}</span>

                  <button aria-label={`Убрать из корзины: ${it.title}`} disabled={setQty.isPending}
                    onClick={() => setQty.mutate({ ref_id: it.ref_id, variant_sku: it.variant_sku, qty: 0 })}
                    className="foc" style={{ width: 32, height: 32, borderRadius: "var(--r-sm)", border: "1px solid var(--c-line)", background: "transparent", color: "var(--c-text-2)", cursor: "pointer" }}>✕</button>
                </article>
              ))}

              <div style={{ marginTop: 26, paddingTop: 4 }}>
                <Total name="подытог" value={rub(subtotal)} />
                {discountAmount > 0 && <Total name={`скидка выпускника (дпо) −${discount}%`} value={`−${rub(discountAmount)}`} tone="ok" />}
                <Total name="итого (справочно)" value={rub(total)} strong />
              </div>
            </div>

            {/* ── Форма заявки ── */}
            <form onSubmit={submit} style={{ border: "1px solid var(--c-line)", borderRadius: "var(--r-lg)", background: "var(--c-bg-raised)", padding: 22 }}>
              <h2 style={{ ...disp, fontWeight: 600, fontSize: "var(--t-h3)", margin: 0 }}>Ваши контакты</h2>
              <p style={{ margin: "8px 0 14px", color: "var(--c-text-3)", fontSize: "var(--t-small)", lineHeight: 1.5 }}>
                По ним менеджер подтвердит заявку.
              </p>

              {/* Honeypot: убран за экран и от скринридеров; боты заполняют – заявка отклоняется */}
              <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true"
                value={form.website} onChange={(e) => set("website", e.target.value)}
                style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />

              <Field name="фио" value={form.contact_fio} onChange={(v) => set("contact_fio", v)} required ph="Имя Фамилия" />
              <Field name="телефон" type="tel" value={form.contact_phone} onChange={(v) => set("contact_phone", v)} required ph="+7 ___ ___-__-__" />
              <Field name="почта" type="email" value={form.contact_email} onChange={(v) => set("contact_email", v)} required ph="you@mail.ru" />

              {hasShippable && (
                <div style={{ padding: "12px 0", borderTop: "1px solid var(--c-line)" }}>
                  <div style={label}>получение</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    {(["pickup", "delivery"] as const).map((f) => {
                      const on = form.fulfillment === f;
                      return (
                        <button type="button" key={f} onClick={() => set("fulfillment", f)} aria-pressed={on} className="foc"
                          style={{
                            ...mono, flex: 1, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)", textTransform: "uppercase",
                            padding: "10px 8px", borderRadius: "var(--r-sm)", cursor: "pointer",
                            border: `1px solid ${on ? "var(--c-accent)" : "var(--c-line)"}`,
                            background: on ? "var(--c-accent)" : "transparent",
                            color: on ? "var(--c-on-accent)" : "var(--c-text-2)",
                          }}>
                          {f === "pickup" ? "самовывоз" : "доставка"}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {hasShippable && form.fulfillment === "delivery" && (
                <Field name="адрес доставки" value={form.address} onChange={(v) => set("address", v)} required ph="город, улица, дом, квартира" />
              )}
              <Field name="комментарий" value={form.comment} onChange={(v) => set("comment", v)} ph="если есть что уточнить" />

              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, marginTop: 14, cursor: "pointer", fontSize: "var(--t-small)", lineHeight: 1.5, color: "var(--c-text-2)" }}>
                <input type="checkbox" checked={form.consent} required onChange={(e) => set("consent", e.target.checked)}
                  style={{ marginTop: 3, width: 17, height: 17, flexShrink: 0, accentColor: "var(--c-accent)" }} />
                <span>
                  Даю согласие на обработку персональных данных в соответствии с{" "}
                  <Link to="/privacy" target="_blank" className="foc" style={{ color: "var(--c-accent-text)", textDecoration: "underline", textUnderlineOffset: 2 }}>политикой обработки</Link>
                </span>
              </label>

              {err && <p role="alert" style={{ ...mono, margin: "12px 0 0", fontSize: "var(--t-caption)", color: "var(--c-danger-text)" }}>{err}</p>}

              {/* Недоступная кнопка становится нейтральной, а не бледно-охряной:
                  полупрозрачная охра читалась как активная и роняла контраст текста. */}
              <button type="submit" disabled={busy || !form.consent} className="foc"
                style={{
                  ...primary, width: "100%", marginTop: 16,
                  ...(busy || !form.consent
                    ? { background: "transparent", color: "var(--c-text-3)", border: "1px solid var(--c-line)", cursor: busy ? "wait" : "not-allowed" }
                    : {}),
                }}>
                {busy ? "Отправляем…" : form.consent ? "Оформить заявку" : "Нужно согласие на обработку данных"}
              </button>
              <p style={{ ...label, fontSize: 10, textTransform: "none", letterSpacing: 0, margin: "10px 0 0", lineHeight: 1.5 }}>
                Деньги сейчас не списываются.
              </p>
            </form>
          </div>
        )}
      </main>
    </V2Shell>
  );
}
