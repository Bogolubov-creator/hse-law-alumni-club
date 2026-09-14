import snapshot from "./news-source-snapshot.json";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NEWS_SOURCES } from "@club/shared";
import { req } from "../lib/admin.js";
import { isMirror } from "../lib/public-url.js";
import Modal from "../components/Modal.js";
import { FormField } from "./common.js";
type Candidate = {id:string;title:string;source_url:string;sources:string[];state:string;published_at:string|null};
type Source = {id:string;title:string;checked_at?:string;error?:string;found?:number};
export default function NewsSources() {
  const qc = useQueryClient();
  const [selected,setSelected] = useState("all"), [showDismissed,setShowDismissed] = useState(false);
  const [edit,setEdit] = useState<Candidate|null>(null),[title,setTitle] = useState(""),[excerpt,setExcerpt] = useState("");
  const data = useQuery({queryKey:["adm","news-sources"],queryFn:()=>req<{automatic:boolean;sources:Source[];items:Candidate[]}>("GET","/admin/news-sources"),enabled:!isMirror,retry:false});
  const [message,setMessage] = useState("");
  const mutation = useMutation({mutationFn:({path,body,method="POST"}:{path:string;body?:unknown;method?:"POST"|"PATCH"})=>req<{busy?:boolean}>(method,path,body),onSuccess:(result)=>{
    setEdit(null); setMessage(result.busy ? "Источник уже обновляется или проверялся менее минуты назад." : "Сохранено. Очередь обновлена.");
    void qc.invalidateQueries({queryKey:["adm"]});
  }});
  const sources = data.data?.sources || NEWS_SOURCES.map(s => ({...s,checked_at:isMirror?snapshot.checked_at:undefined}));
  const items = (data.data?.items || (isMirror ? snapshot.items : [])).filter(i=>(selected==="all"||i.sources.includes(selected))&&(showDismissed||i.state!=="dismissed"));
  return <section className="mb-6 rounded-[18px] border border-[var(--c-line)] bg-[var(--c-bg-raised)] p-5" aria-labelledby="news-sources-title">
    <h3 id="news-sources-title" className="font-display text-xl">Источники и обзоры</h3>
    <p className="mt-2 text-sm text-[var(--c-text-2)]">Обновите источник, выберите материал и подготовьте анонс. В ленту попадут только опубликованные новости. Повторные ссылки объединяются.</p>
    {isMirror && <p role="status" className="mt-3 text-sm">На зеркале показан сохранённый снимок источников. Обновление и импорт доступны в админке с подключённым сервером.</p>}
    {data.data && <p className="mt-3 text-sm">{data.data.automatic ? "Автосбор включён: каждый час, на 17-й минуте." : "Автосбор выключен. Доступно ручное обновление; включение – в настройках сервера."}</p>}
    <div className="mt-4 grid gap-3 md:grid-cols-3">{sources.map((s:Source)=><div key={s.id} className="min-w-0 rounded-xl border border-[var(--c-line)] p-3">
      <strong className="text-sm">{s.title}</strong><p className="my-2 text-xs">{s.checked_at ? `${isMirror ? "Снимок" : "Проверено"}: ${new Date(s.checked_at).toLocaleString("ru-RU")}` : "Ещё не проверялся"}</p>
      {s.error && <p role="alert" className="text-xs text-[var(--c-danger-text)]">{s.error}</p>}
      <button disabled={isMirror||mutation.isPending} className="foc rounded-lg border border-[var(--c-line-control)] px-3 py-2 text-sm disabled:opacity-50" onClick={()=>mutation.mutate({path:`/admin/news-sources/${s.id}/refresh`})}>Обновить</button>
      <a className="foc ml-3 text-sm text-[var(--c-link)]" href={NEWS_SOURCES.find(n=>n.id===s.id)?.url} target="_blank" rel="noopener noreferrer">Источник ↗</a>
    </div>)}</div>
    {(data.isError||mutation.isError) && <p role="alert" className="mt-3 text-sm text-[var(--c-danger-text)]">{(mutation.error||data.error)?.message || "Не удалось загрузить очередь"}</p>}
    {mutation.isPending && <p role="status" className="mt-3 text-sm">Обрабатываем источник…</p>}
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
    {<div className="mt-4 flex flex-wrap gap-3 text-sm"><select aria-label="Источник материалов" value={selected} onChange={e=>setSelected(e.target.value)} className="foc rounded-lg border p-2"><option value="all">Все источники</option>{NEWS_SOURCES.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select><label className="flex items-center gap-2"><input type="checkbox" checked={showDismissed} onChange={e=>setShowDismissed(e.target.checked)}/>Показать отложенные</label></div>}
    {data.isLoading && <p className="mt-4">Загружаем очередь…</p>}
    {data.data && !items.length && <p className="mt-4 text-sm">Материалов пока нет. Обновите источники.</p>}
    {items.map(i=><article key={i.id} className="mt-4 border-t border-[var(--c-line)] pt-4">
      <p className="text-xs text-[var(--c-text-3)]">{i.sources.map(id=>NEWS_SOURCES.find(s=>s.id===id)?.title).join(" · ")} · {i.published_at ? new Date(i.published_at).toLocaleDateString("ru-RU") : "Дата источника не указана"}</p>
      <h4 className="my-2 break-words font-semibold">{i.title}</h4>
      <div className="flex flex-wrap items-center gap-3 text-sm"><a className="foc text-[var(--c-link)]" href={i.source_url} target="_blank" rel="noopener noreferrer">Оригинал ↗</a>
        {i.state==="imported" ? <span>Уже в новостях</span> : <><button className="foc rounded-lg border px-3 py-2" disabled={isMirror||mutation.isPending} onClick={()=>{setEdit(i);setTitle(i.title);setExcerpt("");}}>Подготовить анонс</button><button className="foc px-3 py-2" disabled={isMirror||mutation.isPending} onClick={()=>mutation.mutate({method:"PATCH",path:`/admin/news-sources/${i.id}`,body:{state:i.state==="dismissed"?"new":"dismissed"}})}>{i.state==="dismissed"?"Вернуть":"Отложить"}</button></>}
      </div>
    </article>)}
    {edit && <Modal onClose={()=>setEdit(null)} labelledBy="source-import-title" maxWidth={600}><form className="rounded-[18px] bg-[var(--c-bg-raised)] p-6" onSubmit={e=>{e.preventDefault();mutation.mutate({path:`/admin/news-sources/${edit.id}/import`,body:{title,excerpt}});}}>
      <h3 id="source-import-title" className="font-display text-xl">Анонс материала</h3><p className="my-3 text-sm">Напишите короткий обзор своими словами. Ссылка и дата оригинала сохранятся.</p>
      <FormField label="Заголовок" value={title} onChange={setTitle} required/><FormField label="Ваш анонс" value={excerpt} onChange={setExcerpt} textarea/>
      <button disabled={mutation.isPending||title.trim().length<3||title.length>240||excerpt.length>2000} className="foc mt-4 rounded-xl bg-[var(--c-accent)] px-4 py-3 font-semibold text-[var(--c-on-accent)] disabled:opacity-50">Сохранить черновик</button>
      {mutation.isError && <p role="alert">{mutation.error.message}</p>}
    </form></Modal>}
  </section>;
}
