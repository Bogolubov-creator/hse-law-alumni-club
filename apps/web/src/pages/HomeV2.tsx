import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useNewsList, usePage, useTimeline, formatNewsDate } from "../lib/queries.js";
import { apiGet } from "../lib/api.js";
import { token, useCart } from "../lib/cart.js";
import { useHead } from "../lib/title.js";
import { VisionToggle } from "../components/Vision.js";

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

/**
 * Текст из админки или запасной. Именно текст, а не `??`: Directus отдаёт
 * незаполненные поля пустой строкой, и `??` её пропускает – в разметку уезжает
 * пустой заголовок вместо запасного.
 */
const text = (v: string | null | undefined, fallback: string): string => (v && v.trim() ? v : fallback);

const mono: CSSProperties = { fontFamily: "var(--f-data)", fontVariantNumeric: "tabular-nums" };
const disp: CSSProperties = { fontFamily: "var(--f-display)", letterSpacing: "var(--tr-display)" };

type EventItem = { id: string; title: string; starts_at: string; location?: string | null; format?: string | null; points?: number | null };

/** Сигнатура «поле бланка»: линия и моно-подпись под ней. Только там, где под ней данные. */
function BlankField({ children, label }: { children: ReactNode; label: string }) {
  return (
    <span className="blank-field">
      {children}
      <span className="blank-field__label">{label}</span>
    </span>
  );
}

