import { useRef } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useNewsList, usePage, useTimeline, formatNewsDate } from "../lib/queries.js";
import { apiGet } from "../lib/api.js";
import { token } from "../lib/cart.js";
import { useHead } from "../lib/title.js";
import { HeroPicture } from "../components/HeroPicture.js";
import { V2Shell, text } from "../v2/Shell.js";
import { useVestnikMotion } from "../v2/home-motion.js";
import "../styles/vestnik-home.css";

type EventItem = { id: string; title: string; starts_at: string; location?: string | null; format?: string | null; points?: number | null };

const MARQUEE = [
  "1996", "2004", "2012", "2018", "2024",
  "гражданское", "уголовное", "международное", "финансовое", "цифровое право",
];

/* Шапка уже держит бренд – H1 = одно обещание, не третье «Клуб выпускников». */
const HERO_FALLBACK_TITLE = "Статус выпускника – после проверки офисом";
const HERO_FALLBACK_SUB =
  "Встречи, программы ДПО и кабинет участника. Оплаты и взносов на сайте нет.";
const CTA_FALLBACK =
  "Подайте заявку – учебный офис сверит выпуск с реестром факультета и откроет кабинет. Оплаты и взносов на сайте нет.";

/** Старые маркетинговые формулировки из CMS – не показываем в предрелизе. */
function sober(value: string | null | undefined, fallback: string, stale: RegExp): string {
  const v = (value ?? "").trim();
  if (!v || stale.test(v)) return fallback;
  return v;
}

function soberMetric(metric: string | null | undefined): string | null {
  const v = (metric ?? "").trim();
  if (!v) return null;
  if (/только начало/i.test(v)) return "предрелиз";
  return v;
}

function timelineCard(r: { title: string; text?: string | null; metric?: string | null }) {
  let title = r.title;
  let body = (r.text ?? "").trim();
  if (/геймификац/i.test(title)) {
    title = "Уровни и баллы";
    if (/бейдж|геймификац/i.test(body)) body = "Уровни статуса, баллы и достижения за участие в жизни клуба.";
  }
  if (title === "Сегодня" || /только начало/i.test(r.metric ?? "")) {
    title = "Сейчас";
    body = "Предрелизная версия портала: витрины, кабинет и афиша в работе.";
  }
  if (/собирается в сообщество/i.test(body)) body = "Первый выпуск и запуск личного кабинета.";
  if (/Открывается доступ к программам/i.test(body)) {
    body = "Каталог программ доп. образования и цена выпускника после проверки.";
  }
  if (/растущее сообщество|менторством/i.test(body)) {
    body = "Предрелизная версия портала: витрины, кабинет и афиша в работе.";
  }
  return { title, body, metric: soberMetric(r.metric) };
}

