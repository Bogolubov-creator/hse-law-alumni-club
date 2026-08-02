import { useNavigate } from "react-router-dom";
import { token } from "../../lib/cart.js";
import { useMe, useLedger, formatNewsDate } from "../../lib/queries.js";
import { useHead } from "../../lib/title.js";
import { INK, mono, CARD, REASON_RU } from "../theme.js";
import { Loader, OverlayHeader, OverlaySignIn } from "../ui.js";

export function MobileLedger() {
  useHead({ title: "История баллов", noindex: true });
  const nav = useNavigate();
  const me = useMe(token());
  const ledger = useLedger(token());
  return (
    <div style={{ height: "100dvh", background: "#FBF3E8", display: "flex", flexDirection: "column", overflow: "hidden", color: INK, fontFamily: "'Onest', system-ui, sans-serif" }}>
      <OverlayHeader title="История баллов" sub={me.data ? `Баланс · ${me.data.level.points} баллов` : undefined} onBack={() => nav("/")} />
      <div className="noscroll" style={{ flex: 1, overflowY: "auto" }}>
        {ledger.isLoading && <Loader />}
        {(ledger.isError || me.isError) && <OverlaySignIn />}
        {ledger.data?.length === 0 && <p style={{ padding: 20, ...mono, fontSize: 13, color: "#9B9584" }}>Пока нет начислений.</p>}
        <div style={{ padding: "12px 20px 40px", display: "flex", flexDirection: "column", gap: 10 }}>
          {(ledger.data ?? []).map((l, i) => {
            const plus = l.delta >= 0;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 13, ...CARD, borderRadius: 15, padding: "14px 15px" }}>
                <span style={{ width: 40, height: 40, borderRadius: 12, background: plus ? "rgba(31,138,91,.12)" : "rgba(181,51,27,.1)", color: plus ? "#1F8A5B" : "#B5331B", ...mono, fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{plus ? "+" : ""}{l.delta}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{REASON_RU[l.reason] ?? l.reason}</div>
                  <div style={{ ...mono, fontSize: 10, color: "#9B9584", marginTop: 2 }}>{formatNewsDate(l.created_at)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
