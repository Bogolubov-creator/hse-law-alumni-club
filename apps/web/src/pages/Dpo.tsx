import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SiteShell, { DiscountBadge } from "../components/SiteShell.js";
import { FORMAT_LABEL, rub, type Program } from "../lib/api.js";
import { usePrograms, useMemberDiscount, useCartMutations } from "../lib/cart.js";

export default function Dpo() {
  const programs = usePrograms();
  const discount = useMemberDiscount();
  const { add } = useCartMutations();
  const [dir, setDir] = useState<string | null>(null);
  const [fmt, setFmt] = useState<string | null>(null);

  const directions = useMemo(() => [...new Set((programs.data ?? []).map((p) => p.direction).filter(Boolean))], [programs.data]);
  const list = (programs.data ?? []).filter((p) => (!dir || p.direction === dir) && (!fmt || p.format === fmt));

  const priced = (p: Program) => Math.round((p.price * (100 - discount)) / 100 / 100) * 100;

  return (
    <SiteShell>
      <main className="mx-auto max-w-[1180px] px-7 py-12">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-ohra">Витрина ДПО</p>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight">Программы доп. образования</h1>
        <p className="mt-3 max-w-[560px] text-grafit-soft">Цена выпускника со скидкой по уровню. Оформление ведёт к заявке — оплату ведёт учебный офис.</p>

        <div className="mt-7 flex flex-wrap gap-2">
          <Chip active={!dir && !fmt} onClick={() => { setDir(null); setFmt(null); }}>Все</Chip>
          {directions.map((d) => <Chip key={d} active={dir === d} onClick={() => setDir(dir === d ? null : d)}>{d}</Chip>)}
          {(["online", "offline", "blended"] as const).map((f) => <Chip key={f} active={fmt === f} onClick={() => setFmt(fmt === f ? null : f)}>{FORMAT_LABEL[f]}</Chip>)}
        </div>

        {programs.isLoading && <p className="mt-8 font-mono text-sm text-grafit-soft">Загрузка…</p>}
        <div className="two-col mt-7 grid grid-cols-3 gap-5">
          {list.map((p) => (
            <div key={p.id} className="flex flex-col overflow-hidden rounded-[18px] border border-[#E5E7EB] bg-white">
              <div className="flex h-2"><i className="flex-1 bg-ohra" /><i className="flex-1 bg-hse-blue" /><i className="flex-1 bg-latun" /><i className="flex-1 bg-stal" /></div>
              <div className="flex flex-1 flex-col p-5">
                <div className="font-mono text-[11px] uppercase tracking-wide text-ohra-deep">{p.direction}</div>
                <Link to={`/dpo/${p.slug}`} className="foc mt-2 font-display text-[17px] font-semibold leading-tight tracking-tight hover:text-ohra-deep">{p.title}</Link>
                <div className="mt-2.5 font-mono text-[12px] text-grafit-soft">{FORMAT_LABEL[p.format] ?? p.format} · {p.duration}</div>
                <div className="mt-auto pt-4">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[19px] font-medium">{rub(priced(p))}</span>
                    {discount > 0 && <span className="font-mono text-[13px] text-grafit-soft line-through">{rub(p.price)}</span>}
                  </div>
                  {discount > 0 && <div className="mt-1"><DiscountBadge percent={discount} /></div>}
                  <button onClick={() => add.mutate({ type: "dpo", ref_id: p.slug })} className="foc mt-3 w-full rounded-[12px] bg-hse-blue py-3 font-semibold text-kost">В корзину</button>
                </div>
              </div>
            </div>
          ))}
        </div>
        {!programs.isLoading && list.length === 0 && <p className="mt-8 font-mono text-sm text-grafit-soft">Ничего не найдено.</p>}
      </main>
    </SiteShell>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`foc rounded-full border px-3.5 py-2 text-[13px] font-medium ${active ? "border-grafit bg-grafit text-kost" : "border-[#E5E7EB] bg-white"}`}>{children}</button>
  );
}
