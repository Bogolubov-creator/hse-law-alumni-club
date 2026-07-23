import { Link, useParams } from "react-router-dom";
import SiteShell from "../components/SiteShell.js";
import { useNewsPost, formatNewsDate } from "../lib/queries.js";
import { useHead } from "../lib/title.js";
import { useJsonLd, siteOrigin } from "../lib/jsonld.js";

export default function NewsPost() {
  const { slug = "" } = useParams();
  const post = useNewsPost(slug);
  const d = post.data;

  useHead({
    title: d?.title ?? "Новость",
    description: d?.excerpt ?? (d ? `${d.title} – новость клуба выпускников факультета права НИУ ВШЭ.` : null),
    canonical: `${typeof window !== "undefined" ? window.location.origin : ""}/news/${slug}`,
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
          author: { "@type": "Organization", name: "Клуб выпускников факультета права НИУ ВШЭ" },
          publisher: {
            "@type": "Organization",
            name: "Клуб выпускников факультета права НИУ ВШЭ",
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

  return (
    <SiteShell>
      <main className="mx-auto max-w-[760px] px-7 py-14">
        <Link to="/news" className="foc font-mono text-xs text-ohra-deep">← Все новости</Link>

        {post.isLoading && <p className="mt-8 font-mono text-sm text-grafit-soft">Загрузка…</p>}
        {post.isError && <p className="mt-8 font-mono text-sm text-karmin">Новость не найдена.</p>}

        {d && (
          <article className="mt-6">
            <div className="font-mono text-xs tracking-[0.05em] text-[#6B7280]">{formatNewsDate(d.published_at)}</div>
            <h1 className="mt-3 font-display text-4xl font-bold leading-tight tracking-tight">{d.title}</h1>
            {d.excerpt && <p className="mt-4 text-lg leading-relaxed text-[#3a3f49]">{d.excerpt}</p>}
            <div className="mt-7 space-y-4 text-[16px] leading-relaxed text-grafit">
              {(d.body ?? "").split(/\n{2,}/).filter(Boolean).map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          </article>
        )}
      </main>
    </SiteShell>
  );
}
