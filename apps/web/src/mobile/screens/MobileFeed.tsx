import { Link } from "react-router-dom";
import { useNewsList, formatNewsDate } from "../../lib/queries.js";
import { useHead } from "../../lib/title.js";
import { INK, disp, mono, CARD, NEWS_TINTS } from "../theme.js";
import { Loader, ScreenHeader } from "../ui.js";

export function MobileFeed() {
  useHead({ title: "Новости клуба", description: "Новости клуба выпускников факультета права НИУ ВШЭ." });
  const news = useNewsList();
  return (
    <div>
      <ScreenHeader title="Лента" sub="Новости клуба · t.me/pravohse" />
      <div style={{ padding: "8px 20px 16px", display: "flex", flexDirection: "column", gap: 15 }}>
        {news.isLoading && <Loader />}
        {news.isError && <p style={{ ...mono, fontSize: 13, color: "#C9450E" }}>Не удалось загрузить новости.</p>}
        {news.data?.length === 0 && <p style={{ ...mono, fontSize: 13, color: "#9B9584" }}>Пока нет публикаций.</p>}
        {news.data?.map((n, i) => (
          <Link key={n.id} to={`/news/${n.slug}`} style={{ ...CARD, overflow: "hidden", boxShadow: "0 14px 32px -26px rgba(20,24,31,.5)", textDecoration: "none", color: INK }}>
            <div style={{ height: 96, position: "relative", background: NEWS_TINTS[i % NEWS_TINTS.length], overflow: "hidden" }}>
              <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(115deg,rgba(255,255,255,.08) 0 2px,transparent 2px 13px)" }} />
              <div style={{ position: "absolute", left: 14, top: 12, ...mono, fontSize: 9, letterSpacing: ".12em", color: "rgba(255,255,255,.92)", background: "rgba(0,0,0,.22)", padding: "4px 9px", borderRadius: 7 }}>НОВОСТЬ</div>
            </div>
            <div style={{ padding: "14px 16px 16px" }}>
              <div style={{ ...disp, fontWeight: 600, fontSize: 16, lineHeight: 1.25 }}>{n.title}</div>
              {n.excerpt && <div style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.45, marginTop: 8 }}>{n.excerpt}</div>}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
                <span style={{ ...mono, fontSize: 10, color: "#9B9584" }}>{formatNewsDate(n.published_at)}</span>
                <span style={{ ...mono, fontSize: 11, color: "#C9450E" }}>Читать →</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
