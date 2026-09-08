import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { V2Shell, pageTitle } from "../v2/Shell.js";
import { action, actionGhost, field } from "../styles/primitives.js";
import { useHead } from "../lib/title.js";
export type SupportConfig = { enabled: boolean; draft: boolean; consent: string; version: string; retentionDays: number };
export type Ticket = { id: string; topic: string; status: string; expires_at: string; messages: { author: string; text: string; at: string }[] };
export const topics: Record<string,string> = { account: "Вход и кабинет", order: "Программа или заказ", personal_data: "Персональные данные", other: "Другой вопрос" };
export async function supportRequest<T>(path: string, method = "GET", body?: unknown, key?: string): Promise<T> {
  const r = await fetch(`/api${path}`, { method, cache: "no-store", headers: { ...(body ? { "content-type": "application/json" } : {}), ...(key ? { "x-support-key": key } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const value = await r.json(); if (!r.ok) throw new Error(value.error || "Не удалось выполнить запрос"); return value;
}
function credentials() { return `${crypto.randomUUID()}.${Array.from(crypto.getRandomValues(new Uint8Array(32)), n=>n.toString(16).padStart(2,"0")).join("")}`; }
export function SupportConsent() {
  const q = useQuery({ queryKey: ["support-config"], queryFn: ()=>supportRequest<SupportConfig>("/support/config") });
  useHead({ title: "Согласие для обращения в поддержку", noindex: true });
  return <V2Shell><main id="main" className="club-support-page"><h1 style={pageTitle}>Согласие для обращения в поддержку</h1>{q.data && <><p>{q.data.draft ? "Проект для локального тестирования. Не является утверждённым документом оператора." : "Отдельное согласие на обработку данных обращения."}</p><p style={{ whiteSpace: "pre-wrap", lineHeight: 1.8 }}>{q.data.consent}</p></>}{q.isError && <p role="alert">Не удалось загрузить согласие. <button onClick={()=>q.refetch()}>Повторить</button></p>}<Link to="/v2/support">Вернуться к поддержке</Link></main></V2Shell>;
}
export default function SupportV2() {
  useHead({ title: "Поддержка клуба", noindex: true });
  const config = useQuery({ queryKey: ["support-config"], queryFn: ()=>supportRequest<SupportConfig>("/support/config") });
  const [topic, setTopic] = useState("account"), [message, setMessage] = useState(""), [consent, setConsent] = useState(false);
  const [code, setCode] = useState(()=>sessionStorage.getItem("club_support_code") || ""), [draft, setDraft] = useState(credentials);
  const [ticket, setTicket] = useState<Ticket|null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const run = async (fn: ()=>Promise<void>) => { setBusy(true); setError(""); setNotice(""); try { await fn(); } catch(e) { setError((e as Error).message); } finally { setBusy(false); } };
  const load = async (value=code) => { const [id,key] = value.trim().split("."); if (!id || !key) throw new Error("Введите полный код доступа"); setTicket(await supportRequest<Ticket>(`/support/${encodeURIComponent(id)}`,"GET",undefined,key)); setCode(value); sessionStorage.setItem("club_support_code",value); };
  const submit = (e: FormEvent) => { e.preventDefault(); void run(async()=>{const [id,key]=draft.split(".");await supportRequest("/support","POST",{id,key,topic,message,consent,consentVersion:config.data?.version});await load(draft);setDraft(credentials());setMessage("");}); };
  return <V2Shell><main id="main" className="club-support-page">
    <h1 style={pageTitle}>Поддержка клуба</h1><p>Поможем с кабинетом, программами и заказами. Ответ появится здесь, в вашем обращении.</p>
    {config.data?.draft && <p className="club-support-note">Локальная проверка поддержки. Используйте только тестовые сообщения: публикация сервиса ещё не выполнена.</p>}
    <p>Не указывайте паспортные и платёжные данные, сведения о здоровье и данные других людей.</p>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {ticket ? <section aria-label="Ваше обращение">
      <h2>{topics[ticket.topic]}</h2><p>Статус: {({open:"Ожидает ответа",answered:"Есть ответ",closed:"Закрыто"} as Record<string,string>)[ticket.status]}</p>
      <details><summary>Код доступа к обращению</summary><p>Сохраните код у себя. Он открывает переписку. Не передавайте его другим людям.</p><input aria-label="Ваш код доступа" style={field} readOnly value={code} onFocus={e=>e.target.select()}/></details>
      <p>Переписка удалится {new Date(ticket.expires_at).toLocaleDateString("ru-RU",{timeZone:"Europe/Moscow"})}, если новых сообщений не будет.</p>
      <div aria-live="polite">{ticket.messages.map((m,i)=><article key={i} className={`club-support-message ${m.author==="support" ? "from-support" : ""}`}><strong>{m.author==="support" ? "Поддержка" : "Вы"}</strong><p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{m.text}</p></article>)}</div>
      {ticket.status!=="closed" && <form onSubmit={e=>{e.preventDefault();void run(async()=>{await supportRequest(`/support/${ticket.id}/messages`,"POST",{message},code.split(".")[1]);setMessage("");await load();});}}><label>Дополнить обращение<textarea style={field} minLength={5} maxLength={4000} required value={message} onChange={e=>setMessage(e.target.value)}/></label><button style={action} disabled={busy}>Отправить сообщение</button></form>}
      <div className="club-support-actions"><button style={actionGhost} disabled={busy} onClick={()=>void run(()=>load())}>Проверить ответ</button><button style={actionGhost} disabled={busy} onClick={()=>{setTicket(null);setMessage("");}}>К форме поддержки</button></div>
      <details><summary>Отозвать согласие и удалить переписку</summary><p>Вся переписка будет удалена без возможности восстановления.</p><button style={actionGhost} disabled={busy} onClick={()=>void run(async()=>{await supportRequest(`/support/${ticket.id}`,"DELETE",undefined,code.split(".")[1]);sessionStorage.removeItem("club_support_code");setCode("");setTicket(null);setNotice("Обращение и переписка удалены");})}>Удалить обращение</button></details>
    </section> : <>
      <form onSubmit={submit} className="club-support-form">
        <label>Тема<select style={field} value={topic} onChange={e=>setTopic(e.target.value)}>{Object.entries(topics).map(([value,title])=><option key={value} value={value}>{title}</option>)}</select></label>
        <label>Сообщение<textarea style={field} rows={5} required minLength={5} maxLength={4000} value={message} onChange={e=>setMessage(e.target.value)}/></label>
        <label className="club-support-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} required/><span>Даю <Link target="_blank" rel="noopener" to="/v2/support/consent">отдельное согласие на обработку данных обращения</Link> для ответа поддержки.</span></label>
        <button style={action} disabled={busy||!config.data?.enabled||!consent}>{busy ? "Отправляем…" : "Отправить обращение"}</button>
        {config.isError && <p role="alert">Условия не загрузились. <button type="button" onClick={()=>config.refetch()}>Повторить</button></p>}
        {config.data&&!config.data.enabled&&<p>Приём обращений ещё не открыт.</p>}
      </form>
      <details className="club-support-lookup"><summary>Уже есть обращение</summary><form onSubmit={e=>{e.preventDefault();void run(()=>load());}}><label>Код доступа<input style={field} value={code} type="password" required onChange={e=>setCode(e.target.value)} autoComplete="off"/></label><button style={actionGhost} disabled={busy}>Открыть обращение</button></form></details>
    </>}
  </main></V2Shell>;
}
