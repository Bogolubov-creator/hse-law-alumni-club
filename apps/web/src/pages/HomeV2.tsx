import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useNewsList, usePage, useStats, useTimeline, formatNewsDate } from "../lib/queries.js";
import { apiGet } from "../lib/api.js";
import { token } from "../lib/cart.js";
import { useHead } from "../lib/title.js";
import { V2Shell, BlankField, mono, disp, slab, text } from "../v2/Shell.js";

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
 *
 * Иерархия секций (директива 2026-09): герой → цифры реестра → три опоры клуба →
 * жизнь сообщества (рубрики телеграм-канала) → события и новости → витрины клуба →
 * сервисы ВШЭ (внешние, визуально отделены) → история клуба → как вступить → призыв.
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

/** Пометка внешней ссылки: такие ресурсы ведёт университет, а не клуб. */
const EXTERNAL_META = "внешняя ссылка · hse.ru";

/** Заголовок секции в титульном Slab. */
function SectionTitle({ children }: { children: string }) {
  return <h2 className="v2-title" style={{ ...slab, fontSize: "var(--t-h2)", margin: "0 0 6px" }}>{children}</h2>;
}

const fmtNum = (n: number) => n.toLocaleString("ru-RU");

/** Живая подписка на prefers-reduced-motion: в режиме reduce ролик не монтируем вовсе. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    try { return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
  });
  useEffect(() => {
    let mq: MediaQueryList;
    try { mq = window.matchMedia("(prefers-reduced-motion: reduce)"); } catch { return; }
    const onChange = () => setReduced(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/**
 * Ролик «Фемида с птицей» – эмблема клуба в движении (6,5 с).
 *
 * Ролик длиннее 5-секундного лимита автоплея, поэтому autoplay нет и быть
 * не может: запуск только явным действием. Сам элемент <video> монтируется
 * лениво, когда секция приближается к вьюпорту (IntersectionObserver), а
 * preload="none" не тянет файл до нажатия. Контролы свои и минимальные:
 * кнопка play поверх постера, во время воспроизведения – пауза и тонкая
 * линия прогресса; звука в ролике нет. При prefers-reduced-motion: reduce
 * показываем один постер с пометкой – видео-элемента в DOM нет совсем.
 */
