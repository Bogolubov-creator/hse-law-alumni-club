import { Link } from "react-router-dom";
import { computeOrderTotals } from "@club/shared";
import { useQuery } from "@tanstack/react-query";
import { useNewsList, usePage, formatNewsDate } from "../lib/queries.js";
import { apiGet, rub } from "../lib/api.js";
import { token, usePrograms, useMemberDiscount } from "../lib/cart.js";
import { useHead } from "../lib/title.js";
import { V2Shell, text } from "../v2/Shell.js";
import { HeroPicture } from "../components/HeroPicture.js";
import { mediaUrl } from "../lib/public-url.js";
import "../styles/home.css";

type EventItem = { id: string; title: string; starts_at: string; location?: string | null; format?: string | null; points?: number | null };

/* Шапка уже держит бренд – H1 = одно обещание, не третье «Клуб выпускников». */
const HERO_FALLBACK_TITLE = "Встречи, знания и связи после выпуска";
const HERO_FALLBACK_SUB =
  "Клуб выпускников факультета права Вышки: встречи, программы ДПО с ценой выпускника и кабинет участника.";
const CTA_FALLBACK =
  "Подайте заявку – учебный офис сверит выпуск с реестром факультета и откроет кабинет. Обычно это 1–2 рабочих дня.";

/** Первоисточник фотографий и интервью – сайт факультета права. */
const FACULTY_ALUMNI_PAGE = "https://pravo.hse.ru/businessandlaw/alumni";
const FIRST_MEETING_NEWS = "https://pravo.hse.ru/news/1133936920.html";

/** Обложки с логотипом факультета (просмотрены 12.09); остальные – сток без символики. */
const FACULTY_COVERS = ["472681893", "474599435", "474776084", "494685723", "589527758", "802031223", "905186485", "906651510"];

/** Старые маркетинговые формулировки из CMS – не показываем в предрелизе. */
function sober(value: string | null | undefined, fallback: string, stale: RegExp): string {
  const v = (value ?? "").trim();
  if (!v || stale.test(v)) return fallback;
  return v;
}

/** Одно курсивное слово в титуле – как в референсе; остальное прямым Slab. */
function Emphasized({ title }: { title: string }) {
  const words = title.split(" ");
  if (words.length < 3) return <>{title}</>;
  const last = words.pop()!;
  return <>{words.join(" ")} <em>{last}</em></>;
}

const dayOf = (iso: string) => new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", timeZone: "Europe/Moscow" });
const monthOf = (iso: string) =>
  new Date(iso).toLocaleDateString("ru-RU", { month: "long", timeZone: "Europe/Moscow" });
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });

/**
 * Главная «Фасад и зал» (направление утверждено заказчиком 12.09): каждая полоса
 * строится на фотографии факультета во весь край. Ни eyebrow, ни списков-реестров;
 * HSE Slab 400 с одним курсивным словом, капс-кнопки 4px, движения нет.
 */
