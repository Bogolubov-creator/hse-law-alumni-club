import { programStart } from "../lib/program-date.js";
import { useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, FORMAT_LABEL, rub, type ProgramModule, type ProgramTeacher } from "../lib/api.js";
import { useProgram, useMemberDiscount, useCartMutations } from "../lib/cart.js";
import { useToast } from "../components/Toast.js";
import { useHead } from "../lib/title.js";
import { HeroPicture } from "../components/HeroPicture.js";
import { mediaUrl } from "../lib/public-url.js";
import { V2Shell, mono, disp, pageTitle } from "../v2/Shell.js";
import { action, actionGhost } from "../styles/primitives.js";

/**
 * Карточка программы ДПО v2 (/dpo/:slug).
 *
 * Язык реестра: модули – нумерованные записи с моно-колонкой слева, а не
 * гармошка из карточек; преподаватели – записи, а не плитки с градиентами.
 * Справа «бланк программы»: цена крупно, ниже поля с данными под чертой.
 *
 * Раскрытие модуля – смена состояния, а не анимация: в каталоге из двадцати
 * программ человек открывает модули десятками, и подпрыгивающая гармошка
 * начинает мешать (DESIGN.md, разрешение конфликта в пользу emil-design-eng).
 *
 * SEO: страница noindex, а canonical ведёт на v1 (/dpo/:slug) – контент тот же,
 * индексируется он там, и структурированные данные Course отдаёт та страница.
 * Дублировать разметку на превью нельзя: получились бы два Course на один курс.
 */

const label: CSSProperties = {
  ...mono, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)",
  textTransform: "none", color: "var(--c-text-3)",
};