/** Запись реестра: узкая моно-колонка слева, содержание справа. */
function RegistryRow({ mark, title, text, meta, delay }: { mark: string; title: string; text?: string | null; meta?: string | null; delay?: number }) {
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
        {text && <p style={{ margin: "8px 0 0", color: "var(--c-text-2)", fontSize: "var(--t-body)", lineHeight: 1.6, maxWidth: "65ch" }}>{text}</p>}
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
  const cartCount = useCart().data?.count ?? 0;
  const authed = !!token();
  const [menuOpen, setMenuOpen] = useState(false);

  const hero = page.data?.blocks.hero ?? {};
  const cta = page.data?.blocks.cta ?? {};
  const records = timeline.data ?? [];
  const upcoming = (events.data ?? []).slice(0, 2);

  // Тема: следуем системной, но даём переключатель – канон-охра должна быть
  // проверяема в обоих режимах, а не только в том, что стоит у смотрящего.
  const [theme, setTheme] = useState<"auto" | "light" | "dark">("auto");
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    return () => root.removeAttribute("data-theme");
  }, [theme]);

  const nav = [
    { to: "/dpo", label: "ДПО" },
    { to: "/merch", label: "Мерч" },
    { to: "/podcasts", label: "Подкасты" },
    { to: "/events", label: "События" },
    { to: "/news", label: "Новости" },
  ];

  return (
    <div style={{ background: "var(--c-bg)", color: "var(--c-text)", fontFamily: "var(--f-body)", minHeight: "100dvh" }}>
      {/* ── Шапка: одна строка, ≤72px ────────────────────────────── */}
      <header style={{ position: "sticky", top: 0, zIndex: 50, background: "color-mix(in srgb, var(--c-bg) 88%, transparent)", backdropFilter: "blur(10px)", borderBottom: "1px solid var(--c-line)" }}>
        <div style={{ maxWidth: "var(--container)", margin: "0 auto", padding: "0 28px", height: 72, display: "flex", alignItems: "center", gap: 24 }}>
          <Link to="/v2" className="foc" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none", color: "inherit" }}>
            <img src="/assets/themis.jpeg" alt="" width={36} height={36} style={{ borderRadius: "var(--r-sm)", objectFit: "cover" }} />
            <span style={{ ...disp, fontWeight: 800, fontSize: 15, lineHeight: 1.1 }}>
              Клуб выпускников
              <span style={{ ...mono, display: "block", fontSize: 10, letterSpacing: "var(--tr-data)", color: "var(--c-text-3)", fontWeight: 400, marginTop: 3, textTransform: "uppercase" }}>факультет права</span>
            </span>
          </Link>

          <nav className="desk-only" style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: "auto" }}>
            {nav.map((n) => (
              <Link key={n.to} to={n.to} className="foc" style={{ textDecoration: "none", color: "var(--c-text-2)", fontSize: 14, fontWeight: 500, padding: "8px 12px", borderRadius: "var(--r-sm)" }}>{n.label}</Link>
            ))}
            <Link to="/cart" className="foc" style={{ textDecoration: "none", color: "var(--c-text-2)", fontSize: 14, fontWeight: 500, padding: "8px 12px", borderRadius: "var(--r-sm)" }}>
              Корзина{cartCount > 0 && <span style={{ ...mono, marginLeft: 6, background: "var(--c-accent)", color: "var(--c-on-accent)", borderRadius: 999, padding: "1px 6px", fontSize: 11 }}>{cartCount}</span>}
            </Link>
            <button
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              aria-label={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
              className="foc"
              style={{ marginLeft: 4, border: "1px solid var(--c-line)", background: "transparent", color: "var(--c-text-2)", borderRadius: "var(--r-sm)", padding: "7px 10px", cursor: "pointer", ...mono, fontSize: 11, letterSpacing: "var(--tr-data)" }}
            >
              {theme === "dark" ? "СВЕТ" : "ТЕМА"}
            </button>
            <VisionToggle compact />
            <Link to={authed ? "/lk" : "/join"} className="foc" style={{ marginLeft: 8, textDecoration: "none", background: "var(--c-accent)", color: "var(--c-on-accent)", fontWeight: 600, fontSize: 14, padding: "10px 18px", borderRadius: "var(--r-md)" }}>
              {authed ? "Кабинет" : "Вступить"}
            </Link>
          </nav>

          <button onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen} aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"} className="foc mob-only" style={{ marginLeft: "auto", width: 44, height: 44, borderRadius: "var(--r-md)", border: "1px solid var(--c-line)", background: "transparent", color: "var(--c-text)", fontSize: 18, cursor: "pointer" }}>
            {menuOpen ? "✕" : "☰"}
          </button>
        </div>

        {menuOpen && (
          <nav className="mob-only" style={{ flexDirection: "column", borderTop: "1px solid var(--c-line)", padding: "8px 20px 18px" }}>
            {[...nav, { to: "/cart", label: "Корзина" }, { to: authed ? "/lk" : "/join", label: authed ? "Личный кабинет" : "Вступить в клуб" }].map((n) => (
              <Link key={n.to} to={n.to} onClick={() => setMenuOpen(false)} className="foc" style={{ textDecoration: "none", color: "var(--c-text)", fontWeight: 600, fontSize: 16, padding: "13px 8px", borderRadius: "var(--r-md)" }}>{n.label}</Link>
            ))}
          </nav>
        )}
      </header>

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

            {/* Фемида: реальный ассет канона, не абстрактный градиент */}
            <div className="v2-enter v2-hero-art" style={{ ["--enter-delay" as string]: "40ms" }}>
              <div style={{ position: "relative", aspectRatio: "1 / 1", borderRadius: "var(--r-lg)", overflow: "hidden", background: "var(--c-accent)" }}>
                <img src="/assets/themis.jpeg" alt="Фемида, знак клуба выпускников факультета права" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
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

      <footer style={{ marginTop: 72, borderTop: "1px solid var(--c-line)", padding: "34px 28px 46px" }}>
        <div style={{ maxWidth: "var(--container)", margin: "0 auto", display: "flex", flexWrap: "wrap", gap: 18, justifyContent: "space-between", fontSize: "var(--t-small)", color: "var(--c-text-3)" }}>
          <span>© 2026 Клуб выпускников факультета права Вышки</span>
          <span style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
            <Link to="/privacy" className="foc" style={{ color: "inherit" }}>Политика обработки персональных данных</Link>
            <Link to="/confidential" className="foc" style={{ color: "inherit" }}>Политика конфиденциальности</Link>
            <Link to="/requisites" className="foc" style={{ color: "inherit" }}>Реквизиты</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
