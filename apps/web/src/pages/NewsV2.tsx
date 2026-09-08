import { Link, useParams } from "react-router-dom";
import { useNewsList, useNewsPost, formatNewsDate } from "../lib/queries.js";
import { useHead } from "../lib/title.js";
import { V2Shell, ShowcaseHead, mono, disp, pageTitle } from "../v2/Shell.js";

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
    description: "Новости клуба выпускников факультета права Вышки: события, программы, партнёрства и жизнь сообщества.",
    canonical: `${typeof window !== "undefined" ? window.location.origin : ""}/news`,
    noindex: false,
  });
  const news = useNewsList();
  const list = news.data ?? [];

  return (
    <V2Shell>
      <main id="main" style={{ maxWidth: "var(--container)", margin: "0 auto", padding: "0 28px" }}>
        <ShowcaseHead
          eyebrow="хроника · новости"
          title="Что в клубе сейчас"
          lead="События, программы, партнёрства и жизнь сообщества выпускников факультета права."
          count={list.length ? `публикаций ${list.length}` : undefined}
        />

        {news.isLoading && <p style={{ ...label, margin: 0 }}>загружаем новости…</p>}

        {news.isError && (
          <div style={{ borderTop: "1px solid var(--c-line)", padding: "40px 0" }}>
            <p style={{ ...label, color: "var(--c-danger-text)", margin: 0 }}>новости не загрузились</p>
            <p style={{ margin: "10px 0 0", color: "var(--c-text-2)", fontSize: "var(--t-body)" }}>Проверьте соединение и попробуйте ещё раз.</p>
            <button onClick={() => news.refetch()} className="foc" style={{ marginTop: 16, border: "none", background: "var(--c-accent)", color: "var(--c-on-accent)", borderRadius: "var(--r-md)", padding: "12px 20px", fontWeight: 600, cursor: "pointer" }}>Повторить</button>
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
              className={i === 0 ? "v2-row club-news-featured" : "v2-row"}
              style={{
                display: "grid",
                gridTemplateColumns: i === 0 ? "1fr" : "150px 1fr",
                gap: 24,
                alignItems: "start",
                padding: i === 0 ? "28px 24px" : "22px 0",
                marginBottom: i === 0 ? 12 : 0,
                borderTop: i === 0 ? "none" : "1px solid var(--c-line)",
                borderRadius: i === 0 ? 12 : 0,
                background: i === 0 ? "var(--c-surface-blue, var(--c-bg-sunken))" : undefined,
              }}
            >
              {i !== 0 && <div style={{ ...label }}>{formatNewsDate(item.published_at)}</div>}
              <div style={{ minWidth: 0 }}>
                {i === 0 && <div style={{ ...label, marginBottom: 10 }}>{formatNewsDate(item.published_at)} · главная публикация</div>}
                <Link to={`/news/${item.slug}`} className="foc" style={{ textDecoration: "none", color: "inherit" }}>
                  <h2 style={{ ...disp, fontWeight: 600, fontSize: i === 0 ? "clamp(26px, 3vw, 34px)" : "var(--t-h3)", lineHeight: 1.18, margin: 0 }}>{item.title}</h2>
                </Link>
                {item.excerpt && (
                  <p style={{ margin: "10px 0 0", color: "var(--c-text-2)", fontSize: i === 0 ? "var(--t-lead)" : "var(--t-body)", lineHeight: 1.55, maxWidth: i === 0 ? "68ch" : "62ch" }}>{item.excerpt}</p>
                )}
                <Link to={`/news/${item.slug}`} className="foc" style={{ display: "inline-block", marginTop: 10, ...label, color: "var(--c-accent-text)", textDecoration: "none" }}>читать →</Link>
              </div>
            </article>
          ))}
          {list.length > 0 && <div style={{ borderTop: "1px solid var(--c-line)" }} />}
        </div>
      </main>
    </V2Shell>
  );
}

export function NewsPostV2() {
  const { slug = "" } = useParams();
  const post = useNewsPost(slug);
  const d = post.data;

  useHead({
    title: post.isError ? "Новость не найдена" : d?.title ?? "Новость",
    description: d?.excerpt ?? (d ? `${d.title} – новость клуба выпускников факультета права Вышки.` : null),
    canonical: `${typeof window !== "undefined" ? window.location.origin : ""}/news/${slug}`,
    noindex: false,
  });

  const paragraphs = (d?.body ?? "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  return (
    <V2Shell>
      <main id="main" style={{ maxWidth: 720, margin: "0 auto", padding: "0 28px" }}>
        <nav style={{ ...label, paddingTop: 28 }}>
          <Link to="/news" className="foc" style={{ color: "var(--c-accent-text)", textDecoration: "none" }}>← все новости</Link>
        </nav>

        {post.isLoading && <p style={{ ...label, paddingTop: 40 }}>загружаем публикацию…</p>}

        {post.isError && (
          <div style={{ padding: "56px 0" }}>
            <h1 style={{ ...disp, fontWeight: 700, fontSize: "var(--t-h2)", margin: 0 }}>Новость не найдена</h1>
            <p style={{ margin: "12px 0 0", color: "var(--c-text-2)", fontSize: "var(--t-body)", lineHeight: 1.55 }}>
              Такой публикации нет – возможно, адрес устарел.
            </p>
            <Link to="/news" className="foc" style={{ display: "inline-block", marginTop: 20, background: "var(--c-accent)", color: "var(--c-on-accent)", borderRadius: "var(--r-md)", padding: "13px 22px", fontWeight: 600, textDecoration: "none" }}>
              Все новости
            </Link>
          </div>
        )}

        {d && (
          <article style={{ paddingTop: 26, paddingBottom: 20 }}>
            <div style={label}>{formatNewsDate(d.published_at)}</div>
            <h1 style={{ ...pageTitle, fontSize: "var(--t-h2)", lineHeight: 1.12, margin: "12px 0 0" }}>{d.title}</h1>
            {d.excerpt && (
              <p style={{ margin: "18px 0 0", fontSize: "var(--t-lead)", lineHeight: 1.5, color: "var(--c-text-2)" }}>{d.excerpt}</p>
            )}
            {paragraphs.length > 0 && (
              <div style={{ marginTop: 26, paddingTop: 22, borderTop: "1px solid var(--c-line-strong)" }}>
                {paragraphs.map((para, i) => (
                  <p key={i} style={{ margin: i ? "16px 0 0" : 0, fontSize: "var(--t-body)", lineHeight: 1.7, color: "var(--c-text)" }}>{para}</p>
                ))}
              </div>
            )}
          </article>
        )}
      </main>
    </V2Shell>
  );
}
