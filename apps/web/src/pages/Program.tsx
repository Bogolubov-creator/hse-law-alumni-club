import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import SiteShell, { DiscountBadge } from "../components/SiteShell.js";
import { FORMAT_LABEL, rub, type ProgramModule, type ProgramTeacher } from "../lib/api.js";
import { useProgram, useMemberDiscount, useCartMutations } from "../lib/cart.js";
import { useToast } from "../components/Toast.js";
import { useHead } from "../lib/title.js";
import { useJsonLd, siteOrigin } from "../lib/jsonld.js";

const AVATAR_BG = ["linear-gradient(135deg,#EC5A13,#B5331B)", "linear-gradient(135deg,#11296B,#2E6FAE)", "linear-gradient(135deg,#2C6E80,#11296B)", "linear-gradient(135deg,#C49A45,#E3C272)"];

export default function Program() {
  const { slug = "" } = useParams();
  const q = useProgram(slug);
  const discount = useMemberDiscount();
  const { add } = useCartMutations();
  const toast = useToast();
  const [openM, setOpenM] = useState(0);
  const p = q.data;
  // Та же математика, что на сервере (order-calc): вычитаем округлённую скидку в копейках.
  const priced = p ? p.price - Math.round((p.price * discount) / 100) : 0;
  const modules: ProgramModule[] = Array.isArray(p?.modules) ? p!.modules : [];
  const teachers: ProgramTeacher[] = Array.isArray(p?.teachers) ? p!.teachers : [];
  const totalHours = modules.reduce((s, m) => s + (m.hours ?? 0), 0);

  useHead({
    title: q.isError ? "Программа не найдена" : p?.title ?? "Программа ДПО",
    description: p?.description
      ?? (p ? `${p.title}: программа ДПО факультета права НИУ ВШЭ. ${p.duration ?? ""}. Цена выпускника.` : null),
    canonical: `${typeof window !== "undefined" ? window.location.origin : ""}/dpo/${slug}`,
    // Несуществующий слаг: статус остаётся 200 (SPA), закрываем от индексации мета-тегом.
    noindex: q.isError,
  });
  useJsonLd(
    p && {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Course",
          name: p.title,
          description: p.description ?? undefined,
          url: `${siteOrigin()}/dpo/${p.slug}`,
          inLanguage: "ru-RU",
          provider: { "@type": "EducationalOrganization", name: "НИУ «Высшая школа экономики»", url: "https://pravo.hse.ru" },
          offers: {
            "@type": "Offer",
            category: "Paid",
            price: p.price / 100, // база, без скидки выпускника
            priceCurrency: "RUB",
            url: p.source_url ?? `${siteOrigin()}/dpo/${p.slug}`,
            availability: p.enrollment === "nonactual" ? "https://schema.org/SoldOut" : "https://schema.org/InStock",
          },
          hasCourseInstance: {
            "@type": "CourseInstance",
            courseMode: p.format === "online" ? "Online" : "Onsite",
            ...(totalHours > 0 ? { courseWorkload: `PT${totalHours}H` } : {}),
          },
        },
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Витрина ДПО", item: `${siteOrigin()}/dpo` },
            { "@type": "ListItem", position: 2, name: p.title, item: `${siteOrigin()}/dpo/${p.slug}` },
          ],
        },
      ],
    },
  );

  const navigate = useNavigate();
  const addToCart = () => p && add.mutate({ type: "dpo", ref_id: p.slug }, { onSuccess: () => toast(`«${p.title}» в корзине`), onError: () => toast("Не удалось добавить", "err") });
  // «Оставить заявку» = добавить и сразу перейти к оформлению.
  const leaveRequest = () => p && add.mutate({ type: "dpo", ref_id: p.slug }, { onSuccess: () => navigate("/cart"), onError: () => toast("Не удалось добавить", "err") });

  return (
    <SiteShell>
      <main className="mx-auto max-w-[1180px] px-7 py-12">
        <div className="font-mono text-xs text-grafit-soft">
          <Link to="/dpo" className="foc text-ohra-deep">Витрина ДПО</Link>{p ? <> / {p.direction}</> : null}
        </div>
        {q.isLoading && <p className="mt-8 font-mono text-sm text-grafit-soft">Загрузка…</p>}
        {q.isError && <p className="mt-8 font-mono text-sm text-karmin">Программа не найдена.</p>}
        {p && (
          <div className="mt-6 grid grid-cols-[1.5fr_1fr] gap-10 max-md:grid-cols-1">
            {/* LEFT */}
            <div>
              <div className="font-mono text-[11px] uppercase tracking-wide text-ohra-deep">{p.direction}</div>
              <h1 className="mt-2 font-display text-3xl font-bold leading-tight tracking-tight">{p.title}</h1>
              <div className="mt-4 flex flex-wrap gap-2">
                <Tag>{FORMAT_LABEL[p.format] ?? p.format}</Tag>
                <Tag>{p.duration}</Tag>
                {totalHours > 0 && <Tag>{totalHours} ак. ч.</Tag>}
                {p.enrollment === "nonactual" && <span className="rounded-full bg-[rgba(107,114,128,.14)] px-3 py-1.5 font-mono text-[12px] text-grafit-soft">набор закрыт</span>}
              </div>
              {p.description && (
                <div className="mt-7">
                  <h2 className="font-display text-lg font-semibold">О программе</h2>
                  <p className="mt-3 leading-relaxed text-[#3a3f49]">{p.description}</p>
                </div>
              )}

              {modules.length > 0 && (
                <div className="mt-8">
                  <h2 className="font-display text-lg font-semibold">Программа курса</h2>
                  <div className="mt-1 font-mono text-[12px] text-grafit-soft">{modules.length} {modules.length === 1 ? "модуль" : modules.length < 5 ? "модуля" : "модулей"}{totalHours > 0 && ` · ${totalHours} ак. ч.`}</div>
                  <div className="mt-3 flex flex-col gap-2">
                    {modules.map((m, i) => {
                      const open = openM === i;
                      return (
                        <div key={i} className="overflow-hidden rounded-[14px] border border-[#E5E7EB] bg-white">
                          <button onClick={() => setOpenM(open ? -1 : i)} aria-expanded={open} className="foc flex w-full items-center gap-3 px-4 py-3.5 text-left">
                            <span className="flex h-7 w-7 flex-none items-center justify-center rounded-[8px] bg-kost-2 font-mono text-[12px] font-semibold text-hse-blue">{i + 1}</span>
                            <span className="flex-1 font-semibold leading-tight">{m.title}</span>
                            {m.hours ? <span className="font-mono text-[12px] text-grafit-soft">{m.hours} ч.</span> : null}
                            <span className={`font-mono text-grafit-soft transition-transform ${open ? "rotate-180" : ""}`}>⌄</span>
                          </button>
                          {open && m.points && m.points.length > 0 && (
                            <ul className="border-t border-[#f0ece2] px-5 py-3.5 pl-14">
                              {m.points.map((pt, j) => <li key={j} className="list-disc py-0.5 text-sm text-[#3a3f49] marker:text-ohra">{pt}</li>)}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {teachers.length > 0 && (
                <div className="mt-8">
                  <h2 className="font-display text-lg font-semibold">Преподаватели</h2>
                  <div className="mt-3 grid grid-cols-2 gap-3 max-sm:grid-cols-1">
                    {teachers.map((t, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-[14px] border border-[#E5E7EB] bg-white p-4">
                        <div className="flex h-12 w-12 flex-none items-center justify-center rounded-[12px] font-display text-lg font-extrabold text-kost" style={{ background: AVATAR_BG[i % AVATAR_BG.length] }}>{t.name.trim()[0]?.toUpperCase()}</div>
                        <div className="min-w-0">
                          <div className="font-semibold leading-tight">{t.name}</div>
                          {t.role && <div className="font-mono text-[12px] text-grafit-soft">{t.role}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT — sticky */}
            <aside className="h-fit max-md:order-first md:sticky md:top-[82px]">
              <div className="overflow-hidden rounded-[18px] border border-[#E5E7EB] bg-white">
                <div className="flex h-2"><i className="flex-1 bg-ohra" /><i className="flex-1 bg-hse-blue" /><i className="flex-1 bg-latun" /><i className="flex-1 bg-stal" /><i className="flex-1 bg-karmin" /></div>
                <div className="p-6">
                  {/* Скидка выпускника действует на все программы ДПО, включая ВШЭ. */}
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-2xl font-medium">{rub(priced)}</span>
                    {discount > 0 && <span className="font-mono text-sm text-grafit-soft line-through">{rub(p.price)}</span>}
                  </div>
                  {discount > 0 ? <div className="mt-2"><DiscountBadge percent={discount} /></div> : null}
                  <p className="mt-2 font-mono text-[11px] text-grafit-soft">
                    {p.source_url ? "Цена выпускника · запись и оплата на hse.ru" : "Цена выпускника · применяется после верификации в ЛК"}
                  </p>

                  <dl className="mt-5 divide-y divide-[#f0ece2] border-y border-[#f0ece2] font-mono text-[13px]">
                    {p.dates?.start && <Fact k="Старт" v={p.dates.start} />}
                    <Fact k="Длительность" v={p.duration} />
                    <Fact k="Формат" v={FORMAT_LABEL[p.format] ?? p.format} />
                    {totalHours > 0 && <Fact k="Объём" v={`${totalHours} ак. ч.`} />}
                    {p.document && <Fact k="Документ" v={p.document} />}
                  </dl>

                  {p.enrollment === "nonactual" ? (
                    <>
                      <div className="mt-5 w-full rounded-[12px] bg-kost-2 py-3.5 text-center font-semibold text-grafit-soft">Набор закрыт</div>
                      {p.source_url && <a href={p.source_url} target="_blank" rel="noopener noreferrer" className="foc mt-2 block w-full rounded-[12px] border border-[#E5E7EB] py-3 text-center font-semibold text-grafit-soft">Страница на hse.ru →</a>}
                      <p className="mt-3 font-mono text-[11px] leading-relaxed text-grafit-soft">Набор на эту программу завершён. Следите за новым набором — каталог обновляется с hse.ru автоматически.</p>
                    </>
                  ) : p.source_url ? (
                    <>
                      {/* Программа ВШЭ: маршрутизация на маркетплейс, касса сайта не участвует */}
                      <a href={p.source_url} target="_blank" rel="noopener noreferrer" className="foc mt-5 block w-full rounded-[12px] bg-hse-blue py-3.5 text-center font-semibold text-kost">Записаться на hse.ru →</a>
                      <p className="mt-3 font-mono text-[11px] leading-relaxed text-grafit-soft">Запись и оплата — на официальном маркетплейсе ДПО НИУ ВШЭ. Скидка выпускника действует на все программы ДПО.</p>
                    </>
                  ) : (
                    <>
                      <button disabled={add.isPending} onClick={addToCart} className="foc mt-5 w-full rounded-[12px] bg-hse-blue py-3.5 font-semibold text-kost disabled:opacity-60">В корзину</button>
                      <button disabled={add.isPending} onClick={leaveRequest} className="foc mt-2 w-full rounded-[12px] border border-[#E5E7EB] py-3 font-semibold">Оставить заявку</button>
                      <p className="mt-3 font-mono text-[11px] leading-relaxed text-grafit-soft">Программа клуба выпускников: оформление ведёт к заявке — менеджер свяжется с вами.</p>
                    </>
                  )}
                </div>
              </div>
            </aside>
          </div>
        )}
      </main>
    </SiteShell>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-kost-2 px-3 py-1.5 font-mono text-[12px] text-grafit-soft">{children}</span>;
}
function Fact({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-4 py-2.5"><dt className="text-grafit-soft">{k}</dt><dd className="text-right font-medium text-grafit">{v}</dd></div>;
}
