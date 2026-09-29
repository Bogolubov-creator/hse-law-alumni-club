import { useState } from "react";
import { useAnalytics, useSystemHealth, type AnalyticsRange } from "../lib/admin.js";
import { isMirror } from "../lib/public-url.js";
import "./dashboard.css";

const number = (value: number | null | undefined) => value == null ? "Нет данных" : value.toLocaleString("ru-RU");
const statusLabel = { ok: "Работает", error: "Ошибка", unknown: "Не проверено", disabled: "Не настроено" };

export function DashboardAdmin({ onAnalytics }: { onAnalytics: () => void }) {
  const [range, setRange] = useState<AnalyticsRange>("30d");
  const analytics = useAnalytics(range);
  const health = useSystemHealth();
  const data = analytics.data;
  const series = data?.series.pageviews_by_day ?? [];
  const max = Math.max(1, ...series.map((day) => day.count));
  const points = series.map((day, i) => `${20 + i / Math.max(1, series.length - 1) * 600},${160 - day.count / max * 130}`).join(" ");
  return (
    <section className="adm-dashboard" aria-label="Дашборд сайта">
      <div className="dash-toolbar">
        <p>{isMirror ? "Демонстрация · показатели на зеркале учебные" : "Показатели сайта и проверка сервисов"}</p>
        <div className="dash-period" role="group" aria-label="Период аналитики">
          {(["7d", "30d", "90d"] as const).map((value) => <button key={value} className="foc" aria-pressed={range === value} onClick={() => setRange(value)}>{value.slice(0, -1)} дней</button>)}
        </div>
      </div>
      {analytics.isError ? <div role="alert" className="dash-error">Аналитика недоступна. <button onClick={() => void analytics.refetch()}>Повторить</button></div> : analytics.isPending ? <p role="status">Загружаем аналитику…</p> : data && <>
        <div className="dash-kpis">
          {[
            ["Просмотры страниц", data.pageviews.hits, "Учтённые просмотры, не уникальные посетители"],
            ["Вступления", data.pulse.joins, "Новые участники за период"],
            ["Заявки", data.pulse.orders_created, `Оплачено: ${number(data.pulse.orders_paid)}`],
            ["Участие в жизни клуба", data.pulse.rsvps + data.pulse.podcast_plays, `Записи: ${number(data.pulse.rsvps)} · прослушивания: ${number(data.pulse.podcast_plays)}`],
          ].map(([title, value, note]) => <article className="dash-kpi" key={title}><h2>{title}</h2><strong>{number(value as number | null)}</strong><p>{note}</p></article>)}
        </div>
        <div className="dash-analysis">
          <article className="dash-card dash-traffic">
            <div className="dash-card-head"><h2>Активность сайта</h2><span>Просмотры по дням · UTC</span></div>
            {data.pageviews.hits == null ? <p>Сбор просмотров недоступен.</p> : data.pageviews.hits === 0 ? <p>За выбранный период просмотры не зарегистрированы.</p> : <>
              <svg viewBox="0 0 640 190" role="img" aria-label={`Просмотры по дням, всего ${data.pageviews.hits}`}>
                {[30, 95, 160].map((y) => <line key={y} x1="20" x2="620" y1={y} y2={y} stroke="var(--c-line)" />)}
                <polygon points={`20,160 ${points} 620,160`} fill="var(--c-accent)" opacity=".12" />
                <polyline points={points} fill="none" stroke="var(--c-accent-text)" strokeWidth="3" strokeLinejoin="round" />
              </svg>
              <div className="dash-dates"><span>{series[0]?.day}</span><span>Максимум за день: {number(max)}</span><span>{series.at(-1)?.day}</span></div>
              <details><summary>Данные графика</summary><div className="dash-table-scroll"><table><thead><tr><th>Дата UTC</th><th>Просмотры</th></tr></thead><tbody>{series.map((day) => <tr key={day.day}><td>{day.day}</td><td>{number(day.count)}</td></tr>)}</tbody></table></div></details>
            </>}
            <p className="dash-note">Учитываются просмотры с согласием на аналитику. Это не вся аудитория сайта.</p>
          </article>
          <article className="dash-card">
            <div className="dash-card-head"><h2>Популярные страницы</h2></div>
            {data.pageviews.paths_top.length === 0 ? <p>Нет данных за период.</p> : <ol className="dash-ranking">{data.pageviews.paths_top.slice(0, 5).map((path) => <li key={path.path}><span>{path.path}</span><strong>{number(path.count)}</strong><meter aria-label={`Просмотры ${path.path}`} value={path.count} min={0} max={Math.max(1, ...data.pageviews.paths_top.map((p) => p.count))} /></li>)}</ol>}
            <button className="dash-link foc" onClick={onAnalytics}>Открыть полную аналитику →</button>
          </article>
        </div>
        <p className="dash-note">Срез сформирован: {new Date(data.generated_at).toLocaleString("ru-RU")}</p>
      </>}
      <article className="dash-card dash-system">
        <div className="dash-card-head"><div><h2>Состояние системы</h2><p>{health.data?.status === "degraded" ? "Есть проблема, требующая проверки" : "Фактические проверки и состояние подключений"}</p></div><button className="foc dash-refresh" disabled={health.isFetching} onClick={() => void health.refetch()}>{health.isFetching ? "Проверяем…" : "Проверить сейчас"}</button></div>
        {health.isError ? <p role="alert">Не удалось получить состояние. Статусы сервисов неизвестны.</p> : health.isPending ? <p role="status">Проверяем систему…</p> : health.data && <>
          <div className="dash-services">{health.data.checks.map((check) => <div className="dash-service" key={check.id}><div><h3>{check.name}</h3><span className="dash-status" data-status={check.status}>{statusLabel[check.status]}</span></div><p>{check.detail}</p>{check.latency_ms != null && <small>Ответ: {check.latency_ms} мс</small>}</div>)}</div>
          <p className="dash-note">Проверка: {new Date(health.data.checked_at).toLocaleString("ru-RU")}{health.data.uptime_seconds != null && ` · API запущен ${Math.floor(health.data.uptime_seconds / 60)} мин. назад`}. Это текущий срез, не история доступности. Оплата и внешняя доставка не проверяются.</p>
        </>}
      </article>
    </section>
  );
}
