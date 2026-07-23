import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useNewsList, usePage, useTimeline, formatNewsDate } from "../lib/queries.js";
import { apiGet } from "../lib/api.js";
import { token } from "../lib/cart.js";
import { useHead } from "../lib/title.js";
import { VisionToggle } from "../components/Vision.js";

/**
 * Главная – порт «Главная.dc.html» (Claude Design) в React.
 * Структура и анимации 1:1: сборка Фемиды из осколков, параллакс, маркиза,
 * pinned-таймлайн, reveal, count-up, «магнитные» CTA. Канон-токены.
 * Новости – живьём из /api/news. Полный prefers-reduced-motion фоллбэк.
 */

const THEMIS = "/assets/themis.jpeg";
const mono: CSSProperties = { fontFamily: "'Martian Mono', monospace" };
const disp: CSSProperties = { fontFamily: "'Unbounded', sans-serif" };

// 3×2 сетки → 12 треугольных осколков (как _heroShards в дизайне).
function heroShards() {
  const cols = 3, rows = 2;
  const tris: [number, number][][] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x0 = (i / cols) * 100, x1 = ((i + 1) / cols) * 100;
      const y0 = (j / rows) * 100, y1 = ((j + 1) / rows) * 100;
      const flip = (i + j) % 2 === 0;
      if (flip) {
        tris.push([[x0, y0], [x1, y0], [x0, y1]]);
        tris.push([[x1, y0], [x1, y1], [x0, y1]]);
      } else {
        tris.push([[x0, y0], [x1, y0], [x1, y1]]);
        tris.push([[x0, y0], [x1, y1], [x0, y1]]);
      }
    }
  }
  return tris;
}

const RIBBON = ["#EC5A13", "#11296B", "#C49A45", "#2C6E80", "#B5331B"];
const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  if (m100 >= 11 && m100 <= 14) return many;
  if (m10 === 1) return one;
  if (m10 >= 2 && m10 <= 4) return few;
  return many;
};

const MARQUEE = ["Выпуск ’24", "Выпуск ’25", "Менторы клуба", "Учебный офис", "Партнёры", "ДПО", "Мерч", "Нетворкинг"];
// Дефолтная лента (fallback, если в CMS ещё нет записей таймлайна). Без конкретных
// цифр-«фактов», чтобы при пустой БД на главную не попадали непроверяемые числа —
// точные значения учебный офис добавляет через админку.
const TIMELINE = [
  { year: "2024", title: "Клуб основан", text: "Первый выпуск собирается в сообщество, появляется личный кабинет.", metric: "Старт сообщества выпускников", photo: "[ фото · запуск ]" },
  { year: "2024", title: "Витрина ДПО", text: "Открывается доступ к программам доп. образования со скидкой выпускника.", metric: "Скидка выпускника на ДПО", photo: "[ фото · ДПО ]" },
  { year: "2025", title: "Геймификация", text: "Запуск уровней статуса, баллов и бейджей за активность в клубе.", metric: "Уровни, баллы и бейджи", photo: "[ фото · уровни ]" },
  { year: "2025", title: "Мерч и партнёры", text: "Второй выпуск, фирменный мерч и первые партнёрские предложения.", metric: "Фирменный мерч и партнёры", photo: "[ фото · мерч ]" },
  { year: "2026", title: "Сегодня", text: "Растущее сообщество выпускников факультета права с витринами и менторством.", metric: "и это только начало", photo: "[ фото · сообщество ]" },
];
const REASONS = [
  { num: "01", color: "#C49A45", title: "Статус, который видно", text: "Верификация учебным офисом, личный бейдж и уровень – ваш профиль выпускника всегда подтверждён.", delay: 0 },
  { num: "02", color: "#EC5A13", title: "Скидка 5% выпускнику", text: "Цена выпускника на программы ДПО – применяется автоматически после верификации.", delay: 90 },
  { num: "03", color: "#2E6FAE", title: "Сообщество и связи", text: "Выпуски, менторы, партнёры и мероприятия – нетворкинг, который работает на карьеру.", delay: 180 },
];

