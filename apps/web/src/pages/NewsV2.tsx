import { Link, useParams } from "react-router-dom";
import { useNewsList, useNewsPost, formatNewsDate } from "../lib/queries.js";
import { useHead } from "../lib/title.js";
import { V2Shell, ShowcaseHead, mono, disp, slab } from "../v2/Shell.js";

/**
 * Новости v2: список (/v2/news) и публикация (/v2/news/:slug).
 *
 * Список – хроника реестра: дата моноширинной колонкой слева, заголовок и
 * лид справа, разделитель – линия. Плашки-заглушки «[ новость ]» из v1 не
 * переносятся: под ними нет данных, а рисовать пустое место незачем.
 *
 * SEO: обе страницы noindex, canonical ведёт на v1 – там же живёт разметка
 * NewsArticle. Дублировать её на превью нельзя: получились бы две статьи
 * на одну публикацию.
 */

const label = {
  ...mono, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)",
  textTransform: "uppercase" as const, color: "var(--c-text-3)",
};

export function NewsV2() {
  useHead({
    title: "Новости клуба",
    description: "Новости клуба выпускников факультета права НИУ ВШЭ: события, программы, партнёрства и жизнь сообщества.",
    canonical: `${typeof window !== "undefined" ? window.location.origin : ""}/news`,
    noindex: true,
  });
  const news = useNewsList();
  const list = news.data ?? [];

  return (
    <V2Shell>
      <main style={{ maxWidth: "var(--container)", margin: "0 auto", padding: "0 28px" }}>
        <ShowcaseHead
          slabTitle
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
            <p style={{ margin: 0, color: "var(--c-text-2)", fontSize: "var(--t-body)" }}>Публикаций пока нет – заглядывайте позже.</p>
          </div>
        )}

        <div>
          {list.map((n) => (
            <article key={n.id} className="v2-row" style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 24, alignItems: "start", padding: "22px 0", borderTop: "1px solid var(--c-line)" }}>
              <div style={{ ...label }}>{formatNewsDate(n.published_at)}</div>
              <div style={{ minWidth: 0 }}>
                <Link to={`/v2/news/${n.slug}`} className="foc" style={{ textDecoration: "none", color: "inherit" }}>
                  <h2 style={{ ...disp, fontWeight: 600, fontSize: "var(--t-h3)", lineHeight: 1.22, margin: 0 }}>{n.title}</h2>
                </Link>
                {n.excerpt && (
                  <p style={{ margin: "10px 0 0", color: "var(--c-text-2)", fontSize: "var(--t-body)", lineHeight: 1.55, maxWidth: "62ch" }}>{n.excerpt}</p>
                )}
                <Link to={`/v2/news/${n.slug}`} className="foc" style={{ display: "inline-block", marginTop: 10, ...label, color: "var(--c-accent-text)", textDecoration: "none" }}>читать →</Link>
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
    description: d?.excerpt ?? (d ? `${d.title} – новость клуба выпускников факультета права НИУ ВШЭ.` : null),
    canonical: `${typeof window !== "undefined" ? window.location.origin : ""}/news/${slug}`,
    noindex: true,
  });

  const paragraphs = (d?.body ?? "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  return (
    <V2Shell>
      <main style={{ maxWidth: 720, margin: "0 auto", padding: "0 28px" }}>
        <nav style={{ ...label, paddingTop: 28 }}>
          <Link to="/v2/news" className="foc" style={{ color: "var(--c-accent-text)", textDecoration: "none" }}>← все новости</Link>
        </nav>

        {post.isLoading && <p style={{ ...label, paddingTop: 40 }}>загружаем публикацию…</p>}

        {post.isError && (
          <div style={{ padding: "56px 0" }}>
            <h1 style={{ ...disp, fontWeight: 700, fontSize: "var(--t-h2)", margin: 0 }}>Новость не найдена</h1>
            <p style={{ margin: "12px 0 0", color: "var(--c-text-2)", fontSize: "var(--t-body)", lineHeight: 1.55 }}>
              Такой публикации нет – возможно, адрес устарел.
            </p>
            <Link to="/v2/news" className="foc" style={{ display: "inline-block", marginTop: 20, background: "var(--c-accent)", color: "var(--c-on-accent)", borderRadius: "var(--r-md)", padding: "13px 22px", fontWeight: 600, textDecoration: "none" }}>
              Все новости
            </Link>
          </div>
        )}

        {d && (
          <article style={{ paddingTop: 26, paddingBottom: 20 }}>
            <div style={label}>{formatNewsDate(d.published_at)}</div>
            <h1 className="v2-title" style={{ ...slab, fontSize: "var(--t-h2)", lineHeight: 1.12, margin: "12px 0 0" }}>{d.title}</h1>
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
