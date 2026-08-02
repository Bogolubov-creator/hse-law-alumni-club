import { useNavigate } from "react-router-dom";
import { token } from "../../lib/cart.js";
import { useMe } from "../../lib/queries.js";
import { useHead } from "../../lib/title.js";
import { INK, disp, mono, CARD } from "../theme.js";
import { Loader, OverlayHeader, OverlaySignIn } from "../ui.js";

export function MobileAch() {
  useHead({ title: "Достижения", noindex: true });
  const nav = useNavigate();
  const me = useMe(token());
  const list = me.data?.achievements ?? [];
  const earned = list.filter((a) => a.earned).length;
  return (
    <div style={{ height: "100dvh", background: "#FBF3E8", display: "flex", flexDirection: "column", overflow: "hidden", color: INK, fontFamily: "'Onest', system-ui, sans-serif" }}>
      <OverlayHeader title="Достижения" sub={me.data ? `${earned}/${list.length} · ${me.data.level.points} баллов` : undefined} onBack={() => nav("/")} />
      <div className="noscroll" style={{ flex: 1, overflowY: "auto" }}>
        {me.isLoading && <Loader />}
        {me.isError && <OverlaySignIn />}
        <div style={{ padding: "14px 20px 40px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13 }}>
          {list.map((a) => {
            const active = a.earned || a.star;
            const bg = a.earned ? "linear-gradient(140deg,#2C6E80,#11296B)" : a.star ? "#EC5A13" : "#EDE4D3";
            return (
              <div key={a.key} style={{ ...CARD, borderRadius: 18, padding: "16px 14px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", opacity: active ? 1 : .55 }}>
                <div style={{ width: 56, height: 56, transform: "rotate(45deg)", borderRadius: 15, background: bg, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: a.earned ? "0 10px 22px -10px rgba(17,41,107,.6)" : "none", marginTop: 6 }}>
                  <span style={{ transform: "rotate(-45deg)", fontSize: 20, lineHeight: 1, color: active ? "#FBF3E8" : "#b8a98a" }}>{a.icon}</span>
                </div>
                <div style={{ ...disp, fontWeight: 600, fontSize: 13, marginTop: 16 }}>{a.title}</div>
                <div style={{ fontSize: 11, color: "#6B7280", lineHeight: 1.35, marginTop: 5 }}>{a.description}</div>
                <div style={{ ...mono, fontSize: 9, letterSpacing: ".08em", textTransform: "uppercase", color: a.earned ? "#1F8A5B" : "#9B9584", marginTop: 9 }}>
                  {a.earned ? "Получено" : a.target > 0 ? `${a.current} / ${a.target}` : "Закрыто"}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