function ThemisClip() {
  const reduced = usePrefersReducedMotion();
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (reduced || near) return;
    const el = frameRef.current;
    if (!el || typeof IntersectionObserver === "undefined") { setNear(true); return; }
    const io = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) { setNear(true); io.disconnect(); } },
      { rootMargin: "240px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced, near]);

  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => {});
    else v.pause();
  };

  return (
    <figure style={{ margin: 0, width: "100%", maxWidth: 360, justifySelf: "center" }}>
      <div ref={frameRef} style={{ position: "relative", aspectRatio: "1 / 1", borderRadius: "var(--r-lg)", overflow: "hidden", background: "var(--c-bg-sunken)" }}>
        {reduced ? (
          <>
            <img
              src="/brand/themis-video-poster.jpg"
              alt="Эмблема клуба: Фемида с птицей на оранжевом поле"
              width={800}
              height={800}
              style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
            />
            <span style={{ position: "absolute", left: 12, right: 12, bottom: 12, ...mono, fontSize: 10, letterSpacing: "var(--tr-data)", textTransform: "uppercase", textAlign: "center", background: "color-mix(in srgb, var(--c-bg) 86%, transparent)", color: "var(--c-text-2)", padding: "7px 10px", borderRadius: "var(--r-sm)" }}>
              Видео отключено в режиме reduced motion
            </span>
          </>
        ) : near ? (
          <>
            <video
              ref={videoRef}
              src="/brand/themis-video.mp4"
              poster="/brand/themis-video-poster.jpg"
              preload="none"
              playsInline
              onClick={toggle}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
              onTimeUpdate={(e) => { const v = e.currentTarget; if (v.duration) setProgress(v.currentTime / v.duration); }}
              style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", cursor: "pointer" }}
            />
            {/* Запуск поверх постера: треугольник в круге фирменного акцента.
                Во время воспроизведения кнопка уходит и из фокуса – пауза
                живёт в нижней строке и на клике по самому кадру. */}
            <button
              onClick={toggle}
              tabIndex={playing ? -1 : 0}
              aria-hidden={playing || undefined}
              aria-label="Смотреть видео «Знак клуба»"
              className="foc"
              style={{
                position: "absolute", inset: 0, margin: "auto", width: 64, height: 64, borderRadius: "50%",
                border: "none", cursor: "pointer", background: "var(--c-accent)", color: "var(--c-on-accent)",
                display: "grid", placeItems: "center",
                opacity: playing ? 0 : 1, pointerEvents: playing ? "none" : "auto",
                transition: "opacity var(--dur-base) var(--ease-out)",
              }}
            >
              <svg viewBox="0 0 24 24" width={26} height={26} aria-hidden focusable="false">
                <path d="M8.5 5.5v13l11-6.5z" fill="currentColor" />
              </svg>
            </button>
            {/* Строка воспроизведения: пауза + тонкая линия прогресса */}
            <div style={{ position: "absolute", left: 12, right: 12, bottom: 12, display: "flex", alignItems: "center", gap: 10, opacity: playing ? 1 : 0, pointerEvents: playing ? "auto" : "none", transition: "opacity var(--dur-base) var(--ease-out)" }}>
              <button
                onClick={toggle}
                tabIndex={playing ? 0 : -1}
                aria-hidden={!playing || undefined}
                aria-label="Пауза"
                className="foc"
                style={{ width: 34, height: 34, flexShrink: 0, borderRadius: "50%", border: "none", cursor: "pointer", background: "var(--c-accent)", color: "var(--c-on-accent)", display: "grid", placeItems: "center", boxShadow: "0 0 0 2px color-mix(in srgb, var(--c-on-accent) 65%, transparent)" }}
              >
                <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden focusable="false">
                  <path d="M7.5 5h3.2v14H7.5zM13.3 5h3.2v14h-3.2z" fill="currentColor" />
                </svg>
              </button>
              <span role="progressbar" aria-label="Прогресс видео" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} style={{ flex: 1, height: 3, borderRadius: 2, background: "color-mix(in srgb, var(--c-on-accent) 55%, transparent)", overflow: "hidden" }}>
                <span style={{ display: "block", height: "100%", width: `${progress * 100}%`, background: "var(--c-accent)" }} />
              </span>
            </div>
          </>
        ) : null}
      </div>
      <figcaption style={{ ...mono, marginTop: 12, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)", color: "var(--c-text-3)", textTransform: "uppercase", textAlign: "center" }}>
        {reduced ? "Эмблема клуба" : "Эмблема клуба · видео"}
      </figcaption>
    </figure>
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
  const stats = useStats();
  const events = useQuery({ queryKey: ["events"], queryFn: () => apiGet<EventItem[]>("/events") });
  const authed = !!token();

  const hero = page.data?.blocks.hero ?? {};
  const cta = page.data?.blocks.cta ?? {};
  const records = timeline.data ?? [];
  const upcoming = (events.data ?? []).slice(0, 2);
  const s = stats.data;

  return (
    <V2Shell>
      <main style={{ maxWidth: "var(--container)", margin: "0 auto", padding: "0 28px" }}>
        {/* ── Герой: асимметричный сплит, единственный момент сборки ── */}
        <section style={{ paddingTop: 72, paddingBottom: 56 }}>
          <div className="v2-hero" style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 56, alignItems: "center" }}>
            <div>
              <h1 className="v2-enter" style={{ ...slab, fontSize: "var(--t-h1)", lineHeight: 1.05, margin: 0 }}>
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
                <Link to={authed ? "/v2/lk" : "/v2/join"} className="foc" style={{ textDecoration: "none", background: "var(--c-accent)", color: "var(--c-on-accent)", fontWeight: 600, fontSize: 16, padding: "15px 30px", borderRadius: "var(--r-md)" }}>
                  {authed ? "Мой кабинет" : text(hero.cta_primary, "Вступить в клуб")}
                </Link>
                {!authed && (
                  <Link to="/v2/lk" className="foc" style={{ textDecoration: "none", color: "var(--c-accent-text)", fontWeight: 600, fontSize: 15 }}>Уже в клубе – войти →</Link>
                )}
              </div>

              <div className="v2-enter" style={{ ...mono, marginTop: 34, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)", color: "var(--c-text-3)", textTransform: "uppercase", ["--enter-delay" as string]: "180ms" }}>
                выпусков {records.length || 3} · уровней 4 · скидка до 20%
              </div>
            </div>

            {/* Фемида клуба. Знак-монолиния (Mark) остаётся в шапках и на входах,
                но в герое он читался как схематичная фигура – здесь стоит сама
                иллюстрация, та же, что на первой версии. */}
            <div className="v2-enter v2-hero-art" style={{ ["--enter-delay" as string]: "40ms" }}>
              <div style={{ position: "relative", aspectRatio: "1 / 1", borderRadius: "var(--r-lg)", overflow: "hidden", background: "var(--c-accent)" }}>
                <img
                  src="/assets/themis.jpeg"
                  alt="Фемида с весами и мечом – знак клуба выпускников факультета права"
                  width={560}
                  height={560}
                  style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
                />
              </div>
            </div>
          </div>
        </section>

        {/* ── Цифры реестра: живые счётчики из GET /stats ────────────
            Поле бланка показываем только когда под ним есть данные (см. tokens.css). */}
        {s && (
          <section style={{ paddingBottom: 8 }}>
            <div className="v2-two" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 28 }}>
              <BlankField label="выпускников в реестре">
                <span className="data" style={{ fontSize: "var(--t-h2)", fontWeight: 700, color: "var(--c-text)" }}>{fmtNum(s.alumni)}</span>
              </BlankField>
              <BlankField label="событий клуба в афише">
                <span className="data" style={{ fontSize: "var(--t-h2)", fontWeight: 700, color: "var(--c-text)" }}>{fmtNum(s.events)}</span>
              </BlankField>
              <BlankField label="программ дпо в каталоге">
                <span className="data" style={{ fontSize: "var(--t-h2)", fontWeight: 700, color: "var(--c-text)" }}>{fmtNum(s.programs)}</span>
              </BlankField>
            </div>
          </section>
        )}

        {/* ── Три опоры клуба: зачем клуб существует ───────────────── */}
        <section style={{ paddingTop: 48 }}>
          <SectionTitle>Три опоры клуба</SectionTitle>
          <p style={{ margin: "0 0 18px", color: "var(--c-text-3)", fontSize: "var(--t-small)" }}>На чём держится сообщество выпускников факультета права.</p>
          <div style={{ borderBottom: "1px solid var(--c-line)" }}>
            <RegistryRow
              mark="I"
              title="Объединение выпускников"
              text="Встречи, телеграм-канал и кабинет с однокурсниками: выпуск остаётся на связи и после защиты диплома."
              meta="сообщество"
              delay={0}
            />
            <RegistryRow
              mark="II"
              title="Связь с университетом"
              text="Клуб работает вместе с факультетом права НИУ ВШЭ: совместные проекты, открытые лекции и участие выпускников в жизни факультета."
              meta="факультет права ниу вшэ"
              delay={40}
            />
            <RegistryRow
              mark="III"
              title="Профессиональное развитие"
              text="Программы ДПО с ценой выпускника, карьерные активности и менторство внутри сообщества."
              meta="дпо · карьера · менторство"
              delay={80}
            />
          </div>
        </section>

        {/* ── Знак клуба: эмблема в движении ────────────────────────
            Сплит «текст + ролик»: видео не на весь экран, а как иллюстрация
            рядом с рассказом о знаке. Сам ролик ленивый и без автоплея. */}
        <section style={{ paddingTop: 64 }}>
          <div className="v2-two" style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 56, alignItems: "center" }}>
            <div>
              <SectionTitle>Знак клуба</SectionTitle>
              <p style={{ margin: "14px 0 0", color: "var(--c-text-2)", fontSize: "var(--t-body)", lineHeight: 1.6, maxWidth: "56ch" }}>
                Оранжевая эмблема – фирменный знак клуба: Фемида с весами, птица и кольцо «Факультет права · Alumni». Тот же знак стоит в шапке, на иконках приложения и оживает в коротком ролике.
              </p>
            </div>
            <ThemisClip />
          </div>
        </section>

        {/* ── Жизнь сообщества: рубрики канала, а не лента постов ──── */}
        <section style={{ paddingTop: 64 }}>
          <SectionTitle>Жизнь сообщества</SectionTitle>
          <p style={{ margin: "0 0 18px", color: "var(--c-text-3)", fontSize: "var(--t-small)", maxWidth: "64ch" }}>
            Клуб ведёт телеграм-канал: регулярные рубрики о праве, карьере и встречах выпускников.
          </p>
          <div style={{ borderBottom: "1px solid var(--c-line)" }}>
            <RegistryRow mark="01" title="Правовые дайджесты" text="Главное из изменений законодательства и практики – коротко и по делу." meta="рубрика канала" />
            <RegistryRow mark="02" title="Юридическая латынь" text="Классические формулы и термины: что они значат и откуда взялись." meta="рубрика канала" />
            <RegistryRow mark="03" title="Карьера" text="Карьерные истории выпускников и советы по профессиональному развитию." meta="рубрика канала" />
            <RegistryRow mark="04" title="Встречи ALUMNI.PRAVO" text="Анонсы и итоги встреч клуба: лекции, дискуссии, неформальные посиделки выпусков." meta="рубрика канала" />
            <RegistryRow mark="05" title="Спартакиада" text="Спортивная жизнь сообщества: команды выпускников и турниры." meta="рубрика канала" />
          </div>
          <div style={{ marginTop: 22, maxWidth: 420 }}>
            <BlankField label="канал клуба · telegram · внешняя ссылка">
              <a href="https://t.me/AlumniLawHSE" target="_blank" rel="noopener noreferrer" className="foc" style={{ color: "var(--c-link)", fontWeight: 600, fontSize: "var(--t-body)", textDecoration: "none" }}>
                t.me/AlumniLawHSE ↗
              </a>
            </BlankField>
          </div>
        </section>

        {/* ── События: живые данные ────────────────────────────────── */}
        {upcoming.length > 0 && (
          <section style={{ paddingTop: 64 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
              <h2 className="v2-title" style={{ ...slab, fontSize: "var(--t-h2)", margin: 0 }}>Ближайшие события</h2>
              <Link to="/v2/events" className="foc" style={{ color: "var(--c-link)", fontWeight: 600, fontSize: 15, textDecoration: "none" }}>Вся афиша и запись →</Link>
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
              <h2 className="v2-title" style={{ ...slab, fontSize: "var(--t-h2)", margin: 0 }}>Что в клубе сейчас</h2>
              <Link to="/v2/news" className="foc" style={{ color: "var(--c-link)", fontWeight: 600, fontSize: 15, textDecoration: "none" }}>Все новости →</Link>
            </div>
            <div style={{ borderBottom: "1px solid var(--c-line)" }}>
              {(news.data ?? []).map((n) => (
                <div key={n.slug} style={{ borderTop: "1px solid var(--c-line)" }}>
                  <Link to={`/v2/news/${n.slug}`} className="foc" style={{ display: "grid", gridTemplateColumns: "96px 1fr", gap: 24, padding: "22px 0", textDecoration: "none", color: "inherit" }}>
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

        {/* ── Витрины клуба: две крупные записи ────────────────────── */}
        <section style={{ paddingTop: 64 }}>
          <h2 className="v2-title" style={{ ...slab, fontSize: "var(--t-h2)", margin: "0 0 22px" }}>Что доступно выпускнику</h2>
          <div className="v2-two" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22 }}>
            {[
              { to: "/v2/dpo", img: "/assets/dpo-hero.jpg", title: "Программы ДПО", text: "Курсы и интенсивы факультета с ценой выпускника. Фильтры по направлению, формату и длительности.", label: "цена выпускника · каталог вшэ" },
              { to: "/v2/merch", img: "/assets/merch-hoodie.jpg", title: "Мерч клуба", text: "Одежда и аксессуары с фасеточной Фемидой. Размеры, остатки, самовывоз или доставка.", label: "склад · размеры в наличии" },
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

        {/* ── Сервисы ВШЭ для выпускников: внешние, не клубные ───────
            Приглушённая поверхность и явные пометки, чтобы не смешивать
            возможности университета с возможностями клуба. */}
        <section style={{ paddingTop: 64 }}>
          <div style={{ background: "var(--c-bg-sunken)", border: "1px solid var(--c-line)", borderRadius: "var(--r-lg)", padding: "36px 32px" }}>
            <SectionTitle>Сервисы ВШЭ для выпускников</SectionTitle>
            <p style={{ ...mono, margin: "8px 0 22px", fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)", color: "var(--c-text-3)", textTransform: "uppercase" }}>
              сервисы университета, не клуба · все ссылки внешние
            </p>
            <div style={{ borderBottom: "1px solid var(--c-line)" }}>
              {[
                {
                  href: "https://career.hse.ru/",
                  title: "Центр развития карьеры",
                  text: "Вакансии и стажировки, ярмарки работодателей и карьерные консультации для студентов и выпускников Вышки.",
                  host: "career.hse.ru",
                },
                {
                  href: "https://library.hse.ru/",
                  title: "Библиотека ВШЭ",
                  text: "Читальные залы и электронные ресурсы университета; условия доступа для выпускников уточняйте в библиотеке.",
                  host: "library.hse.ru",
                },
                {
                  href: "https://alumni.hse.ru/loyalty/",
                  title: "Программа лояльности выпускников",
                  text: "Карта выпускника, скидки и специальные предложения университета и его партнёров.",
                  host: "alumni.hse.ru",
                },
              ].map((svc) => (
                <div key={svc.href} className="v2-row" style={{ display: "grid", gridTemplateColumns: "96px 1fr", gap: 24, padding: "22px 0", borderTop: "1px solid var(--c-line)" }}>
                  <span style={{ ...mono, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)", color: "var(--c-text-3)", paddingTop: 4 }}>внешняя</span>
                  <div style={{ minWidth: 0 }}>
                    <a href={svc.href} target="_blank" rel="noopener noreferrer" className="foc" style={{ ...disp, fontWeight: 600, fontSize: "var(--t-h3)", lineHeight: 1.2, color: "var(--c-link)", textDecoration: "none" }}>
                      {svc.title} ↗
                    </a>
                    <p style={{ margin: "8px 0 0", color: "var(--c-text-2)", fontSize: "var(--t-body)", lineHeight: 1.6, maxWidth: "65ch" }}>{svc.text}</p>
                    <div style={{ ...mono, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)", color: "var(--c-text-3)", marginTop: 10, textTransform: "uppercase" }}>
                      {EXTERNAL_META.replace("hse.ru", svc.host)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p style={{ margin: "18px 0 0", color: "var(--c-text-3)", fontSize: "var(--t-small)", lineHeight: 1.6, maxWidth: "64ch" }}>
              Этими сервисами управляет университет: условия и содержимое страниц на hse.ru могут меняться без участия клуба.
            </p>
          </div>
        </section>

        {/* ── Реестр: история клуба как записи, а не как карточки ──── */}
        {records.length > 0 && (
          <section style={{ paddingTop: 64, paddingBottom: 24 }}>
            <h2 className="v2-title" style={{ ...slab, fontSize: "var(--t-h2)", margin: "0 0 6px" }}>{text(hero.history_title, "История клуба")}</h2>
            <p style={{ margin: "0 0 18px", color: "var(--c-text-3)", fontSize: "var(--t-small)" }}>{text(hero.history_hint, "Записи реестра по годам.")}</p>
            <div style={{ borderBottom: "1px solid var(--c-line)" }}>
              {records.map((r, i) => (
                <RegistryRow key={r.id} mark={r.year} title={r.title} text={r.text} meta={r.metric} delay={i * 40} />
              ))}
            </div>
          </section>
        )}

        {/* ── Как вступить: настоящая последовательность ───────────── */}
        <section style={{ paddingTop: 64 }}>
          <h2 className="v2-title" style={{ ...slab, fontSize: "var(--t-h2)", margin: "0 0 20px" }}>Как вступить</h2>
          <div style={{ borderBottom: "1px solid var(--c-line)" }}>
            <RegistryRow mark="01" title="Заявка" text="Анкета с годом выпуска и образовательной программой. Занимает пару минут." meta="2 минуты" />
            <RegistryRow mark="02" title="Проверка учебным офисом" text="Офис сверяет выпуск с реестром факультета и подтверждает статус." meta="1–3 рабочих дня" />
            <RegistryRow mark="03" title="Статус выпускника" text="Кабинет, цена выпускника на ДПО, события с баллами, сообщество однокурсников." meta="навсегда, без взносов" />
          </div>
        </section>

        {/* ── Финальный призыв ─────────────────────────────────────── */}
        <section style={{ margin: "72px 0 0", background: "var(--c-bg-inverse)", color: "var(--c-text-inverse)", borderRadius: "var(--r-lg)", padding: "56px 40px" }}>
          <h2 style={{ ...slab, fontSize: "var(--t-h2)", margin: 0, maxWidth: "18ch" }}>{text(cta.title, "Вы уже выпускник. Осталось это подтвердить.")}</h2>
          <p style={{ margin: "16px 0 0", fontSize: "var(--t-body)", lineHeight: 1.6, maxWidth: "56ch", opacity: 0.82 }}>
            {text(cta.text, "Учебный офис сверит выпуск с реестром факультета и откроет кабинет. Взносов нет.")}
          </p>
          <Link to="/v2/join" className="foc" style={{ display: "inline-block", marginTop: 28, textDecoration: "none", background: "var(--c-accent)", color: "var(--c-on-accent)", fontWeight: 600, fontSize: 16, padding: "16px 34px", borderRadius: "var(--r-md)" }}>
            {text(cta.button, "Подать заявку")}
          </Link>
        </section>
      </main>

    </V2Shell>
  );
}
