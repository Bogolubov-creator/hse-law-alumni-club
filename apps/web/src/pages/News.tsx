import { Link } from "react-router-dom";
import { useNewsList, formatNewsDate } from "../lib/queries.js";
import { useHead } from "../lib/title.js";
import SiteShell from "../components/SiteShell.js";

export default function News() {
  useHead({ title: "Новости клуба", description: "Новости клуба выпускников факультета права Вышки: события, программы, партнёрства и жизнь сообщества." });
  const news = useNewsList();
  return (
    <SiteShell>
      <main id="main" className="min-h-screen bg-kost text-grafit">
      <div className="mx-auto max-w-[1180px] px-7 py-14">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-ohra">Новости</p>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight">Что в клубе сейчас</h1>

        {news.isLoading && <p className="mt-8 font-mono text-sm text-grafit-soft">Загрузка…</p>}
        {news.isError && <p className="mt-8 font-mono text-sm text-karmin">Не удалось загрузить новости.</p>}
        {news.data?.length === 0 && <p className="mt-8 font-mono text-sm text-grafit-soft">Пока нет публикаций.</p>}

        <div className="two-col mt-9 grid grid-cols-3 gap-6">
          {news.data?.map((n) => (
            <Link key={n.id} to={`/news/${n.slug}`} className="vcard foc block overflow-hidden rounded-[18px] border border-[#7C828C] bg-white">
              <div className="flex h-[150px] items-center justify-center bg-kost-2" style={{ backgroundImage: "repeating-linear-gradient(45deg,rgba(196,154,69,.18) 0 12px,transparent 12px 24px)" }}>
                <span className="font-mono text-[11px] text-[#8a6d28]">[ новость ]</span>
              </div>
              <div className="p-5">
                <div className="font-mono text-[11px] tracking-[0.05em] text-[#5C6470]">{formatNewsDate(n.published_at)}</div>
                <div className="mt-2.5 font-display text-[17px] font-semibold leading-tight tracking-tight">{n.title}</div>
                <p className="mt-2.5 text-sm leading-snug text-[#5C6470]">{n.excerpt}</p>
                <div className="mt-3.5 text-sm font-semibold text-[#2E6FAE]">Читать →</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
    </SiteShell>
  );
}
