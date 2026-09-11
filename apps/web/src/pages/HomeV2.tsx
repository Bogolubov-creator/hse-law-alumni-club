import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useNewsList, usePage, useTimeline, formatNewsDate } from "../lib/queries.js";
import { apiGet } from "../lib/api.js";
import { token } from "../lib/cart.js";
import { useHead } from "../lib/title.js";
import { V2Shell, text } from "../v2/Shell.js";
import { HeroPicture } from "../components/HeroPicture.js";
import { publicUrl } from "../lib/public-url.js";
import "../styles/home.css";

type EventItem = { id: string; title: string; starts_at: string; location?: string | null; format?: string | null; points?: number | null };

/* Шапка уже держит бренд – H1 = одно обещание, не третье «Клуб выпускников». */
const HERO_FALLBACK_TITLE = "Встречи, знания и связи после выпуска";
const HERO_FALLBACK_SUB =
  "Встречи, программы ДПО и кабинет участника. Оплаты и взносов на сайте нет.";
const CTA_FALLBACK =
  "Подайте заявку – учебный офис сверит выпуск с реестром факультета и откроет кабинет. Оплаты и взносов на сайте нет.";

/** Первоисточник фотографий и интервью – страница клуба на сайте факультета. */
const FACULTY_ALUMNI_PAGE = "https://pravo.hse.ru/businessandlaw/alumni";

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

const dayOf = (iso: string) => new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", timeZone: "Europe/Moscow" });
const monthOf = (iso: string) =>
  new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Moscow" }).replace(/^\d+\s+/, "");

