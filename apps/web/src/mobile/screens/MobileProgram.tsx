import { Link, useLocation, useNavigate } from "react-router-dom";
import { rub } from "../../lib/api.js";
import { useProgram, useMemberDiscount, useCart, useCartMutations } from "../../lib/cart.js";
import { useToast } from "../../components/Toast.js";
import { useHead } from "../../lib/title.js";
import { INK, disp, mono, CARD, FMT_COL, FMT_RU, roundDark, secTitle, factChip, stickyBar, primaryBtn, ghostBtn, BackWhite } from "../theme.js";
import { Loader } from "../ui.js";

export function MobileProgram() {
  // Оболочка рендерится вне <Route path="/dpo/:slug">, поэтому useParams пуст —
  // берём slug прямо из пути.
  const { pathname } = useLocation();
  const slug = decodeURIComponent(pathname.replace(/^\/dpo\//, ""));
  const nav = useNavigate();
  const q = useProgram(slug);
  const discount = useMemberDiscount();
  const { add } = useCartMutations();
  const cart = useCart();
  const toast = useToast();
  const p = q.data;
  useHead({ title: p?.title ?? "Программа ДПО", description: p?.description ?? undefined, canonical: typeof window !== "undefined" ? `${window.location.origin}/dpo/${slug}` : undefined });
  const count = cart.data?.count ?? 0;
  const mem = p ? Math.round(p.price * (1 - discount / 100)) : 0;
  const modules = (Array.isArray(p?.modules) && p!.modules) || [];
  const teacher = (Array.isArray(p?.teachers) && p!.teachers && p!.teachers[0]) || null;
  const doAdd = (goCart: boolean) => {
    if (!p) return;
    add.mutate({ type: "dpo", ref_id: p.slug, qty: 1 }, {
      onSuccess: () => { toast(goCart ? "Добавлено — оформите заявку" : `«${p.title}» в корзине`); if (goCart) nav("/cart"); },
      onError: (e) => toast((e as Error).message, "err"),
    });
  };
  return (
    <div style={{ height: "100dvh", background: "#FBF3E8", display: "flex", flexDirection: "column", overflow: "hidden", color: INK, fontFamily: "'Onest', system-ui, sans-serif" }}>
      <div className="noscroll" style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ position: "relative", height: 200, overflow: "hidden", background: "linear-gradient(150deg,#1e2942,#11296B 60%,#0f1c3f)" }}>
          <img src="/assets/themis.jpeg" alt="" style={{ position: "absolute", right: -30, bottom: -30, width: 190, height: 190, objectFit: "cover", opacity: .16, transform: "rotate(8deg)" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(20,24,31,.15),rgba(20,24,31,.86))" }} />
          <div style={{ position: "absolute", top: "calc(env(safe-area-inset-top, 0px) + 14px)", left: 16, right: 16, display: "flex", justifyContent: "space-between" }}>
            <button onClick={() => nav("/dpo")} aria-label="Назад" style={roundDark}>{BackWhite}</button>
            <Link to="/cart" aria-label="Корзина" style={{ ...roundDark, position: "relative" }}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8h12l-1 12H7L6 8z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>
              {count > 0 && <span style={{ position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, padding: "0 4px", borderRadius: 99, background: "#EC5A13", color: "#fff", ...mono, fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #0f1c3f" }}>{count}</span>}
            </Link>
          </div>
          {p && <div style={{ position: "absolute", left: 20, right: 20, bottom: 16 }}>
            <span style={{ ...mono, fontSize: 9, letterSpacing: ".08em", color: "#fff", background: FMT_COL[p.format] ?? "#11296B", padding: "4px 8px", borderRadius: 6 }}>{FMT_RU[p.format] ?? p.format}</span>
            <div style={{ ...disp, fontWeight: 700, fontSize: 22, lineHeight: 1.15, color: "#FBF3E8", marginTop: 10 }}>{p.title}</div>
          </div>}
        </div>
        {q.isLoading && <Loader />}
        {q.isError && <p style={{ padding: 20, ...mono, fontSize: 13, color: "#C9450E" }}>Программа не найдена.</p>}
        {p && (
          <div style={{ padding: "18px 20px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {p.duration && <span style={factChip}>{p.duration}</span>}
              {p.document && <span style={factChip}>Документ: {p.document}</span>}
              {p.direction && <span style={factChip}>{p.direction}</span>}
            </div>
            <div style={{ ...CARD, borderRadius: 18, padding: "16px 17px" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span style={{ ...disp, fontWeight: 800, fontSize: 26, color: "#EC5A13" }}>{rub(mem)}</span>
                {discount > 0 && <span style={{ ...mono, fontSize: 14, color: "#B8B0A0", textDecoration: "line-through" }}>{rub(p.price)}</span>}
              </div>
              <div style={{ ...mono, fontSize: 10.5, color: "#9B9584", marginTop: 6 }}>{discount > 0 ? `Цена члена клуба (−${discount}%) · справочно` : "Цена · справочно"}</div>
            </div>
            {p.description && <div><div style={secTitle}>О программе</div><div style={{ fontSize: 14, lineHeight: 1.55, color: "#3a3f49" }}>{p.description}</div></div>}
            {modules.length > 0 && <div><div style={secTitle}>Модули</div><div style={{ display: "flex", flexDirection: "column", gap: 9 }}>{modules.map((m, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 11, ...CARD, borderRadius: 13, padding: "12px 14px" }}><span style={{ width: 22, height: 22, borderRadius: 99, background: "rgba(236,90,19,.12)", color: "#C9450E", ...mono, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</span><span style={{ fontSize: 13.5 }}>{m.title}</span></div>
            ))}</div></div>}
            {teacher && <div style={{ display: "flex", alignItems: "center", gap: 12, background: INK, borderRadius: 16, padding: "15px 16px" }}><span style={{ width: 42, height: 42, borderRadius: 12, background: "linear-gradient(135deg,#E3C272,#C49A45)", color: INK, ...disp, fontWeight: 700, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{teacher.name.trim()[0] ?? "≡"}</span><div style={{ minWidth: 0 }}><div style={{ ...mono, fontSize: 9.5, letterSpacing: ".1em", color: "rgba(251,243,232,.5)" }}>ПРЕПОДАВАТЕЛЬ</div><div style={{ fontWeight: 600, fontSize: 14, color: "#FBF3E8", marginTop: 2 }}>{teacher.name}{teacher.role ? ` · ${teacher.role}` : ""}</div></div></div>}
          </div>
        )}
      </div>
      {p && (p.source_url ? (
        <div style={stickyBar}><a href={p.source_url} target="_blank" rel="noopener noreferrer" style={{ ...primaryBtn, textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>Запись на hse.ru ↗</a></div>
      ) : (
        <div style={stickyBar}>
          <button onClick={() => doAdd(false)} disabled={add.isPending} style={ghostBtn}>В корзину</button>
          <button onClick={() => doAdd(true)} disabled={add.isPending} style={{ ...primaryBtn, flex: 1.3 }}>Оставить заявку</button>
        </div>
      ))}
    </div>
  );
}
