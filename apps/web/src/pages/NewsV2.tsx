import { canonicalNewsUrl, newsSourceLabel } from "@club/shared";
import "../styles/editorial.css";
import { ApiError } from "../lib/api.js";
import { Link, useParams } from "react-router-dom";
import { useNewsList, useNewsPost, formatNewsDate } from "../lib/queries.js";
import { useHead } from "../lib/title.js";
import { useJsonLd, siteOrigin } from "../lib/jsonld.js";
import { V2Shell, ShowcaseHead, mono, disp, pageTitle } from "../v2/Shell.js";
import { action } from "../styles/primitives.js";

/**
 * Новости v2: список (/news) и публикация (/news/:slug).
 *
 * Список – хроника реестра: дата моноширинной колонкой слева, заголовок и
 * лид справа, разделитель – линия. Плашки-заглушки «[ новость ]» из v1 не
 * переносятся: под ними нет данных, а рисовать пустое место незачем.
 *
 * SEO: канонические URL /news и /news/:slug (этап 0 cutover).
 */

const label = {
  ...mono, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)",
  textTransform: "none" as const, color: "var(--c-text-3)",
};

export function NewsV2() {
  useHead({
    title: "Новости клуба",
    description: "Новости клуба выпускников факультета права Вышки: встречи, программы ДПО и обновления портала.",
    canonical: `${typeof window !== "undefined" ? window.location.origin : ""}/news`,
    noindex: false,
  });
  const news = useNewsList();
  const list = news.data ?? [];

  return (
    <V2Shell>
      <main id="main">
        <ShowcaseHead
          photo={{ src: "assets/photos/students-talk.jpg", alt: "Студенты факультета права после церемонии", side: "left" }}
          eyebrow="новости"
          title="Новости клуба"
          lead="Анонсы встреч, программы ДПО и обновления портала."
          count={list.length ? `публикаций ${list.length}` : undefined}
        />
        <div style={{ maxWidth: "var(--container)", margin: "0 auto", padding: "0 var(--page-gutter)" }}>

        {news.isLoading && <p role="status" style={{ ...label, margin: 0 }}>загружаем новости…</p>}

        {news.isError && (
          <div style={{ borderTop: "1px solid var(--c-line)", padding: "40px 0" }}>
            <p style={{ ...label, color: "var(--c-danger-text)", margin: 0 }}>новости не загрузились</p>
            <p style={{ margin: "10px 0 0", color: "var(--c-text-2)", fontSize: "var(--t-body)" }}>Проверьте соединение и попробуйте ещё раз.</p>
            <button onClick={() => news.refetch()} className="foc" style={{ ...action, marginTop: 16 }}>Повторить</button>
          </div>
        )}

        {!news.isLoading && !news.isError && list.length === 0 && (
          <div style={{ borderTop: "1px solid var(--c-line)", padding: "40px 0" }}>
            <p style={{ margin: 0, color: "var(--c-text-2)", fontSize: "var(--t-body)" }}>Публикаций пока нет. Ближайшие встречи клуба – в разделе «События».</p>
          </div>
        )}

        <div>
          {list.map((item, i) => (
            <article
              key={item.id}
              className={`club-news-row${i === 0 ? " club-news-row--featured" : ""}`}

            >
              {i !== 0 && <time dateTime={item.published_at ?? undefined} style={{ ...label, color: "var(--c-accent-text)" }}>{formatNewsDate(item.published_at)}</time>}
              <div style={{ minWidth: 0 }}>
                {i === 0 && <div style={{ ...label, marginBottom: 10 }}><time dateTime={item.published_at ?? undefined}>{formatNewsDate(item.published_at)}</time> · последняя публикация</div>}
                <Link to={`/news/${item.slug}`} className="foc" style={{ textDecoration: "none", color: "inherit" }}>
                  <h2 style={{ ...(i === 0 ? pageTitle : disp), fontWeight: i === 0 ? 400 : 600, fontSize: i === 0 ? "clamp(28px, 3.5vw, 44px)" : "var(--t-h3)", lineHeight: 1.18, margin: 0 }}>{item.title}</h2>
                </Link>
                {item.excerpt && (
                  <p style={{ margin: "10px 0 0", color: "var(--c-text-2)", fontSize: i === 0 ? "var(--t-lead)" : "var(--t-body)", lineHeight: 1.55, maxWidth: i === 0 ? "68ch" : "62ch" }}>{item.excerpt}</p>
                )}
                {item.source_url && <p style={{ ...label, margin: "12px 0 0" }}>Источник: {newsSourceLabel(item.source_url)}</p>}
                <Link to={`/news/${item.slug}`} aria-label={`Читать: ${item.title}`} className="foc club-news-read" style={{ marginTop: 10, ...label, color: "var(--c-link)", textDecoration: "none" }}>читать →</Link>
              </div>
            </article>
          ))}
          {list.length > 0 && <div style={{ borderTop: "1px solid var(--c-line)" }} />}
        </div>
        </div>
      </main>
    </V2Shell>
  );
}

