import { useLocation, useNavigate } from "react-router-dom";
import { useNewsPost, formatNewsDate } from "../../lib/queries.js";
import { useHead } from "../../lib/title.js";
import { INK, disp, mono, NEWS_TINTS, roundDark, BackWhite } from "../theme.js";
import { Loader } from "../ui.js";

export function MobileNewsPost() {
  const { pathname } = useLocation();
  const slug = decodeURIComponent(pathname.replace(/^\/news\//, ""));
  const nav = useNavigate();
  const post = useNewsPost(slug);
  const d = post.data;
  useHead({ title: d?.title ?? "Новость", description: d?.excerpt ?? undefined, canonical: typeof window !== "undefined" ? `${window.location.origin}/news/${slug}` : undefined });
  // Оттенок героя — стабильный по slug (как цветные карточки ленты).
  const tint = NEWS_TINTS[Math.abs([...slug].reduce((s, c) => s + c.charCodeAt(0), 0)) % NEWS_TINTS.length];
  return (
    <div style={{ height: "100dvh", background: "#FBF3E8", display: "flex", flexDirection: "column", overflow: "hidden", color: INK, fontFamily: "'Onest', system-ui, sans-serif" }}>
      <div className="noscroll" style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ position: "relative", height: 150, background: tint, overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(115deg,rgba(255,255,255,.08) 0 2px,transparent 2px 14px)" }} />
          <button onClick={() => nav("/news")} aria-label="Назад" style={{ ...roundDark, position: "absolute", top: "calc(env(safe-area-inset-top, 0px) + 14px)", left: 16, background: "rgba(20,24,31,.34)" }}>{BackWhite}</button>
          <div style={{ position: "absolute", left: 20, bottom: 14, ...mono, fontSize: 9.5, letterSpacing: ".12em", color: "rgba(255,255,255,.95)", background: "rgba(0,0,0,.24)", padding: "5px 10px", borderRadius: 7 }}>НОВОСТЬ</div>
        </div>
        {post.isLoading && <Loader />}
        {post.isError && <p style={{ padding: 20, ...mono, fontSize: 13, color: "#C9450E" }}>Новость не найдена.</p>}
        {d && (
          <div style={{ padding: "18px 20px 40px" }}>
            <div style={{ ...mono, fontSize: 10, color: "#9B9584" }}>{formatNewsDate(d.published_at)}</div>
            <h1 style={{ ...disp, fontWeight: 700, fontSize: 22, lineHeight: 1.2, margin: "8px 0 0" }}>{d.title}</h1>
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 13 }}>
              {(d.body ?? d.excerpt ?? "").split(/\n{2,}/).filter(Boolean).map((para, i) => (
                <p key={i} style={{ fontSize: 14.5, lineHeight: 1.6, color: "#3a3f49", margin: 0 }}>{para}</p>
              ))}
            </div>
            <a href="https://t.me/pravohse" target="_blank" rel="noopener noreferrer" style={{ marginTop: 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 9, height: 50, borderRadius: 14, background: "#15375E", color: "#FBF3E8", fontWeight: 600, fontSize: 14, textDecoration: "none" }}>Открыть в Telegram · t.me/pravohse</a>
          </div>
        )}
      </div>
    </div>
  );
}
