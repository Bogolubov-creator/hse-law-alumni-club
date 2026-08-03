import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useNewsList, usePage, useTimeline, formatNewsDate } from "../lib/queries.js";
import { apiGet } from "../lib/api.js";
import { token } from "../lib/cart.js";
import { useHead } from "../lib/title.js";
import { Mark } from "../v2/Mark.js";
import { V2Shell, BlankField, mono, disp, text } from "../v2/Shell.js";

/**
 * Главная v2 – вариант A «Реестр» из DESIGN-PLAN §2.1.
 *
 * Замысел: портал выглядит как реестр выпускников, а не как лендинг. Вместо сетки
 * одинаковых карточек – горизонтальные записи: узкая моноширинная колонка слева
 * (год, номер, категория) и содержание справа. Это язык документа, в котором живёт
 * факультет права, а не язык маркетинговой страницы.
 *
 * Живёт по адресу /v2 рядом со старой главной, чтобы их можно было сравнить.
 * Данные настоящие: те же хуки, что и у текущей главной.
 */

type EventItem = { id: string; title: string; starts_at: string; location?: string | null; format?: string | null; points?: number | null };

/** Запись реестра: узкая моно-колонка слева, содержание справа. */
function RegistryRow({ mark, title, text: body, meta, delay }: { mark: string; title: string; text?: string | null; meta?: string | null; delay?: number }) {
  return (
    <div
      className="v2-row"
      style={{
        display: "grid", gridTemplateColumns: "96px 1fr", gap: 24,
        padding: "22px 0", borderTop: "1px solid var(--c-line)",
        // @ts-expect-error – кастомное свойство для задержки въезда
        "--enter-delay": `${delay ?? 0}ms`,
      }}
    >
      <span style={{ ...mono, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)", color: "var(--c-accent-text)", paddingTop: 4 }}>{mark}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ ...disp, fontWeight: 600, fontSize: "var(--t-h3)", lineHeight: 1.2 }}>{title}</div>
        {body && <p style={{ margin: "8px 0 0", color: "var(--c-text-2)", fontSize: "var(--t-body)", lineHeight: 1.6, maxWidth: "65ch" }}>{body}</p>}
        {meta && <div style={{ ...mono, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)", color: "var(--c-text-3)", marginTop: 10, textTransform: "uppercase" }}>{meta}</div>}
      </div>
    </div>
  );
}

export default function HomeV2() {
  useHead({
    // useHead дописывает базовое имя сайта сам, поэтому здесь только уточнение.
    title: "Реестр выпускников",
    description: "Реестр выпускников факультета права НИУ ВШЭ: статус, скидка на программы ДПО, события клуба и сообщество однокурсников.",
    noindex: true, // превью новой главной: в индекс не пускаем, пока не выбран вариант
  });
  const page = usePage("home");
  const timeline = useTimeline();
  const news = useNewsList(3);
  const events = useQuery({ queryKey: ["events"], queryFn: () => apiGet<EventItem[]>("/events") });
  const authed = !!token();

  const hero = page.data?.blocks.hero ?? {};
  const cta = page.data?.blocks.cta ?? {};
  const records = timeline.data ?? [];
  const upcoming = (events.data ?? []).slice(0, 2);

  return (
    <V2Shell>
      <main style={{ maxWidth: "var(--container)", margin: "0 auto", padding: "0 28px" }}>
        {/* ── Герой: асимметричный сплит, единственный момент сборки ── */}
        <section style={{ paddingTop: 72, paddingBottom: 56 }}>
          <div className="v2-hero" style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 56, alignItems: "center" }}>
            <div>
              <h1 className="v2-enter" style={{ ...disp, fontWeight: 800, fontSize: "var(--t-h1)", lineHeight: 1.05, margin: 0 }}>
                {text(hero.title_pre, "Статус выпускника,")}{" "}
                <span style={{ color: "var(--c-accent-text)" }}>{text(hero.title_accent, "который работает")}</span>
              </h1>

              <div className="v2-enter" style={{ marginTop: 26, maxWidth: 460, ["--enter-delay" as string]: "60ms" }}>
                <BlankField label="реестр выпускников · факультет права ниу вшэ">
                  <p style={{ margin: 0, fontSize: "var(--t-lead)", lineHeight: 1.5, color: "var(--c-text-2)" }}>
                    {text(hero.subtitle, "Личный кабинет со статусом, скидка на программы ДПО, события клуба и однокурсники.")}
                  </p>
                </BlankField>
              </div>

              <div className="v2-enter" style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", marginTop: 30, ["--enter-delay" as string]: "120ms" }}>
                <Link to={authed ? "/lk" : "/join"} className="foc" style={{ textDecoration: "none", background: "var(--c-accent)", color: "var(--c-on-accent)", fontWeight: 600, fontSize: 16, padding: "15px 30px", borderRadius: "var(--r-md)" }}>
                  {authed ? "Мой кабинет" : text(hero.cta_primary, "Вступить в клуб")}
                </Link>
                {!authed && (
                  <Link to="/lk" className="foc" style={{ textDecoration: "none", color: "var(--c-accent-text)", fontWeight: 600, fontSize: 15 }}>Уже в клубе – войти →</Link>
                )}
              </div>

              <div className="v2-enter" style={{ ...mono, marginTop: 34, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)", color: "var(--c-text-3)", textTransform: "uppercase", ["--enter-delay" as string]: "180ms" }}>
                выпусков {records.length || 3} · уровней 4 · скидка до 20%
              </div>
            </div>

            {/* Знак клуба: Фемида вектором, графит на охре – 5,12:1 */}
            <div className="v2-enter v2-hero-art" style={{ ["--enter-delay" as string]: "40ms" }}>
              <div style={{ position: "relative", aspectRatio: "1 / 1", borderRadius: "var(--r-lg)", background: "var(--c-accent)", display: "grid", placeItems: "center", color: "var(--c-on-accent)" }}>
                <Mark kind="themis" size="72%" title="Фемида с весами – знак клуба выпускников факультета права" style={{ height: "auto" }} />
              </div>
            </div>
          </div>
        </section>

        {/* ── Реестр: история клуба как записи, а не как карточки ──── */}
        {records.length > 0 && (
          <section style={{ paddingTop: 40, paddingBottom: 24 }}>
            <h2 style={{ ...disp, fontWeight: 600, fontSize: "var(--t-h2)", margin: "0 0 6px" }}>{text(hero.history_title, "История клуба")}</h2>
            <p style={{ margin: "0 0 18px", color: "var(--c-text-3)", fontSize: "var(--t-small)" }}>{text(hero.history_hint, "Записи реестра по годам.")}</p>
            <div style={{ borderBottom: "1px solid var(--c-line)" }}>
              {records.map((r, i) => (
                <RegistryRow key={r.id} mark={r.year} title={r.title} text={r.text} meta={r.metric} delay={i * 40} />
              ))}
            </div>
          </section>
        )}

        {/* ── Витрины: две крупные записи, не три равные карточки ──── */}
        <section style={{ paddingTop: 48 }}>
          <h2 style={{ ...disp, fontWeight: 600, fontSize: "var(--t-h2)", margin: "0 0 22px" }}>Что доступно выпускнику</h2>
          <div className="v2-two" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22 }}>
            {[
              { to: "/dpo", img: "/assets/dpo-hero.jpg", title: "Программы ДПО", text: "Курсы и интенсивы факультета с ценой выпускника. Фильтры по направлению, формату и длительности.", label: "цена выпускника · каталог вшэ" },
              { to: "/merch", img: "/assets/merch-hoodie.jpg", title: "Мерч клуба", text: "Одежда и аксессуары с фасеточной Фемидой. Размеры, остатки, самовывоз или доставка.", label: "склад · размеры в наличии" },
            ].map((c) => (
              <Link key={c.to} to={c.to} className="foc v2-card" style={{ textDecoration: "none", color: "inherit", border: "1px solid var(--c-line)", borderRadius: "var(--r-lg)", overflow: "hidden", background: "var(--c-bg-raised)", display: "block" }}>
                <div style={{ height: 208, background: `var(--c-bg-sunken) url(${c.img}) center / cover no-repeat` }} />
                <div style={{ padding: 24 }}>
                  <BlankField label={c.label}>
                    <div style={{ ...disp, fontWeight: 600, fontSize: "var(--t-h3)" }}>{c.title}</div>
                  </BlankField>
                  <p style={{ margin: "14px 0 0", color: "var(--c-text-2)", fontSize: "var(--t-body)", lineHeight: 1.6 }}>{c.text}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* ── Как вступить: настоящая последовательность ───────────── */}
        <section style={{ paddingTop: 64 }}>
          <h2 style={{ ...disp, fontWeight: 600, fontSize: "var(--t-h2)", margin: "0 0 20px" }}>Как вступить</h2>
          <div style={{ borderBottom: "1px solid var(--c-line)" }}>
            <RegistryRow mark="01" title="Заявка" text="Анкета с годом выпуска и образовательной программой. Занимает пару минут." meta="2 минуты" />
            <RegistryRow mark="02" title="Проверка учебным офисом" text="Офис сверяет выпуск с реестром факультета и подтверждает статус." meta="1–3 рабочих дня" />
            <RegistryRow mark="03" title="Статус выпускника" text="Кабинет, цена выпускника на ДПО, события с баллами, сообщество однокурсников." meta="навсегда, без взносов" />
          </div>
        </section>

        {/* ── События: живые данные ────────────────────────────────── */}
        {upcoming.length > 0 && (
          <section style={{ paddingTop: 64 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
              <h2 style={{ ...disp, fontWeight: 600, fontSize: "var(--t-h2)", margin: 0 }}>Ближайшие события</h2>
              <Link to="/events" className="foc" style={{ color: "var(--c-link)", fontWeight: 600, fontSize: 15, textDecoration: "none" }}>Вся афиша и запись →</Link>
            </div>
            <div style={{ borderBottom: "1px solid var(--c-line)" }}>
              {upcoming.map((e) => (
                <RegistryRow
                  key={e.id}
                  mark={new Date(e.starts_at).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}
                  title={e.title}
                  text={e.location ?? null}
                  meta={[e.format === "online" ? "онлайн" : "очно", e.points ? `+${e.points} баллов` : null].filter(Boolean).join(" · ")}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Новости ──────────────────────────────────────────────── */}
        {(news.data ?? []).length > 0 && (
          <section style={{ paddingTop: 64 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
              <h2 style={{ ...disp, fontWeight: 600, fontSize: "var(--t-h2)", margin: 0 }}>Что в клубе сейчас</h2>
              <Link to="/news" className="foc" style={{ color: "var(--c-link)", fontWeight: 600, fontSize: 15, textDecoration: "none" }}>Все новости →</Link>
            </div>
            <div style={{ borderBottom: "1px solid var(--c-line)" }}>
              {(news.data ?? []).map((n) => (
                <div key={n.slug} style={{ borderTop: "1px solid var(--c-line)" }}>
                  <Link to={`/news/${n.slug}`} className="foc" style={{ display: "grid", gridTemplateColumns: "96px 1fr", gap: 24, padding: "22px 0", textDecoration: "none", color: "inherit" }}>
                    <span style={{ ...mono, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)", color: "var(--c-accent-text)", paddingTop: 4 }}>
                      {n.published_at ? formatNewsDate(n.published_at).replace(/ г\.$/, "") : ""}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ ...disp, fontWeight: 600, fontSize: "var(--t-h3)", lineHeight: 1.2 }}>{n.title}</div>
                      {n.excerpt && <p style={{ margin: "8px 0 0", color: "var(--c-text-2)", fontSize: "var(--t-body)", lineHeight: 1.6, maxWidth: "65ch" }}>{n.excerpt}</p>}
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Финальный призыв ─────────────────────────────────────── */}
        <section style={{ margin: "72px 0 0", background: "var(--c-bg-inverse)", color: "var(--c-text-inverse)", borderRadius: "var(--r-lg)", padding: "56px 40px" }}>
          <h2 style={{ ...disp, fontWeight: 700, fontSize: "var(--t-h2)", margin: 0, maxWidth: "18ch" }}>{text(cta.title, "Вы уже выпускник. Осталось это подтвердить.")}</h2>
          <p style={{ margin: "16px 0 0", fontSize: "var(--t-body)", lineHeight: 1.6, maxWidth: "56ch", opacity: 0.82 }}>
            {text(cta.text, "Учебный офис сверит выпуск с реестром факультета и откроет кабинет. Взносов нет.")}
          </p>
          <Link to="/join" className="foc" style={{ display: "inline-block", marginTop: 28, textDecoration: "none", background: "var(--c-accent)", color: "var(--c-on-accent)", fontWeight: 600, fontSize: 16, padding: "16px 34px", borderRadius: "var(--r-md)" }}>
            {text(cta.button, "Подать заявку")}
          </Link>
        </section>
      </main>

    </V2Shell>
  );
}
