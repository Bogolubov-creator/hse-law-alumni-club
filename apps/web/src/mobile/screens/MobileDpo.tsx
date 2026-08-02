import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { rub, type Program } from "../../lib/api.js";
import { usePrograms, useMemberDiscount } from "../../lib/cart.js";
import { useHead } from "../../lib/title.js";
import { INK, disp, mono, CARD, HEADER, FMT_COL, FMT_RU } from "../theme.js";
import { Loader, Chip } from "../ui.js";

export function MobileDpo() {
  useHead({ title: "Программы ДПО со скидкой выпускника", description: "Каталог программ ДПО факультета права НИУ ВШЭ со скидкой выпускника." });
  const programs = usePrograms();
  const discount = useMemberDiscount();
  const [dir, setDir] = useState<string | null>(null);
  const list = programs.data ?? [];
  const dirs = useMemo(() => [...new Set(list.map((p) => p.direction).filter(Boolean))], [list]);
  const shown = dir ? list.filter((p) => p.direction === dir) : list;

  return (
    <div>
      <header style={{ ...HEADER, padding: "calc(env(safe-area-inset-top, 0px) + 18px) 20px 12px" }}>
        <h1 style={{ ...disp, fontWeight: 800, fontSize: 27, letterSpacing: "-.02em", margin: 0 }}>Программы ДПО</h1>
        <div style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>Скидка выпускника на программы ДПО</div>
        <div className="noscroll" style={{ display: "flex", gap: 8, overflowX: "auto", margin: "14px -20px 0", padding: "0 20px 2px" }}>
          <Chip on={!dir} onClick={() => setDir(null)}>Все</Chip>
          {dirs.map((d) => <Chip key={d} on={dir === d} onClick={() => setDir(dir === d ? null : d)}>{d}</Chip>)}
        </div>
      </header>
      <div style={{ padding: "12px 20px 16px", display: "flex", flexDirection: "column", gap: 13 }}>
        {programs.isLoading && <Loader />}
        {shown.map((p: Program) => {
          const mem = Math.round(p.price * (1 - discount / 100));
          return (
            <Link key={p.id} to={`/dpo/${p.slug}`} style={{ ...CARD, padding: "16px 17px", boxShadow: "0 14px 32px -28px rgba(20,24,31,.5)", textDecoration: "none", color: INK }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ ...mono, fontSize: 9, letterSpacing: ".06em", color: "#fff", background: FMT_COL[p.format] ?? "#11296B", padding: "4px 8px", borderRadius: 6 }}>{FMT_RU[p.format] ?? p.format}</span>
                <span style={{ ...mono, fontSize: 10, color: "#9B9584", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.direction}</span>
              </div>
              <div style={{ ...disp, fontWeight: 600, fontSize: 16.5, lineHeight: 1.2, marginTop: 11 }}>{p.title}</div>
              {p.duration && <div style={{ ...mono, fontSize: 10.5, color: "#9B9584", marginTop: 8 }}>{p.duration}</div>}
              <div style={{ display: "flex", alignItems: "baseline", gap: 9, marginTop: 13 }}>
                <span style={{ ...disp, fontWeight: 700, fontSize: 18, color: "#EC5A13" }}>{rub(mem)}</span>
                {discount > 0 && <span style={{ ...mono, fontSize: 12, color: "#B8B0A0", textDecoration: "line-through" }}>{rub(p.price)}</span>}
                {discount > 0 && <span style={{ marginLeft: "auto", ...mono, fontSize: 11, color: "#C9450E" }}>−{discount}%</span>}
              </div>
            </Link>
          );
        })}
        {!programs.isLoading && shown.length === 0 && <p style={{ ...mono, fontSize: 13, color: "#9B9584" }}>Нет программ в этом направлении.</p>}
      </div>
    </div>
  );
}
