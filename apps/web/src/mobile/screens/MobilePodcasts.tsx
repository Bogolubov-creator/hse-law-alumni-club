import { Link } from "react-router-dom";
import { token } from "../../lib/cart.js";
import { usePodcasts } from "../../lib/queries.js";
import { useHead } from "../../lib/title.js";
import { INK, disp, mono, CARD } from "../theme.js";
import { Loader, ScreenHeader } from "../ui.js";

export function MobilePodcasts() {
  useHead({ title: "Подкасты клуба", description: "Подкасты клуба выпускников факультета права НИУ ВШЭ." });
  const q = usePodcasts(token());
  const items = q.data?.items ?? [];
  return (
    <div>
      <ScreenHeader title="Подкасты" sub="Разговоры с практиками права" />
      <div style={{ padding: "10px 20px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
        {q.isLoading && <Loader />}
        {items.length === 0 && !q.isLoading && <p style={{ ...mono, fontSize: 13, color: "#9B9584" }}>Выпусков пока нет.</p>}
        {items.map((p, i) => (
          <Link key={p.id} to={`/podcasts?ep=${encodeURIComponent(p.id)}`} style={{ display: "flex", alignItems: "center", gap: 14, ...CARD, borderRadius: 18, padding: "13px 14px", boxShadow: "0 14px 30px -28px rgba(20,24,31,.5)", textDecoration: "none", color: INK }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, flexShrink: 0, background: p.cover ? `#11296B url(${p.cover}) center/cover` : "linear-gradient(140deg,#1e2942,#11296B)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {!p.cover && <svg width="17" height="17" viewBox="0 0 24 24" fill="#FBF3E8"><path d="M8 5v14l11-7z" /></svg>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...mono, fontSize: 9.5, letterSpacing: ".08em", color: "#9B9584" }}>ВЫПУСК {i + 1}{p.duration ? ` · ${p.duration}` : ""}{p.is_free ? " · беспл." : ""}</div>
              <div style={{ ...disp, fontWeight: 600, fontSize: 14.5, lineHeight: 1.2, marginTop: 4 }}>{p.title}</div>
              {p.description && <div style={{ fontSize: 12, color: "#6B7280", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.description}</div>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
