import { changeDate, changeTime, type ChangesSnapshot } from "../lib/changes.js";

export default function ChangesStatus({ data }: { data: ChangesSnapshot }) {
  const delayed = data.lastSuccessAt && Date.now() - Date.parse(data.lastSuccessAt) > 2 * 60 * 60 * 1000;
  return <div className="changes-notice"><span aria-hidden="true">◷</span><div>
    <p>{data.syncStatus === "unavailable" ? <><strong>Источник временно недоступен.</strong> Показаны сохранённые материалы.</>
      : delayed ? <><strong>Обновление задерживается.</strong> Показаны материалы последней успешной загрузки.</>
      : data.mode === "channel" ? <>LegisDigest · Проверяем новые публикации каждый час</>
      : <>Документы за {changeDate(data.periodFrom)} – {changeDate(data.periodTo)}</>}</p>
    <p className="changes-sync-meta">{data.lastSuccessAt ? `Обновлено: ${changeTime(data.lastSuccessAt)}.` : ""}
      {data.lastPostAt && ` Последняя публикация: ${changeDate(data.lastPostAt)}.`}</p>
    {data.syncStatus === "unavailable" && data.checkedAt && <p className="changes-sync-meta">Последняя попытка: {changeTime(data.checkedAt)}.</p>}
  </div></div>;
}
