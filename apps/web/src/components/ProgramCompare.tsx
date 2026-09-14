import { programStart } from "../lib/program-date.js";
import { useQueries } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { programFullSchema, type ProgramFull } from "@club/shared";
import { apiGet, FORMAT_LABEL, rub } from "../lib/api.js";
import { useMemberDiscount } from "../lib/cart.js";
import { actionGhost } from "../styles/primitives.js";

/** Сравниваем опубликованные данные подробной страницы, без параллельной копии каталога. */
export default function ProgramCompare({ slugs, onRemove }: { slugs: string[]; onRemove: (slug: string) => void }) {
  const discount = useMemberDiscount();
  const queries = useQueries({ queries: slugs.map((slug) => ({ queryKey: ["program", slug], queryFn: () => apiGet<ProgramFull>(`/programs/${slug}`, undefined, programFullSchema) })) });
  const rows: { title: string; value: (p: ProgramFull) => React.ReactNode }[] = [
    { title: "Цена", value: (p) => <>{rub(p.price - Math.round(p.price * discount / 100))}{discount > 0 && <small style={{ display: "block" }}>С учётом подтверждённой скидки {discount}%</small>}</> },
    { title: "Формат", value: (p) => FORMAT_LABEL[p.format] ?? p.format },
    { title: "Длительность", value: (p) => p.duration || "Не указана" },
    { title: "Начало", value: (p) => programStart(p.dates?.start) },
    { title: "Набор", value: (p) => p.enrollment === "nonactual" ? "Закрыт" : "Актуальный набор" },
    { title: "Документ", value: (p) => p.document || "Не указан" },
    { title: "Содержание", value: (p) => p.modules?.length ? <details><summary>Посмотреть содержание · {p.modules.length} разделов</summary><ul>{p.modules.map((m, i) => <li key={i}>{m.title}{(m.hours ?? 0) > 0 && ` (${m.hours} ч)`}{!!m.points?.length && <ul>{m.points.map((point, j) => <li key={j}>{point}</li>)}</ul>}</li>)}</ul></details> : p.description || "Содержание не опубликовано" },
    { title: "Преподаватели", value: (p) => p.teachers?.length ? <ul>{p.teachers.map((t, i) => <li key={i}>{t.name}{t.role && `, ${t.role}`}</li>)}</ul> : "Состав уточняется" },
    { title: "Запись", value: (p) => <Link to={`/dpo/${p.slug}`}>Условия и запись</Link> },
  ];
  return <section aria-labelledby="compare-title" className="club-compare">
    <h2 id="compare-title">Сравнение программ · {slugs.length} из 3</h2>
    <p id="compare-help">{slugs.length < 2 ? "Добавьте ещё одну программу. " : ""}На узком экране прокручивайте таблицу по горизонтали. С клавиатуры: перейдите к таблице и используйте стрелки.</p>
    <div role="region" aria-label="Таблица сравнения программ" aria-describedby="compare-help" tabIndex={0} className="club-compare-scroll foc">
      <table>
        <thead><tr><th scope="col">Условия</th>{slugs.map((slug, i) => <th scope="col" key={slug}><Link to={`/dpo/${slug}`}>{queries[i]?.data?.title ?? "Загружаем программу…"}</Link><button style={{ ...actionGhost, display: "block", marginTop: 12 }} onClick={() => onRemove(slug)} aria-label={`Убрать из сравнения: ${queries[i]?.data?.title ?? slug}`}>Убрать</button>{queries[i]?.isError && <p role="alert">Не удалось загрузить. <button onClick={() => queries[i]?.refetch()}>Повторить</button></p>}</th>)}</tr></thead>
        <tbody>{rows.map((row) => <tr key={row.title}><th scope="row">{row.title}</th>{queries.map((q, i) => <td key={slugs[i]}>{q.data ? row.value(q.data) : q.isError ? "Данные недоступны" : "Загрузка…"}</td>)}</tr>)}</tbody>
      </table>
    </div>
  </section>;
}