export default function HomeV2() {
  useHead({
    title: "Клуб выпускников факультета права",
    description: "Клуб выпускников факультета права НИУ ВШЭ: встречи, программы ДПО и кабинет участника.",
  });
  const page = usePage("home");
  const news = useNewsList(3);
  const programs = usePrograms();
  const discount = useMemberDiscount();
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
  const upcoming = (events.data ?? [])
    .filter((e) => Date.parse(e.starts_at) >= Date.now())
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
    .slice(0, 2);
  const featured = (programs.data ?? [])
    .filter((p) => p.enrollment !== "nonactual" && FACULTY_COVERS.some((id) => (p.cover ?? "").includes(`/${id}.`)))
    .slice(0, 4);
  const joinTo = authed ? "/lk" : "/join";

  return (
    <V2Shell>
      <main id="main" className="home">
        {/* 1. Фасад: фото во весь край слева, чёрная панель с одной фразой справа */}
        <section className="home-hero" aria-label="Клуб выпускников факультета права">
          <div className="home-hero__photo">
            <HeroPicture
              path="assets/photos/themis-facade.jpg"
              alt="Фемида с весами у входа в здание Высшей школы экономики"
              width={1024}
              height={597}
            />
          </div>
          <div className="home-hero__panel club-dark">
            <h1><Emphasized title={title} /></h1>
            <p className="home-hero__lead">{subtitle}</p>
            <div className="home-actions">
              <Link to={joinTo} className="foc home-btn">{authed ? "Мой кабинет" : text(hero.cta_primary, "Вступить в клуб")}<span aria-hidden="true">→</span></Link>
              <Link to="/dpo" className="foc home-btn home-btn--ghost">Программы ДПО</Link>
            </div>
          </div>
        </section>

        {/* 2. Зал: ближайшие встречи слева, аудитория факультета во весь край справа */}
        <section className="home-agenda" aria-labelledby="home-agenda-title" data-reveal>
          <div className="home-agenda__copy">
            <h2 id="home-agenda-title">Ближайшие <em>встречи</em></h2>
            {upcoming.length > 0 ? (
              <div className="home-agenda__list">
                {upcoming.map((e) => (
                  <Link key={e.id} to={`/events/${e.id}`} className="foc home-agenda__item">
                    <time dateTime={e.starts_at}>
                      <strong>{dayOf(e.starts_at)}</strong>
                      <span>{monthOf(e.starts_at)} · {timeOf(e.starts_at)}</span>
                    </time>
                    <span className="home-agenda__body">
                      <span className="home-agenda__title">{e.title}</span>
                      <span className="home-agenda__place">{e.location || (e.format === "online" ? "Онлайн" : "Место уточняется")}</span>
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="home-agenda__empty">Афиша на ближайшие недели формируется. Записи на встречи открываются участникам клуба.</p>
            )}
            <Link to="/events" className="foc home-btn home-btn--ghost home-agenda__all">Вся афиша</Link>
          </div>
          <div className="home-agenda__photo">
            <img src={mediaUrl("/assets/photos/hall-audience.jpg")} alt="Аудитория факультета права во время лекции" width={1083} height={722} loading="lazy" decoding="async" />
          </div>
        </section>

        {/* 3. Витрина ДПО: обложки программ как предметы на белом */}
        <section className="home-dpo" aria-labelledby="home-dpo-title" data-reveal>
          <div className="home-dpo__head">
            <h2 id="home-dpo-title">Программы ДПО с ценой <em>выпускника</em></h2>
            <p>Курсы и интенсивы факультета права. {discount > 0 ? `Скидка ${discount}% уже учтена в ценах программ.` : "Показаны базовые цены. Цена участника клуба открывается после подтверждения выпуска."}</p>
          </div>
          {featured.length > 0 && (
            <div className="home-dpo__grid">
              {featured.map((p) => (
                <Link key={p.slug} to={`/dpo/${p.slug}`} className="foc home-dpo__item">
                  <span className="home-dpo__cover">
                    <img src={mediaUrl(p.cover!)} alt="" width={640} height={360} decoding="async" />
                  </span>
                  <span className="home-dpo__title">{p.title}</span>
                  <span className="home-dpo__meta">{p.direction}</span>
                  <span className="home-dpo__price">{rub(computeOrderTotals([{ type: "dpo", price: p.price, qty: 1 }], discount).total)}</span>
                </Link>
              ))}
            </div>
          )}
          <Link to="/dpo" className="foc home-btn home-dpo__all">Весь каталог</Link>
        </section>

        {/* 4. Встреча клуба: фото во всю ширину, чёрная подпись под ним */}
        <section className="home-meeting" aria-labelledby="home-meeting-title" data-reveal>
          <div className="home-meeting__photo">
            <img src={mediaUrl("/assets/photos/alumni-meeting.jpg")} alt="Выпускники факультета права на первой встрече клуба в актовом зале Вышки" width={1083} height={722} loading="lazy" decoding="async" />
          </div>
          <div className="home-meeting__caption club-dark">
            <h2 id="home-meeting-title">Первая встреча клуба, <em>27 февраля</em></h2>
            <p>Выпускники разных лет собрались в Вышке, чтобы договориться о задачах клуба: устойчивое сообщество, постоянный канал между выпускниками и студентами, поддержка карьеры.</p>
            <a href={FIRST_MEETING_NEWS} target="_blank" rel="noopener noreferrer" className="foc home-btn home-btn--ghost">Репортаж на pravo.hse.ru ↗</a>
          </div>
        </section>

        {/* Сообщество: отдельный кадр со встречи выпускников 2025 года */}
        <section id="community" className="home-voice home-community" aria-labelledby="home-community-title" data-reveal>
          <div className="home-voice__photo">
            <img src={mediaUrl("/assets/photos/alumni-conversation-2025.webp")} alt="Выпускники факультета права общаются на встрече 15 февраля 2025 года" width={1280} height={853} loading="lazy" decoding="async" />
          </div>
          <div className="home-voice__copy">
            <h2 id="home-community-title">Свои люди <em>после выпуска</em></h2>
            <p>Встретить однокурсников, познакомиться с коллегами из других выпусков, обменяться опытом. Клуб помогает оставаться на связи с факультетом и друг с другом.</p>
            <Link to="/events" className="foc home-btn home-btn--ghost">Встречи клуба <span aria-hidden="true">→</span></Link>
          </div>
        </section>

        {/* 5. Голос выпускника: портрет слева, слово справа */}
        <section className="home-voice" aria-labelledby="home-voice-title" data-reveal>
          <div className="home-voice__photo">
            <img src={mediaUrl("/assets/photos/alumni-voice.jpg")} alt="Екатерина Салугина-Сорокова, выпускница факультета права 2006 года" width={1083} height={720} decoding="async" />
          </div>
          <div className="home-voice__copy">
            <h2 id="home-voice-title">Екатерина Салугина-Сорокова, <em>выпуск 2006</em></h2>
            <p>Первый вице-президент Газпромбанка – о факультете, карьере и о том, зачем выпускникам клуб.</p>
            <a href={FACULTY_ALUMNI_PAGE} target="_blank" rel="noopener noreferrer" className="foc home-btn home-btn--ghost">Читать интервью ↗</a>
          </div>
        </section>

        {/* 6. Вступление: чёрная полоса, три шага и одно действие */}
        <section id="kak" className="home-join club-dark" aria-labelledby="home-join-title" data-reveal>
          <div className="home-join__copy">
            <h2 id="home-join-title">Три шага, и вы <em>в клубе</em></h2>
            <p>{ctaText}</p>
            <ol className="home-join__steps">
              <li><strong>Заявка</strong><span>Анкета с годом выпуска и образовательной программой.</span></li>
              <li><strong>Проверка учебным офисом</strong><span>Офис сверяет выпуск с реестром факультета и подтверждает статус.</span></li>
              <li><strong>Кабинет</strong><span>Откроются цена выпускника на ДПО, запись на встречи и разделы клуба.</span></li>
            </ol>
            <Link to={joinTo} className="foc home-btn">{authed ? "Открыть кабинет" : text(cta.button, "Подать заявку")}<span aria-hidden="true">→</span></Link>
          </div>
          {/* Фемида клуба выпускников – постер из фирменного набора клуба */}
          <div className="home-join__art">
            <img src={mediaUrl("/assets/photos/themis-club.jpg")} alt="Фемида – знак клуба выпускников факультета права" width={576} height={575} loading="lazy" decoding="async" />
          </div>
        </section>

        {/* 7. Новости: три публикации, дата плитой */}
        {(news.data ?? []).length > 0 && (
          <section className="home-news" aria-labelledby="home-news-title" data-reveal>
            <div className="home-news__head">
              <h2 id="home-news-title">Новости</h2>
              <Link to="/news" className="foc club-caps home-news__all">Все новости</Link>
            </div>
            <div className="home-news__grid">
              {(news.data ?? []).map((n) => (
                <article key={n.slug}>
                  <time>{n.published_at ? formatNewsDate(n.published_at).replace(/ г\.$/, "") : ""}</time>
                  <h3><Link to={`/news/${n.slug}`} className="foc">{n.title}</Link></h3>
                  {n.excerpt && <p>{n.excerpt}</p>}
                </article>
              ))}
            </div>
          </section>
        )}
      </main>
    </V2Shell>
  );
}
