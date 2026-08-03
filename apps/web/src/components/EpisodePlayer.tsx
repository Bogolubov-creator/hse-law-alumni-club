import { useRef, useState } from "react";
import { apiGet, type PodcastItem } from "../lib/api.js";
import { token } from "../lib/cart.js";

/**
 * Плеер выпуска подкаста. Вынесен из страницы: логика тут нетривиальная
 * (позиция в localStorage, тихое обновление протухшей подписанной ссылки),
 * и держать её в двух версиях фронта нельзя – разойдутся.
 *
 * `v2` меняет только оформление кнопки скорости: v1 остаётся на Tailwind,
 * v2 берёт семантические токены и потому работает в тёмной теме.
 */

const RATES = [1, 1.25, 1.5, 2] as const;

/** Плеер выпуска: запоминает позицию (localStorage) и умеет менять скорость.
    Подписанная ссылка живёт 2 часа – если вкладка провисела дольше и источник
    вернул ошибку, тихо берём свежую ссылку из API и продолжаем с того же места. */
export function EpisodePlayer({ id, src, v2 = false }: { id: string; src: string; v2?: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  const lastSave = useRef(0);
  const refreshing = useRef(false);
  const [liveSrc, setLiveSrc] = useState(src);
  const [stale, setStale] = useState<string | null>(null);
  const [rate, setRate] = useState(1);
  const posKey = `pod-pos-${id}`;

  const refreshSrc = async () => {
    if (refreshing.current) return; // одна авто-попытка за раз
    refreshing.current = true;
    const el = ref.current;
    const pos = el?.currentTime || Number(localStorage.getItem(posKey) || 0);
    try {
      const t = token();
      const fresh = await apiGet<{ items: PodcastItem[] }>("/podcasts", t ?? undefined);
      const url = fresh.items.find((p) => p.id === id)?.audio_url;
      if (!url) throw new Error("нет ссылки");
      setStale(null);
      setLiveSrc(url);
      // После смены src аудио перезагрузится; вернём позицию и продолжим.
      requestAnimationFrame(() => {
        const a = ref.current;
        if (!a) return;
        a.load();
        const onMeta = () => { if (pos > 5) a.currentTime = pos; void a.play().catch(() => undefined); a.removeEventListener("loadedmetadata", onMeta); };
        a.addEventListener("loadedmetadata", onMeta);
      });
    } catch {
      setStale("Ссылка на аудио устарела – обновите страницу");
    } finally {
      setTimeout(() => { refreshing.current = false; }, 3000);
    }
  };

  const restore = () => {
    const el = ref.current;
    const saved = Number(localStorage.getItem(posKey) || 0);
    // Не восстанавливаем, если дослушано почти до конца – начинаем заново.
    if (el && saved > 5 && saved < (el.duration || Infinity) - 5) el.currentTime = saved;
  };
  const savePos = () => {
    const el = ref.current;
    if (!el) return;
    const now = Date.now();
    if (now - lastSave.current < 5000) return; // пишем не чаще раза в 5 секунд
    lastSave.current = now;
    localStorage.setItem(posKey, String(Math.floor(el.currentTime)));
  };
  const cycleRate = () => {
    const next = RATES[(RATES.indexOf(rate as (typeof RATES)[number]) + 1) % RATES.length]!;
    setRate(next);
    if (ref.current) ref.current.playbackRate = next;
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-3">
        <audio
          ref={ref}
          controls
          preload="none"
          src={liveSrc}
          className="min-w-0 flex-1"
          onLoadedMetadata={restore}
          onTimeUpdate={savePos}
          onPause={() => { lastSave.current = 0; savePos(); }}
          onError={() => void refreshSrc()}
        />
        <button
          onClick={cycleRate}
          title="Скорость воспроизведения"
          aria-label={`Скорость воспроизведения ×${rate}`}
          className={v2 ? "foc" : "foc flex-none rounded-[10px] border border-[#E5E7EB] bg-white px-3 py-2 font-mono text-[12px] font-semibold"}
          style={v2 ? { flex: "none", borderRadius: "var(--r-sm)", border: "1px solid var(--c-line)", background: "transparent", color: "var(--c-text-2)", padding: "8px 12px", fontFamily: "var(--f-data)", fontSize: 12, fontWeight: 600, cursor: "pointer" } : undefined}
        >
          ×{rate}
        </button>
      </div>
      {stale && <p role="alert" className={v2 ? undefined : "font-mono text-[11px] text-karmin"} style={v2 ? { fontFamily: "var(--f-data)", fontSize: 11, color: "var(--c-danger-text)", margin: 0 } : undefined}>{stale}</p>}
    </div>
  );
}