/** Главная портала клуба: full-bleed Фемида, бренд, живой motion. */
export default function HomeV2() {
  useHead({
    title: "Клуб выпускников факультета права",
    description: "Клуб выпускников факультета права НИУ ВШЭ: встречи, программы ДПО и кабинет участника.",
  });
  const page = usePage("home");
  const timeline = useTimeline();
  const news = useNewsList(3);
  const events = useQuery({ queryKey: ["events"], queryFn: () => apiGet<EventItem[]>("/events") });
  const authed = !!token();
  const hero = page.data?.blocks.hero ?? {};
  const cta = page.data?.blocks.cta ?? {};
  const configuredTitle = `${hero.title_pre || ""} ${hero.title_accent || ""}`.trim();
  const title = sober(
    configuredTitle,
    HERO_FALLBACK_TITLE,
    /который\s+работает|клуб\s+выпускников/i,
  );
  const subtitle = sober(
    hero.subtitle,
    HERO_FALLBACK_SUB,
    /открывает цену|сообщество однокурсников|статус,?\s*скидк|статус\s+выпускника\s*[–-]/i,
  );
  const ctaText = sober(
    cta.text,
    CTA_FALLBACK,
    /получите статус|скидки и доступ к витринам|честные сроки|1\s*[–-]\s*3\s*рабочих/i,
  );
  const historyTitle = sober(hero.history_title, "Ключевые этапы", /к сообществу|первого выпуска/i);
  const historyHint = sober(hero.history_hint, "Листайте вбок", /таймлайн движется|↓/);
  const records = timeline.data ?? [];
  const upcoming = (events.data ?? [])
    .filter((e) => Date.parse(e.starts_at) >= Date.now())
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
    .slice(0, 2);

  const rootRef = useRef<HTMLElement>(null);
  useVestnikMotion(rootRef);

  const marqueeBits = [...MARQUEE, ...MARQUEE];

  return (
    <V2Shell>
      <main id="main" ref={rootRef} className="vestnik-home">
        <section className="vestnik-hero" id="top" aria-label="Клуб выпускников">
          <div className="vestnik-hero-atmosphere">
            <HeroPicture
              path="assets/themis.jpeg"
              className="vestnik-themis"
              alt="Фемида с весами и мечом – знак клуба выпускников факультета права"
              width={700}
              height={900}
            />
            <div className="vestnik-grain" aria-hidden />
            <div className="vestnik-wash" aria-hidden />
          </div>
          <div className="vestnik-hero-copy">
            <div className="vestnik-hero-copy-inner">
              <h1>{title}</h1>
              <p className="vestnik-lead">
                {subtitle}
              </p>
              <div className="vestnik-actions">
                <Link to={authed ? "/lk" : "/join"} className="vestnik-button foc">
                  {authed ? "Мой кабинет" : text(hero.cta_primary, "Вступить в клуб")}
                </Link>
                {!authed && (
                  <Link to="/lk" className="vestnik-text-link foc">
                    Уже в клубе – войти
                  </Link>
                )}
              </div>
            </div>
          </div>
        </section>

        <div className="vestnik-marquee" aria-hidden tabIndex={-1}>
          <div className="vestnik-marquee-track">
            {marqueeBits.map((bit, i) => (
              <span key={`${bit}-${i}`}>{bit}</span>
            ))}
          </div>
        </div>

        <nav aria-label="Разделы клуба" className="vestnik-index">
          {[
            { to: "/events", title: "События", description: "Афиша и запись на встречи" },
            { to: "/dpo", title: "Программы ДПО", description: "Каталог факультета права" },
            {
              to: authed ? "/lk" : "/join",
              title: authed ? "Кабинет" : "Вступление",
              description: authed ? "Профиль и разделы участника" : "Заявка и проверка выпуска",
            },
          ].map((entry, i) => (
            <Link key={entry.to} to={entry.to} className="foc vestnik-scrub">
              <span className="vestnik-index__num" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
              <strong>{entry.title}</strong>
              <span>{entry.description}</span>
            </Link>
          ))}
        </nav>

        <div className="vestnik-folio">
          {upcoming.length > 0 && (
            <section className="vestnik-agenda vestnik-scrub">
              <div className="vestnik-section-head">
                <h2>Ближайшие события</h2>
                <Link to="/events" className="foc">Вся афиша и запись</Link>
              </div>
              {upcoming.map((e) => (
                <Link key={e.id} to={`/events/${e.id}`} className="vestnik-meeting foc">
                  <time dateTime={e.starts_at}>
                    <strong>{new Date(e.starts_at).toLocaleDateString("ru-RU", { day: "numeric", timeZone: "Europe/Moscow" })}</strong>
                    <span>
                      {new Date(e.starts_at)
                        .toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Moscow" })
                        .replace(/^\d+\s+/, "")}
                    </span>
                  </time>
                  <div>
                    <h3>{e.title}</h3>
                    <p>{e.location || (e.format === "online" ? "Онлайн" : "Место уточняется")}</p>
                    <span className="vestnik-meeting-link">Подробнее и запись</span>
                  </div>
                </Link>
              ))}
            </section>
          )}
          {(news.data ?? []).length > 0 && (
            <section className="vestnik-news vestnik-scrub">
              <div className="vestnik-section-head">
                <h2>Новости</h2>
                <Link to="/news" className="foc">Все новости</Link>
              </div>
              {(news.data ?? []).map((n) => (
                <article key={n.slug}>
                  <time>{n.published_at ? formatNewsDate(n.published_at).replace(/ г\.$/, "") : ""}</time>
                  <h3>
                    <Link to={`/news/${n.slug}`} className="foc">{n.title}</Link>
                  </h3>
                  {n.excerpt && <p>{n.excerpt}</p>}
                </article>
              ))}
            </section>
          )}
        </div>

        <section className="vestnik-access vestnik-scrub">
          <h2>Что доступно выпускнику</h2>
          <div className="vestnik-access-row">
            <h3><Link to="/dpo" className="foc">Программы ДПО</Link></h3>
            <p>Курсы и интенсивы факультета с ценой выпускника. Содержание, формат, длительность и условия участия.</p>
            <Link to="/dpo" className="vestnik-text-link foc">Выбрать программу</Link>
          </div>
          <div className="vestnik-access-row">
            <h3><Link to="/merch" className="foc">Мерч клуба</Link></h3>
            <p>Одежда и аксессуары с символикой клуба. Варианты, остатки, самовывоз или доставка.</p>
            <Link to="/merch" className="vestnik-text-link foc">Перейти в магазин</Link>
          </div>
        </section>

        <section id="kak" className="vestnik-join vestnik-scrub">
          <div>
            <h2>Три шага и вы в клубе</h2>
            <p>{ctaText}</p>
            <Link to={authed ? "/lk" : "/join"} className="vestnik-button foc">
              {authed ? "Открыть кабинет" : text(cta.button, "Подать заявку")}
            </Link>
          </div>
          <ol>
            <li>
              <h3>Заявка</h3>
              <p>Анкета с годом выпуска и образовательной программой.</p>
            </li>
            <li>
              <h3>Проверка учебным офисом</h3>
              <p>Офис сверяет выпуск с реестром факультета и подтверждает статус.</p>
            </li>
            <li>
              <h3>Доступ к кабинету</h3>
              <p>После проверки откроются кабинет, цена выпускника на ДПО и разделы клуба.</p>
            </li>
          </ol>
        </section>

        {records.length > 0 && (
          <section className="vestnik-history vestnik-scrub" aria-labelledby="vestnik-history-title">
            <header className="vestnik-history__head">
              <p className="vestnik-eyebrow">{text(hero.history_eyebrow, "История клуба")}</p>
              <h2 id="vestnik-history-title">{historyTitle}</h2>
              <p className="vestnik-history__hint">{historyHint}</p>
            </header>
            <ol className="vestnik-timeline">
              {records.map((r, i) => {
                const card = timelineCard(r);
                return (
                  <li key={r.id} className="vestnik-timeline__item" style={{ ["--step" as string]: i }}>
                    <time dateTime={r.year}>{r.year}</time>
                    <div className="vestnik-timeline__card">
                      <h3>{card.title}</h3>
                      {card.body && <p>{card.body}</p>}
                      {card.metric && <span className="vestnik-timeline__metric">{card.metric}</span>}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        )}
      </main>
    </V2Shell>
  );
}