/**
 * Главная по референсу (12.09.2026): разворот 50/50 с тёмной панелью и фото
 * встречи, полосы белое → тёмное, hairline вместо теней, движения нет.
 */
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
  const title = sober(configuredTitle, HERO_FALLBACK_TITLE, /который\s+работает|клуб\s+выпускников/i);
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
  const records = timeline.data ?? [];
  const upcoming = (events.data ?? [])
    .filter((e) => Date.parse(e.starts_at) >= Date.now())
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
    .slice(0, 2);
  const joinTo = authed ? "/lk" : "/join";

  return (
    <V2Shell>
      <main id="main" className="home">
        {/* 1. Герой: тёмная панель с титулом слева, фото встречи во весь край справа */}
        <section className="home-hero" aria-label="Клуб выпускников">
          <div className="home-hero__panel club-dark">
            <p className="club-caps home-eyebrow">Клуб выпускников факультета права</p>
            <h1>{title}</h1>
            <p className="home-lead">{subtitle}</p>
            <div className="home-actions">
              <Link to={joinTo} className="foc home-btn">
                {authed ? "Мой кабинет" : text(hero.cta_primary, "Вступить в клуб")}
              </Link>
              {!authed && <Link to="/lk" className="foc home-btn home-btn--ghost">Уже в клубе – войти</Link>}
            </div>
          </div>
          <div className="home-hero__photo">
            <HeroPicture
              path="assets/alumni-meeting.jpg"
              alt="Выпускники факультета права на встрече клуба в актовом зале Вышки"
              width={1083}
              height={722}
            />
          </div>
        </section>

        {/* 2. Индекс разделов: три входа на hairline */}
        <nav aria-label="Разделы клуба" className="home-index">
          {[
            { to: "/events", title: "События", description: "Афиша и запись на встречи" },
            { to: "/dpo", title: "Программы ДПО", description: "Каталог факультета права с ценой выпускника" },
            {
              to: joinTo,
              title: authed ? "Кабинет" : "Вступление",
              description: authed ? "Профиль и разделы участника" : "Заявка и проверка выпуска",
            },
          ].map((entry, i) => (
            <Link key={entry.to} to={entry.to} className="foc home-index__item">
              <span className="home-index__num" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
              <strong>{entry.title}</strong>
              <span>{entry.description}</span>
            </Link>
          ))}
        </nav>

        {/* 3. Афиша и новости */}
        {(upcoming.length > 0 || (news.data ?? []).length > 0) && (
          <div className="home-folio">
            {upcoming.length > 0 && (
              <section className="home-agenda" aria-labelledby="home-agenda-title">
                <div className="home-section-head">
                  <h2 id="home-agenda-title">Ближайшие события</h2>
                  <Link to="/events" className="foc club-caps">Вся афиша</Link>
                </div>
                {upcoming.map((e) => (
                  <Link key={e.id} to={`/events/${e.id}`} className="foc home-meeting">
                    <time dateTime={e.starts_at}>
                      <strong>{dayOf(e.starts_at)}</strong>
                      <span>{monthOf(e.starts_at)}</span>
                    </time>
                    <span className="home-meeting__body">
                      <span className="home-meeting__title">{e.title}</span>
                      <span className="home-meeting__place">{e.location || (e.format === "online" ? "Онлайн" : "Место уточняется")}</span>
                    </span>
                  </Link>
                ))}
              </section>
            )}
            {(news.data ?? []).length > 0 && (
              <section className="home-news" aria-labelledby="home-news-title">
                <div className="home-section-head">
                  <h2 id="home-news-title">Новости</h2>
                  <Link to="/news" className="foc club-caps">Все новости</Link>
                </div>
                {(news.data ?? []).map((n) => (
                  <article key={n.slug}>
                    <time>{n.published_at ? formatNewsDate(n.published_at).replace(/ г\.$/, "") : ""}</time>
                    <h3><Link to={`/news/${n.slug}`} className="foc">{n.title}</Link></h3>
                    {n.excerpt && <p>{n.excerpt}</p>}
                  </article>
                ))}
              </section>
            )}
          </div>
        )}

        {/* 4. Что доступно выпускнику: Фемида как образ клуба и три входа */}
        <section className="home-access" aria-labelledby="home-access-title">
          <div className="home-access__art" aria-hidden="true">
            <img src={publicUrl("assets/themis.jpeg")} alt="" width={700} height={900} loading="lazy" decoding="async" />
          </div>
          <div className="home-access__rows">
            <h2 id="home-access-title">Что доступно выпускнику</h2>
            {[
              { to: "/dpo", title: "Программы ДПО", body: "Курсы и интенсивы факультета с ценой выпускника. Содержание, формат, длительность и условия участия.", link: "Выбрать программу" },
              { to: "/podcasts", title: "Подкасты клуба", body: "Разговоры с выпускниками и преподавателями факультета. Выпуски и подписка.", link: "Слушать" },
              { to: "/merch", title: "Мерч клуба", body: "Одежда и аксессуары с символикой клуба. Варианты, остатки, самовывоз или доставка.", link: "Перейти в магазин" },
            ].map((row) => (
              <div key={row.to} className="home-access__row">
                <h3><Link to={row.to} className="foc">{row.title}</Link></h3>
                <p>{row.body}</p>
                <Link to={row.to} className="foc club-caps home-text-link">{row.link}</Link>
              </div>
            ))}
          </div>
        </section>

        {/* 5. Три шага: тёмная полоса с единственным действием */}
        <section id="kak" className="home-join club-dark" aria-labelledby="home-join-title">
          <div className="home-join__copy">
            <p className="club-caps home-eyebrow">Как вступить</p>
            <h2 id="home-join-title">Три шага и вы в клубе</h2>
            <p>{ctaText}</p>
            <Link to={joinTo} className="foc home-btn">
              {authed ? "Открыть кабинет" : text(cta.button, "Подать заявку")}
            </Link>
          </div>
          <ol className="home-join__steps">
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

        {/* 6. История клуба: этапы на hairline */}
        {records.length > 0 && (
          <section className="home-history" aria-labelledby="home-history-title">
            <div className="home-section-head">
              <div>
                <p className="club-caps home-eyebrow">{text(hero.history_eyebrow, "История клуба")}</p>
                <h2 id="home-history-title">{historyTitle}</h2>
              </div>
            </div>
            <ol className="home-timeline">
              {records.map((r) => {
                const card = timelineCard(r);
                return (
                  <li key={r.id}>
                    <time dateTime={r.year}>{r.year}</time>
                    <h3>{card.title}</h3>
                    {card.body && <p>{card.body}</p>}
                    {card.metric && <span className="club-caps home-timeline__metric">{card.metric}</span>}
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        {/* 7. Голос выпускника: портрет и ссылка на интервью-первоисточник */}
        <section className="home-voice" aria-labelledby="home-voice-title">
          <div className="home-voice__photo">
            <img src={publicUrl("assets/alumni-voice.jpg")} alt="Екатерина Салугина-Сорокова, выпускница факультета права 2006 года" width={1000} height={665} loading="lazy" decoding="async" />
          </div>
          <div className="home-voice__copy">
            <p className="club-caps home-eyebrow">Голос выпускника</p>
            <h2 id="home-voice-title">Екатерина Салугина-Сорокова, выпуск 2006</h2>
            <p>Первый вице-президент Газпромбанка – о факультете, карьере и о том, зачем выпускникам клуб. Интервью на сайте факультета права.</p>
            <a href={FACULTY_ALUMNI_PAGE} target="_blank" rel="noopener noreferrer" className="foc club-caps home-text-link">Читать интервью на pravo.hse.ru ↗</a>
          </div>
        </section>
      </main>
    </V2Shell>
  );
}
