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

/** Главная портала клуба: full-bleed Фемида, бренд, живой motion. */
export default function HomeV2() {
  useHead({
    title: "Клуб выпускников факультета права",
    description: "Клуб выпускников факультета права НИУ ВШЭ: встречи, программы ДПО и сообщество однокурсников.",
  });
  const page = usePage("home");
  const timeline = useTimeline();
  const news = useNewsList(3);
  const events = useQuery({ queryKey: ["events"], queryFn: () => apiGet<EventItem[]>("/events") });
  const authed = !!token();
  const hero = page.data?.blocks.hero ?? {};
  const cta = page.data?.blocks.cta ?? {};
  const configuredTitle = `${hero.title_pre || ""} ${hero.title_accent || ""}`.trim();
  const title = configuredTitle || "Статус выпускника, который работает";
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
              width={1600}
              height={1200}
            />
            <div className="vestnik-grain" aria-hidden />
            <div className="vestnik-wash" aria-hidden />
          </div>
          <div className="vestnik-hero-copy">
            <div className="vestnik-hero-copy-inner">
              <p className="vestnik-brand">
                Клуб выпускников
                <span>факультета права Вышки</span>
              </p>
              <h1>{title}</h1>
              <p className="vestnik-lead">
                {text(hero.subtitle, "Личный кабинет со статусом, скидка на программы ДПО, события клуба и однокурсники.")}
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

        <nav aria-label="Участие в клубе" className="vestnik-index">
          {[
            { to: "/events", title: "Встретиться", description: "Афиша и запись на встречи" },
            { to: "/dpo", title: "Продолжить учиться", description: "Программы факультета права" },
            {
              to: authed ? "/lk" : "/join",
              title: "Найти своих",
              description: authed ? "Однокурсники в личном кабинете" : "Вступление открывает сообщество однокурсников",
            },
          ].map((entry) => (
            <Link key={entry.to} to={entry.to} className="foc vestnik-scrub">
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
                <h2>Что в клубе сейчас</h2>
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
            <p>Одежда и аксессуары с фасеточной Фемидой. Варианты, остатки, самовывоз или доставка.</p>
            <Link to="/merch" className="vestnik-text-link foc">Перейти в магазин</Link>
          </div>
        </section>

        <section id="kak" className="vestnik-join vestnik-scrub">
          <div>
            <h2>Три шага и честные сроки</h2>
            <p>
              {text(
                cta.text,
                "Учебный офис сверит выпуск с реестром факультета и откроет кабинет – обычно 1–3 рабочих дня. Оплаты на сайте нет, взносов нет.",
              )}
            </p>
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
              <h3>Статус выпускника</h3>
              <p>Кабинет, цена выпускника на ДПО, события с баллами, сообщество однокурсников.</p>
            </li>
          </ol>
        </section>

        {records.length > 0 && (
          <section className="vestnik-history vestnik-scrub">
            <h2>{text(hero.history_title, "История клуба")}</h2>
            {hero.history_hint && <p>{hero.history_hint}</p>}
            <div className="vestnik-history-grid">
              {records.map((r) => (
                <article key={r.id}>
                  <time>{r.year}</time>
                  <div>
                    <h3>{r.title}</h3>
                    {r.text && <p>{r.text}</p>}
                    {r.metric && <small>{r.metric}</small>}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>
    </V2Shell>
  );
}
