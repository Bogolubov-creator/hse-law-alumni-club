import { Link } from "react-router-dom";
import { rub, type PodcastItem } from "../lib/api.js";
import { token } from "../lib/cart.js";
import { usePodcasts, useSubscribePodcasts } from "../lib/queries.js";
import { useHead } from "../lib/title.js";
import { EpisodePlayer } from "../components/EpisodePlayer.js";
import { VideoEmbed } from "../components/VideoEmbed.js";
import { V2Shell, ShowcaseHead, mono, disp } from "../v2/Shell.js";

/**
 * Подкасты v2 (/v2/podcasts) – выпуски как записи фонотеки: номер и
 * длительность моноширинной колонкой слева, название и плеер справа.
 *
 * Обложки не выносим в крупные плитки: у части выпусков их нет, и сетка
 * распадается на «с картинкой» и «без». Обложка идёт компактной меткой рядом
 * с номером – она уточняет запись, а не заменяет её.
 *
 * SEO: noindex, canonical на v1 – разметку PodcastSeries отдаёт та страница.
 */

const label = {
  ...mono, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)",
  textTransform: "uppercase" as const, color: "var(--c-text-3)",
};

export default function PodcastsV2() {
  useHead({
    title: "Подкасты клуба",
    description: "Подкасты клуба выпускников факультета права НИУ ВШЭ: разговоры с выпускниками, преподавателями и практиками права.",
    canonical: `${typeof window !== "undefined" ? window.location.origin : ""}/podcasts`,
    noindex: true,
  });

  const t = token();
  const q = usePodcasts(t);
  const subscribe = useSubscribePodcasts(t);
  const data = q.data;
  const priceRub = data ? rub(data.price) : "3 999 ₽";
  const items = data?.items ?? [];

  const onSubscribe = () =>
    subscribe.mutate(undefined, {
      onSuccess: (r) => { if (r.payment_url) window.location.assign(r.payment_url); },
    });

  return (
    <V2Shell>
      <main style={{ maxWidth: "var(--container)", margin: "0 auto", padding: "0 28px" }}>
        <ShowcaseHead
          eyebrow="фонотека · подкасты"
          title="Разговоры о праве и практике"
          lead="Выпускники, преподаватели и практики права. Пробный выпуск открыт всем, остальное – по годовой подписке."
          count={items.length ? `выпусков ${items.length}` : undefined}
        />

        {/* Подписка: состояние вверху, чтобы не искать его среди выпусков */}
        {data && !data.subscribed && (
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 18, padding: "20px 22px", borderRadius: "var(--r-lg)", border: "1px solid var(--c-line-strong)", background: "var(--c-bg-raised)" }}>
            <div style={{ minWidth: 240, flex: 1 }}>
              <div style={{ ...disp, fontWeight: 600, fontSize: "var(--t-h3)" }}>Подписка · {priceRub} в год</div>
              <p style={{ margin: "8px 0 0", color: "var(--c-text-2)", fontSize: "var(--t-small)", lineHeight: 1.5, maxWidth: "56ch" }}>
                Все выпуски без ограничений. {t
                  ? "Оформление – заявка; если онлайн-оплата подключена, сразу откроется оплата картой."
                  : "Чтобы оформить, войдите в личный кабинет."}
              </p>
            </div>
            {t ? (
              <button onClick={onSubscribe} disabled={subscribe.isPending} className="foc"
                style={{ flex: "none", border: "none", background: "var(--c-accent)", color: "var(--c-on-accent)", borderRadius: "var(--r-md)", padding: "13px 22px", fontWeight: 600, fontSize: 15, cursor: subscribe.isPending ? "wait" : "pointer" }}>
                {subscribe.isPending ? "Оформляем…" : "Оформить подписку"}
              </button>
            ) : (
              <Link to="/v2/lk" className="foc"
                style={{ flex: "none", background: "var(--c-accent)", color: "var(--c-on-accent)", borderRadius: "var(--r-md)", padding: "13px 22px", fontWeight: 600, fontSize: 15, textDecoration: "none" }}>
                Войти в кабинет
              </Link>
            )}
          </div>
        )}

        {data?.subscribed && (
          <div style={{ ...label, color: "var(--c-ok-text)", padding: "14px 0", borderTop: "1px solid var(--c-line)", borderBottom: "1px solid var(--c-line)" }}>
            подписка активна{data.sub_until ? ` до ${new Date(data.sub_until).toLocaleDateString("ru-RU")}` : ""} · доступны все выпуски
          </div>
        )}

        {subscribe.isSuccess && !subscribe.data.payment_url && (
          <p role="status" style={{ ...label, color: "var(--c-status)", textTransform: "none", letterSpacing: 0, margin: "14px 0 0", lineHeight: 1.5 }}>
            Заявка {subscribe.data.number} оформлена – менеджер учебного офиса свяжется для оплаты, после чего подписка включится.
          </p>
        )}
        {subscribe.isError && (
          <p role="alert" style={{ ...mono, fontSize: "var(--t-caption)", color: "var(--c-danger-text)", margin: "14px 0 0" }}>{(subscribe.error as Error).message}</p>
        )}

        {q.isLoading && <p style={{ ...label, margin: "26px 0 0" }}>загружаем выпуски…</p>}

        {q.isError && (
          <div style={{ borderTop: "1px solid var(--c-line)", marginTop: 26, padding: "40px 0" }}>
            <p style={{ ...label, color: "var(--c-danger-text)", margin: 0 }}>выпуски не загрузились</p>
            <button onClick={() => q.refetch()} className="foc" style={{ marginTop: 16, border: "none", background: "var(--c-accent)", color: "var(--c-on-accent)", borderRadius: "var(--r-md)", padding: "12px 20px", fontWeight: 600, cursor: "pointer" }}>Повторить</button>
          </div>
        )}

        <div style={{ marginTop: 26 }}>
          {items.map((p: PodcastItem, i) => (
            <article key={p.id} className="v2-row" style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 24, alignItems: "start", padding: "22px 0", borderTop: "1px solid var(--c-line)" }}>
              <div>
                <div style={{ ...mono, fontSize: 17, fontWeight: 500, color: "var(--c-text)" }}>{String(i + 1).padStart(2, "0")}</div>
                {p.duration && <div style={{ ...label, fontSize: 10, marginTop: 6 }}>{p.duration}</div>}
                {p.cover && (
                  <img src={p.cover} alt="" width={56} height={56} loading="lazy"
                    style={{ width: 56, height: 56, marginTop: 10, borderRadius: "var(--r-sm)", objectFit: "cover" }}
                    onError={(ev) => { (ev.target as HTMLImageElement).style.display = "none"; }} />
                )}
              </div>

              <div style={{ minWidth: 0 }}>
                {p.is_free && <div style={{ ...label, fontSize: 10, color: "var(--c-ok-text)", marginBottom: 6 }}>пробный выпуск · бесплатно</div>}
                <h2 style={{ ...disp, fontWeight: 600, fontSize: "var(--t-h3)", lineHeight: 1.25, margin: 0 }}>{p.title}</h2>
                {p.description && (
                  <p style={{ margin: "9px 0 0", color: "var(--c-text-2)", fontSize: "var(--t-body)", lineHeight: 1.55, maxWidth: "62ch" }}>{p.description}</p>
                )}

                <div style={{ marginTop: 14 }}>
                  {/* Видеовыпуск: если есть запись на RuTube, показываем её вместо аудио */}
                  {p.video_url ? (
                    <VideoEmbed src={p.video_url} title={p.title} v2 />
                  ) : p.audio_url ? (
                    <EpisodePlayer id={p.id} src={p.audio_url} v2 />
                  ) : (
                    <div style={{ ...label, fontSize: 10, display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", border: "1px dashed var(--c-line)", borderRadius: "var(--r-md)" }}>
                      <span aria-hidden>🔒</span> доступно по подписке {priceRub} в год
                    </div>
                  )}
                </div>
              </div>
            </article>
          ))}
          {items.length > 0 && <div style={{ borderTop: "1px solid var(--c-line)" }} />}
        </div>

        {data && items.length === 0 && (
          <div style={{ borderTop: "1px solid var(--c-line)", padding: "40px 0" }}>
            <p style={{ margin: 0, color: "var(--c-text-2)", fontSize: "var(--t-body)" }}>Выпусков пока нет – скоро появятся.</p>
          </div>
        )}
      </main>
    </V2Shell>
  );
}
