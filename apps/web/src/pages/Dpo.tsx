import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useHead } from "../lib/title.js";
import SiteShell, { DiscountBadge } from "../components/SiteShell.js";
import { FORMAT_LABEL, rub, type Program } from "../lib/api.js";
import { usePrograms, useMemberDiscount, useCartMutations } from "../lib/cart.js";
import { useToast } from "../components/Toast.js";

type Sort = "default" | "cheap" | "pricey";

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export default function Dpo() {
  const programs = usePrograms();
  const discount = useMemberDiscount();
  const { add } = useCartMutations();
  const toast = useToast();
  useHead({ title: "Программы ДПО со скидкой выпускника", description: "Каталог программ дополнительного образования факультета права НИУ ВШЭ. Цена выпускника применяется автоматически после верификации.", canonical: `${typeof window !== "undefined" ? window.location.origin : ""}/dpo` });
  // Фильтры живут в URL – подборкой можно поделиться ссылкой.
  const [params, setParams] = useSearchParams();
  const [dir, setDir] = useState<string | null>(params.get("dir"));
  const [fmt, setFmt] = useState<string | null>(params.get("fmt"));
  const [dur, setDur] = useState<string | null>(params.get("dur"));
  const [sort, setSort] = useState<Sort>((params.get("sort") as Sort) || "default");
  const [q, setQ] = useState(params.get("q") ?? "");
  // Как на hse.ru: «Актуальный набор» отдельно от полного каталога.
  const [showAll, setShowAll] = useState(params.get("all") === "1");

  useEffect(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (dir) p.set("dir", dir);
    if (fmt) p.set("fmt", fmt);
    if (dur) p.set("dur", dur);
    if (sort !== "default") p.set("sort", sort);
    if (showAll) p.set("all", "1");
    setParams(p, { replace: true });
  }, [q, dir, fmt, dur, sort, showAll, setParams]);

  const catalog = programs.data ?? [];
  const actualCount = catalog.filter((p) => p.enrollment !== "nonactual").length;
  const all = showAll ? catalog : catalog.filter((p) => p.enrollment !== "nonactual");
  const directions = useMemo(() => [...new Set(all.map((p) => p.direction).filter(Boolean))], [all]);
  const formats = useMemo(() => [...new Set(all.map((p) => p.format).filter(Boolean))], [all]);
  const durations = useMemo(() => [...new Set(all.map((p) => p.duration).filter(Boolean))].sort(), [all]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const f = all.filter((p) =>
      (!dir || p.direction === dir) && (!fmt || p.format === fmt) && (!dur || p.duration === dur)
      && (!needle || `${p.title} ${p.direction}`.toLowerCase().includes(needle)));
    if (sort === "cheap") return [...f].sort((a, b) => a.price - b.price);
    if (sort === "pricey") return [...f].sort((a, b) => b.price - a.price);
    return f;
  }, [all, dir, fmt, dur, sort, q]);

  const hasFilter = !!(dir || fmt || dur || q.trim());
  const reset = () => { setDir(null); setFmt(null); setDur(null); setQ(""); };
  // Та же математика, что на сервере (order-calc): вычитаем округлённую скидку в копейках.
  const priced = (p: Program) => p.price - Math.round((p.price * discount) / 100);

  return (
    <SiteShell>
      <main id="main" className="mx-auto max-w-[1180px] px-7 py-12">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-ohra">Витрина · ДПО</p>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight">Программы по праву со скидкой выпускника</h1>
        <p className="mt-3 max-w-[600px] text-grafit-soft">Каталог программ дополнительного образования факультета права. Цена выпускника применяется автоматически после верификации в личном кабинете.</p>

        {/* НАБОР: актуальный / все (как на hse.ru) */}
        <div className="mt-7 flex flex-wrap gap-2">
          <button onClick={() => setShowAll(false)} className={`foc rounded-[11px] px-4 py-2.5 text-sm font-semibold ${!showAll ? "bg-hse-blue text-kost" : "border border-[#7C828C] bg-white"}`}>Актуальный набор · {actualCount}</button>
          <button onClick={() => setShowAll(true)} className={`foc rounded-[11px] px-4 py-2.5 text-sm font-semibold ${showAll ? "bg-hse-blue text-kost" : "border border-[#7C828C] bg-white"}`}>Все программы · {catalog.length}</button>
        </div>

        {/* ПОИСК */}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск по названию или направлению…"
          aria-label="Поиск программ"
          className="foc mt-5 w-full max-w-[480px] rounded-[12px] border-[1.5px] border-[#E5E7EB] bg-white px-4 py-3 text-[15px] outline-none focus:border-ohra"
        />

        {/* FILTERS */}
        <div className="mt-5 flex flex-col gap-3">
          <FilterRow label="Направление">
            <Chip active={!dir} onClick={() => setDir(null)}>Все</Chip>
            {directions.map((d) => <Chip key={d} active={dir === d} onClick={() => setDir(dir === d ? null : d)}>{d}</Chip>)}
          </FilterRow>
          <FilterRow label="Формат">
            <Chip active={!fmt} onClick={() => setFmt(null)}>Любой</Chip>
            {formats.map((f) => <Chip key={f} active={fmt === f} onClick={() => setFmt(fmt === f ? null : f)}>{FORMAT_LABEL[f] ?? f}</Chip>)}
          </FilterRow>
          <FilterRow label="Длительность">
            <Chip active={!dur} onClick={() => setDur(null)}>Любая</Chip>
            {durations.map((d) => <Chip key={d} active={dur === d} onClick={() => setDur(dur === d ? null : d)}>{d}</Chip>)}
          </FilterRow>
        </div>

        {/* SORT + COUNT */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="font-mono text-[13px] text-grafit-soft">
            {programs.isLoading ? "Загрузка…" : <>Найдено: {list.length} {plural(list.length, "программа", "программы", "программ")}{hasFilter && <> · <button onClick={reset} className="foc underline hover:text-ohra-deep">сбросить фильтры</button></>}</>}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[12px] text-grafit-soft">Сортировка:</span>
            <SortBtn active={sort === "default"} onClick={() => setSort("default")}>По умолчанию</SortBtn>
            <SortBtn active={sort === "cheap"} onClick={() => setSort("cheap")}>Дешевле</SortBtn>
            <SortBtn active={sort === "pricey"} onClick={() => setSort("pricey")}>Дороже</SortBtn>
          </div>
        </div>

        {programs.isError && <p className="mt-8 font-mono text-sm text-karmin">Не удалось загрузить программы. Обновите страницу.</p>}

        {!programs.isLoading && list.length === 0 ? (
          <div className="mt-10 rounded-[18px] border border-[#7C828C] bg-white p-12 text-center">
            <div className="mx-auto h-12 w-12 rotate-45 rounded-[12px] bg-kost-2" />
            <h3 className="mt-5 font-display text-xl font-semibold">Под фильтры ничего не нашлось</h3>
            <p className="mt-2 text-grafit-soft">Попробуйте изменить направление, формат или длительность.</p>
            {hasFilter && <button onClick={reset} className="foc mt-5 rounded-[12px] bg-hse-blue px-6 py-3 font-semibold text-kost">Сбросить фильтры</button>}
          </div>
        ) : (
          <div className="two-col mt-7 grid grid-cols-3 gap-5">
            {list.map((p) => (
              <div key={p.id} className="flex flex-col overflow-hidden rounded-[18px] border border-[#7C828C] bg-white">
                <div className="flex h-2"><i className="flex-1 bg-ohra" /><i className="flex-1 bg-hse-blue" /><i className="flex-1 bg-latun" /><i className="flex-1 bg-stal" /></div>
                <div className="flex flex-1 flex-col p-5">
                  <div className="font-mono text-[11px] uppercase tracking-wide text-ohra-deep">{p.direction}</div>
                  <Link to={`/dpo/${p.slug}`} className="foc mt-2 font-display text-[17px] font-semibold leading-tight tracking-tight hover:text-ohra-deep">{p.title}</Link>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    <Tag>{FORMAT_LABEL[p.format] ?? p.format}</Tag>
                    <Tag>{p.duration}</Tag>
                    {p.enrollment === "nonactual" && <span className="rounded-full bg-[rgba(107,114,128,.14)] px-2.5 py-1 font-mono text-[11px] text-grafit-soft">набор закрыт</span>}
                  </div>
                  <div className="mt-auto pt-4">
                    {/* Скидка выпускника действует на все программы ДПО. Программы ВШЭ
                        (source_url) – запись на hse.ru; собственные – корзина сайта. */}
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-[19px] font-medium">{rub(priced(p))}</span>
                      {discount > 0 && <span className="font-mono text-[13px] text-grafit-soft line-through">{rub(p.price)}</span>}
                    </div>
                    {/* Скидку показываем ТОЛЬКО верифицированному выпускнику: гостю
                        цена выпускника не раскрывается (правило клуба). */}
                    {discount > 0 && <div className="mt-1"><DiscountBadge percent={discount} /></div>}
                    <div className="mt-3 flex gap-2">
                      <Link to={`/dpo/${p.slug}`} className="foc flex-1 rounded-[12px] border border-hse-blue py-3 text-center font-semibold text-hse-blue">Подробнее</Link>
                      {p.enrollment !== "nonactual" && (
                        p.source_url ? (
                          <a href={p.source_url} target="_blank" rel="noopener noreferrer" className="foc flex-1 rounded-[12px] bg-hse-blue py-3 text-center font-semibold text-kost">На hse.ru →</a>
                        ) : (
                          <button disabled={add.isPending} onClick={() => add.mutate({ type: "dpo", ref_id: p.slug }, { onSuccess: () => toast(`«${p.title}» в корзине`), onError: () => toast("Не удалось добавить", "err") })} className="foc flex-1 rounded-[12px] bg-hse-blue py-3 font-semibold text-kost disabled:opacity-60">В корзину</button>
                        )
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </SiteShell>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-[104px] flex-none font-mono text-[11px] uppercase tracking-wide text-grafit-soft">{label}</span>
      {children}
    </div>
  );
}
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`foc rounded-full border px-3.5 py-1.5 text-[13px] font-medium ${active ? "border-grafit bg-grafit text-kost" : "border-[#E5E7EB] bg-white"}`}>{children}</button>;
}
function SortBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`foc rounded-[9px] border px-3 py-1.5 text-[12px] font-medium ${active ? "border-ohra bg-ohra text-kost" : "border-[#E5E7EB] bg-white"}`}>{children}</button>;
}
function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-kost-2 px-2.5 py-1 font-mono text-[11px] text-grafit-soft">{children}</span>;
}
