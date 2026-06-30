import { Link, useParams } from "react-router-dom";
import SiteShell, { DiscountBadge } from "../components/SiteShell.js";
import { FORMAT_LABEL, rub } from "../lib/api.js";
import { useProgram, useMemberDiscount, useCartMutations } from "../lib/cart.js";
import { useToast } from "../components/Toast.js";

export default function Program() {
  const { slug = "" } = useParams();
  const q = useProgram(slug);
  const discount = useMemberDiscount();
  const { add } = useCartMutations();
  const toast = useToast();
  const p = q.data;
  const priced = p ? Math.round((p.price * (100 - discount)) / 100 / 100) * 100 : 0;
  const modules = Array.isArray(p?.modules) ? (p!.modules as string[]) : [];
  const teachers = Array.isArray(p?.teachers) ? (p!.teachers as { name: string; role?: string }[]) : [];

  return (
    <SiteShell>
      <main className="mx-auto max-w-[900px] px-7 py-12">
        <Link to="/dpo" className="foc font-mono text-xs text-ohra-deep">← Витрина ДПО</Link>
        {q.isLoading && <p className="mt-8 font-mono text-sm text-grafit-soft">Загрузка…</p>}
        {q.isError && <p className="mt-8 font-mono text-sm text-karmin">Программа не найдена.</p>}
        {p && (
          <div className="mt-6 grid grid-cols-[1.5fr_1fr] gap-8 max-md:grid-cols-1">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-wide text-ohra-deep">{p.direction}</div>
              <h1 className="mt-2 font-display text-3xl font-bold leading-tight tracking-tight">{p.title}</h1>
              <div className="mt-3 font-mono text-[13px] text-grafit-soft">{FORMAT_LABEL[p.format] ?? p.format} · {p.duration}</div>
              {p.description && <p className="mt-5 leading-relaxed text-[#3a3f49]">{p.description}</p>}
              {modules.length > 0 && (
                <div className="mt-7">
                  <h2 className="font-display text-lg font-semibold">Программа</h2>
                  <ul className="mt-3 space-y-2">{modules.map((m, i) => <li key={i} className="rounded-soft border border-[#E5E7EB] bg-white px-4 py-3 text-sm">{m}</li>)}</ul>
                </div>
              )}
              {teachers.length > 0 && (
                <div className="mt-7">
                  <h2 className="font-display text-lg font-semibold">Преподаватели</h2>
                  <div className="mt-3 space-y-2">{teachers.map((t, i) => <div key={i} className="text-sm"><b>{t.name}</b>{t.role ? ` – ${t.role}` : ""}</div>)}</div>
                </div>
              )}
            </div>
            <aside className="h-fit rounded-[18px] border border-[#E5E7EB] bg-white p-6 max-md:order-first">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-2xl font-medium">{rub(priced)}</span>
                {discount > 0 && <span className="font-mono text-sm text-grafit-soft line-through">{rub(p.price)}</span>}
              </div>
              {discount > 0 && <div className="mt-2"><DiscountBadge percent={discount} /></div>}
              <button disabled={add.isPending} onClick={() => add.mutate({ type: "dpo", ref_id: p.slug }, { onSuccess: () => toast(`«${p.title}» в корзине`), onError: () => toast("Не удалось добавить", "err") })} className="foc mt-4 w-full rounded-[12px] bg-ohra py-3.5 font-semibold text-kost disabled:opacity-60">В корзину</button>
              <p className="mt-3 font-mono text-[11px] leading-relaxed text-grafit-soft">Оплаты нет – оформление ведёт к заявке, офис свяжется с вами.</p>
            </aside>
          </div>
        )}
      </main>
    </SiteShell>
  );
}
