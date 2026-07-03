import { Link } from "react-router-dom";
import SiteShell from "../components/SiteShell.js";
import { rub, type PodcastItem } from "../lib/api.js";
import { token } from "../lib/cart.js";
import { usePodcasts, useSubscribePodcasts } from "../lib/queries.js";

/**
 * Подкасты клуба — витрина по аналогии с мерчем. Слушать можно по годовой
 * подписке (3 999 ₽/год): без неё карточки видны, но вместо плеера — замок и CTA.
 */
export default function Podcasts() {
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
          Разговоры с выпускниками, преподавателями и практиками права. Доступ к прослушиванию —
          по подписке {priceRub} в год.
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
                  <div className="font-display text-[17px] font-semibold leading-tight tracking-tight">{p.title}</div>
                  {p.description && <p className="mt-2 text-sm leading-relaxed text-grafit-soft">{p.description}</p>}
                  {p.duration && <div className="mt-2 font-mono text-[12px] text-grafit-soft">{p.duration}</div>}
                </div>
              </div>
              <div className="border-t border-[#f0ece2] px-5 py-4">
                {p.audio_url ? (
                  <audio controls preload="none" src={p.audio_url} className="w-full" />
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
