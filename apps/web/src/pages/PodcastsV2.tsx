import { PodcastSubscription } from "../components/PodcastSubscription.js";
import { PodcastArtwork } from "../components/PodcastArtwork.js";
import { Mark } from "../v2/Mark.js";
import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { type PodcastItem } from "../lib/api.js";
import { token } from "../lib/cart.js";
import { usePodcasts } from "../lib/queries.js";
import { useHead } from "../lib/title.js";
import { V2Shell, ShowcaseHead, mono, disp } from "../v2/Shell.js";
import { action } from "../styles/primitives.js";

/**
 * Подкасты v2 (/podcasts) – выпуски как записи фонотеки: номер и
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
  textTransform: "none" as const, color: "var(--c-text-3)",
};

export default function PodcastsV2() {
  useHead({
    title: "Подкасты клуба",
    description: "Подкасты клуба выпускников факультета права Вышки: разговоры с выпускниками, преподавателями и практиками права.",
    canonical: `${typeof window !== "undefined" ? window.location.origin : ""}/podcasts`,
    noindex: false,
  });

  const t = token();
  const q = usePodcasts(t);
  const data = q.data;
  const { hash } = useLocation();
  useEffect(() => {
    if (hash !== "#podcast-subscription" || !data || data.subscribed) return;
    const panel = document.getElementById("podcast-subscription");
    panel?.scrollIntoView({ block: "start" });
    panel?.focus({ preventScroll: true });
  }, [hash, data]);
  const items = data?.items ?? [];

  return (
    <V2Shell>
      <main id="main">
        <ShowcaseHead
          photo={{ src: "assets/photos/hall-audience.jpg", alt: "Аудитория факультета права во время лекции", side: "left" }}
          eyebrow="подкасты"
          title="Подкасты клуба"
          lead="Выпуски о праве и практике. Один выпуск бесплатно, остальные – по годовой подписке."
          count={items.length ? `выпусков ${items.length}` : undefined}
        />
        <div style={{ maxWidth: "var(--container)", margin: "0 auto", padding: "0 28px" }}>

        {/* Подписка: состояние вверху, чтобы не искать его среди выпусков */}
        {data && !data.subscribed && <PodcastSubscription token={t} price={data.price} />}

        {data?.subscribed && (
          <div className="podcast-member-panel">
            <Mark kind="scales" size={34} />
            <div><strong>Ваша подписка активна</strong><p>{data.sub_until ? `До ${new Date(data.sub_until).toLocaleDateString("ru-RU")} · ` : ""}Все выпуски доступны для прослушивания</p></div>
          </div>
        )}

        {q.isLoading && <p style={{ ...label, margin: "26px 0 0" }}>загружаем выпуски…</p>}

        {q.isError && (
          <div style={{ borderTop: "1px solid var(--c-line)", marginTop: 26, padding: "40px 0" }}>
            <p style={{ ...label, color: "var(--c-danger-text)", margin: 0 }}>выпуски не загрузились</p>
            <button onClick={() => q.refetch()} className="foc" style={{ ...action, marginTop: 16 }}>Повторить</button>
          </div>
        )}

        <div style={{ marginTop: 26 }}>
          {items.map((p: PodcastItem, i) => {
            const locked = !p.is_free && !data?.subscribed;
            return (
            <article key={p.id} className={`v2-row podcast-row${locked ? " podcast-row--locked" : ""}`} style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 24, alignItems: "start", padding: "22px 0", borderTop: "1px solid var(--c-line)" }}>
              <div className="podcast-row__meta">
                <Link to={`/podcasts/${encodeURIComponent(p.id)}`} className="foc" aria-label={`Открыть выпуск: ${p.title}`}><PodcastArtwork key={p.id} cover={p.cover} number={i + 1} locked={locked} /></Link>
                {p.duration && <div style={{ ...label, fontSize: "var(--t-micro)", marginTop: 10 }}>{p.duration}</div>}
              </div>

              <div style={{ minWidth: 0 }}>
                <h2 style={{ ...disp, fontFamily: "var(--f-display)", fontWeight: 400, fontSize: "var(--t-h3)", lineHeight: 1.25, margin: 0 }}><Link to={`/podcasts/${encodeURIComponent(p.id)}`} className="foc" style={{ color: "inherit", textDecoration: "none" }}>{p.title}</Link></h2>
                {locked && <div className="podcast-access-label">По подписке</div>}
                {p.is_free && <div style={{ ...label, fontSize: "var(--t-caption)", color: "var(--c-ok-text)", marginTop: 6 }}>Пробный выпуск, бесплатно</div>}
                {p.description && (
                  <p style={{ margin: "9px 0 0", color: "var(--c-text-2)", fontSize: "var(--t-body)", lineHeight: 1.55, maxWidth: "62ch" }}>{p.description}</p>
                )}

                {locked ? (
                  <a href="#podcast-subscription" className="foc podcast-subscribe-link" onClick={() => document.getElementById("podcast-subscription")?.focus({ preventScroll: true })}>Оформить подписку</a>
                ) : (
                  <Link to={`/podcasts/${encodeURIComponent(p.id)}`} className="foc" style={{ ...action, display: "inline-flex", marginTop: 18 }}>Прослушать</Link>
                )}
              </div>
            </article>
          ); })}
          {items.length > 0 && <div style={{ borderTop: "1px solid var(--c-line)" }} />}
        </div>

        {data && items.length === 0 && (
          <div style={{ borderTop: "1px solid var(--c-line)", padding: "40px 0" }}>
            <p style={{ margin: 0, color: "var(--c-text-2)", fontSize: "var(--t-body)" }}>Выпусков пока нет. О новых напишем в новостях клуба.</p>
          </div>
        )}
        </div>
      </main>
    </V2Shell>
  );
}
