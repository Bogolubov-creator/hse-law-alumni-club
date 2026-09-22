import { changeDate, changeTime, type ChangesSnapshot } from "../lib/changes.js";

export default function ChangesStatus({ data }: { data: ChangesSnapshot }) {
  const delayed = data.lastSuccessAt && Date.now() - Date.parse(data.lastSuccessAt) > 2 * 60 * 60 * 1000;
  const quiet = data.lastPostAt && Date.now() - Date.parse(data.lastPostAt) > 10 * 24 * 60 * 60 * 1000;
  return <div className="changes-notice"><span aria-hidden="true">◷</span><div>
    <p>{data.syncStatus === "unavailable" ? <><strong>Источник временно недоступен.</strong> Показаны сохранённые материалы.</>
      : delayed ? <><strong>Обновление задерживается.</strong> Показаны материалы последней успешной загрузки.</>
      : data.mode === "channel" ? <><strong>Обновление из LegisDigest каждый час.</strong> Справки и пояснения из опубликованных сообщений канала.</>
      : <><strong>Архивный срез.</strong> Первое обновление из канала ещё не выполнено.</>}</p>
    <p className="changes-sync-meta">{data.lastSuccessAt ? `Последняя успешная загрузка: ${changeTime(data.lastSuccessAt)}.` : "Успешной загрузки из канала пока нет."}
      {data.lastPostAt && ` Последний материал в канале: ${changeDate(data.lastPostAt)}.`}</p>
    {data.syncStatus === "unavailable" && data.checkedAt && <p className="changes-sync-meta">Последняя попытка: {changeTime(data.checkedAt)}.</p>}
    {quiet && <p className="changes-sync-meta">В открытой ленте давно нет новых публикаций. Обновление сайта не означает появления новых материалов у агента.</p>}
  </div></div>;
}
