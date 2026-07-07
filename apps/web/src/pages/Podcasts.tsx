import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import SiteShell from "../components/SiteShell.js";
import { apiGet, rub, type PodcastItem } from "../lib/api.js";
import { token } from "../lib/cart.js";
import { usePodcasts, useSubscribePodcasts } from "../lib/queries.js";
import { usePageTitle } from "../lib/title.js";

const RATES = [1, 1.25, 1.5, 2] as const;

/** Плеер выпуска: запоминает позицию (localStorage) и умеет менять скорость.
    Подписанная ссылка живёт 2 часа — если вкладка провисела дольше и источник
    вернул ошибку, тихо берём свежую ссылку из API и продолжаем с того же места. */
function EpisodePlayer({ id, src }: { id: string; src: string }) {
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
      setStale("Ссылка на аудио устарела — обновите страницу");
    } finally {
      setTimeout(() => { refreshing.current = false; }, 3000);
    }
  };

  const restore = () => {
    const el = ref.current;
    const saved = Number(localStorage.getItem(posKey) || 0);
    // Не восстанавливаем, если дослушано почти до конца — начинаем заново.
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
        <button onClick={cycleRate} title="Скорость воспроизведения" className="foc flex-none rounded-[10px] border border-[#E5E7EB] bg-white px-3 py-2 font-mono text-[12px] font-semibold">
          ×{rate}
        </button>
      </div>
      {stale && <p className="font-mono text-[11px] text-karmin">{stale}</p>}
    </div>
  );
}

/**
 * Подкасты клуба — витрина по аналогии с мерчем. Слушать можно по годовой
 * подписке (3 999 ₽/год): без неё карточки видны, но вместо плеера — замок и CTA.
 */
export default function Podcasts() {
  usePageTitle("Подкасты");
  const t = token();
  const q = usePodcasts(t);
  const subscribe = useSubscribePodcasts(t);
  const data = q.data;
  const priceRub = data ? rub(data.price) : "3 999 ₽";

  const onSubscribe = () => {
    subscribe.mutate(undefined, {
      onSuccess: (r) => {
        if (r.payment_url) window.location.assign(r.payment_url); // сразу к оплате ЮKassa
      },
    });
  };

  return (
    <SiteShell>
      <main className="mx-auto max-w-[1180px] px-7 py-12">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-ohra">Витрина · Подкасты</p>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight">Подкасты клуба</h1>
        <p className="mt-3 max-w-[620px] text-grafit-soft">
          Разговоры с выпускниками, преподавателями и практиками права. Пробный выпуск открыт
          для всех, полный доступ — по подписке {priceRub} в год.
        </p>

        {/* Подписка */}
        {data && !data.subscribed && (
          <div className="mt-7 flex flex-wrap items-center justify-between gap-4 rounded-[18px] bg-hse-blue p-6 text-kost">
            <div>
              <div className="font-display text-xl font-semibold">Подписка на подкасты · {priceRub} в год</div>
              <p className="mt-1 max-w-[560px] text-sm text-[rgba(251,243,232,.8)]">
                Все выпуски без ограничений. {t ? "Оформление — заявка; при подключённой онлайн-оплате сразу откроется оплата картой." : "Чтобы оформить, войдите в личный кабинет."}
              </p>
            </div>
            {t ? (
              <button onClick={onSubscribe} disabled={subscribe.isPending} className="foc flex-none rounded-[12px] bg-ohra px-7 py-3.5 font-semibold text-kost disabled:opacity-60">
                {subscribe.isPending ? "Оформляем…" : "Оформить подписку"}
              </button>
            ) : (
              <Link to="/lk" className="foc flex-none rounded-[12px] bg-ohra px-7 py-3.5 font-semibold text-kost">Войти в ЛК</Link>
            )}
          </div>
        )}
        {data?.subscribed && (
          <div className="mt-7 rounded-[14px] bg-[rgba(31,138,91,.1)] px-5 py-3.5 font-mono text-[13px] text-[#1F8A5B]">
            Подписка активна{data.sub_until ? ` до ${new Date(data.sub_until).toLocaleDateString("ru-RU")}` : ""} — слушайте все выпуски.
          </div>
        )}
        {subscribe.isSuccess && !subscribe.data.payment_url && (
          <p className="mt-3 rounded-[14px] bg-[rgba(196,154,69,.14)] px-5 py-3.5 font-mono text-[13px] text-[#a07d2e]">
            Заявка {subscribe.data.number} оформлена — менеджер учебного офиса свяжется с вами для оплаты, после чего подписка включится.
          </p>
        )}
        {subscribe.isError && <p className="mt-3 font-mono text-[13px] text-karmin">{(subscribe.error as Error).message}</p>}

        {q.isLoading && <p className="mt-8 font-mono text-sm text-grafit-soft">Загрузка…</p>}
        {q.isError && <p className="mt-8 font-mono text-sm text-karmin">Не удалось загрузить подкасты. Обновите страницу.</p>}

        <div className="two-col mt-8 grid grid-cols-2 gap-5">
          {data?.items.map((p: PodcastItem) => (
            <div key={p.id} className="overflow-hidden rounded-[18px] border border-[#E5E7EB] bg-white">
              <div className="flex gap-5 p-5">
                {p.cover
                  ? <img src={p.cover} alt="" className="h-24 w-24 flex-none rounded-[14px] object-cover" />
                  : <div className="flex h-24 w-24 flex-none items-center justify-center rounded-[14px] bg-hse-blue font-display text-2xl font-extrabold text-kost">▶</div>}
                <div className="min-w-0 flex-1">
                  {p.is_free && <span className="mb-1.5 inline-block rounded-full bg-[rgba(31,138,91,.14)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-[#1F8A5B]">Пробный выпуск · бесплатно</span>}
                  <div className="font-display text-[17px] font-semibold leading-tight tracking-tight">{p.title}</div>
                  {p.description && <p className="mt-2 text-sm leading-relaxed text-grafit-soft">{p.description}</p>}
                  {p.duration && <div className="mt-2 font-mono text-[12px] text-grafit-soft">{p.duration}</div>}
                </div>
              </div>
              <div className="border-t border-[#f0ece2] px-5 py-4">
                {p.audio_url ? (
                  <EpisodePlayer id={p.id} src={p.audio_url} />
                ) : (
                  <div className="flex items-center gap-3 font-mono text-[12px] text-grafit-soft">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-kost-2">🔒</span>
                    Доступно по подписке {priceRub}/год
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        {data && data.items.length === 0 && <p className="mt-8 font-mono text-sm text-grafit-soft">Выпусков пока нет — скоро появятся.</p>}
      </main>
    </SiteShell>
  );
}
