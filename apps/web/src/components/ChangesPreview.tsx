import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { changeDate, loadChanges, selectChanges } from "../lib/changes.js";
import "../styles/changes.css";

export default function ChangesPreview() {
  const q = useQuery({ queryKey: ["law-changes"], queryFn: ({ signal }) => loadChanges(signal), staleTime: 60000, retry: false });
  const items = selectChanges(q.data?.items ?? [], new URLSearchParams()).slice(0, 3);
  return <section className="changes-preview" aria-labelledby="changes-preview-title">
    <div className="changes-preview-head"><div><h2 id="changes-preview-title">Изменения в праве</h2><p>Документы legis-digest: поиск, реквизиты и первоисточники.</p></div><Link className="changes-button" to="/changes">Открыть раздел ↗</Link></div>
    {q.data && <p className="changes-muted">Архив за {changeDate(q.data.periodFrom)} – {changeDate(q.data.periodTo)} · обновление пока не подключено</p>}
    {items.map(item => <Link className="changes-preview-row" key={item.id} to={`/changes/${item.id}`}><time dateTime={item.published}>{changeDate(item.published)}</time><span>{item.title}</span><span aria-hidden="true">↗</span></Link>)}
  </section>;
}