export default function Home() {
  useHead({
    description: "Клуб выпускников факультета права НИУ ВШЭ: личный кабинет со статусом, скидка выпускника на ДПО, события, подкасты, мерч и сообщество.",
    canonical: `${typeof window !== "undefined" ? window.location.origin : ""}/`,
  });
  const rootRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const pinSectionRef = useRef<HTMLElement>(null);
  const pinInnerRef = useRef<HTMLDivElement>(null);
  const pinTrackRef = useRef<HTMLDivElement>(null);
  const [heroIn, setHeroIn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false); // мобильный бургер (десктоп не трогаем)
  const news = useNewsList(3);
  // Ближайшие события для блока на главной (тот же /events, что и афиша).
  const eventsQ = useQuery({
    queryKey: ["events", "home"],
    queryFn: () => apiGet<{ id: string; title: string; description: string | null; starts_at: string; location: string | null; cover: string | null; format: string; points: number; status: string; going: number }[]>("/events"),
    staleTime: 60_000,
  });
  const statsQ = useQuery({
    queryKey: ["stats"],
    queryFn: () => apiGet<{ alumni: number; events: number; programs: number }>("/stats"),
    staleTime: 300_000,
  });
  const st = statsQ.data;
  const upcomingEvents = (eventsQ.data ?? [])
    .filter((e: { status: string; starts_at: string }) => e.status === "published" && new Date(e.starts_at).getTime() >= Date.now())
    .slice(0, 3);
  const page = usePage("home");
  // «История» редактируется в админ-панели; до загрузки/при сбое — захардкоженный фолбэк.
  const timelineQ = useTimeline();
  const timeline = timelineQ.data?.length
    ? timelineQ.data.map((t) => ({ year: t.year, title: t.title, text: t.text ?? "", metric: t.metric ?? "", photo: `[ ${t.year} · ${t.title.toLowerCase()} ]` }))
    : TIMELINE;
  // Тексты блоков из CMS (M2A) с фоллбэком на дефолты в коде.
  const hero = page.data?.blocks?.hero ?? {};
  const cta = page.data?.blocks?.cta ?? {};
  // Бегущая лента: из админки (block_hero.marquee), иначе — дефолт в коде.
  const marquee = Array.isArray(hero.marquee) && hero.marquee.length ? (hero.marquee as string[]) : MARQUEE;

  const reduce = () => {
    try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
  };

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const red = reduce();
    const cleanups: (() => void)[] = [];

    // Hero assembly
    if (red) setHeroIn(true);
    else requestAnimationFrame(() => requestAnimationFrame(() => setHeroIn(true)));

    // Reveal (видимо по умолчанию + скан при скролле)
    let pending = [...root.querySelectorAll<HTMLElement>("[data-reveal],[data-count]")];
    const show = (el: HTMLElement) => {
      if (el.hasAttribute("data-reveal")) el.style.transform = "none";
      if (el.hasAttribute("data-count")) countUp(el, red);
    };
    let scan: (() => void) | null = null;
    if (red) {
      pending.forEach(show);
      pending = [];
    } else {
      root.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => {
        el.style.transform = "translateY(26px)";
        const d = el.dataset.revealDelay ? +el.dataset.revealDelay : 0;
        el.style.transition = `transform .65s cubic-bezier(.2,.8,.2,1) ${d}ms`;
      });
      scan = () => {
        if (!pending.length) return;
        pending = pending.filter((el) => {
          const r = el.getBoundingClientRect();
          if (r.top < window.innerHeight - 40 && r.bottom > -40) { show(el); return false; }
          return true;
        });
      };
      requestAnimationFrame(() => scan && scan());
      const safety = window.setTimeout(() => { pending.forEach(show); pending = []; }, 1500);
      cleanups.push(() => clearTimeout(safety));
    }

    // Tilt
    if (!red) {
      root.querySelectorAll<HTMLElement>("[data-tilt]").forEach((card) => {
        const onMove = (e: MouseEvent) => {
          const b = card.getBoundingClientRect();
          const rx = ((e.clientY - (b.top + b.height / 2)) / b.height) * -6;
          const ry = ((e.clientX - (b.left + b.width / 2)) / b.width) * 6;
          card.style.transform = `perspective(800px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-4px)`;
          card.style.boxShadow = "0 22px 44px -20px rgba(20,24,31,.4)";
        };
        const onLeave = () => { card.style.transform = ""; card.style.boxShadow = ""; };
        card.addEventListener("mousemove", onMove);
        card.addEventListener("mouseleave", onLeave);
        cleanups.push(() => { card.removeEventListener("mousemove", onMove); card.removeEventListener("mouseleave", onLeave); });
      });
    }

    // Magnetic CTA
    root.querySelectorAll<HTMLElement>("[data-mag]").forEach((el) => {
      const state = { x: 0, y: 0, p: false };
      const move = (e: MouseEvent) => {
        if (red) return;
        const b = el.getBoundingClientRect();
        state.x = (e.clientX - (b.left + b.width / 2)) * 0.25;
        state.y = (e.clientY - (b.top + b.height / 2)) * 0.35;
        el.style.transform = `translate(${state.x}px,${state.y}px) scale(${state.p ? 0.95 : 1})`;
      };
      const leave = () => { state.x = 0; state.y = 0; state.p = false; el.style.transform = ""; };
      const down = () => { state.p = true; el.style.transform = `translate(${state.x}px,${state.y}px) scale(.94)`; };
      const up = () => { state.p = false; el.style.transform = `translate(${state.x}px,${state.y}px) scale(1)`; };
      el.addEventListener("mousemove", move); el.addEventListener("mouseleave", leave);
      el.addEventListener("mousedown", down); el.addEventListener("mouseup", up);
      cleanups.push(() => { el.removeEventListener("mousemove", move); el.removeEventListener("mouseleave", leave); el.removeEventListener("mousedown", down); el.removeEventListener("mouseup", up); });
    });

    // Parallax + pinned timeline
    const pinSection = pinSectionRef.current, pinInner = pinInnerRef.current, pinTrack = pinTrackRef.current;
    if (red && pinSection) {
      pinSection.style.height = "auto";
      if (pinInner) { pinInner.style.position = "static"; pinInner.style.height = "auto"; pinInner.style.padding = "64px 0"; }
      if (pinTrack) { pinTrack.style.overflowX = "auto"; pinTrack.style.transform = "none"; pinTrack.style.paddingBottom = "10px"; }
    } else {
      const onScroll = () => {
        if (scan) scan();
        const y = window.scrollY;
        if (heroRef.current) heroRef.current.style.transform = `translateY(${y * 0.06}px)`;
        if (pinSection && pinTrack) {
          const rect = pinSection.getBoundingClientRect();
          const total = pinSection.offsetHeight - window.innerHeight;
          const prog = Math.min(1, Math.max(0, -rect.top / total));
          const dist = Math.max(0, pinTrack.scrollWidth - window.innerWidth + 28);
          pinTrack.style.transform = `translateX(${-prog * dist}px)`;
        }
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
      cleanups.push(() => window.removeEventListener("scroll", onScroll));
    }

    return () => cleanups.forEach((fn) => fn());
  }, []);

  const shards = heroShards().map((tri, i) => {
    const clip = "polygon(" + tri.map((p) => `${p[0].toFixed(1)}% ${p[1].toFixed(1)}%`).join(",") + ")";
    const cx = (tri[0]![0] + tri[1]![0] + tri[2]![0]) / 3;
    const cy = (tri[0]![1] + tri[1]![1] + tri[2]![1]) / 3;
    const dx = cx - 50, dy = cy - 50;
    const rot = ((i * 47) % 80) - 40;
    const scattered = `translate(${(dx * 2.6).toFixed(1)}px,${(dy * 2.6).toFixed(1)}px) scale(.4) rotate(${rot}deg)`;
    const style: CSSProperties = {
      position: "absolute", inset: 0, backgroundImage: `url('${THEMIS}')`, backgroundSize: "100% 100%",
      backgroundPosition: "center", clipPath: clip, transformOrigin: "center",
      transform: heroIn ? "none" : scattered, opacity: heroIn ? 1 : 0,
      transition: `transform .8s cubic-bezier(.2,.85,.25,1) ${i * 45}ms, opacity .55s ease ${i * 45}ms`,
    };
    return { style, key: i };
  });

  return (
    <div ref={rootRef} style={{ background: "#FBF3E8", color: "#14181F", fontFamily: "'Onest', system-ui, sans-serif", overflowX: "hidden" }}>
      {/* HEADER */}
      <header style={{ position: "sticky", top: 0, zIndex: 50, backdropFilter: "blur(12px)", background: "rgba(251,243,232,.82)", borderBottom: "1px solid #E5E7EB" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "13px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20 }}>
          <a href="#top" className="foc" style={{ display: "flex", alignItems: "center", gap: 13, textDecoration: "none", color: "inherit" }}>
            <img src={THEMIS} alt="Логотип клуба" width={42} height={42} style={{ borderRadius: 10, objectFit: "cover", flex: "none" }} />
            <div style={{ lineHeight: 1.05 }}>
              <div style={{ ...disp, fontWeight: 800, fontSize: 16, letterSpacing: "-0.01em" }}>Клуб выпускников</div>
              <div style={{ ...mono, fontSize: 10, color: "#6B7280", letterSpacing: ".08em", marginTop: 2 }}>факультета права Вышки</div>
            </div>
          </a>
          <nav className="desk-only" style={{ display: "flex", alignItems: "center", gap: 28 }}>
            <VisionToggle compact />
            <a href="#istoriya" className="foc nav-link" style={{ textDecoration: "none", color: "#14181F", fontWeight: 500, fontSize: 15 }}>История</a>
            <a href="#vitriny" className="foc nav-link" style={{ textDecoration: "none", color: "#14181F", fontWeight: 500, fontSize: 15 }}>Витрины</a>
            <Link to="/events" className="foc nav-link" style={{ textDecoration: "none", color: "#14181F", fontWeight: 500, fontSize: 15 }}>События</Link>
            <Link to="/news" className="foc nav-link" style={{ textDecoration: "none", color: "#14181F", fontWeight: 500, fontSize: 15 }}>Новости</Link>
            {token() ? (
              <Link to="/lk" data-mag className="foc" style={{ textDecoration: "none", fontWeight: 600, fontSize: 14, padding: "10px 20px", borderRadius: 11, background: "#EC5A13", color: "#FBF3E8", transition: "transform .25s cubic-bezier(.2,.8,.2,1)" }}>Личный кабинет</Link>
            ) : (
              <>
                <Link to="/lk" className="foc nav-link" style={{ textDecoration: "none", color: "#14181F", fontWeight: 600, fontSize: 15 }}>Войти</Link>
                <Link to="/join" data-mag className="foc" style={{ textDecoration: "none", fontWeight: 600, fontSize: 14, padding: "10px 20px", borderRadius: 11, background: "#EC5A13", color: "#FBF3E8", transition: "transform .25s cubic-bezier(.2,.8,.2,1)" }}>Вступить в клуб</Link>
              </>
            )}
          </nav>
          <button onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen} aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"} className="foc mob-only" style={{ alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: 11, border: "1px solid #E5E7EB", background: "#fff", fontSize: 19, cursor: "pointer" }}>
            {menuOpen ? "✕" : "☰"}
          </button>
        </div>
        {menuOpen && (
          <nav className="mob-only" style={{ flexDirection: "column", borderTop: "1px solid #E5E7EB", background: "#FBF3E8", padding: "8px 20px 16px" }}>
            {[
              { href: "#istoriya", label: "История" },
              { href: "#vitriny", label: "Витрины" },
            ].map((n) => (
              <a key={n.href} href={n.href} onClick={() => setMenuOpen(false)} className="foc" style={{ textDecoration: "none", color: "#14181F", fontWeight: 600, fontSize: 16, padding: "14px 12px", borderRadius: 12 }}>{n.label}</a>
            ))}
            <Link to="/dpo" onClick={() => setMenuOpen(false)} className="foc" style={{ textDecoration: "none", color: "#14181F", fontWeight: 600, fontSize: 16, padding: "14px 12px", borderRadius: 12 }}>Витрина ДПО</Link>
            <Link to="/merch" onClick={() => setMenuOpen(false)} className="foc" style={{ textDecoration: "none", color: "#14181F", fontWeight: 600, fontSize: 16, padding: "14px 12px", borderRadius: 12 }}>Мерч</Link>
            <Link to="/events" onClick={() => setMenuOpen(false)} className="foc" style={{ textDecoration: "none", color: "#14181F", fontWeight: 600, fontSize: 16, padding: "14px 12px", borderRadius: 12 }}>События</Link>
            <Link to="/podcasts" onClick={() => setMenuOpen(false)} className="foc" style={{ textDecoration: "none", color: "#14181F", fontWeight: 600, fontSize: 16, padding: "14px 12px", borderRadius: 12 }}>Подкасты</Link>
            <Link to="/news" onClick={() => setMenuOpen(false)} className="foc" style={{ textDecoration: "none", color: "#14181F", fontWeight: 600, fontSize: 16, padding: "14px 12px", borderRadius: 12 }}>Новости</Link>
            <Link to="/lk" onClick={() => setMenuOpen(false)} className="foc" style={{ textDecoration: "none", fontWeight: 600, fontSize: 16, padding: "14px 16px", borderRadius: 12, background: "#EC5A13", color: "#FBF3E8", textAlign: "center", marginTop: 6 }}>{token() ? "Личный кабинет" : "Войти в ЛК"}</Link>
            {!token() && <Link to="/join" onClick={() => setMenuOpen(false)} className="foc" style={{ textDecoration: "none", fontWeight: 600, fontSize: 16, padding: "14px 16px", borderRadius: 12, border: "1.5px solid #EC5A13", color: "#C9450E", textAlign: "center", marginTop: 8 }}>Вступить в клуб</Link>}
          </nav>
        )}
      </header>

      {/* HERO */}
      <section id="top" style={{ maxWidth: 1180, margin: "0 auto", padding: "74px 28px 60px" }}>
        <div className="hero-grid" style={{ display: "grid", gridTemplateColumns: "1.05fr .95fr", gap: 48, alignItems: "center" }}>
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, ...mono, fontSize: 12, letterSpacing: ".1em", color: "#B5331B", background: "rgba(181,51,27,.1)", border: "1px solid rgba(181,51,27,.25)", padding: "6px 13px", borderRadius: 999 }}>● {hero.badge ?? "Сообщество выпускников факультета права"}</div>
            <h1 className="h-xl" style={{ ...disp, fontWeight: 800, fontSize: 62, lineHeight: 1.03, letterSpacing: "-0.015em", margin: "22px 0 0", textWrap: "balance" } as CSSProperties}>{hero.title_pre ?? "Статус выпускника, который"} <span style={{ color: "#EC5A13" }}>{hero.title_accent ?? "работает"}</span></h1>
            <p style={{ fontSize: 18, lineHeight: 1.6, color: "#3a3f49", maxWidth: 500, margin: "24px 0 0" }}>{hero.subtitle ?? "Клуб выпускников факультета права «Вышки»: личный кабинет с уровнями, скидка выпускника на ДПО, новости и менторы – всё в одном месте."}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 32 }}>
              <Link to="/lk" data-mag className="foc" style={{ textDecoration: "none", fontWeight: 600, fontSize: 16, padding: "15px 30px", borderRadius: 13, background: "#EC5A13", color: "#FBF3E8", boxShadow: "0 12px 28px -12px rgba(236,90,19,.85)", transition: "transform .25s cubic-bezier(.2,.8,.2,1)" }}>{token() ? "Мой личный кабинет" : hero.cta_primary ?? "Войти в личный кабинет"}</Link>
              <a href="#kak" data-mag className="foc" style={{ textDecoration: "none", fontWeight: 600, fontSize: 16, padding: "15px 30px", borderRadius: 13, border: "1.5px solid #14181F", color: "#14181F", transition: "transform .25s cubic-bezier(.2,.8,.2,1)" }}>{hero.cta_secondary ?? "Как вступить"}</a>
            </div>
            <div style={{ display: "flex", gap: 38, marginTop: 46, flexWrap: "wrap" }}>
              {/* Живые счётчики клуба из /api/stats; до загрузки — прежние статические. */}
              {st ? (
                <>
                  <div><div style={{ ...disp, fontWeight: 800, fontSize: 52, lineHeight: 1, letterSpacing: "-0.02em" }}>{st.alumni}</div><div style={{ ...mono, fontSize: 12, color: "#6B7280", marginTop: 8, letterSpacing: ".05em" }}>{plural(st.alumni, "выпускник", "выпускника", "выпускников")}<br />в клубе</div></div>
                  <div style={{ width: 1, background: "#E5E7EB" }} />
                  <div><div style={{ ...disp, fontWeight: 800, fontSize: 52, lineHeight: 1, letterSpacing: "-0.02em" }}>{st.events}</div><div style={{ ...mono, fontSize: 12, color: "#6B7280", marginTop: 8, letterSpacing: ".05em" }}>{plural(st.events, "событие", "события", "событий")}<br />в календаре</div></div>
                </>
              ) : (
                <>
                  <div data-count="2"><div style={{ ...disp, fontWeight: 800, fontSize: 52, lineHeight: 1, letterSpacing: "-0.02em" }}><span data-count="2">0</span></div><div style={{ ...mono, fontSize: 12, color: "#6B7280", marginTop: 8, letterSpacing: ".05em" }}>выпуска<br />в клубе</div></div>
                  <div style={{ width: 1, background: "#E5E7EB" }} />
                  <div data-count="4"><div style={{ ...disp, fontWeight: 800, fontSize: 52, lineHeight: 1, letterSpacing: "-0.02em" }}><span data-count="4">0</span></div><div style={{ ...mono, fontSize: 12, color: "#6B7280", marginTop: 8, letterSpacing: ".05em" }}>уровня<br />статуса</div></div>
                </>
              )}
              <div style={{ width: 1, background: "#E5E7EB" }} />
              <div data-count="5"><div style={{ ...disp, fontWeight: 800, fontSize: 52, lineHeight: 1, letterSpacing: "-0.02em", color: "#EC5A13" }}><span data-count="5">0</span>%</div><div style={{ ...mono, fontSize: 12, color: "#6B7280", marginTop: 8, letterSpacing: ".05em" }}>скидка<br />выпускникам</div></div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ position: "relative", width: "min(430px,86vw)" }}>
              <div style={{ position: "absolute", inset: "-8%", background: "radial-gradient(circle at 50% 42%,rgba(236,90,19,.45),transparent 60%)", filter: "blur(26px)", zIndex: 0 }} />
              <div ref={heroRef} style={{ position: "relative", zIndex: 1, aspectRatio: "1", borderRadius: 28, overflow: "hidden", background: "#EC5A13", boxShadow: "0 34px 70px -30px rgba(201,69,14,.8)", willChange: "transform" }}>
                {shards.map((s) => <div key={s.key} style={s.style} />)}
                <div style={{ position: "absolute", inset: 0, borderRadius: 28, boxShadow: "inset 0 0 0 1px rgba(255,255,255,.18),inset 0 -50px 70px -34px rgba(20,24,31,.45)", pointerEvents: "none" }} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* MARQUEE — лента редактируется в админке (Контент → Страницы) */}
      <div style={{ background: "#14181F", color: "#FBF3E8", overflow: "hidden", padding: "16px 0", borderTop: "1px solid rgba(251,243,232,.08)", borderBottom: "1px solid rgba(251,243,232,.08)" }}>
        <div className="marq-track" style={{ display: "flex", width: "max-content" }}>
          {[0, 1].map((dup) => (
            <div key={dup} style={{ display: "flex", alignItems: "center", gap: 34, paddingRight: 34, ...mono, fontSize: 14, letterSpacing: ".04em", whiteSpace: "nowrap" }}>
              {marquee.map((m, i) => (
                <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 34 }}><span style={{ width: 8, height: 8, background: "#EC5A13", transform: "rotate(45deg)", flex: "none" }} />{m}</span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ИСТОРИЯ – PINNED TIMELINE (заголовок редактируется в админке) */}
      <section id="istoriya" ref={pinSectionRef} style={{ position: "relative", height: "240vh", background: "#14181F", color: "#FBF3E8" }}>
        <div ref={pinInnerRef} style={{ position: "sticky", top: 0, height: "100vh", overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 28px", width: "100%" }}>
            <div style={{ ...mono, fontSize: 12, letterSpacing: ".16em", color: "#EC5A13", textTransform: "uppercase" }}>{hero.history_eyebrow ?? "История клуба"}</div>
            <h2 style={{ ...disp, fontWeight: 600, fontSize: 40, letterSpacing: "-0.01em", margin: "10px 0 0" }}>{hero.history_title ?? "От первого выпуска – к сообществу"}</h2>
            <p style={{ color: "#9aa3b2", fontSize: 14, margin: "10px 0 0", ...mono }}>{hero.history_hint ?? "↓ листайте – таймлайн движется вбок"}</p>
          </div>
          <div ref={pinTrackRef} style={{ display: "flex", gap: 26, marginTop: 34, padding: "0 max(28px,calc((100vw - 1180px)/2 + 28px))", willChange: "transform" }}>
            {timeline.map((t, i) => (
              <article key={i} style={{ flex: "none", width: 340, background: "rgba(251,243,232,.04)", border: "1px solid rgba(251,243,232,.1)", borderRadius: 18, overflow: "hidden" }}>
                <div style={{ position: "relative", height: 180, background: "#23272f", backgroundImage: "repeating-linear-gradient(45deg,rgba(196,154,69,.16) 0 12px,transparent 12px 24px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ ...mono, fontSize: 11, color: "#C49A45", letterSpacing: ".08em" }}>{t.photo}</span>
                </div>
                <div style={{ padding: 22 }}>
                  <div style={{ ...disp, fontWeight: 800, fontSize: 34, letterSpacing: "-0.02em", color: "#EC5A13" }}>{t.year}</div>
                  <div style={{ ...disp, fontWeight: 600, fontSize: 19, letterSpacing: "-0.01em", marginTop: 8, lineHeight: 1.2 }}>{t.title}</div>
                  <p style={{ color: "#9aa3b2", fontSize: 14, lineHeight: 1.5, margin: "10px 0 0" }}>{t.text}</p>
                  <div style={{ ...mono, fontSize: 13, color: "#E3C272", marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(251,243,232,.1)" }}>{t.metric}</div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ВИТРИНЫ */}
      <section id="vitriny" style={{ maxWidth: 1180, margin: "0 auto", padding: "88px 28px 20px" }}>
        <div data-reveal style={{ ...mono, fontSize: 12, letterSpacing: ".16em", color: "#EC5A13", textTransform: "uppercase" }}>Витрины клуба</div>
        <h2 data-reveal style={{ ...disp, fontWeight: 600, fontSize: 40, letterSpacing: "-0.01em", margin: "10px 0 6px" }}>Что доступно выпускнику</h2>
        <p data-reveal style={{ color: "#6B7280", fontSize: 16, maxWidth: 540, margin: "0 0 34px" }}>Две витрины ведут к общей корзине и заявке – оплату ведёт учебный офис.</p>
        <div className="two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 26 }}>
          {[
            { to: "/dpo", bg: "#11296B", img: "/assets/dpo-hero.jpg", imgPos: "center", title2: "ДПО", h: "Программы доп. образования", p: "Курсы и интенсивы со скидкой выпускника. Фильтры по направлению, формату и длительности.", meta: "актуальный набор ВШЭ · скидка выпускника", metaColor: "#2E6FAE", cta: "Открыть →", ctaColor: "#11296B", delay: undefined as number | undefined },
            { to: "/merch", bg: "#EC5A13", img: "/assets/merch-hoodie.jpg", imgPos: "center 30%", title2: "Мерч", h: "Фирменный мерч клуба", p: "Одежда и аксессуары с фасеточной Фемидой. Размеры, цвета, самовывоз или доставка.", meta: "новинки сезона", metaColor: "#B5331B", cta: "Открыть →", ctaColor: "#C9450E", delay: 90 },
          ].map((v) => (
            <Link key={v.to} to={v.to} data-reveal data-reveal-delay={v.delay} data-tilt className="vcard foc" style={{ textDecoration: "none", color: "inherit", borderRadius: 22, overflow: "hidden", border: "1px solid #E5E7EB", background: "#fff", display: "block" }}>
              <div style={{ position: "relative", height: 230, background: `${v.bg} url(${v.img}) ${v.imgPos} / cover no-repeat`, display: "flex", alignItems: "flex-end", padding: 24 }}>
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(20,24,31,0) 40%, rgba(20,24,31,.55))" }} />
                <span style={{ position: "relative", ...disp, fontWeight: 800, fontSize: 30, color: "#FBF3E8", letterSpacing: "-0.01em", textShadow: "0 2px 14px rgba(0,0,0,.45)" }}>{v.title2}</span>
              </div>
              <div style={{ padding: 24 }}>
                <div style={{ ...disp, fontWeight: 600, fontSize: 20, letterSpacing: "-0.01em" }}>{v.h}</div>
                <p style={{ color: "#6B7280", fontSize: 15, lineHeight: 1.5, margin: "10px 0 0" }}>{v.p}</p>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18 }}>
                  <span style={{ ...mono, fontSize: 12, color: v.metaColor }}>{v.meta}</span>
                  <span style={{ fontWeight: 600, color: v.ctaColor }}>{v.cta}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* БЛИЖАЙШИЕ СОБЫТИЯ – живьём из /api/events */}
      {upcomingEvents.length > 0 && (
        <section id="sobytiya" style={{ maxWidth: 1180, margin: "0 auto", padding: "72px 28px 20px" }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 14, marginBottom: 34 }}>
            <div>
              <div data-reveal style={{ ...mono, fontSize: 12, letterSpacing: ".16em", color: "#EC5A13", textTransform: "uppercase" }}>Календарь клуба</div>
              <h2 data-reveal style={{ ...disp, fontWeight: 600, fontSize: 40, letterSpacing: "-0.01em", margin: "10px 0 0" }}>Ближайшие события</h2>
            </div>
            <Link to="/events" data-reveal className="foc" style={{ textDecoration: "none", fontWeight: 600, color: "#2E6FAE", fontSize: 15 }}>Вся афиша и запись →</Link>
          </div>
          <div className="two-col" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 22 }}>
            {upcomingEvents.map((e, i) => (
              <Link key={e.id} to="/events" data-reveal data-reveal-delay={i * 90} className="vcard foc" style={{ textDecoration: "none", color: "inherit", borderRadius: 18, overflow: "hidden", border: "1px solid #E5E7EB", background: "#fff", display: "flex", flexDirection: "column" }}>
                {e.cover ? (
                  <div style={{ height: 130, background: `#11296B url(${e.cover}) center / cover no-repeat` }} />
                ) : (
                  <div style={{ display: "flex", height: 8 }}><i style={{ flex: 1, background: "#EC5A13" }} /><i style={{ flex: 1, background: "#11296B" }} /><i style={{ flex: 1, background: "#C49A45" }} /><i style={{ flex: 1, background: "#2E6FAE" }} /></div>
                )}
                <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", flex: 1 }}>
                  <div style={{ ...mono, fontSize: 11.5, color: "#C9450E", textTransform: "uppercase", letterSpacing: ".08em" }}>
                    {new Date(e.starts_at).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })} · {e.format === "online" ? "онлайн" : "очно"}
                  </div>
                  <div style={{ ...disp, fontWeight: 600, fontSize: 19, letterSpacing: "-0.01em", marginTop: 10, lineHeight: 1.25 }}>{e.title}</div>
                  {e.location && <p style={{ ...mono, fontSize: 12, color: "#6B7280", margin: "10px 0 0" }}>📍 {e.location}</p>}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto", paddingTop: 16 }}>
                    <span style={{ ...mono, fontSize: 12, color: "#6B7280" }}>{e.going > 0 ? `пойдут: ${e.going}` : "будьте первым!"}</span>
                    {e.points > 0 && <span style={{ ...mono, fontSize: 12, color: "#a07d2e" }}>+{e.points} баллов</span>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ЗАЧЕМ ВСТУПАТЬ */}
      <section id="kak" style={{ maxWidth: 1180, margin: "0 auto", padding: "72px 28px 20px" }}>
        <div data-reveal style={{ ...mono, fontSize: 12, letterSpacing: ".16em", color: "#EC5A13", textTransform: "uppercase" }}>Зачем вступать</div>
        <h2 data-reveal style={{ ...disp, fontWeight: 600, fontSize: 40, letterSpacing: "-0.01em", margin: "10px 0 34px" }}>Три причины быть в клубе</h2>
        <div className="two-col" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 22 }}>
          {REASONS.map((r) => (
            <div key={r.num} data-reveal data-reveal-delay={r.delay} style={{ padding: 28, borderRadius: 18, border: "1px solid #E5E7EB", background: "#fff" }}>
              <div style={{ ...mono, fontSize: 13, color: r.color, fontWeight: 500 }}>{r.num}</div>
              <div style={{ ...disp, fontWeight: 600, fontSize: 21, letterSpacing: "-0.01em", marginTop: 16, lineHeight: 1.2 }}>{r.title}</div>
              <p style={{ color: "#6B7280", fontSize: 15, lineHeight: 1.55, margin: "12px 0 0" }}>{r.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* НОВОСТИ – живьём из /api/news */}
      <section id="novosti" style={{ maxWidth: 1180, margin: "0 auto", padding: "72px 28px 20px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 14, marginBottom: 34 }}>
          <div>
            <div data-reveal style={{ ...mono, fontSize: 12, letterSpacing: ".16em", color: "#EC5A13", textTransform: "uppercase" }}>Новости</div>
            <h2 data-reveal style={{ ...disp, fontWeight: 600, fontSize: 40, letterSpacing: "-0.01em", margin: "10px 0 0" }}>Что в клубе сейчас</h2>
          </div>
          <Link to="/news" data-reveal className="foc" style={{ textDecoration: "none", fontWeight: 600, color: "#2E6FAE", fontSize: 15 }}>Все новости →</Link>
        </div>
        <div className="two-col" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 22 }}>
          {news.isLoading && [0, 1, 2].map((i) => (
            <div key={i} style={{ borderRadius: 18, border: "1px solid #E5E7EB", background: "#fff", height: 300, opacity: 0.5 }} />
          ))}
          {news.isError && <p style={{ color: "#B5331B", ...mono, fontSize: 13 }}>Не удалось загрузить новости.</p>}
          {news.data?.map((n, i) => (
            <Link key={n.id} to={`/news/${n.slug}`} data-reveal data-reveal-delay={i * 90} className="vcard foc" style={{ textDecoration: "none", color: "inherit", borderRadius: 18, overflow: "hidden", border: "1px solid #E5E7EB", background: "#fff", display: "block" }}>
              <div style={{ position: "relative", height: 150, background: "#F2E3CF", backgroundImage: "repeating-linear-gradient(45deg,rgba(196,154,69,.18) 0 12px,transparent 12px 24px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ ...mono, fontSize: 11, color: "#8a6d28" }}>[ новость ]</span>
              </div>
              <div style={{ padding: 20 }}>
                <div style={{ ...mono, fontSize: 11, color: "#6B7280", letterSpacing: ".05em" }}>{formatNewsDate(n.published_at)}</div>
                <div style={{ ...disp, fontWeight: 600, fontSize: 17, letterSpacing: "-0.01em", marginTop: 10, lineHeight: 1.25 }}>{n.title}</div>
                <p style={{ color: "#6B7280", fontSize: 14, lineHeight: 1.5, margin: "10px 0 0" }}>{n.excerpt}</p>
                <div style={{ fontWeight: 600, color: "#2E6FAE", fontSize: 14, marginTop: 14 }}>Читать →</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ maxWidth: 1180, margin: "72px auto 0", padding: "0 28px" }}>
        <div data-reveal style={{ position: "relative", overflow: "hidden", borderRadius: 26, background: "#11296B", color: "#FBF3E8", padding: "60px 48px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 34, flexWrap: "wrap" }}>
          <div style={{ position: "absolute", right: -40, top: -40, width: 280, height: 280, background: "radial-gradient(circle,rgba(236,90,19,.5),transparent 65%)", filter: "blur(8px)" }} />
          <div style={{ position: "relative", maxWidth: 560 }}>
            <h2 style={{ ...disp, fontWeight: 800, fontSize: 38, letterSpacing: "-0.01em", lineHeight: 1.08, margin: 0 }}>{cta.title ?? "Вступить в клуб"}</h2>
            <p style={{ fontSize: 17, color: "rgba(251,243,232,.8)", lineHeight: 1.5, margin: "16px 0 0" }}>{cta.text ?? "Подтвердите выпуск у учебного офиса – и получите статус, скидки и доступ к витринам."}</p>
          </div>
          <Link to="/join" data-mag className="foc" style={{ position: "relative", textDecoration: "none", fontWeight: 600, fontSize: 17, padding: "17px 36px", borderRadius: 14, background: "#EC5A13", color: "#FBF3E8", boxShadow: "0 14px 30px -12px rgba(0,0,0,.5)", transition: "transform .25s cubic-bezier(.2,.8,.2,1)", flex: "none" }}>{cta.button ?? "Подать заявку"}</Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ background: "#14181F", color: "#FBF3E8", marginTop: 80, padding: "56px 0 40px" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 28px", display: "flex", justifyContent: "space-between", gap: 40, flexWrap: "wrap" }}>
          <div style={{ maxWidth: 320 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
              <img src={THEMIS} alt="Логотип" width={44} height={44} style={{ borderRadius: 10, objectFit: "cover" }} />
              <div style={{ ...disp, fontWeight: 800, fontSize: 17, lineHeight: 1.15 }}>Клуб выпускников<br />факультета права Вышки</div>
            </div>
            <p style={{ color: "#9aa3b2", fontSize: 14, lineHeight: 1.55, margin: "18px 0 0" }}>Сообщество выпускников факультета права НИУ ВШЭ.</p>
          </div>
          <div style={{ display: "flex", gap: 64, flexWrap: "wrap" }}>
            <div>
              <div style={{ ...mono, fontSize: 11, color: "#6B7280", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 16 }}>Навигация</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                <a href="#istoriya" className="foc" style={{ color: "#FBF3E8", textDecoration: "none", fontSize: 15 }}>История</a>
                <a href="#vitriny" className="foc" style={{ color: "#FBF3E8", textDecoration: "none", fontSize: 15 }}>Витрины</a>
                <Link to="/news" className="foc" style={{ color: "#FBF3E8", textDecoration: "none", fontSize: 15 }}>Новости</Link>
              </div>
            </div>
            <div>
              <div style={{ ...mono, fontSize: 11, color: "#6B7280", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 16 }}>Контакты</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                <a href="https://t.me/pravohse" target="_blank" rel="noopener noreferrer" className="foc" style={{ color: "#E3C272", textDecoration: "none", fontSize: 15 }}>t.me/pravohse</a>
                <a href="https://pravo.hse.ru/businessandlaw/alumni" target="_blank" rel="noopener noreferrer" className="foc" style={{ color: "#E3C272", textDecoration: "none", fontSize: 15 }}>pravo.hse.ru/…/alumni</a>
              </div>
            </div>
          </div>
        </div>
        <div style={{ height: 10, overflow: "hidden", width: "100%", marginTop: 44 }}>
          <div style={{ display: "flex", width: "100%", height: "100%" }}>
            {Array.from({ length: 60 }).map((_, i) => (
              <div key={i} style={{ width: 34, height: "100%", transform: "skewX(-22deg)", flex: "none", background: RIBBON[i % RIBBON.length] }} />
            ))}
          </div>
        </div>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "24px 28px 0" }}>
          {/* 152-ФЗ: юридические документы + информация о владельце */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 20px", fontSize: 13 }}>
            <Link to="/privacy" className="foc" style={{ color: "#9aa3b2", textDecoration: "underline", textUnderlineOffset: 3 }}>Политика обработки персональных данных</Link>
            <Link to="/confidential" className="foc" style={{ color: "#9aa3b2", textDecoration: "underline", textUnderlineOffset: 3 }}>Политика конфиденциальности</Link>
            <Link to="/requisites" className="foc" style={{ color: "#9aa3b2", textDecoration: "underline", textUnderlineOffset: 3 }}>Реквизиты</Link>
          </div>
          <p style={{ fontSize: 12, lineHeight: 1.6, color: "#6B7280", margin: "12px 0 0" }}>
            НИУ «Высшая школа экономики», факультет права · ОГРН 1027739630401 · ИНН 7714030726 · 101000, г. Москва, ул. Мясницкая, д. 20 · pravo@hse.ru · +7 (495) 771-32-32
          </p>
          <div style={{ ...mono, fontSize: 11, color: "#6B7280", marginTop: 12 }}>© 2026 Клуб выпускников факультета права Вышки</div>
        </div>
      </footer>
    </div>
  );
}

// Count-up для статистики hero.
function countUp(el: HTMLElement, red: boolean) {
  const target = +(el.dataset.count || 0);
  const out = (el.tagName === "SPAN" ? el : el.querySelector("span")) as HTMLElement | null;
  if (!out) return;
  out.textContent = String(target);
  if (red) return;
  const dur = 1100, t0 = Date.now();
  const id = window.setInterval(() => {
    const p = Math.min(1, (Date.now() - t0) / dur);
    out.textContent = String(Math.round((1 - Math.pow(1 - p, 3)) * target));
    if (p >= 1) { out.textContent = String(target); clearInterval(id); }
  }, 33);
}