/** Поле бланка: подпись слева, значение справа, разделитель – линия. */
function Fact({ name, value }: { name: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 14, padding: "10px 0", borderTop: "1px solid var(--c-line)" }}>
      <span style={label}>{name}</span>
      <span style={{ ...mono, fontSize: 13, fontWeight: 500, textAlign: "right" }}>{value}</span>
    </div>
  );
}

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export default function ProgramV2() {
  const { slug = "" } = useParams();
  const q = useProgram(slug);
  const discount = useMemberDiscount();
  const { add } = useCartMutations();
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(0);

  const p = q.data;
  const notFound = q.error instanceof ApiError && q.error.status === 404;
  // Та же математика, что на сервере (order-calc): округлённая скидка в копейках.
  const priced = p ? p.price - Math.round((p.price * discount) / 100) : 0;
  const modules: ProgramModule[] = Array.isArray(p?.modules) ? p!.modules : [];
  const teachers: ProgramTeacher[] = Array.isArray(p?.teachers) ? p!.teachers : [];
  const audience = Array.isArray(p?.audience) ? p!.audience : [];
  const results = Array.isArray(p?.results) ? p!.results : [];
  const advantages = Array.isArray(p?.advantages) ? p!.advantages : [];
  const totalHours = modules.reduce((s, m) => s + (m.hours ?? 0), 0);
  const coverSrc = p?.cover || "/assets/dpo-hero.jpg";
  const coverIsHeroFallback = !p?.cover;

  useHead({
    title: q.isError ? (notFound ? "Программа не найдена" : "Не удалось загрузить программу") : p?.title ?? "Программа ДПО",
    description: p?.description ?? (p ? `${p.title}: программа ДПО факультета права НИУ ВШЭ с ценой выпускника.` : null),
    canonical: `${typeof window !== "undefined" ? window.location.origin : ""}/dpo/${slug}`,
    noindex: q.isError || !p,
  });

  const addToCart = () =>
    p && add.mutate({ type: "dpo", ref_id: p.slug },
      { onSuccess: () => toast(`«${p.title}» в корзине`), onError: () => toast("Не удалось добавить", "err") });
  // «Оставить заявку» – положить и сразу перейти к оформлению.
  const leaveRequest = () =>
    p && add.mutate({ type: "dpo", ref_id: p.slug },
      { onSuccess: () => navigate("/cart"), onError: () => toast("Не удалось добавить", "err") });

  return (
    <V2Shell>
      <main id="main" style={{ maxWidth: "var(--container)", margin: "0 auto", padding: "0 28px" }}>
        <nav style={{ ...label, paddingTop: 28 }} aria-label="Хлебные крошки">
          <Link to="/dpo" className="foc" style={{ color: "var(--c-text-2)", textDecoration: "underline", textUnderlineOffset: 4 }}>витрина дпо</Link>
          {p?.direction && <> · {p.direction}</>}
        </nav>

        {q.isLoading && <p style={{ ...label, paddingTop: 40 }}>загружаем программу…</p>}

        {q.isError && (
          <div style={{ padding: "56px 0" }}>
            <h1 style={{ ...disp, fontWeight: 700, fontSize: "var(--t-h2)", margin: 0 }}>{notFound ? "Программа не найдена" : "Не удалось загрузить программу"}</h1>
            <p style={{ margin: "12px 0 0", color: "var(--c-text-2)", fontSize: "var(--t-body)", maxWidth: 520, lineHeight: 1.55 }}>
              {notFound ? "Такой записи в каталоге нет – возможно, набор завершён и программа снята." : "Сервер временно недоступен. Повторите загрузку."}
            </p>
            {!notFound && <button className="foc" onClick={() => q.refetch()}>Повторить загрузку</button>}
            <Link to="/dpo" className="foc" style={{ ...action, marginTop: 20 }}>
              Весь каталог программ
            </Link>
          </div>
        )}

        {p && (
          <>
          <div style={{ marginTop: 18, borderRadius: "var(--r-lg)", overflow: "hidden", border: "1px solid var(--c-line)", maxHeight: 320, background: "var(--c-bg-sunken)" }}>
            {coverIsHeroFallback ? (
              <HeroPicture path="assets/dpo-hero.jpg" alt="" width={1400} height={700} className="club-program-cover" />
            ) : (
              <img
                className="club-program-cover"
                src={mediaUrl(coverSrc)}
                alt=""
                width={1400}
                height={700}
                style={{ width: "100%", height: "auto", maxHeight: 320, objectFit: "cover", display: "block" }}
                decoding="async"
                loading="eager"
                fetchPriority="high"
              />
            )}
          </div>
          <div style={{ paddingTop: 24, maxWidth: "58ch" }}>
            <h1 style={{ ...pageTitle, fontSize: "var(--t-h2)", lineHeight: 1.12, margin: 0 }}>{p.title}</h1>
            {p.tagline && (
              <p style={{ margin: "12px 0 0", fontSize: "var(--t-body)", lineHeight: 1.55, color: "var(--c-text-2)" }}>{p.tagline}</p>
            )}
          </div>
          <div className="v2-prog-page" style={{ display: "grid", gridTemplateColumns: "1.55fr 1fr", gap: 40, alignItems: "start", paddingTop: 22 }}>
            {/* ── Содержание записи ── */}
            <div style={{ minWidth: 0 }}>

              <div style={{ ...label, marginTop: 16 }}>
                {[FORMAT_LABEL[p.format] ?? p.format, p.duration, totalHours > 0 ? `${totalHours} ак. ч.` : null]
                  .filter(Boolean).join(" · ")}
              </div>
              {p.enrollment === "nonactual" && (
                <div style={{ ...label, color: "var(--c-danger-text)", marginTop: 8 }}>набор закрыт</div>
              )}

              {p.description && (
                <section style={{ marginTop: 30 }}>
                  <h2 style={{ ...disp, fontWeight: 600, fontSize: "var(--t-h3)", margin: 0 }}>О программе</h2>
                  <p style={{ margin: "12px 0 0", fontSize: "var(--t-body)", lineHeight: 1.65, color: "var(--c-text-2)", maxWidth: "64ch", whiteSpace: "pre-line" }}>{p.description}</p>
                </section>
              )}

              {audience.length > 0 && (
                <section style={{ marginTop: 36 }}>
                  <h2 style={{ ...disp, fontWeight: 600, fontSize: "var(--t-h3)", margin: 0 }}>Кому подойдёт</h2>
                  <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none", maxWidth: "64ch" }}>
                    {audience.map((item, i) => (
                      <li key={i} style={{ display: "grid", gridTemplateColumns: "14px 1fr", gap: 10, padding: "6px 0", fontSize: "var(--t-body)", lineHeight: 1.55, color: "var(--c-text-2)", borderTop: i ? "1px solid var(--c-line)" : undefined }}>
                        <span aria-hidden style={{ color: "var(--c-text-3)" }}>–</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {results.length > 0 && (
                <section style={{ marginTop: 36 }}>
                  <h2 style={{ ...disp, fontWeight: 600, fontSize: "var(--t-h3)", margin: 0 }}>Чему научитесь</h2>
                  <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none", maxWidth: "64ch" }}>
                    {results.map((item, i) => (
                      <li key={i} style={{ display: "grid", gridTemplateColumns: "14px 1fr", gap: 10, padding: "6px 0", fontSize: "var(--t-body)", lineHeight: 1.55, color: "var(--c-text-2)", borderTop: i ? "1px solid var(--c-line)" : undefined }}>
                        <span aria-hidden style={{ color: "var(--c-text-3)" }}>–</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {advantages.length > 0 && (
                <section style={{ marginTop: 36 }}>
                  <h2 style={{ ...disp, fontWeight: 600, fontSize: "var(--t-h3)", margin: 0 }}>Преимущества</h2>
                  <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none", maxWidth: "64ch" }}>
                    {advantages.map((item, i) => (
                      <li key={i} style={{ display: "grid", gridTemplateColumns: "14px 1fr", gap: 10, padding: "6px 0", fontSize: "var(--t-body)", lineHeight: 1.55, color: "var(--c-text-2)", borderTop: i ? "1px solid var(--c-line)" : undefined }}>
                        <span aria-hidden style={{ color: "var(--c-text-3)" }}>–</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {modules.length > 0 && (
                <section style={{ marginTop: 36 }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
                    <h2 style={{ ...disp, fontWeight: 600, fontSize: "var(--t-h3)", margin: 0 }}>Программа курса</h2>
                    <span style={label}>
                      {modules.length} {plural(modules.length, "раздел", "раздела", "разделов")}
                      {totalHours > 0 && ` · ${totalHours} ак. ч.`}
                    </span>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    {modules.map((m, i) => {
                      const on = open === i;
                      const points = m.points ?? [];
                      const can = points.length > 0;
                      return (
                        <div key={i} style={{ borderTop: "1px solid var(--c-line)" }}>
                          <button
                            onClick={() => can && setOpen(on ? -1 : i)}
                            aria-expanded={can ? on : undefined}
                            disabled={!can}
                            className="foc"
                            style={{
                              display: "grid", gridTemplateColumns: "44px 1fr auto", gap: 14, alignItems: "baseline",
                              width: "100%", textAlign: "left", padding: "16px 0", border: "none", background: "transparent",
                              color: "inherit", cursor: can ? "pointer" : "default", font: "inherit",
                            }}
                          >
                            <span style={{ ...mono, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)", color: "var(--c-accent-text)" }}>
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            <span style={{ fontSize: "var(--t-body)", fontWeight: 500, lineHeight: 1.35 }}>{m.title}</span>
                            <span style={{ ...label, whiteSpace: "nowrap" }}>
                              {m.hours ? `${m.hours} ч.` : ""}{can && (on ? "  −" : "  +")}
                            </span>
                          </button>
                          {on && can && (
                            <ul style={{ margin: 0, padding: "0 0 18px 58px", listStyle: "none" }}>
                              {points.map((pt, j) => (
                                <li key={j} style={{ display: "grid", gridTemplateColumns: "14px 1fr", gap: 10, padding: "5px 0", fontSize: "var(--t-small)", lineHeight: 1.55, color: "var(--c-text-2)" }}>
                                  <span aria-hidden style={{ color: "var(--c-text-3)" }}>–</span>
                                  <span>{pt}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                    <div style={{ borderTop: "1px solid var(--c-line)" }} />
                  </div>
                </section>
              )}

              {teachers.length > 0 && (
                <section style={{ marginTop: 36 }}>
                  <h2 style={{ ...disp, fontWeight: 600, fontSize: "var(--t-h3)", margin: 0 }}>Преподаватели</h2>
                  <div style={{ marginTop: 12 }}>
                    {teachers.map((t, i) => (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: "56px 1fr", gap: 14, alignItems: "center", padding: "13px 0", borderTop: "1px solid var(--c-line)" }}>
                        {t.photo ? (
                          <img
                            src={mediaUrl(t.photo)}
                            alt=""
                            width={56}
                            height={56}
                            loading="lazy"
                            decoding="async"
                            style={{ width: 56, height: 56, borderRadius: "var(--r-sm)", objectFit: "cover", border: "1px solid var(--c-line)", background: "var(--c-bg-sunken)" }}
                          />
                        ) : (
                          <span aria-hidden style={{ width: 56, height: 56, borderRadius: "var(--r-sm)", background: "var(--c-bg-sunken)", border: "1px solid var(--c-line)", display: "flex", alignItems: "center", justifyContent: "center", ...disp, fontWeight: 700, fontSize: 18, color: "var(--c-text-2)" }}>
                            {t.name.trim().charAt(0).toUpperCase()}
                          </span>
                        )}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: "var(--t-body)", fontWeight: 500 }}>{t.name}</div>
                          {t.role && <div style={{ ...label, fontSize: "var(--t-micro)", marginTop: 3 }}>{t.role}</div>}
                        </div>
                      </div>
                    ))}
                    <div style={{ borderTop: "1px solid var(--c-line)" }} />
                  </div>
                </section>
              )}
            </div>

            {/* ── Бланк программы ── */}
            <aside className="v2-prog-aside" style={{ position: "sticky", top: 92 }}>
              <div style={{ border: "1px solid var(--c-line)", borderRadius: "var(--r-lg)", background: "var(--c-bg-raised)", padding: 22 }}>
                <div style={{ ...mono, fontSize: 26, fontWeight: 600, color: discount > 0 ? "var(--c-accent-text)" : "var(--c-text)" }}>{rub(priced)}</div>
                {discount > 0 && (
                  <div style={{ ...mono, fontSize: 13, color: "var(--c-text-3)", textDecoration: "line-through", marginTop: 4 }}>{rub(p.price)}</div>
                )}
                <div style={{ ...label, marginTop: 10, textTransform: "none", letterSpacing: 0, lineHeight: 1.5 }}>
                  {discount > 0
                    ? `Цена выпускника, скидка ${discount}% уже применена.`
                    : p.source_url
                      ? "Цена выпускника применяется после верификации в кабинете; запись и оплата – на hse.ru."
                      : "Цена выпускника применяется после верификации в кабинете."}
                </div>

                <div style={{ marginTop: 16 }}>
                  {p.dates?.start && <Fact name="старт" value={programStart(p.dates.start)} />}
                  <Fact name="длительность" value={p.duration} />
                  <Fact name="формат" value={FORMAT_LABEL[p.format] ?? p.format} />
                  {totalHours > 0 && <Fact name="объём" value={`${totalHours} ак. ч.`} />}
                  {p.document && <Fact name="документ" value={p.document} />}
                  <div style={{ borderTop: "1px solid var(--c-line)" }} />
                </div>

                {/* Действие следует из данных: закрыт набор / программа ВШЭ / своя */}
                {p.enrollment === "nonactual" ? (
                  <>
                    <div style={{ marginTop: 18, padding: "13px 16px", borderRadius: "var(--r-md)", border: "1px dashed var(--c-line)", textAlign: "center", color: "var(--c-text-3)", fontWeight: 600 }}>Набор закрыт</div>
                    {p.source_url && (
                      <a href={p.source_url} target="_blank" rel="noopener noreferrer" className="foc" style={{ display: "block", marginTop: 8, padding: "12px 16px", borderRadius: "var(--r-md)", border: "1px solid var(--c-line-control)", textAlign: "center", color: "var(--c-text-2)", fontWeight: 600, textDecoration: "none" }}>Страница на hse.ru →</a>
                    )}
                    <p style={{ ...label, textTransform: "none", letterSpacing: 0, margin: "12px 0 0", lineHeight: 1.5 }}>
                      Набор завершён. Каталог обновляется с hse.ru автоматически – следите за новым набором.
                    </p>
                  </>
                ) : p.source_url ? (
                  <>
                    <a href={p.source_url} target="_blank" rel="noopener noreferrer" className="foc" style={{ display: "inline-block", marginTop: 18, padding: "10px 0", color: "var(--c-link)", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 4 }}>Записаться на hse.ru ↗</a>
                    <p style={{ ...label, textTransform: "none", letterSpacing: 0, margin: "12px 0 0", lineHeight: 1.5 }}>
                      Запись и оплата – на официальном маркетплейсе ДПО НИУ ВШЭ. Скидка выпускника действует на все программы.
                    </p>
                  </>
                ) : (
                  <>
                    <button disabled={add.isPending} onClick={leaveRequest} className="foc"
                      style={{ ...action, width: "100%", marginTop: 18, cursor: add.isPending ? "wait" : "pointer" }}>
                      Оставить заявку
                    </button>
                    <button disabled={add.isPending} onClick={addToCart} className="foc"
                      style={{ ...actionGhost, width: "100%", marginTop: 8, cursor: add.isPending ? "wait" : "pointer" }}>
                      Положить в корзину
                    </button>
                    <p style={{ ...label, textTransform: "none", letterSpacing: 0, margin: "12px 0 0", lineHeight: 1.5 }}>
                      Программа клуба: учебный офис подтвердит детали и пришлёт ссылку на оплату.
                    </p>
                  </>
                )}
              </div>
            </aside>
          </div>
          </>
        )}
      </main>
    </V2Shell>
  );
}
