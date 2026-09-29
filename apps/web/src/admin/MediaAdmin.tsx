import { useEffect, useRef, useState } from "react";
import Modal from "../components/Modal.js";
import { previewMedia, useAdminMedia, useMediaMutations, type AdminMedia } from "../lib/admin-media.js";
import { ConfirmDelete } from "./common.js";
import { action, actionGhost, field, Panel, PanelTitle } from "./ui.js";

const sizeLabel=(size:number) => size>=1024*1024 ? `${(size/1024/1024).toFixed(1)} МБ` : `${Math.ceil(size/1024)} КБ`;
export function MediaAdmin() {
  const [page,setPage]=useState(1);
  const [search,setSearch]=useState("");
  const [query,setQuery]=useState("");
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const [deleting,setDeleting]=useState<AdminMedia|null>(null);
  const [preview,setPreview]=useState<{url:string;name:string}|null>(null);
  const [opening,setOpening]=useState<string|null>(null);
  const input=useRef<HTMLInputElement>(null);
  const files=useAdminMedia(page,query);
  const {upload,remove}=useMediaMutations();
  useEffect(() => () => { if(preview) URL.revokeObjectURL(preview.url); },[preview]);
  async function open(file:AdminMedia) {
    setOpening(file.id);setError("");
    try { setPreview({url:await previewMedia(file.id),name:file.filename}); }
    catch(e) { setError(e instanceof Error ? e.message : "Не удалось открыть файл"); }
    finally { setOpening(null); }
  }
  return <Panel>
    <PanelTitle>Медиа</PanelTitle>
    <p className="mb-5 text-sm text-[var(--c-text-2)]">Фотографии и аудио для материалов клуба. Изображения становятся доступны на сайте после публикации материала; аудио открывается через страницу выпуска.</p>
    <form className="flex flex-wrap items-end gap-3" onSubmit={event => {
      event.preventDefault();const file=input.current?.files?.[0];if(!file)return;
      setError("");setMessage("");
      upload.mutate(file,{onSuccess:() => { if(input.current)input.current.value="";setMessage("Файл загружен");setPage(1); },onError:e => setError(e.message)});
    }}>
      <label className="min-w-0 text-sm" style={{flex:"1 1 260px"}}>Файл
        <input ref={input} type="file" required accept="image/jpeg,image/png,image/webp,audio/mpeg,audio/wav,audio/ogg,audio/mp4,.mp3,.wav,.ogg,.m4a" className="foc mt-2 block w-full min-w-0" />
      </label>
      <button type="submit" style={action} disabled={upload.isPending}>{upload.isPending ? "Загрузка…" : "Загрузить"}</button>
    </form>
    <p className="mt-2 text-xs text-[var(--c-text-3)]">JPEG, PNG, WebP – до 10 МБ; MP3, WAV, OGG, M4A – до 128 МБ.</p>
    {message && <p role="status" className="mt-3 text-sm text-[var(--c-ok-text)]">{message}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-[var(--c-danger-text)]">{error}</p>}
    <form className="my-5 flex flex-wrap gap-2" onSubmit={event => {event.preventDefault();setQuery(search.trim());setPage(1);}}>
      <input aria-label="Найти файл" placeholder="Название файла" value={search} onChange={event => setSearch(event.target.value)} style={{...field,flex:1,minWidth:160}} />
      <button style={actionGhost}>Найти</button>
    </form>
    {files.isPending && <p role="status">Загружаем список…</p>}
    {files.isError && <div role="alert"><p>Не удалось загрузить список файлов.</p><button style={actionGhost} onClick={() => void files.refetch()}>Повторить</button></div>}
    {files.data?.items.length === 0 && <p>{query ? "Файлы не найдены." : "Файлов пока нет."}</p>}
    <div>
      {files.data?.items.map(file => <article key={file.id} className="flex flex-wrap items-start gap-3 border-t border-[var(--c-line)] py-4">
        <div className="min-w-0 flex-1" style={{flexBasis:260}}>
          <h3 className="break-words font-semibold">{file.filename}</h3>
          <p className="mt-1 text-xs text-[var(--c-text-3)]">{sizeLabel(file.size)} · {file.type} · {new Date(file.created_at).toLocaleDateString("ru-RU")}</p>
          <label className="mt-3 block text-xs text-[var(--c-text-3)]">{file.type.startsWith("audio/") ? "Для поля «Аудио»" : "Ссылка для материала"}
            <input aria-label={`Ссылка на ${file.filename}`} readOnly value={file.type.startsWith("audio/") ? file.id : `/api/media/${file.id}`} onFocus={event => event.target.select()} style={{...field,display:"block",width:"100%",marginTop:5,fontSize:12}} />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          {file.type.startsWith("image/") && <button style={actionGhost} disabled={opening===file.id} onClick={() => void open(file)}>{opening===file.id ? "Открываем…" : "Просмотр"}</button>}
          <button style={actionGhost} onClick={() => {setError("");setDeleting(file);}}>Удалить</button>
        </div>
      </article>)}
    </div>
    {files.data && files.data.total>files.data.limit && <nav aria-label="Страницы файлов" className="mt-4 flex items-center justify-between gap-3">
      <button style={actionGhost} disabled={page===1} onClick={() => setPage(p => p-1)}>Назад</button>
      <span className="text-sm">{page} / {Math.ceil(files.data.total/files.data.limit)}</span>
      <button style={actionGhost} disabled={page*files.data.limit>=files.data.total} onClick={() => setPage(p => p+1)}>Далее</button>
    </nav>}
    {deleting && <ConfirmDelete title={deleting.filename} hint="Удалить можно только файл, который не используется в материалах или профилях." busy={remove.isPending} onCancel={() => setDeleting(null)} onConfirm={() => remove.mutate(deleting.id,{onSuccess:() => {setDeleting(null);setMessage("Файл удалён");},onError:e => {setDeleting(null);setError(e.message);}})} />}
    {preview && <Modal onClose={() => setPreview(null)} labelledBy="media-preview-title" maxWidth={860}><div className="p-5"><h3 id="media-preview-title" className="mb-4 break-words font-semibold">{preview.name}</h3><img src={preview.url} alt={preview.name} style={{maxWidth:"100%",maxHeight:"65vh",objectFit:"contain"}} /><button style={{...actionGhost,marginTop:16}} onClick={() => setPreview(null)}>Закрыть</button></div></Modal>}
  </Panel>;
}
