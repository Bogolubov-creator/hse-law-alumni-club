import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { type PodcastItem } from "../../lib/api.js";
import { token } from "../../lib/cart.js";
import { usePodcasts } from "../../lib/queries.js";
import { useHead } from "../../lib/title.js";
import { disp, mono, roundDark, primaryBtn, BackWhite } from "../theme.js";
import { Loader } from "../ui.js";

function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function MobilePodcastPlayer({ epId }: { epId: string }) {
  const nav = useNavigate();
  const q = usePodcasts(token());
  const items: PodcastItem[] = q.data?.items ?? [];
  const idx = items.findIndex((p) => p.id === epId);
  const item = idx >= 0 ? items[idx]! : null;
  useHead({ title: item?.title ?? "Подкаст", noindex: true });
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const posKey = `pod-pos-${epId}`;

  // Смена выпуска – сбрасываем локальный прогресс UI (audio сам перезагрузится по key).
  useEffect(() => { setPlaying(false); setPos(0); setDur(0); }, [epId]);

  if (q.isLoading) return <div style={{ height: "100dvh", background: "#14181F" }}><Loader /></div>;
  if (!item) return (
    <div style={{ height: "100dvh", background: "#14181F", color: "#FBF3E8", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, fontFamily: "'Onest', system-ui, sans-serif" }}>
      <p style={{ ...mono, fontSize: 13 }}>Выпуск не найден</p>
      <button onClick={() => nav("/podcasts")} style={{ ...primaryBtn, flex: "none", padding: "0 26px", height: 48 }}>К списку</button>
    </div>
  );
  const locked = !item.audio_url;
  const goEp = (i: number) => { const t2 = items[i]; if (t2) nav(`/podcasts?ep=${encodeURIComponent(t2.id)}`, { replace: true }); };
  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) { void a.play().catch(() => undefined); } else { a.pause(); }
  };
  const seek = (e: { currentTarget: HTMLDivElement; clientX: number }) => {
    const a = audioRef.current;
    if (!a || !dur) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = Math.max(0, Math.min(dur, ((e.clientX - r.left) / r.width) * dur));
  };
  return (
    <div style={{ height: "100dvh", background: "linear-gradient(180deg,#1a2338 0%,#14181F 60%,#0f131a 100%)", display: "flex", flexDirection: "column", color: "#FBF3E8", overflow: "hidden", fontFamily: "'Onest', system-ui, sans-serif" }}>
      <div style={{ padding: "calc(env(safe-area-inset-top, 0px) + 14px) 16px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button onClick={() => nav("/podcasts")} aria-label="Назад" style={{ ...roundDark, background: "rgba(251,243,232,.12)", backdropFilter: "none", WebkitBackdropFilter: "none" }}>{BackWhite}</button>
        <span style={{ ...mono, fontSize: 10, letterSpacing: ".14em", color: "rgba(251,243,232,.55)" }}>{locked ? "ПО ПОДПИСКЕ" : "СЕЙЧАС ИГРАЕТ"}</span>
        <div style={{ width: 40 }} />
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 30px", minHeight: 0 }}>
        <div style={{ width: 210, height: 210, borderRadius: 28, background: item.cover ? `#11296B url(${item.cover}) center/cover` : "linear-gradient(145deg,#20325c,#11296B)", position: "relative", overflow: "hidden", boxShadow: "0 40px 70px -30px rgba(0,0,0,.8)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {!item.cover && <img src="/assets/themis.jpeg" alt="" style={{ position: "absolute", right: -24, bottom: -24, width: 150, height: 150, objectFit: "cover", opacity: .22, transform: "rotate(8deg)" }} />}
          {!locked && (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 64, position: "relative" }}>
              {["#E3C272", "#EC5A13", "#E3C272", "#EC5A13"].map((c, i) => (
                <span key={i} style={{ width: 7, height: "100%", borderRadius: 9, background: c, transformOrigin: "bottom", animation: playing ? `eq 900ms ease-in-out infinite ${i * 0.15}s` : "none", transform: playing ? undefined : "scaleY(.35)" }} />
              ))}
            </div>
          )}
          {locked && <span style={{ position: "relative", fontSize: 40 }} aria-hidden>🔒</span>}
        </div>
        <div style={{ ...mono, fontSize: 10, letterSpacing: ".1em", color: "#E3C272", marginTop: 28 }}>ВЫПУСК {idx + 1} · ПОДКАСТЫ КЛУБА</div>
        <div style={{ ...disp, fontWeight: 700, fontSize: 20, textAlign: "center", lineHeight: 1.25, marginTop: 12 }}>{item.title}</div>
        {item.description && <div style={{ fontSize: 13.5, color: "rgba(251,243,232,.6)", marginTop: 6, textAlign: "center", maxWidth: 300, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{item.description}</div>}
      </div>
      <div style={{ padding: "0 30px calc(env(safe-area-inset-bottom, 0px) + 34px)" }}>
        {locked ? (
          <button onClick={() => nav("/podcasts")} style={{ ...primaryBtn, width: "100%", flex: "none" }}>Оформить подписку на подкасты</button>
        ) : (
          <>
            <audio key={item.id} ref={audioRef} src={item.audio_url ?? undefined} preload="metadata"
              onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
              onTimeUpdate={(e) => { const a = e.currentTarget; setPos(a.currentTime); try { localStorage.setItem(posKey, String(a.currentTime)); } catch { /* приватный режим */ } }}
              onLoadedMetadata={(e) => { const a = e.currentTarget; setDur(a.duration || 0); const saved = Number(localStorage.getItem(posKey) || 0); if (saved > 5 && saved < (a.duration || Infinity) - 5) a.currentTime = saved; }}
              onEnded={() => { setPlaying(false); try { localStorage.removeItem(posKey); } catch { /* ок */ } }} />
            <div onClick={seek} role="slider" aria-label="Перемотка" aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(pos)} style={{ height: 5, borderRadius: 99, background: "rgba(251,243,232,.16)", overflow: "hidden", cursor: "pointer" }}>
              <div style={{ width: dur ? `${(pos / dur) * 100}%` : "0%", height: "100%", borderRadius: 99, background: "#EC5A13" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", ...mono, fontSize: 10, color: "rgba(251,243,232,.5)", marginTop: 8 }}><span>{fmtTime(pos)}</span><span>{fmtTime(dur)}</span></div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 30, marginTop: 22 }}>
              <button onClick={() => goEp(idx - 1)} disabled={idx <= 0} aria-label="Предыдущий выпуск" style={{ background: "none", border: "none", cursor: "pointer", opacity: idx <= 0 ? .35 : 1 }}><svg width="30" height="30" viewBox="0 0 24 24" fill="#FBF3E8"><path d="M11 6L4 12l7 6zM19 6l-7 6 7 6z" /></svg></button>
              <button onClick={toggle} aria-label={playing ? "Пауза" : "Играть"} style={{ width: 74, height: 74, borderRadius: 99, border: "none", cursor: "pointer", background: "#EC5A13", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 16px 34px -12px rgba(236,90,19,.9)" }}>
                {playing
                  ? <svg width="26" height="26" viewBox="0 0 24 24" fill="#FBF3E8"><rect x="6" y="5" width="4" height="14" rx="1.3" /><rect x="14" y="5" width="4" height="14" rx="1.3" /></svg>
                  : <svg width="28" height="28" viewBox="0 0 24 24" fill="#FBF3E8"><path d="M8 5v14l11-7z" /></svg>}
              </button>
              <button onClick={() => goEp(idx + 1)} disabled={idx >= items.length - 1} aria-label="Следующий выпуск" style={{ background: "none", border: "none", cursor: "pointer", opacity: idx >= items.length - 1 ? .35 : 1 }}><svg width="30" height="30" viewBox="0 0 24 24" fill="#FBF3E8"><path d="M13 6l7 6-7 6zM5 6l7 6-7 6z" /></svg></button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
