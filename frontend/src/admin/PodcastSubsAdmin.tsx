import { mono, label, action, Panel, PanelTitle, Row, Stat } from "./ui.js";
import { usePodcastSubs } from "../lib/admin.js";

export function PodcastSubs() {
  const q = usePodcastSubs();
  const d = q.data;

  if (q.isLoading) return <p style={{ ...label, margin: 0 }}>загружаем…</p>;
  if (q.isError) {
    return (
      <Panel>
        <p style={{ ...label, color: "var(--c-danger-text)", margin: 0 }}>данные не загрузились</p>
        <button onClick={() => q.refetch()} className="foc" style={{ ...action, marginTop: 14 }}>Повторить</button>
      </Panel>
    );
  }

  return (
    <>
      <div className="adm-stats" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: "0 28px" }}>
        <Stat name="Активных подписок" value={d?.active ?? 0} accent />
        <Stat name="Истекают за 30 дней" value={d?.expiring_30d ?? 0} accent={!!d?.expiring_30d} />
        <Stat name="Истёкших" value={d?.expired ?? 0} />
        <Stat name="Прослушиваний всего" value={d?.plays_total ?? 0} />
      </div>

      <div className="adm-two" style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 20, marginTop: 26 }}>
        <Panel>
          <PanelTitle right={<span style={label}>по дате окончания</span>}>Подписчики</PanelTitle>
          {!d?.items.length && <p style={{ ...label, margin: 0, textTransform: "none", letterSpacing: 0 }}>Активных подписок нет.</p>}
          {d?.items.map((s) => (
            <Row key={s.id} cols="1fr 108px auto">
              <span style={{ minWidth: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{s.fio ?? "Выпускник"}</span>
                {s.cohort && <span style={{ ...label, fontSize: 10, marginLeft: 8 }}>выпуск {s.cohort}</span>}
              </span>
              <span style={{ ...mono, fontSize: 12, color: "var(--c-text-3)" }}>{new Date(s.until).toLocaleDateString("ru-RU")}</span>
              {/* Оставшиеся дни – главное, по чему офис решает, звонить ли */}
              <span style={{ ...mono, fontSize: 12, whiteSpace: "nowrap", color: s.days_left <= 10 ? "var(--c-danger-text)" : "var(--c-text)" }}>
                {s.days_left} дн.{s.reminded ? " · напомнили" : ""}
              </span>
            </Row>
          ))}
          {!!d?.items.length && <div style={{ borderTop: "1px solid var(--c-line)" }} />}
        </Panel>

        <Panel>
          <PanelTitle right={<span style={label}>за 30 дней · всего</span>}>Прослушивания</PanelTitle>
          {!d?.by_podcast.length && <p style={{ ...label, margin: 0, textTransform: "none", letterSpacing: 0 }}>Выпусков нет.</p>}
          {d?.by_podcast.map((p) => (
            <Row key={p.id} cols="1fr auto">
              <span style={{ minWidth: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{p.title}</span>
                <span style={{ ...label, fontSize: 10, display: "block", marginTop: 3 }}>
                  {p.is_free ? "бесплатный" : "по подписке"} · слушателей {p.listeners}
                </span>
              </span>
              <span style={{ ...mono, fontSize: 13, whiteSpace: "nowrap" }}>{p.plays_30d} · {p.plays}</span>
            </Row>
          ))}
          {!!d?.by_podcast.length && <div style={{ borderTop: "1px solid var(--c-line)" }} />}
          <p style={{ ...label, textTransform: "none", letterSpacing: 0, margin: "14px 0 0", lineHeight: 1.5 }}>
            Считаются обращения к аудио на стороне сервера. Видеовыпуски RuTube сюда не попадают – их отдаёт чужой плеер.
          </p>
        </Panel>
      </div>
    </>
  );
}
