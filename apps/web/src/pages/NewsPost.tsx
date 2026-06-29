import { Link, useParams } from "react-router-dom";
import { useNewsPost, formatNewsDate } from "../lib/queries.js";

export default function NewsPost() {
  const { slug = "" } = useParams();
  const post = useNewsPost(slug);

  return (
    <main className="min-h-screen bg-kost text-grafit">
      <div className="mx-auto max-w-[760px] px-7 py-14">
        <Link to="/news" className="foc font-mono text-xs text-ohra-deep">← Все новости</Link>

        {post.isLoading && <p className="mt-8 font-mono text-sm text-grafit-soft">Загрузка…</p>}
        {post.isError && <p className="mt-8 font-mono text-sm text-karmin">Новость не найдена.</p>}

        {post.data && (
          <article className="mt-6">
            <div className="font-mono text-xs tracking-[0.05em] text-[#6B7280]">{formatNewsDate(post.data.published_at)}</div>
            <h1 className="mt-3 font-display text-4xl font-bold leading-tight tracking-tight">{post.data.title}</h1>
            {post.data.excerpt && <p className="mt-4 text-lg leading-relaxed text-[#3a3f49]">{post.data.excerpt}</p>}
            <div className="mt-7 space-y-4 text-[16px] leading-relaxed text-grafit">
              {(post.data.body ?? "").split(/\n{2,}/).filter(Boolean).map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          </article>
        )}
      </div>
    </main>
  );
}