export function NewsPostV2() {
  const { slug = "" } = useParams();
  const post = useNewsPost(slug);
  const d = post.data;
  const notFound = post.error instanceof ApiError && post.error.status === 404;

  useHead({
    title: post.isError ? (notFound ? "Новость не найдена" : "Не удалось загрузить новость") : d?.title ?? "Новость",
    description: d?.excerpt ?? (d ? `${d.title} – новость клуба выпускников факультета права Вышки.` : null),
    canonical: `${typeof window !== "undefined" ? window.location.origin : ""}/news/${slug}`,
    noindex: post.isError || !d,
  });
  useJsonLd(
    d && {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "NewsArticle",
          headline: d.title,
          description: d.excerpt ?? undefined,
          articleBody: d.body ?? undefined,
          image: `${siteOrigin()}/og-card.png`,
          datePublished: d.published_at ?? undefined,
          dateModified: d.published_at ?? undefined,
          inLanguage: "ru-RU",
          mainEntityOfPage: `${siteOrigin()}/news/${slug}`,
          author: { "@type": "Organization", name: "Клуб выпускников факультета права Вышки" },
          publisher: {
            "@type": "Organization",
            name: "Клуб выпускников факультета права Вышки",
            logo: { "@type": "ImageObject", url: `${siteOrigin()}/icon-512.png` },
          },
        },
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Новости", item: `${siteOrigin()}/news` },
            { "@type": "ListItem", position: 2, name: d.title, item: `${siteOrigin()}/news/${slug}` },
          ],
        },
      ],
    },
  );

  const paragraphs = (d?.body ?? "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  return (
    <V2Shell>
      <main id="main" className="club-news-post">
        <nav style={{ ...label, paddingTop: 28 }}>
          <Link to="/news" className="foc" style={{ color: "var(--c-text-2)", textDecoration: "underline", textUnderlineOffset: 4 }}>← все новости</Link>
        </nav>

        {post.isLoading && <p role="status" style={{ ...label, paddingTop: 40 }}>загружаем публикацию…</p>}

        {post.isError && (
          <div role="alert" style={{ padding: "56px 0" }}>
            <h1 style={{ ...pageTitle, fontSize: "var(--t-h2)", margin: 0 }}>{notFound ? "Новость не найдена" : "Не удалось загрузить новость"}</h1>
            <p style={{ margin: "12px 0 0", color: "var(--c-text-2)", fontSize: "var(--t-body)", lineHeight: 1.55 }}>
              {notFound ? "Такой публикации нет – возможно, адрес устарел." : "Проверьте соединение и попробуйте ещё раз."}
            </p>
            {!notFound && <button className="foc" style={{ ...action, margin: "20px 16px 0 0" }} onClick={() => post.refetch()}>Повторить</button>}
            <Link to="/news" className="foc" style={{ ...action, marginTop: 20 }}>
              Все новости
            </Link>
          </div>
        )}

        {d && (
          <article>
            <time dateTime={d.published_at ?? undefined} style={{ ...label, color: "var(--c-accent-text)" }}>{formatNewsDate(d.published_at)}</time>
            <h1 style={{ ...pageTitle, fontSize: "clamp(32px, 4.5vw, 56px)", lineHeight: 1.12, margin: "12px 0 0" }}>{d.title}</h1>
            {d.excerpt && (
              <p style={{ margin: "18px 0 0", fontSize: "var(--t-lead)", lineHeight: 1.5, color: "var(--c-text-2)" }}>{d.excerpt}</p>
            )}
            {paragraphs.length > 0 && (
              <div className="club-news-post__body" style={{ marginTop: 26, paddingTop: 22, borderTop: "1px solid var(--c-line-strong)" }}>
                {paragraphs.map((para, i) => (
                  <p key={i} style={{ margin: i ? "16px 0 0" : 0, fontSize: "var(--t-body)", lineHeight: 1.7, color: "var(--c-text)" }}>{para}</p>
                ))}
              </div>
            )}
            <footer className="club-news-post__footer"><Link className="foc" to="/news">Все новости</Link><Link className="foc" to="/events">Ближайшие встречи</Link></footer>
            {d.source_url && canonicalNewsUrl(d.source_url) && (
              <p style={{ fontSize: "var(--t-body)", lineHeight: 1.5 }}>
                Анонс материала. <a href={d.source_url} target="_blank" rel="noopener noreferrer" className="foc club-news-read">Читать оригинал · {newsSourceLabel(d.source_url)} ↗</a>
              </p>
            )}
          </article>
        )}
      </main>
    </V2Shell>
  );
}
