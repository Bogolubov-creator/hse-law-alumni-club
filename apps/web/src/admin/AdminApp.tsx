import { useId, useState, useEffect, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import Modal from "../components/Modal.js";
import { rub } from "../lib/api.js";
import { computeLevel, ORDER_STATUS_RU, rutubeEmbed } from "@club/shared";
import { useHead } from "../lib/title.js";
import { VisionToggle } from "../components/Vision.js";
import { Mark } from "../v2/Mark.js";
import { mono, disp, label, action, actionGhost, field, Panel, PanelTitle, Pill, Row, Stat, statusTone } from "./ui.js";

const DIRECTUS_URL = (import.meta.env.VITE_DIRECTUS_URL as string) || "http://localhost:8055";
import {
  adminLogin, adminToken, setAdminToken, adminLogout, usePodcastSubs,
  useOverview, useAdminOrders, useMembers, useAdminMutations,
  useAdminPrograms, useAdminProducts, useAdminPage, useAdminNews, useAdminTimeline, useAdminPodcasts, useAdminEvents,
  useAuditLog, downloadOrdersCsv, adminReq,
  type AdminOrder, type Member, type AdminProgram, type AdminProduct, type ProgramInput, type ProductInput,
  type AdminNews, type AdminTimeline, type AdminPodcast, type AuditEntry, type AdminEvent,
} from "../lib/admin.js";

/**
 * Админка офиса на реальных данных (Фаза 4). Подключена к /api/admin/*.
 * Верификация, ручные баллы, персональная скидка, статусы заявок.
 * Контент (новости/программы/товары/блоки) редактируется в Directus Studio.
 */

const ORDER_FLOW = ["new", "in_progress", "confirmed", "done", "canceled"];
const VERIF: Record<string, string> = { pending: "На проверке", verified: "Верифицирован", rejected: "Отклонён" };
const LEVEL_RU: Record<string, string> = { graduate: "Выпускник", friend: "Друг клуба", expert: "Знаток", ambassador: "Амбассадор" };

type Section = "overview" | "orders" | "members" | "subs" | "content" | "audit";

export default function AdminApp() {
  useHead({ title: "Админ-панель", noindex: true }); // офисная зона – не индексируем
  const [token, setToken] = useState<string | null>(() => adminToken());
  if (!token) return <AdminGate onAuthed={(t) => { setAdminToken(t); setToken(t); }} />;
  return <AdminShell onLogout={() => { void adminLogout().finally(() => setToken(null)); }} />;
}

function AdminGate({ onAuthed }: { onAuthed: (t: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const emailId = useId();
  const passId = useId();
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null); setBusy(true);
    try { const r = await adminLogin(email, password); onAuthed(r.token); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <main style={{ minHeight: "100dvh", background: "var(--c-bg)", color: "var(--c-text)", fontFamily: "var(--f-body)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <form onSubmit={submit} style={{ width: "100%", maxWidth: 400, background: "var(--c-bg-raised)", border: "1px solid var(--c-line)", borderRadius: "var(--r-lg)", padding: 32 }}>
        <Mark kind="scales" size={38} style={{ color: "var(--c-accent-text)" }} />
        <h1 style={{ ...disp, fontWeight: 700, fontSize: "var(--t-h3)", margin: "16px 0 0" }}>Панель учебного офиса</h1>
        <p style={{ ...label, textTransform: "none", letterSpacing: 0, margin: "8px 0 0", lineHeight: 1.5 }}>
          Служебный вход. Все действия попадают в журнал безопасности.
        </p>

        <label htmlFor={emailId} style={{ ...label, display: "block", marginTop: 22 }}>почта</label>
        <input id={emailId} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="foc" style={{ ...field, width: "100%", marginTop: 7, padding: "12px 14px", fontSize: 15 }} />

        <label htmlFor={passId} style={{ ...label, display: "block", marginTop: 16 }}>пароль</label>
        <input id={passId} type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="foc" style={{ ...field, width: "100%", marginTop: 7, padding: "12px 14px", fontSize: 15 }} />

        {err && <p role="alert" style={{ ...mono, margin: "14px 0 0", fontSize: "var(--t-caption)", color: "var(--c-danger-text)" }}>{err}</p>}

        <button disabled={busy} className="foc" style={{ width: "100%", marginTop: 22, padding: "14px 20px", borderRadius: "var(--r-md)", border: "none", background: "var(--c-accent)", color: "var(--c-on-accent)", fontWeight: 600, fontSize: 15, cursor: busy ? "wait" : "pointer" }}>
          {busy ? "Входим…" : "Войти"}
        </button>
      </form>
    </main>
  );
}

function AdminShell({ onLogout }: { onLogout: () => void }) {
  const [section, setSection] = useState<Section>("overview");
  const ov = useOverview();
  const nav: { key: Section; label: string; badge?: number }[] = [
    { key: "overview", label: "Обзор" },
    { key: "orders", label: "Заявки", badge: ov.data?.new_orders },
    { key: "members", label: "Выпускники", badge: ov.data?.pending_verifications },
    { key: "subs", label: "Подписки" },
    { key: "content", label: "Контент" },
    { key: "audit", label: "Журнал" },
  ];
  const titles: Record<Section, string> = { overview: "Обзор", orders: "Заявки и заказы", members: "Выпускники", subs: "Подписки на подкасты", content: "Контент", audit: "Журнал безопасности" };

  // На вход выкидываем ТОЛЬКО при 401 (истёкшая сессия). Прочие ошибки (5xx/сеть)
  // не должны маскироваться под разлогин – показываем ретрай в основной области.
  if (ov.isError && (ov.error as { status?: number })?.status === 401)
    return <AdminGate onAuthed={(t) => { setAdminToken(t); location.reload(); }} />;

  return (
    <div className="adm-grid" style={{ display: "grid", gridTemplateColumns: "232px 1fr", minHeight: "100dvh", background: "var(--c-bg)", color: "var(--c-text)", fontFamily: "var(--f-body)" }}>
      <aside className="adm-aside" style={{ position: "sticky", top: 0, height: "100dvh", display: "flex", flexDirection: "column", gap: 2, padding: 16, borderRight: "1px solid var(--c-line)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 6px 18px" }}>
          <Mark kind="scales" size={26} style={{ color: "var(--c-accent-text)" }} />
          <span style={{ ...disp, fontWeight: 800, fontSize: 13, lineHeight: 1.1 }}>
            Учебный офис
            <span style={{ ...label, display: "block", fontSize: 9, marginTop: 3 }}>клуб выпускников</span>
          </span>
        </div>
        {nav.map((n) => {
          const on = section === n.key;
          return (
            <button key={n.key} onClick={() => setSection(n.key)} aria-current={on ? "page" : undefined} className="foc"
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                padding: "10px 12px", borderRadius: "var(--r-sm)", textAlign: "left", cursor: "pointer",
                border: "none", background: on ? "var(--c-bg-sunken)" : "transparent",
                color: on ? "var(--c-text)" : "var(--c-text-3)",
                ...mono, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)", textTransform: "uppercase",
                borderLeft: `2px solid ${on ? "var(--c-accent)" : "transparent"}`,
              }}>
              {n.label}
              {n.badge ? <span style={{ ...mono, background: "var(--c-accent)", color: "var(--c-on-accent)", borderRadius: 999, padding: "1px 7px", fontSize: 10 }}>{n.badge}</span> : null}
            </button>
          );
        })}
        <div style={{ marginTop: 14, paddingLeft: 2 }}><VisionToggle compact v2 /></div>
        <button onClick={onLogout} className="foc" style={{ ...actionGhost, marginTop: "auto", textAlign: "left" }}>Выйти</button>
      </aside>

      {/* Низ панели не должен уезжать под cookie-баннер */}
      <main style={{ minWidth: 0, padding: "26px 32px 64px", paddingBottom: "calc(64px + var(--cookie-h, 0px))" }}>
        <h1 style={{ ...disp, fontWeight: 800, fontSize: "var(--t-h2)", margin: "0 0 22px" }}>{titles[section]}</h1>
        {ov.isError && (
          <p role="alert" style={{ margin: "0 0 20px", padding: "12px 16px", borderRadius: "var(--r-md)", border: "1px solid var(--c-danger-text)", ...mono, fontSize: "var(--t-caption)", color: "var(--c-danger-text)" }}>
            Не удалось загрузить данные (ошибка сети или сервера).{" "}
            <button onClick={() => ov.refetch()} className="foc" style={{ ...mono, background: "none", border: "none", color: "inherit", textDecoration: "underline", cursor: "pointer", font: "inherit" }}>Повторить</button>
          </p>
        )}
        {section === "overview" && <Overview onGo={setSection} />}
        {section === "orders" && <Orders />}
        {section === "members" && <Members />}
        {section === "subs" && <PodcastSubs />}
        {section === "content" && <Content />}
        {section === "audit" && <AuditLog />}
      </main>
    </div>
  );
}

/** Оставлен как псевдоним Panel: он ещё используется в разделах контента.*/
function Card({ children }: { children: React.ReactNode }) {
  return <Panel>{children}</Panel>;
}

function Overview({ onGo }: { onGo: (s: Section) => void }) {
  const ov = useOverview();
  const orders = useAdminOrders({ limit: 5 }); // дашборду хватает пяти строк
  const members = useMembers({ status: "pending", limit: 100 });
  const { patchMember } = useAdminMutations();
  const pending = members.data?.items ?? [];
  const d = ov.data;
  // Вся статистика сайта – одним экраном.
  /**
   * Акцентом помечены только те два числа, по которым офис действует прямо
   * сейчас. Раньше каждый показатель был своего цвета – десять акцентов
   * означают, что акцента нет ни одного.
   */
  const stats = [
    { label: "Новые заявки", value: d?.new_orders ?? 0, act: true },
    { label: "На верификацию", value: d?.pending_verifications ?? 0, act: true },
    { label: "Выпускников", value: d?.alumni_count ?? 0, note: `подтверждено ${d?.alumni_verified ?? 0}` },
    { label: "Заявок всего", value: d?.orders_count ?? 0, note: `оплачено ${d?.orders_paid ?? 0}` },
    { label: "Программ ДПО", value: d?.programs_total ?? 0, note: `актуальный набор ${d?.programs_actual ?? 0}` },
    { label: "Товаров мерча", value: d?.products_count ?? 0 },
    { label: "Новостей", value: d?.news_count ?? 0 },
    { label: "Дружеских связей", value: d?.friendships ?? 0, note: `заявок в друзья ${d?.friend_requests ?? 0}` },
    { label: "Подкастов", value: d?.podcasts_count ?? 0, note: `подписчиков ${d?.podcast_subscribers ?? 0}` },
    { label: "Баллов у выпускников", value: d?.points_total ?? 0 },
  ] as { label: string; value: number; note?: string; act?: boolean }[];
  return (
    <>
      <div className="adm-stats" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: "0 28px" }}>
        {stats.map((s) => <Stat key={s.label} name={s.label} value={s.value} note={s.note} accent={s.act} />)}
      </div>
      <div className="adm-two" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20, marginTop: 26 }}>
        <Panel>
          <PanelTitle right={<button onClick={() => onGo("orders")} className="foc" style={{ ...label, color: "var(--c-accent-text)", background: "none", border: "none", cursor: "pointer" }}>все →</button>}>
            Последние заявки
          </PanelTitle>
          {(orders.data?.items ?? []).slice(0, 5).map((o) => (
            <Row key={o.id} cols="104px 1fr auto">
              <span style={{ ...label, fontSize: 10 }}>{o.number}</span>
              <span style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.contact_fio}</span>
              <Pill status={o.status}>{ORDER_STATUS_RU[o.status]}</Pill>
            </Row>
          ))}
          {orders.data?.items.length === 0 && <p style={{ ...label, margin: "12px 0 0", textTransform: "none", letterSpacing: 0 }}>Заявок пока нет.</p>}
        </Panel>

        <Panel>
          <PanelTitle>На верификацию</PanelTitle>
          {pending.length === 0 && <p style={{ ...label, margin: 0, textTransform: "none", letterSpacing: 0 }}>Нет ожидающих.</p>}
          {pending.map((m) => (
            <div key={m.id} style={{ padding: "12px 0", borderTop: "1px solid var(--c-line)" }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{m.fio}</div>
              <div style={{ ...label, fontSize: 10, marginTop: 3 }}>выпуск {m.cohort}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button disabled={patchMember.isPending} onClick={() => patchMember.mutate({ id: m.id, verification_status: "verified" })} className="foc" style={{ ...action, flex: 1, textAlign: "center" }}>Подтвердить</button>
                <button disabled={patchMember.isPending} onClick={() => patchMember.mutate({ id: m.id, verification_status: "rejected" })} className="foc" style={{ ...actionGhost, flex: 1, textAlign: "center", color: "var(--c-danger-text)", borderColor: "var(--c-danger-text)" }}>Отклонить</button>
              </div>
            </div>
          ))}
        </Panel>
      </div>
      <div className="adm-two" style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 20, marginTop: 20 }}>
        <Panel>
          <PanelTitle right={<button onClick={() => onGo("content")} className="foc" style={{ ...label, color: "var(--c-accent-text)", background: "none", border: "none", cursor: "pointer" }}>события →</button>}>
            Ближайшее событие
          </PanelTitle>
          {d?.next_event ? (
            <div style={{ paddingTop: 12, borderTop: "1px solid var(--c-line)" }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{d.next_event.title}</div>
              <div style={{ ...label, fontSize: 10, marginTop: 5 }}>
                {new Date(d.next_event.starts_at).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
              </div>
              <div style={{ ...mono, fontSize: 13, marginTop: 10 }}>записались: {d.next_event.rsvps}</div>
            </div>
          ) : (
            <p style={{ ...label, margin: 0, textTransform: "none", letterSpacing: 0, lineHeight: 1.5 }}>Анонсов нет – создайте событие во вкладке «Контент → События».</p>
          )}
        </Panel>
        <PushBroadcast subs={d?.push_subs_count ?? 0} />
      </div>
    </>
  );
}

/** Ручная пуш-рассылка: анонс на все подписанные устройства (журналируется). */
function PushBroadcast({ subs }: { subs: number }) {
  const [f, setF] = useState({ title: "", body: "", url: "/events" });
  const [sent, setSent] = useState<string | null>(null);
  const send = useMutation({
    mutationFn: () => adminReq<{ ok: boolean; subscribers: number }>("POST", "/admin/push/broadcast", f),
    onSuccess: (r) => { setSent(`Отправлено на ${r.subscribers} устройств ✓`); setF({ title: "", body: "", url: "/events" }); },
    onError: (e) => setSent((e as Error).message),
  });
  const valid = f.title.trim().length >= 3 && f.body.trim().length >= 3 && /^\/[a-z0-9\-\/]*$/i.test(f.url);
  const blocked = !valid || send.isPending || subs === 0;
  return (
    <Panel>
      <PanelTitle>Пуш-рассылка</PanelTitle>
      <p style={{ ...label, margin: "0 0 12px", textTransform: "none", letterSpacing: 0, lineHeight: 1.5 }}>
        Уйдёт на {subs} подписанных устройств. Действие попадает в журнал безопасности.
      </p>
      <div className="adm-push" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 170px", gap: 10, paddingTop: 12, borderTop: "1px solid var(--c-line)" }}>
        <input aria-label="Заголовок пуш-уведомления" value={f.title} onChange={(e) => setF((s) => ({ ...s, title: e.target.value }))} placeholder="Заголовок (например: Новое событие)" className="foc" style={field} />
        <input aria-label="Текст пуш-уведомления" value={f.body} onChange={(e) => setF((s) => ({ ...s, body: e.target.value }))} placeholder="Текст уведомления" className="foc" style={field} />
        <input aria-label="Ссылка, куда ведёт уведомление" value={f.url} onChange={(e) => setF((s) => ({ ...s, url: e.target.value }))} placeholder="/events" title="Ссылка ведёт на десктопную версию страницы" className="foc" style={{ ...field, ...mono }} />
      </div>
      <p style={{ ...label, margin: "8px 0 0", textTransform: "none", letterSpacing: 0, lineHeight: 1.5 }}>
        Ссылка ведёт на десктопную версию страницы – на телефоне она откроется без мобильной оболочки.
      </p>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12, marginTop: 14 }}>
        {/* Заблокированная кнопка называет причину, а не молчит бледной охрой */}
        <button disabled={blocked} onClick={() => send.mutate()} className="foc"
          style={blocked
            ? { ...actionGhost, cursor: send.isPending ? "wait" : "not-allowed", color: "var(--c-text-3)" }
            : action}>
          {send.isPending ? "Отправляем…" : subs === 0 ? "Подписчиков пока нет" : !valid ? "Заполните заголовок и текст" : "Отправить всем"}
        </button>
        {sent && <span role="status" style={{ ...mono, fontSize: "var(--t-caption)", color: "var(--c-ok-text)" }}>{sent}</span>}
      </div>
    </Panel>
  );
}

const ORDERS_PER_PAGE = 50;

function Orders() {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  // Поиск и фильтр считает сервер: в панели больше нет «последних 100»,
  // видно все заявки постранично.
  const orders = useAdminOrders({ q: q.trim() || undefined, status: statusFilter || undefined, page, limit: ORDERS_PER_PAGE });
  const { setOrderStatus } = useAdminMutations();
  const [csvBusy, setCsvBusy] = useState(false);
  const list = orders.data?.items ?? [];
  const total = orders.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / ORDERS_PER_PAGE));
  // Смена запроса/фильтра всегда возвращает на первую страницу – иначе пустой
  // экран «страница 7» при выборке из трёх заявок.
  const resetTo = (fn: () => void) => { fn(); setPage(1); };
  const exportCsv = async () => {
    setCsvBusy(true);
    try { await downloadOrdersCsv(); } catch { alert("Не удалось выгрузить CSV"); } finally { setCsvBusy(false); }
  };
  return (
    <>
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 16 }}>
      <input aria-label="Поиск по заявкам" value={q} onChange={(e) => resetTo(() => setQ(e.target.value))}
        placeholder="Номер, ФИО, телефон, почта…" className="foc" style={{ ...field, width: 280, maxWidth: "100%" }} />
      <select value={statusFilter} onChange={(e) => resetTo(() => setStatusFilter(e.target.value))} aria-label="Фильтр по статусу" className="foc" style={field}>
        <option value="">Все статусы</option>
        {ORDER_FLOW.map((s) => <option key={s} value={s}>{ORDER_STATUS_RU[s]}</option>)}
      </select>
      <span style={label}>всего: {total}</span>
      <button onClick={exportCsv} disabled={csvBusy} className="foc" style={{ ...actionGhost, marginLeft: "auto", cursor: csvBusy ? "wait" : "pointer" }}>
        {csvBusy ? "Готовим…" : "Выгрузить CSV"}
      </button>
    </div>

    <div>
      {/* Шапка описи: те же колонки, что и у записей ниже */}
      <div className="adm-order-head" style={{ display: "grid", gridTemplateColumns: "108px 1fr 1fr 172px 152px", gap: 14, padding: "0 0 10px" }}>
        <span style={label}>номер</span><span style={label}>клиент</span><span style={label}>контакты</span><span style={label}>сумма</span><span style={label}>статус</span>
      </div>

      {list.map((o: AdminOrder) => (
        <div key={o.id} style={{ padding: "12px 0", borderTop: "1px solid var(--c-line)" }}>
          <div className="adm-order" style={{ display: "grid", gridTemplateColumns: "108px 1fr 1fr 172px 152px", gap: 14, alignItems: "center" }}>
            <span style={{ ...label, fontSize: 10 }}>{o.number}</span>
            <span style={{ fontSize: 14, fontWeight: 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.contact_fio}</span>
            <span style={{ ...mono, fontSize: 12, color: "var(--c-text-3)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.contact_phone}</span>
            <span style={{ ...mono, fontSize: 13, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
              {rub(o.total_estimate)}
              {/* Вебхук ЮKassa пометил заявку: пришла не та сумма. Молча оставлять нельзя. */}
              {o.payment_status === "review" && (
                <span title="Оплата пришла на другую сумму – проверьте вручную"
                  style={{ ...mono, fontSize: 10, letterSpacing: "var(--tr-data)", color: "var(--c-danger-text)", border: "1px solid var(--c-danger-text)", borderRadius: 999, padding: "2px 7px", whiteSpace: "nowrap" }}>сумма ≠</span>
              )}
              {o.payment_status === "succeeded" && (
                <span style={{ ...label, fontSize: 10, color: "var(--c-ok-text)", whiteSpace: "nowrap" }}>оплачено</span>
              )}
            </span>
            <select aria-label={`Статус заявки ${o.number}`} value={o.status}
              onChange={(e) => setOrderStatus.mutate({ id: o.id, status: e.target.value })} className="foc"
              style={{ ...mono, fontSize: 11, letterSpacing: "var(--tr-data)", padding: "6px 10px", borderRadius: 999,
                border: `1px solid ${statusTone(o.status).border}`, color: statusTone(o.status).color,
                background: "transparent", cursor: "pointer" }}>
              {ORDER_FLOW.map((s) => <option key={s} value={s}>{ORDER_STATUS_RU[s]}</option>)}
            </select>
          </div>
          {/* Состав заявки – офис видит позиции без похода в Directus */}
          {(o.items_json?.length || o.address || o.comment) && (
            <div className="adm-order-items" style={{ ...mono, fontSize: 11, lineHeight: 1.6, color: "var(--c-text-3)", marginTop: 6, paddingLeft: 122 }}>
              {o.items_json?.map((i) => `${i.title}${i.variant_sku ? ` (${i.variant_sku})` : ""} ×${i.qty}`).join("; ")}
              {o.address ? ` · доставка: ${o.address}` : ""}
              {o.comment ? ` · «${o.comment}»` : ""}
            </div>
          )}
        </div>
      ))}
      {list.length > 0 && <div style={{ borderTop: "1px solid var(--c-line)" }} />}
      {!orders.isLoading && list.length === 0 && (
        <p style={{ ...label, textTransform: "none", letterSpacing: 0, textAlign: "center", padding: "40px 0", borderTop: "1px solid var(--c-line)" }}>
          {q || statusFilter ? "По запросу ничего не найдено." : "Заявок нет."}
        </p>
      )}
    </div>

    {pages > 1 && (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginTop: 20 }}>
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="foc" style={{ ...actionGhost, opacity: page <= 1 ? 0.4 : 1 }}>← назад</button>
        <span style={label}>стр. {page} из {pages}</span>
        <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages} className="foc" style={{ ...actionGhost, opacity: page >= pages ? 0.4 : 1 }}>вперёд →</button>
      </div>
    )}
    </>
  );
}

function Members() {
  const [sel, setSel] = useState<Member | null>(null);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [vf, setVf] = useState<string>("all");
  const [page, setPage] = useState(1);
  const pendingCount = useOverview().data?.pending_verifications ?? 0;

  // Серверный поиск с дебаунсом (не запрос на каждую клавишу).
  useEffect(() => {
    const t = setTimeout(() => { setQ(qInput.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const membersQ = useMembers({ q: q || undefined, status: vf === "all" ? undefined : vf, page, limit: 50 });
  const data = membersQ.data;
  const list = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.page_size ?? 50;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const setFilter = (key: string) => { setVf(key); setPage(1); };

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 16 }}>
        {[
          { key: "all", label: "все" },
          { key: "pending", label: `заявки на вступление${pendingCount ? ` · ${pendingCount}` : ""}` },
          { key: "verified", label: "подтверждённые" },
          { key: "rejected", label: "отклонённые" },
        ].map((f) => {
          const on = vf === f.key;
          // Очередь на верификацию помечена акцентом, только когда в ней кто-то есть
          const urgent = f.key === "pending" && pendingCount > 0 && !on;
          return (
            <button key={f.key} onClick={() => setFilter(f.key)} aria-pressed={on} className="foc"
              style={{
                ...mono, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)", textTransform: "uppercase",
                padding: "7px 12px", borderRadius: 999, cursor: "pointer",
                border: `1px solid ${on ? "var(--c-accent)" : urgent ? "var(--c-accent-text)" : "var(--c-line)"}`,
                background: on ? "var(--c-accent)" : "transparent",
                color: on ? "var(--c-on-accent)" : urgent ? "var(--c-accent-text)" : "var(--c-text-2)",
              }}>{f.label}</button>
          );
        })}
        <input aria-label="Поиск по выпускникам" value={qInput} onChange={(e) => setQInput(e.target.value)}
          placeholder="ФИО, год, программа…" className="foc" style={{ ...field, marginLeft: "auto", width: 260, maxWidth: "100%" }} />
        <span style={label}>всего: {total}</span>
      </div>

      <div>
        <div className="adm-member-head" style={{ display: "grid", gridTemplateColumns: "1fr 78px 132px 74px 78px 74px 96px", gap: 12, padding: "0 0 10px" }}>
          <span style={label}>выпускник</span><span style={label}>выпуск</span><span style={label}>статус</span>
          <span style={label}>баллы</span><span style={label}>скидка</span><span style={label}>друзья</span><span style={label}>подкасты</span>
        </div>
        {list.map((m) => (
          <button key={m.id} onClick={() => setSel(m)} className="foc adm-member"
            style={{ display: "grid", width: "100%", gridTemplateColumns: "1fr 78px 132px 74px 78px 74px 96px", gap: 12, alignItems: "center",
              textAlign: "left", padding: "12px 0", borderTop: "1px solid var(--c-line)", border: "none", borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: "var(--c-line)", background: "transparent", color: "inherit", cursor: "pointer", font: "inherit" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.fio}</span>
              {m.duplicate && (
                <span title="Возможный дубль: тот же ФИО и год выпуска"
                  style={{ ...mono, flexShrink: 0, fontSize: 10, letterSpacing: "var(--tr-data)", color: "var(--c-status)", border: "1px solid var(--c-status)", borderRadius: 999, padding: "2px 7px" }}>дубль?</span>
              )}
            </span>
            <span style={{ ...mono, fontSize: 12, color: "var(--c-text-3)" }}>{m.cohort}</span>
            <span><Pill status={m.verification_status}>{VERIF[m.verification_status]}</Pill></span>
            <span style={{ ...mono, fontSize: 13 }}>{m.points_cached}</span>
            <span style={{ ...mono, fontSize: 13 }}>{m.verification_status === "verified" ? `−${computeLevel(m.points_cached ?? 0).discount_percent + (m.personal_discount ?? 0)}%` : "–"}</span>
            <span style={{ ...mono, fontSize: 13 }}>{m.friends_count ?? 0}</span>
            <span style={{ ...mono, fontSize: 11, color: m.podcast_active ? "var(--c-ok-text)" : "var(--c-text-3)" }}>{m.podcast_active ? "подписка" : "–"}</span>
          </button>
        ))}
        {list.length > 0 && <div style={{ borderTop: "1px solid var(--c-line)" }} />}
        {!membersQ.isLoading && list.length === 0 && (
          <p style={{ ...label, textTransform: "none", letterSpacing: 0, textAlign: "center", padding: "40px 0", borderTop: "1px solid var(--c-line)" }}>
            {q ? "По запросу ничего не найдено." : "Выпускников нет."}
          </p>
        )}
      </div>

      {pages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginTop: 20 }}>
          <span style={label}>показаны {from}–{to} из {total}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="foc" style={{ ...actionGhost, opacity: page <= 1 ? 0.4 : 1 }}>← назад</button>
            <span style={label}>{page} / {pages}</span>
            <button disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))} className="foc" style={{ ...actionGhost, opacity: page >= pages ? 0.4 : 1 }}>вперёд →</button>
          </div>
        </div>
      )}
      {sel && <MemberModal member={sel} onClose={() => setSel(null)} />}
    </>
  );
}

/**
 * Карточка выпускника: верификация, ручные баллы, персональная скидка,
 * подписка на подкасты и исполнение запроса по 152-ФЗ.
 *
 * Оформление переписано вручную, а не общей заменой цветов: здесь опасные
 * действия, и «зелёная кнопка с белым текстом» тут не годится – зелёный в
 * тёмной теме светлый, белое на нём не читается. Все действия – один акцент,
 * опасное – контурное карминовое.
 */
function MemberModal({ member, onClose }: { member: Member; onClose: () => void }) {
  const { patchMember, addPoints, grantPodcastSub, anonymizeMember } = useAdminMutations();
  const [discount, setDiscount] = useState(String(member.personal_discount));
  const [delta, setDelta] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);

  const sectionLabel: React.CSSProperties = { ...label, display: "block", marginTop: 20 };
  const rowBtn: React.CSSProperties = { ...action, padding: "11px 18px" };

  return (
    <Modal onClose={onClose} labelledBy="member-modal-title" maxWidth={460}>
      <div style={{ position: "relative", background: "var(--c-bg-raised)", color: "var(--c-text)", border: "1px solid var(--c-line)", borderRadius: "var(--r-lg)", padding: 26 }}>
        <button onClick={onClose} aria-label="Закрыть" className="foc"
          style={{ position: "absolute", right: 16, top: 16, width: 34, height: 34, borderRadius: "var(--r-sm)", border: "1px solid var(--c-line)", background: "transparent", color: "var(--c-text-3)", cursor: "pointer" }}>✕</button>

        <h2 id="member-modal-title" style={{ ...disp, fontWeight: 700, fontSize: "var(--t-h3)", margin: 0, paddingRight: 40 }}>{member.fio}</h2>
        <div style={{ ...label, fontSize: 10, marginTop: 8 }}>
          выпуск {member.cohort} · {LEVEL_RU[member.level_cached] ?? member.level_cached} · {member.points_cached} баллов · в друзьях {member.friends_count ?? 0}
        </div>

        {/* Анкета из формы вступления – всё, что заполнил выпускник */}
        <div style={{ marginTop: 16 }}>
          {member.email && <Fact name="почта" value={member.email} />}
          {(member.edu_level || member.edu_program) && (
            <Fact name="образование" value={[member.edu_level, member.edu_program && `ОП «${member.edu_program}»`].filter(Boolean).join(" · ")} />
          )}
          {member.contacts_json && Object.entries(member.contacts_json).filter(([, v]) => v).map(([k, v]) => <Fact key={k} name={k} value={v} />)}
          {!!member.interests_json?.length && <Fact name="интересы" value={member.interests_json.join(", ")} />}
          {member.joined_at && <Fact name="заявка подана" value={new Date(member.joined_at).toLocaleDateString("ru-RU")} />}
          <div style={{ borderTop: "1px solid var(--c-line)" }} />
        </div>

        <div style={sectionLabel}>верификация</div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button disabled={patchMember.isPending} onClick={() => patchMember.mutate({ id: member.id, verification_status: "verified" })} className="foc" style={{ ...rowBtn, flex: 1 }}>Подтвердить</button>
          <button disabled={patchMember.isPending} onClick={() => patchMember.mutate({ id: member.id, verification_status: "rejected" })} className="foc"
            style={{ ...actionGhost, flex: 1, padding: "11px 18px", color: "var(--c-danger-text)", borderColor: "var(--c-danger-text)" }}>Отклонить</button>
        </div>

        <div style={sectionLabel}>ручные баллы</div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input aria-label="Сколько баллов начислить или списать" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="напр. 60 или −30" className="foc" style={{ ...field, flex: 1 }} />
          <button disabled={addPoints.isPending} className="foc" style={rowBtn}
            onClick={() => { const d = parseInt(delta, 10); if (!isNaN(d)) { addPoints.mutate({ id: member.id, delta: d }); setDelta(""); } }}>Начислить</button>
        </div>

        <div style={sectionLabel}>персональная скидка · 0–10%</div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input aria-label="Персональная скидка, %" value={discount} onChange={(e) => setDiscount(e.target.value)} type="number" min={0} max={10} className="foc" style={{ ...field, flex: 1 }} />
          <button disabled={patchMember.isPending} className="foc" style={rowBtn}
            onClick={() => patchMember.mutate({ id: member.id, personal_discount: Math.max(0, Math.min(10, parseInt(discount, 10) || 0)) })}>Сохранить</button>
        </div>

        <div style={sectionLabel}>подкасты · подписка {member.podcast_active ? "активна" : "нет"}</div>
        <button disabled={grantPodcastSub.isPending} onClick={() => grantPodcastSub.mutate(member.id)} className="foc"
          style={{ ...actionGhost, width: "100%", marginTop: 8, padding: "11px 18px", textAlign: "center" }}>
          {grantPodcastSub.isPending ? "Продлеваем…" : "Продлить подписку на год (оплата по счёту)"}
        </button>

        {/* 152-ФЗ: исполнение запроса на удаление ПДн без разработчика */}
        <div style={{ marginTop: 24, border: "1px solid var(--c-danger-text)", borderRadius: "var(--r-md)", padding: 14 }}>
          <div style={{ ...label, color: "var(--c-danger-text)" }}>удаление данных · 152-ФЗ</div>
          {anonymizeMember.isSuccess ? (
            <p style={{ ...mono, fontSize: "var(--t-caption)", color: "var(--c-ok-text)", margin: "10px 0 0" }}>Данные участника обезличены</p>
          ) : !confirmDel ? (
            <button onClick={() => setConfirmDel(true)} className="foc"
              style={{ ...actionGhost, width: "100%", marginTop: 10, padding: "11px 18px", textAlign: "center", color: "var(--c-danger-text)", borderColor: "var(--c-danger-text)" }}>
              Обезличить и закрыть доступ
            </button>
          ) : (
            <div style={{ marginTop: 10 }}>
              <p style={{ ...mono, fontSize: 11, lineHeight: 1.6, color: "var(--c-text-3)", margin: 0 }}>
                Профиль, контакты, фото и заявки будут обезличены, аккаунт входа удалён. Необратимо.
              </p>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button disabled={anonymizeMember.isPending} onClick={() => anonymizeMember.mutate(member.id)} className="foc"
                  style={{ ...action, flex: 1, padding: "11px 18px", background: "var(--c-danger)", color: "#fff" }}>
                  {anonymizeMember.isPending ? "Удаляем…" : "Подтвердить удаление"}
                </button>
                <button onClick={() => setConfirmDel(false)} className="foc" style={{ ...actionGhost, flex: 1, padding: "11px 18px", textAlign: "center" }}>Отмена</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** Поле анкеты: подпись слева, значение справа, разделитель – линия. */
function Fact({ name, value }: { name: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 14, padding: "9px 0", borderTop: "1px solid var(--c-line)" }}>
      <span style={{ ...label, flexShrink: 0 }}>{name}</span>
      <span style={{ ...mono, fontSize: 12, textAlign: "right", overflowWrap: "anywhere" }}>{value}</span>
    </div>
  );
}

/**
 * Подписки на подкасты и статистика прослушиваний.
 *
 * Прослушивания считает сервер при выдаче аудио, поэтому цифры отражают
 * реальные обращения к файлу. Видеовыпуски RuTube сюда не попадают: запись
 * отдаёт чужой плеер, и обращений к ней мы не видим.
 */
function PodcastSubs() {
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

const AUDIT_RU: Record<string, { label: string; icon: string; group: string }> = {
  "login.ok": { label: "Вход выпускника", icon: "🔓", group: "Входы" },
  "login.fail": { label: "Неудачный вход", icon: "⚠️", group: "Входы" },
  "login.locked": { label: "Вход заблокирован (перебор)", icon: "⛔", group: "Входы" },
  "admin.login.ok": { label: "Вход администратора", icon: "🔐", group: "Входы" },
  "admin.login.fail": { label: "Неудачный вход админа", icon: "⚠️", group: "Входы" },
  "admin.login.locked": { label: "Вход админа заблокирован", icon: "⛔", group: "Входы" },
  "register": { label: "Заявка на вступление", icon: "🎓", group: "Входы" },
  "password.forgot": { label: "Запрос восстановления пароля", icon: "🔁", group: "Входы" },
  "password.reset": { label: "Пароль изменён", icon: "🔑", group: "Входы" },
  "payment.succeeded": { label: "Оплата прошла", icon: "💳", group: "Платежи" },
  "payment.canceled": { label: "Оплата отменена", icon: "↩️", group: "Платежи" },
  "payment.webhook.badip": { label: "Webhook с чужого IP (отклонён)", icon: "🛡️", group: "Платежи" },
  "order.created": { label: "Создана заявка", icon: "🧾", group: "Заявки" },
  "order.status": { label: "Смена статуса заявки", icon: "📋", group: "Заявки" },
  "orders.export": { label: "Выгрузка заявок в CSV", icon: "📤", group: "Заявки" },
  "member.patch": { label: "Изменение выпускника", icon: "👤", group: "Изменения" },
  "podcast.sub.grant": { label: "Выдана подписка на подкасты", icon: "🎧", group: "Платежи" },
  "podcast.sub.request": { label: "Запрошена подписка", icon: "🎧", group: "Платежи" },
  "avatar.upload": { label: "Загружено фото профиля", icon: "🖼️", group: "Изменения" },
  "avatar.reject": { label: "Отклонён файл аватара (не изображение)", icon: "🚫", group: "Изменения" },
  "admin.logout": { label: "Выход администратора", icon: "🔒", group: "Входы" },
  // Контент витрин: раньше правки цен и публикаций не логировались вовсе.
  "program.create": { label: "Добавлена программа ДПО", icon: "🎓", group: "Изменения" },
  "program.patch": { label: "Изменена программа ДПО", icon: "🎓", group: "Изменения" },
  "program.delete": { label: "Удалена программа ДПО", icon: "🗑️", group: "Изменения" },
  "product.create": { label: "Добавлен товар", icon: "🧢", group: "Изменения" },
  "product.patch": { label: "Изменён товар (цена/остаток)", icon: "🧢", group: "Изменения" },
  "product.delete": { label: "Удалён товар", icon: "🗑️", group: "Изменения" },
  "news.create": { label: "Опубликована новость", icon: "📰", group: "Изменения" },
  "news.patch": { label: "Изменена новость", icon: "📰", group: "Изменения" },
  "news.delete": { label: "Удалена новость", icon: "🗑️", group: "Изменения" },
  "timeline.create": { label: "Добавлен пункт истории", icon: "📜", group: "Изменения" },
  "timeline.patch": { label: "Изменён пункт истории", icon: "📜", group: "Изменения" },
  "timeline.delete": { label: "Удалён пункт истории", icon: "🗑️", group: "Изменения" },
  "podcast.create": { label: "Добавлен подкаст", icon: "🎙️", group: "Изменения" },
  "podcast.patch": { label: "Изменён подкаст", icon: "🎙️", group: "Изменения" },
  "podcast.delete": { label: "Удалён подкаст", icon: "🗑️", group: "Изменения" },
  "page.patch": { label: "Изменено наполнение страницы", icon: "📝", group: "Изменения" },
  "catalog.dpo_sync": { label: "Синхронизация каталога ДПО", icon: "🔄", group: "Изменения" },
  "member.points": { label: "Ручное начисление баллов", icon: "⭐", group: "Изменения" },
  "friend.decline": { label: "Отклонена заявка в друзья", icon: "🙅", group: "Изменения" },
  "friend.remove": { label: "Удаление из друзей", icon: "🙅", group: "Изменения" },
  "payment.amount_mismatch": { label: "Оплата на другую сумму – проверить", icon: "🚨", group: "Платежи" },
  "password.reset.replay": { label: "Повторное использование ссылки сброса", icon: "⛔", group: "Входы" },
  "event.patch": { label: "Изменено событие", icon: "📅", group: "Изменения" },
  "event.delete": { label: "Удалено событие", icon: "🗑️", group: "Изменения" },
  "points.service": { label: "Служебное начисление баллов", icon: "⭐", group: "Изменения" },
  "push.sub.reassign": { label: "Пуш-подписка переназначена (общее устройство)", icon: "📱", group: "Изменения" },
};
const AUDIT_GROUPS = ["Все", "Входы", "Платежи", "Заявки", "Изменения"];

function AuditLog() {
  const log = useAuditLog();
  const [group, setGroup] = useState("Все");
  const [q, setQ] = useState("");
  const rows = (log.data ?? []).filter((r) => {
    const meta = AUDIT_RU[r.event];
    if (group !== "Все" && (meta?.group ?? "Изменения") !== group) return false;
    if (!q.trim()) return true;
    const hay = `${r.event} ${meta?.label ?? ""} ${r.actor ?? ""} ${r.subject ?? ""} ${r.ip ?? ""}`.toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  });
  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "–";

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {AUDIT_GROUPS.map((g) => (
          <button key={g} onClick={() => setGroup(g)} className={`foc rounded-full px-3.5 py-2 text-[13px] font-semibold ${group === g ? "bg-[var(--c-accent)] text-[var(--c-on-accent)]" : "border border-[var(--c-line)] text-[var(--c-text-2)]"}`}>{g}</button>
        ))}
        <input aria-label="Поиск по журналу безопасности" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск: email, IP, номер заявки…" className="foc ml-auto w-72 max-w-full rounded-[11px] border-[1.5px] border-[var(--c-line)] px-3.5 py-2 text-sm outline-none focus:border-ohra" />
      </div>
      <div className="overflow-hidden rounded-[18px] border border-[var(--c-line)] bg-[var(--c-bg-raised)]">
        <div className="grid grid-cols-[110px_1fr_1fr_1fr_120px] gap-3 bg-[var(--c-bg-sunken)] px-6 py-3.5 font-mono text-[11px] uppercase tracking-wide text-[var(--c-text-3)]">
          <span>Когда</span><span>Событие</span><span>Кто</span><span>Объект</span><span>IP</span>
        </div>
        {log.isLoading && <p className="p-8 text-center font-mono text-sm text-[var(--c-text-3)]">Загрузка…</p>}
        {rows.map((r: AuditEntry) => {
          const meta = AUDIT_RU[r.event];
          const danger = r.event.includes("fail") || r.event.includes("locked") || r.event.includes("badip");
          return (
            <div key={r.id} title={r.detail ? JSON.stringify(r.detail) : undefined} className="grid grid-cols-[110px_1fr_1fr_1fr_120px] items-center gap-3 border-t border-[var(--c-line)] px-6 py-3 text-sm">
              <span className="font-mono text-[12px] text-[var(--c-text-3)]">{fmt(r.created_at)}</span>
              <span className={`font-semibold ${danger ? "text-[var(--c-danger-text)]" : ""}`}>{meta?.icon ?? "•"} {meta?.label ?? r.event}</span>
              <span className="min-w-0 truncate font-mono text-[12px] text-[var(--c-text-3)]">{r.actor ?? "–"}</span>
              <span className="min-w-0 truncate font-mono text-[12px] text-[var(--c-text-3)]">{r.subject ?? "–"}</span>
              <span className="font-mono text-[12px] text-[var(--c-text-3)]">{r.ip ?? "–"}</span>
            </div>
          );
        })}
        {!log.isLoading && rows.length === 0 && <p className="p-8 text-center font-mono text-sm text-[var(--c-text-3)]">Записей не найдено.</p>}
      </div>
      <p className="mt-3 font-mono text-[11px] text-[var(--c-text-3)]">Последние 300 событий · обновляется раз в минуту · наведите на строку, чтобы увидеть детали.</p>
    </>
  );
}

// ── Контент: управление каталогом (программы ДПО + мерч) ─────────────
const FORMAT_RU: Record<string, string> = { online: "Онлайн", offline: "Очно", blended: "Смешанный" };
const CATALOG_STATUS: Record<string, string> = { published: "На витрине", draft: "Черновик", archived: "Архив" };

function Content() {
  const [tab, setTab] = useState<"programs" | "products" | "events" | "news" | "timeline" | "podcasts" | "pages">("programs");
  const tabs = [
    { key: "programs" as const, label: "Программы ДПО" },
    { key: "products" as const, label: "Товары (мерч)" },
    { key: "events" as const, label: "События" },
    { key: "news" as const, label: "Новости" },
    { key: "timeline" as const, label: "История" },
    { key: "podcasts" as const, label: "Подкасты" },
    { key: "pages" as const, label: "Страницы" },
  ];
  return (
    <>
      <div className="mb-5 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`foc rounded-[11px] px-4 py-2.5 text-sm font-semibold ${tab === t.key ? "bg-[var(--c-accent)] text-[var(--c-on-accent)]" : "border border-[var(--c-line)] text-[var(--c-text-2)]"}`}>{t.label}</button>
        ))}
        <a href={DIRECTUS_URL} target="_blank" rel="noopener noreferrer" className="foc ml-auto rounded-[11px] border border-[var(--c-line)] bg-[var(--c-bg-raised)] px-4 py-2.5 font-mono text-[12px] text-[var(--c-text-3)]">Directus Studio → медиа</a>
      </div>
      {tab === "programs" && <ProgramsAdmin />}
      {tab === "products" && <ProductsAdmin />}
      {tab === "events" && <EventsAdmin />}
      {tab === "news" && <NewsAdmin />}
      {tab === "timeline" && <TimelineAdmin />}
      {tab === "podcasts" && <PodcastsAdmin />}
      {tab === "pages" && <PagesAdmin />}
    </>
  );
}

// ── События клуба: афиша + участники + «был» → авто-баллы ───────────
function EventsAdmin() {
  const events = useAdminEvents();
  const { createEvent, patchEvent, deleteEvent, markAttended } = useAdminMutations();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<AdminEvent | null>(null);
  const [confirmDel, setConfirmDel] = useState<AdminEvent | null>(null);
  const fmt = (iso: string) => new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="overflow-hidden rounded-[18px] border border-[var(--c-line)] bg-[var(--c-bg-raised)]">
      <div className="flex items-center justify-between gap-3 bg-[var(--c-bg-sunken)] px-6 py-3.5">
        <span className="font-mono text-[11px] uppercase tracking-wide text-[var(--c-text-3)]">События · {events.data?.length ?? "…"} · отметка «был ✓» начисляет баллы автоматически</span>
        <button onClick={() => setShowCreate(true)} className="foc rounded-[10px] bg-[var(--c-accent)] px-4 py-2 text-sm font-semibold text-[var(--c-on-accent)]">+ Добавить событие</button>
      </div>
      {(events.data ?? []).map((e) => (
        <div key={e.id} className="border-t border-[var(--c-line)] px-6 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[12px] text-[var(--c-text-3)]">{fmt(e.starts_at)}</span>
            <span className="min-w-0 flex-1 truncate font-semibold">{e.title}</span>
            <span className="font-mono text-[11px] text-[var(--c-status)]">+{e.points} б.</span>
            <select aria-label={`Статус события «${e.title}»`} value={e.status} disabled={patchEvent.isPending} onChange={(ev) => patchEvent.mutate({ id: e.id, status: ev.target.value })} className={`foc rounded-full border-none px-3 py-1.5 font-mono text-[11px] ${e.status === "published" ? "bg-[rgba(31,138,91,.14)] text-[var(--c-ok-text)]" : e.status === "done" ? "bg-[rgba(46,111,174,.14)] text-[var(--c-link)]" : "bg-[var(--c-bg-sunken)] text-[var(--c-text-3)]"}`}>
              <option value="published">Анонс</option><option value="done">Прошло</option><option value="draft">Черновик</option><option value="canceled">Отменено</option>
            </select>
            <button aria-label={`Редактировать ${e.title}`} onClick={() => setEditing(e)} className="foc h-8 w-8 rounded-[9px] text-[var(--c-text-3)] hover:bg-[var(--c-bg-sunken)]">✎</button>
            <button aria-label={`Удалить ${e.title}`} onClick={() => setConfirmDel(e)} className="foc h-8 w-8 rounded-[9px] text-[var(--c-danger-text)] hover:bg-[rgba(181,51,27,.08)]">✕</button>
          </div>
          {e.rsvps.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-2 pl-1">
              {e.rsvps.map((r) => (
                <button key={r.id} disabled={r.attended || markAttended.isPending} onClick={() => markAttended.mutate(r.id)}
                  title={r.attended ? "Баллы начислены" : "Отметить посещение (+баллы)"}
                  className={`foc rounded-full px-3 py-1.5 font-mono text-[11px] ${r.attended ? "bg-[rgba(31,138,91,.14)] text-[var(--c-ok-text)]" : "border border-[var(--c-line)] bg-[var(--c-bg-raised)] hover:border-ohra"}`}>
                  {r.fio} {r.attended ? "✓" : "· был?"}
                </button>
              ))}
            </div>
          )}
          {e.rsvps.length === 0 && <p className="mt-2 pl-1 font-mono text-[11px] text-[var(--c-text-3)]">записей пока нет</p>}
        </div>
      ))}
      {events.data?.length === 0 && <p className="p-10 text-center font-mono text-sm text-[var(--c-text-3)]">Событий нет – добавьте первое.</p>}
      {showCreate && <EventForm busy={createEvent.isPending} onClose={() => setShowCreate(false)} onSave={(v) => createEvent.mutate(v, { onSuccess: () => setShowCreate(false) })} />}
      {editing && <EventForm initial={editing} busy={patchEvent.isPending} onClose={() => setEditing(null)} onSave={(v) => patchEvent.mutate({ id: editing.id, ...v }, { onSuccess: () => setEditing(null) })} />}
      {confirmDel && <ConfirmDelete title={confirmDel.title} busy={deleteEvent.isPending} hint="Событие и все записи на него будут удалены." onCancel={() => setConfirmDel(null)} onConfirm={() => deleteEvent.mutate(confirmDel.id, { onSuccess: () => setConfirmDel(null) })} />}
    </div>
  );
}

function EventForm({ initial, busy, onClose, onSave }: { initial?: AdminEvent; busy: boolean; onClose: () => void; onSave: (v: { title: string; description?: string | null; starts_at: string; location?: string | null; cover?: string | null; reg_url?: string | null; format?: string; points?: number }) => void }) {
  const d = initial ? new Date(initial.starts_at) : null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const [f, setF] = useState({
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    date: d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : "",
    time: d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : "19:00",
    location: initial?.location ?? "",
    cover: initial?.cover ?? "",
    reg_url: initial?.reg_url ?? "",
    format: initial?.format ?? "offline",
    points: String(initial?.points ?? 60),
  });
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const regOk = !f.reg_url.trim() || /^https?:\/\/.+/.test(f.reg_url.trim());
  const valid = f.title.trim().length >= 3 && /^\d{4}-\d{2}-\d{2}$/.test(f.date) && regOk;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    onSave({
      title: f.title.trim(), description: f.description.trim() || null,
      starts_at: `${f.date}T${f.time || "19:00"}:00+03:00`, location: f.location.trim() || null,
      cover: f.cover.trim() || null, reg_url: f.reg_url.trim() || null,
      format: f.format, points: Number(f.points) || 60,
    });
  };
  return (
    <Modal onClose={onClose} labelledBy="ev-form-title" maxWidth={520}>
      <form onSubmit={submit} className="rounded-[18px] bg-[var(--c-bg-raised)] p-7">
        <h3 id="ev-form-title" className="font-display text-lg font-bold">{initial ? "Редактировать событие" : "Новое событие"}</h3>
        <div className="mt-4 space-y-3">
          <FormField label="Название" value={f.title} onChange={(v) => set("title", v)} required />
          <FormField label="Краткое описание (видно в карточке и анонсе)" value={f.description} onChange={(v) => set("description", v)} textarea />
          <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
            <FormField label="Дата (ГГГГ-ММ-ДД)" value={f.date} onChange={(v) => set("date", v)} ph="2026-09-18" required />
            <FormField label="Время" value={f.time} onChange={(v) => set("time", v)} ph="19:00" />
            <FormField label="Баллы за участие" value={f.points} onChange={(v) => set("points", v.replace(/[^\d]/g, ""))} />
          </div>
          <div className="grid grid-cols-[1fr_140px] gap-3">
            <FormField label="Место / ссылка" value={f.location} onChange={(v) => set("location", v)} ph="Милютинский пер., 13" />
            <label className="block">
              <span className="font-mono text-[11px] uppercase tracking-wide text-[var(--c-text-3)]">Формат</span>
              <select value={f.format} onChange={(e) => set("format", e.target.value)} className="foc mt-1.5 w-full rounded-[11px] border-[1.5px] border-[var(--c-line)] bg-[var(--c-bg)] px-3 py-2.5 text-[15px]">
                <option value="offline">Очно</option><option value="online">Онлайн</option>
              </select>
            </label>
          </div>
          <FormField label="Картинка-анонс (ссылка или /assets/…)" value={f.cover} onChange={(v) => set("cover", v)} ph="/assets/event-networking.jpg" />
          {f.cover.trim() && <img src={f.cover.trim()} alt="Предпросмотр анонса" className="h-24 w-full rounded-[10px] object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />}
          <FormField label="Ссылка на регистрацию (если есть внешняя форма)" value={f.reg_url} onChange={(v) => set("reg_url", v)} ph="https://hse-law.timepad.ru/event/…" />
          {!regOk && <p className="font-mono text-[11px] text-[var(--c-danger-text)]">Ссылка должна начинаться с http(s)://</p>}
        </div>
        <div className="mt-5 flex gap-2">
          <button type="submit" disabled={!valid || busy} className="foc flex-1 rounded-[11px] bg-[var(--c-accent)] py-2.5 font-semibold text-[var(--c-on-accent)] disabled:opacity-50">{busy ? "Сохраняем…" : initial ? "Сохранить" : "Создать"}</button>
          <button type="button" onClick={onClose} className="foc flex-1 rounded-[11px] border border-[var(--c-line)] py-2.5 font-semibold">Отмена</button>
        </div>
      </form>
    </Modal>
  );
}

// ── Новости: пишутся прямо здесь ─────────────────────────────────────
function NewsAdmin() {
  const news = useAdminNews();
  const { createNews, patchNews, deleteNews } = useAdminMutations();
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDel, setConfirmDel] = useState<AdminNews | null>(null);
  return (
    <div className="overflow-hidden rounded-[18px] border border-[var(--c-line)] bg-[var(--c-bg-raised)]">
      <div className="flex items-center justify-between gap-3 bg-[var(--c-bg-sunken)] px-6 py-3.5">
        <span className="font-mono text-[11px] uppercase tracking-wide text-[var(--c-text-3)]">Новости · {news.data?.length ?? "…"}</span>
        <button onClick={() => setShowCreate(true)} className="foc rounded-[10px] bg-[var(--c-accent)] px-4 py-2 text-sm font-semibold text-[var(--c-on-accent)]">+ Написать новость</button>
      </div>
      {(news.data ?? []).map((n) => (
        <div key={n.id} className="grid grid-cols-[1fr_130px_36px] items-center gap-3 border-t border-[var(--c-line)] px-6 py-3.5 text-sm">
          <div className="min-w-0">
            <div className="truncate font-semibold">{n.title}</div>
            {n.excerpt && <div className="truncate font-mono text-[11px] text-[var(--c-text-3)]">{n.excerpt}</div>}
          </div>
          <select aria-label={`Статус новости «${n.title}»`} value={n.status} disabled={patchNews.isPending} onChange={(e) => patchNews.mutate({ id: n.id, status: e.target.value })} className={`foc rounded-full border-none px-3 py-1.5 font-mono text-[11px] ${n.status === "published" ? "bg-[rgba(31,138,91,.14)] text-[var(--c-ok-text)]" : "bg-[rgba(46,111,174,.14)] text-[var(--c-link)]"}`}>
            <option value="published">Опубликована</option><option value="draft">Черновик</option>
          </select>
          <button aria-label={`Удалить ${n.title}`} onClick={() => setConfirmDel(n)} className="foc h-8 w-8 rounded-[9px] text-[var(--c-danger-text)] hover:bg-[rgba(181,51,27,.08)]">✕</button>
        </div>
      ))}
      {news.data?.length === 0 && <p className="p-10 text-center font-mono text-sm text-[var(--c-text-3)]">Новостей нет – напишите первую.</p>}
      {showCreate && <NewsForm busy={createNews.isPending} onClose={() => setShowCreate(false)} onSave={(v) => createNews.mutate(v, { onSuccess: () => setShowCreate(false) })} />}
      {confirmDel && (
        <ConfirmDelete title={confirmDel.title} busy={deleteNews.isPending} hint="Новость исчезнет с сайта безвозвратно."
          onCancel={() => setConfirmDel(null)} onConfirm={() => deleteNews.mutate(confirmDel.id, { onSuccess: () => setConfirmDel(null) })} />
      )}
    </div>
  );
}

function NewsForm({ busy, onClose, onSave }: { busy: boolean; onClose: () => void; onSave: (v: { title: string; excerpt?: string | null; body?: string | null }) => void }) {
  const [f, setF] = useState({ title: "", excerpt: "", body: "" });
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const valid = f.title.trim().length >= 3;
  const submit = (e: FormEvent) => { e.preventDefault(); if (valid) onSave({ title: f.title.trim(), excerpt: f.excerpt.trim() || null, body: f.body.trim() || null }); };
  return (
    <Modal onClose={onClose} labelledBy="news-form-title" maxWidth={560}>
      <form onSubmit={submit} className="rounded-[18px] bg-[var(--c-bg-raised)] p-7">
        <h3 id="news-form-title" className="font-display text-lg font-bold">Новая новость</h3>
        <div className="mt-4 space-y-3">
          <FormField label="Заголовок" value={f.title} onChange={(v) => set("title", v)} required />
          <FormField label="Короткий анонс" value={f.excerpt} onChange={(v) => set("excerpt", v)} />
          <FormField label="Текст новости" value={f.body} onChange={(v) => set("body", v)} textarea />
        </div>
        <div className="mt-5 flex gap-2">
          <button type="submit" disabled={!valid || busy} className="foc flex-1 rounded-[11px] bg-[var(--c-accent)] py-2.5 font-semibold text-[var(--c-on-accent)] disabled:opacity-50">{busy ? "Публикуем…" : "Опубликовать"}</button>
          <button type="button" onClick={onClose} className="foc flex-1 rounded-[11px] border border-[var(--c-line)] py-2.5 font-semibold">Отмена</button>
        </div>
      </form>
    </Modal>
  );
}

// ── «История» на главной ─────────────────────────────────────────────
function TimelineAdmin() {
  const timeline = useAdminTimeline();
  const { createTimeline, patchTimeline, deleteTimeline } = useAdminMutations();
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDel, setConfirmDel] = useState<AdminTimeline | null>(null);
  return (
    <div className="overflow-hidden rounded-[18px] border border-[var(--c-line)] bg-[var(--c-bg-raised)]">
      <div className="flex items-center justify-between gap-3 bg-[var(--c-bg-sunken)] px-6 py-3.5">
        <span className="font-mono text-[11px] uppercase tracking-wide text-[var(--c-text-3)]">История на главной · {timeline.data?.length ?? "…"} вех</span>
        <button onClick={() => setShowCreate(true)} className="foc rounded-[10px] bg-[var(--c-accent)] px-4 py-2 text-sm font-semibold text-[var(--c-on-accent)]">+ Добавить веху</button>
      </div>
      {(timeline.data ?? []).map((t) => (
        <div key={t.id} className="grid grid-cols-[64px_1fr_130px_36px] items-center gap-3 border-t border-[var(--c-line)] px-6 py-3.5 text-sm">
          <span className="font-display text-lg font-extrabold text-hse-blue">{t.year}</span>
          <div className="min-w-0">
            <div className="truncate font-semibold">{t.title}</div>
            <div className="truncate font-mono text-[11px] text-[var(--c-text-3)]">{t.text}{t.metric ? ` · ${t.metric}` : ""}</div>
          </div>
          <select aria-label={`Статус пункта истории «${t.title}»`} value={t.status} disabled={patchTimeline.isPending} onChange={(e) => patchTimeline.mutate({ id: t.id, status: e.target.value })} className={`foc rounded-full border-none px-3 py-1.5 font-mono text-[11px] ${t.status === "published" ? "bg-[rgba(31,138,91,.14)] text-[var(--c-ok-text)]" : "bg-[rgba(46,111,174,.14)] text-[var(--c-link)]"}`}>
            <option value="published">На сайте</option><option value="draft">Скрыта</option>
          </select>
          <button aria-label={`Удалить ${t.title}`} onClick={() => setConfirmDel(t)} className="foc h-8 w-8 rounded-[9px] text-[var(--c-danger-text)] hover:bg-[rgba(181,51,27,.08)]">✕</button>
        </div>
      ))}
      {showCreate && <TimelineForm busy={createTimeline.isPending} onClose={() => setShowCreate(false)} onSave={(v) => createTimeline.mutate(v, { onSuccess: () => setShowCreate(false) })} />}
      {confirmDel && (
        <ConfirmDelete title={confirmDel.title} busy={deleteTimeline.isPending} hint="Веха исчезнет из «Истории» на главной."
          onCancel={() => setConfirmDel(null)} onConfirm={() => deleteTimeline.mutate(confirmDel.id, { onSuccess: () => setConfirmDel(null) })} />
      )}
    </div>
  );
}

function TimelineForm({ busy, onClose, onSave }: { busy: boolean; onClose: () => void; onSave: (v: { year: string; title: string; text?: string | null; metric?: string | null }) => void }) {
  const [f, setF] = useState({ year: String(new Date().getFullYear()), title: "", text: "", metric: "" });
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const valid = /^\d{4}$/.test(f.year) && f.title.trim().length >= 2;
  const submit = (e: FormEvent) => { e.preventDefault(); if (valid) onSave({ year: f.year, title: f.title.trim(), text: f.text.trim() || null, metric: f.metric.trim() || null }); };
  return (
    <Modal onClose={onClose} labelledBy="tl-form-title" maxWidth={480}>
      <form onSubmit={submit} className="rounded-[18px] bg-[var(--c-bg-raised)] p-7">
        <h3 id="tl-form-title" className="font-display text-lg font-bold">Новая веха истории</h3>
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-[110px_1fr] gap-3">
            <FormField label="Год" value={f.year} onChange={(v) => set("year", v.replace(/[^\d]/g, "").slice(0, 4))} required />
            <FormField label="Заголовок" value={f.title} onChange={(v) => set("title", v)} required />
          </div>
          <FormField label="Текст" value={f.text} onChange={(v) => set("text", v)} textarea />
          <FormField label="Метрика (подпись)" value={f.metric} onChange={(v) => set("metric", v)} ph="напр. 2-й выпуск · мерч" />
        </div>
        <div className="mt-5 flex gap-2">
          <button type="submit" disabled={!valid || busy} className="foc flex-1 rounded-[11px] bg-[var(--c-accent)] py-2.5 font-semibold text-[var(--c-on-accent)] disabled:opacity-50">{busy ? "Добавляем…" : "Добавить"}</button>
          <button type="button" onClick={onClose} className="foc flex-1 rounded-[11px] border border-[var(--c-line)] py-2.5 font-semibold">Отмена</button>
        </div>
      </form>
    </Modal>
  );
}

// ── Подкасты (доступ слушателям – по подписке 3 999 ₽/год) ──────────
function PodcastsAdmin() {
  const podcasts = useAdminPodcasts();
  const { createPodcast, patchPodcast, deletePodcast } = useAdminMutations();
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDel, setConfirmDel] = useState<AdminPodcast | null>(null);
  return (
    <div className="overflow-hidden rounded-[18px] border border-[var(--c-line)] bg-[var(--c-bg-raised)]">
      <div className="flex items-center justify-between gap-3 bg-[var(--c-bg-sunken)] px-6 py-3.5">
        <span className="font-mono text-[11px] uppercase tracking-wide text-[var(--c-text-3)]">Подкасты · {podcasts.data?.length ?? "…"} · доступ по подписке 3 999 ₽/год</span>
        <button onClick={() => setShowCreate(true)} className="foc rounded-[10px] bg-[var(--c-accent)] px-4 py-2 text-sm font-semibold text-[var(--c-on-accent)]">+ Добавить подкаст</button>
      </div>
      {(podcasts.data ?? []).map((p) => (
        <div key={p.id} className="grid grid-cols-[52px_1fr_110px_90px_130px_36px] items-center gap-3 border-t border-[var(--c-line)] px-6 py-3.5 text-sm">
          {p.cover ? <img src={p.cover} alt="" className="h-12 w-12 rounded-[10px] object-cover" /> : <div className="h-12 w-12 rounded-[10px] bg-[var(--c-bg-sunken)]" />}
          <div className="min-w-0">
            <div className="truncate font-semibold">{p.title}</div>
            <div className="truncate font-mono text-[11px] text-[var(--c-text-3)]">{p.description}</div>
          </div>
          <button
            onClick={() => patchPodcast.mutate({ id: p.id, is_free: !p.is_free })}
            disabled={patchPodcast.isPending}
            title="Пробный выпуск слушается без подписки"
            className={`foc rounded-full px-3 py-1.5 font-mono text-[11px] ${p.is_free ? "bg-[rgba(31,138,91,.14)] text-[var(--c-ok-text)]" : "bg-[var(--c-bg-sunken)] text-[var(--c-text-3)]"}`}
          >
            {p.is_free ? "пробный ✓" : "по подписке"}
          </button>
          <span className="font-mono text-[12px] text-[var(--c-text-3)]">{p.duration ?? "–"}</span>
          <select aria-label={`Статус подкаста «${p.title}»`} value={p.status} disabled={patchPodcast.isPending} onChange={(e) => patchPodcast.mutate({ id: p.id, status: e.target.value })} className={`foc rounded-full border-none px-3 py-1.5 font-mono text-[11px] ${p.status === "published" ? "bg-[rgba(31,138,91,.14)] text-[var(--c-ok-text)]" : "bg-[rgba(46,111,174,.14)] text-[var(--c-link)]"}`}>
            <option value="published">Опубликован</option><option value="draft">Черновик</option>
          </select>
          <button aria-label={`Удалить ${p.title}`} onClick={() => setConfirmDel(p)} className="foc h-8 w-8 rounded-[9px] text-[var(--c-danger-text)] hover:bg-[rgba(181,51,27,.08)]">✕</button>
        </div>
      ))}
      {podcasts.data?.length === 0 && <p className="p-10 text-center font-mono text-sm text-[var(--c-text-3)]">Подкастов нет – добавьте первый.</p>}
      {showCreate && <PodcastForm busy={createPodcast.isPending} onClose={() => setShowCreate(false)} onSave={(v) => createPodcast.mutate(v, { onSuccess: () => setShowCreate(false) })} />}
      {confirmDel && (
        <ConfirmDelete title={confirmDel.title} busy={deletePodcast.isPending} hint="Подкаст исчезнет с витрины подкастов."
          onCancel={() => setConfirmDel(null)} onConfirm={() => deletePodcast.mutate(confirmDel.id, { onSuccess: () => setConfirmDel(null) })} />
      )}
    </div>
  );
}

function PodcastForm({ busy, onClose, onSave }: { busy: boolean; onClose: () => void; onSave: (v: { title: string; description?: string | null; cover?: string | null; audio_url?: string | null; video_url?: string | null; duration?: string | null }) => void }) {
  const [f, setF] = useState({ title: "", description: "", cover: "", audio_url: "", video_url: "", duration: "" });
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  // Ссылку на видео проверяем сразу: в поле легко вставить не тот адрес,
  // и тогда выпуск молча остался бы без плеера.
  const video = f.video_url.trim() ? rutubeEmbed(f.video_url.trim()) : null;
  const videoBad = !!f.video_url.trim() && !video;
  const valid = f.title.trim().length >= 3 && !videoBad;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (valid) onSave({ title: f.title.trim(), description: f.description.trim() || null, cover: f.cover.trim() || null, audio_url: f.audio_url.trim() || null, video_url: f.video_url.trim() || null, duration: f.duration.trim() || null });
  };
  return (
    <Modal onClose={onClose} labelledBy="pod-form-title" maxWidth={520}>
      <form onSubmit={submit} className="rounded-[18px] bg-[var(--c-bg-raised)] p-7">
        <h3 id="pod-form-title" className="font-display text-lg font-bold">Новый подкаст</h3>
        <div className="mt-4 space-y-3">
          <FormField label="Название" value={f.title} onChange={(v) => set("title", v)} required />
          <FormField label="Описание" value={f.description} onChange={(v) => set("description", v)} textarea />
          <FormField label="Картинка (ссылка или /assets/…)" value={f.cover} onChange={(v) => set("cover", v)} ph="/assets/dpo-hero.jpg" />
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <FormField label="Аудио (ссылка на mp3)" value={f.audio_url} onChange={(v) => set("audio_url", v)} ph="https://…/episode.mp3" />
            <FormField label="Длительность" value={f.duration} onChange={(v) => set("duration", v)} ph="42 мин" />
          </div>
          <div>
            <FormField label="Видео RuTube" value={f.video_url} onChange={(v) => set("video_url", v)} ph="https://rutube.ru/video/…" />
            {videoBad ? (
              <p role="alert" style={{ ...mono, fontSize: 11, color: "var(--c-danger-text)", margin: "6px 0 0", lineHeight: 1.5 }}>
                Не похоже на ссылку RuTube. Скопируйте адрес из адресной строки: rutube.ru/video/… или приватную rutube.ru/video/private/…?p=…
              </p>
            ) : video ? (
              <p style={{ ...label, fontSize: 10, margin: "6px 0 0", textTransform: "none", letterSpacing: 0 }}>
                Ссылка распознана{video.private ? " · видео из закрытой папки" : ""}. Если заполнено, выпуск показывается видеоплеером вместо аудио.
              </p>
            ) : null}
          </div>
        </div>
        <div className="mt-5 flex gap-2">
          <button type="submit" disabled={!valid || busy} className="foc flex-1 rounded-[11px] bg-[var(--c-accent)] py-2.5 font-semibold text-[var(--c-on-accent)] disabled:opacity-50">{busy ? "Добавляем…" : "Добавить"}</button>
          <button type="button" onClick={onClose} className="foc flex-1 rounded-[11px] border border-[var(--c-line)] py-2.5 font-semibold">Отмена</button>
        </div>
      </form>
    </Modal>
  );
}

/** Наполнение главной: hero + CTA-блок. Изменения сразу видны на сайте. */
function PagesAdmin() {
  const page = useAdminPage("home");
  const { savePage } = useAdminMutations();
  const [hero, setHero] = useState<Record<string, string>>({});
  const [cta, setCta] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);

  const [history, setHistory] = useState<Record<string, string>>({});
  const [marquee, setMarquee] = useState("");

  useEffect(() => {
    if (!page.data || loaded) return;
    const h = page.data.blocks.hero ?? {}, c = page.data.blocks.cta ?? {};
    setHero({ badge: h.badge ?? "", title_pre: h.title_pre ?? "", title_accent: h.title_accent ?? "", subtitle: h.subtitle ?? "", cta_primary: h.cta_primary ?? "", cta_secondary: h.cta_secondary ?? "" });
    setCta({ title: c.title ?? "", text: c.text ?? "", button: c.button ?? "" });
    setHistory({ history_eyebrow: h.history_eyebrow ?? "История клуба", history_title: h.history_title ?? "От первого выпуска – к сообществу", history_hint: h.history_hint ?? "↓ листайте – таймлайн движется вбок" });
    setMarquee((h.marquee?.length ? h.marquee : ["Выпуск ’24", "Выпуск ’25", "Менторы клуба", "Учебный офис", "Партнёры", "ДПО", "Мерч", "Нетворкинг"]).join(", "));
    setLoaded(true);
  }, [page.data, loaded]);

  const hset = (k: string, v: string) => setHero((s) => ({ ...s, [k]: v }));
  const cset = (k: string, v: string) => setCta((s) => ({ ...s, [k]: v }));
  const xset = (k: string, v: string) => setHistory((s) => ({ ...s, [k]: v }));
  const save = () => savePage.mutate({
    slug: "home",
    hero: { ...hero, ...history, marquee: marquee.split(",").map((x) => x.trim()).filter(Boolean) },
    cta,
  });

  if (page.isLoading) return <Card><p className="font-mono text-sm text-[var(--c-text-3)]">Загрузка…</p></Card>;
  if (page.isError) return <Card><p className="font-mono text-sm text-[var(--c-danger-text)]">Не удалось загрузить страницу.</p></Card>;

  return (
    <div className="grid grid-cols-2 gap-5 max-md:grid-cols-1">
      <Card>
        <div className="font-display text-lg font-semibold">Главная · Hero</div>
        <p className="mt-1 font-mono text-[11px] text-[var(--c-text-3)]">Первый экран: бейдж, заголовок, подзаголовок, кнопки.</p>
        <div className="mt-4 space-y-3">
          <FormField label="Бейдж" value={hero.badge ?? ""} onChange={(v) => hset("badge", v)} />
          <FormField label="Заголовок (начало)" value={hero.title_pre ?? ""} onChange={(v) => hset("title_pre", v)} />
          <FormField label="Заголовок (акцент)" value={hero.title_accent ?? ""} onChange={(v) => hset("title_accent", v)} />
          <FormField label="Подзаголовок" value={hero.subtitle ?? ""} onChange={(v) => hset("subtitle", v)} textarea />
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Кнопка (основная)" value={hero.cta_primary ?? ""} onChange={(v) => hset("cta_primary", v)} />
            <FormField label="Кнопка (вторая)" value={hero.cta_secondary ?? ""} onChange={(v) => hset("cta_secondary", v)} />
          </div>
        </div>
      </Card>
      <Card>
        <div className="font-display text-lg font-semibold">Главная · CTA-блок</div>
        <p className="mt-1 font-mono text-[11px] text-[var(--c-text-3)]">Тёмный блок призыва внизу страницы.</p>
        <div className="mt-4 space-y-3">
          <FormField label="Заголовок" value={cta.title ?? ""} onChange={(v) => cset("title", v)} />
          <FormField label="Текст" value={cta.text ?? ""} onChange={(v) => cset("text", v)} textarea />
          <FormField label="Кнопка" value={cta.button ?? ""} onChange={(v) => cset("button", v)} />
        </div>
      </Card>

      <Card>
        <div className="font-display text-lg font-semibold">Главная · История клуба и лента</div>
        <p className="mt-1 font-mono text-[11px] text-[var(--c-text-3)]">Заголовок секции «История клуба» и бегущая лента над ней.</p>
        <div className="mt-4 space-y-3">
          <FormField label="Надзаголовок (мелкий, оранжевый)" value={history.history_eyebrow ?? ""} onChange={(v) => xset("history_eyebrow", v)} ph="История клуба" />
          <FormField label="Заголовок секции" value={history.history_title ?? ""} onChange={(v) => xset("history_title", v)} ph="От первого выпуска – к сообществу" />
          <FormField label="Подсказка под заголовком" value={history.history_hint ?? ""} onChange={(v) => xset("history_hint", v)} ph="↓ листайте – таймлайн движется вбок" />
          <FormField label="Бегущая лента (пункты через запятую)" value={marquee} onChange={setMarquee} textarea ph="Выпуск ’24, Выпуск ’25, Менторы клуба, …" />
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-3">
          <button onClick={save} disabled={savePage.isPending} className="foc rounded-[11px] bg-[var(--c-accent)] px-6 py-2.5 font-semibold text-[var(--c-on-accent)] disabled:opacity-60">
            {savePage.isPending ? "Сохраняем…" : "Сохранить все секции"}
          </button>
          {savePage.isSuccess && <span className="font-mono text-[12px] text-[var(--c-ok-text)]">сохранено ✓ – уже на сайте</span>}
          {savePage.isError && <span className="font-mono text-[12px] text-[var(--c-danger-text)]">не удалось сохранить</span>}
        </div>
      </Card>
    </div>
  );
}

function StatusToggle({ status, onSet, busy }: { status: string; onSet: (s: string) => void; busy: boolean }) {
  return (
    <select aria-label="Статус публикации" value={status} disabled={busy} onChange={(e) => onSet(e.target.value)} className={`foc rounded-full border-none px-3 py-1.5 font-mono text-[11px] ${status === "published" ? "bg-[rgba(31,138,91,.14)] text-[var(--c-ok-text)]" : status === "draft" ? "bg-[rgba(46,111,174,.14)] text-[var(--c-link)]" : "bg-[rgba(107,114,128,.14)] text-[var(--c-text-3)]"}`}>
      {Object.entries(CATALOG_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  );
}

function ProgramsAdmin() {
  const programs = useAdminPrograms();
  const { createProgram, patchProgram, deleteProgram, syncDpo } = useAdminMutations();
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDel, setConfirmDel] = useState<AdminProgram | null>(null);

  return (
    <div className="overflow-hidden rounded-[18px] border border-[var(--c-line)] bg-[var(--c-bg-raised)]">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--c-bg-sunken)] px-6 py-3.5">
        <span className="font-mono text-[11px] uppercase tracking-wide text-[var(--c-text-3)]">Каталог ДПО · {programs.data?.length ?? "…"} программ</span>
        <div className="flex items-center gap-2">
          <button onClick={() => syncDpo.mutate()} disabled={syncDpo.isPending} title="Забрать актуальный набор с hse.ru (факультет права)" className="foc rounded-[10px] border border-[var(--c-line)] bg-[var(--c-bg-raised)] px-4 py-2 text-sm font-semibold disabled:opacity-60">
            {syncDpo.isPending ? "Синхронизируем…" : "⟳ Обновить с hse.ru"}
          </button>
          <button onClick={() => setShowCreate(true)} className="foc rounded-[10px] bg-[var(--c-accent)] px-4 py-2 text-sm font-semibold text-[var(--c-on-accent)]">+ Добавить программу</button>
        </div>
      </div>
      {syncDpo.isSuccess && <p className="border-t border-[var(--c-line)] bg-[rgba(31,138,91,.07)] px-6 py-2.5 font-mono text-[12px] text-[var(--c-ok-text)]">Синхронизировано с hse.ru: +{syncDpo.data.created} новых, {syncDpo.data.updated} обновлено, {syncDpo.data.archived} в архив (актуальный набор {(syncDpo.data as any).actual ?? "–"}, закрытые {(syncDpo.data as any).nonactual ?? "–"}). Ночная автосинхронизация – ежедневно в 05:00.</p>}
      {syncDpo.isError && <p className="border-t border-[var(--c-line)] px-6 py-2.5 font-mono text-[12px] text-[var(--c-danger-text)]">Синхронизация не удалась: {(syncDpo.error as Error).message}</p>}
      {(programs.data ?? []).map((p) => (
        <div key={p.id} className="grid grid-cols-[1fr_150px_120px_130px_36px] items-center gap-3 border-t border-[var(--c-line)] px-6 py-3.5 text-sm max-md:grid-cols-1">
          <div className="min-w-0">
            <div className="truncate font-semibold">{p.title}</div>
            <div className="font-mono text-[11px] text-[var(--c-text-3)]">
              <span className={`mr-1.5 rounded-full px-2 py-0.5 ${p.source_url ? "bg-[rgba(17,41,107,.1)] text-hse-blue" : "bg-[rgba(236,90,19,.14)] text-[var(--c-accent-text)]"}`}>{p.source_url ? "ВШЭ · синк" : "Клуба"}</span>
              {p.direction} · {FORMAT_RU[p.format] ?? p.format} · {p.duration}{p.dates?.start ? ` · старт ${p.dates.start}` : ""}{p.enrollment === "nonactual" ? " · набор закрыт" : ""}
            </div>
          </div>
          <span className="font-mono text-[13px]">{rub(p.price)}</span>
          <span className="font-mono text-[11px] text-[var(--c-text-3)]">{p.slug}</span>
          <StatusToggle status={p.status} busy={patchProgram.isPending} onSet={(s) => patchProgram.mutate({ id: p.id, status: s })} />
          <button aria-label={`Удалить ${p.title}`} onClick={() => setConfirmDel(p)} className="foc h-8 w-8 rounded-[9px] text-[var(--c-danger-text)] hover:bg-[rgba(181,51,27,.08)]">✕</button>
        </div>
      ))}
      {programs.data?.length === 0 && <p className="p-10 text-center font-mono text-sm text-[var(--c-text-3)]">Программ нет – добавьте первую.</p>}
      {(createProgram.isError || deleteProgram.isError || patchProgram.isError) && <p className="px-6 py-3 font-mono text-xs text-[var(--c-danger-text)]">Не удалось сохранить изменение – попробуйте ещё раз.</p>}

      {showCreate && <ProgramForm busy={createProgram.isPending} onClose={() => setShowCreate(false)} onSave={(v) => createProgram.mutate(v, { onSuccess: () => setShowCreate(false) })} />}
      {confirmDel && (
        <ConfirmDelete
          title={confirmDel.title} busy={deleteProgram.isPending}
          hint="Программа исчезнет с витрины. Уже оформленные заявки сохранятся (в них снимок позиции)."
          onCancel={() => setConfirmDel(null)}
          onConfirm={() => deleteProgram.mutate(confirmDel.id, { onSuccess: () => setConfirmDel(null) })}
        />
      )}
    </div>
  );
}

function ProductsAdmin() {
  const products = useAdminProducts();
  const { createProduct, patchProduct, deleteProduct } = useAdminMutations();
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDel, setConfirmDel] = useState<AdminProduct | null>(null);

  return (
    <div className="overflow-hidden rounded-[18px] border border-[var(--c-line)] bg-[var(--c-bg-raised)]">
      <div className="flex items-center justify-between gap-3 bg-[var(--c-bg-sunken)] px-6 py-3.5">
        <span className="font-mono text-[11px] uppercase tracking-wide text-[var(--c-text-3)]">Мерч · {products.data?.length ?? "…"} товаров</span>
        <button onClick={() => setShowCreate(true)} className="foc rounded-[10px] bg-[var(--c-accent)] px-4 py-2 text-sm font-semibold text-[var(--c-on-accent)]">+ Добавить товар</button>
      </div>
      {(products.data ?? []).map((p) => (
        <div key={p.id} className="grid grid-cols-[1fr_150px_110px_130px_36px] items-center gap-3 border-t border-[var(--c-line)] px-6 py-3.5 text-sm max-md:grid-cols-1">
          <div className="min-w-0">
            <div className="truncate font-semibold">{p.title}</div>
            <div className="font-mono text-[11px] text-[var(--c-text-3)]">{p.category}{p.variants_json?.length ? ` · ${p.variants_json.length} вар.` : ""}</div>
          </div>
          <span className="font-mono text-[13px]">{rub(p.price)}</span>
          <span className="font-mono text-[12px] text-[var(--c-text-3)]">склад: {p.stock}</span>
          <StatusToggle status={p.status} busy={patchProduct.isPending} onSet={(s) => patchProduct.mutate({ id: p.id, status: s })} />
          <button aria-label={`Удалить ${p.title}`} onClick={() => setConfirmDel(p)} className="foc h-8 w-8 rounded-[9px] text-[var(--c-danger-text)] hover:bg-[rgba(181,51,27,.08)]">✕</button>
        </div>
      ))}
      {products.data?.length === 0 && <p className="p-10 text-center font-mono text-sm text-[var(--c-text-3)]">Товаров нет – добавьте первый.</p>}
      {(createProduct.isError || deleteProduct.isError || patchProduct.isError) && <p className="px-6 py-3 font-mono text-xs text-[var(--c-danger-text)]">Не удалось сохранить изменение – попробуйте ещё раз.</p>}

      {showCreate && <ProductForm busy={createProduct.isPending} onClose={() => setShowCreate(false)} onSave={(v) => createProduct.mutate(v, { onSuccess: () => setShowCreate(false) })} />}
      {confirmDel && (
        <ConfirmDelete
          title={confirmDel.title} busy={deleteProduct.isPending}
          hint="Товар исчезнет с витрины. Уже оформленные заявки сохранятся (в них снимок позиции)."
          onCancel={() => setConfirmDel(null)}
          onConfirm={() => deleteProduct.mutate(confirmDel.id, { onSuccess: () => setConfirmDel(null) })}
        />
      )}
    </div>
  );
}

function ConfirmDelete({ title, hint, busy, onCancel, onConfirm }: { title: string; hint: string; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Modal onClose={onCancel} labelledBy="confirm-del-title" maxWidth={420}>
      <div className="rounded-[18px] bg-[var(--c-bg-raised)] p-7">
        <h3 id="confirm-del-title" className="font-display text-lg font-bold">Удалить «{title}»?</h3>
        <p className="mt-2 text-sm text-[var(--c-text-3)]">{hint}</p>
        <div className="mt-5 flex gap-2">
          <button onClick={onConfirm} disabled={busy} className="foc flex-1 rounded-[11px] bg-karmin py-2.5 font-semibold text-[var(--c-on-accent)] disabled:opacity-60">{busy ? "Удаляем…" : "Удалить"}</button>
          <button onClick={onCancel} className="foc flex-1 rounded-[11px] border border-[var(--c-line)] py-2.5 font-semibold">Отмена</button>
        </div>
      </div>
    </Modal>
  );
}

// Цена вводится в рублях, хранится в копейках.
function ProgramForm({ busy, onClose, onSave }: { busy: boolean; onClose: () => void; onSave: (v: ProgramInput) => void }) {
  const [f, setF] = useState({ title: "", direction: "", format: "online", duration: "", priceRub: "", start: "", description: "" });
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const valid = f.title.trim().length >= 3 && f.direction.trim().length >= 2 && f.duration.trim() && Number(f.priceRub) > 0;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    onSave({
      title: f.title.trim(), direction: f.direction.trim(), format: f.format, duration: f.duration.trim(),
      price: Math.round(Number(f.priceRub) * 100),
      start: f.start.trim() || null, description: f.description.trim() || null,
      document: "Удостоверение о повышении квалификации НИУ ВШЭ",
    });
  };
  return (
    <Modal onClose={onClose} labelledBy="prog-form-title" maxWidth={520}>
      <form onSubmit={submit} className="rounded-[18px] bg-[var(--c-bg-raised)] p-7">
        <h3 id="prog-form-title" className="font-display text-lg font-bold">Новая программа клуба</h3>
        <p className="mt-1 font-mono text-[11px] leading-relaxed text-[var(--c-text-3)]">Собственная программа клуба выпускников: запись и оплата – через сайт (корзина, скидка выпускника). Программы ВШЭ добавлять не нужно – они приходят из синка с hse.ru и ведут на маркетплейс.</p>
        <div className="mt-4 space-y-3">
          <FormField label="Название" value={f.title} onChange={(v) => set("title", v)} required />
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Направление" value={f.direction} onChange={(v) => set("direction", v)} required />
            <label className="block">
              <span className="font-mono text-[11px] uppercase tracking-wide text-[var(--c-text-3)]">Формат</span>
              <select value={f.format} onChange={(e) => set("format", e.target.value)} className="foc mt-1.5 w-full rounded-[11px] border-[1.5px] border-[var(--c-line)] bg-[var(--c-bg)] px-3 py-2.5 text-[15px]">
                {Object.entries(FORMAT_RU).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Длительность" value={f.duration} onChange={(v) => set("duration", v)} ph="напр. 6 недель" required />
            <FormField label="Цена, ₽" value={f.priceRub} onChange={(v) => set("priceRub", v.replace(/[^\d]/g, ""))} ph="50000" required />
          </div>
          <FormField label="Старт (дата словами)" value={f.start} onChange={(v) => set("start", v)} ph="напр. 15 сентября 2026" />
          <FormField label="Описание" value={f.description} onChange={(v) => set("description", v)} textarea />
        </div>
        <div className="mt-5 flex gap-2">
          <button type="submit" disabled={!valid || busy} className="foc flex-1 rounded-[11px] bg-[var(--c-accent)] py-2.5 font-semibold text-[var(--c-on-accent)] disabled:opacity-50">{busy ? "Создаём…" : "Создать"}</button>
          <button type="button" onClick={onClose} className="foc flex-1 rounded-[11px] border border-[var(--c-line)] py-2.5 font-semibold">Отмена</button>
        </div>
      </form>
    </Modal>
  );
}

function ProductForm({ busy, onClose, onSave }: { busy: boolean; onClose: () => void; onSave: (v: ProductInput) => void }) {
  const [f, setF] = useState({ title: "", category: "Одежда", priceRub: "", stock: "10", description: "", image: "" });
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const valid = f.title.trim().length >= 3 && Number(f.priceRub) > 0;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    onSave({
      title: f.title.trim(), category: f.category, price: Math.round(Number(f.priceRub) * 100),
      stock: Number(f.stock) || 0, description: f.description.trim() || null,
      images: f.image.trim() ? [f.image.trim()] : null,
    });
  };
  return (
    <Modal onClose={onClose} labelledBy="prod-form-title" maxWidth={480}>
      <form onSubmit={submit} className="rounded-[18px] bg-[var(--c-bg-raised)] p-7">
        <h3 id="prod-form-title" className="font-display text-lg font-bold">Новый товар</h3>
        <div className="mt-4 space-y-3">
          <FormField label="Название" value={f.title} onChange={(v) => set("title", v)} required />
          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="font-mono text-[11px] uppercase tracking-wide text-[var(--c-text-3)]">Категория</span>
              <select value={f.category} onChange={(e) => set("category", e.target.value)} className="foc mt-1.5 w-full rounded-[11px] border-[1.5px] border-[var(--c-line)] bg-[var(--c-bg)] px-3 py-2.5 text-[15px]">
                <option>Одежда</option><option>Аксессуары</option><option>Канцелярия</option>
              </select>
            </label>
            <FormField label="Цена, ₽" value={f.priceRub} onChange={(v) => set("priceRub", v.replace(/[^\d]/g, ""))} ph="4200" required />
            <FormField label="Остаток, шт." value={f.stock} onChange={(v) => set("stock", v.replace(/[^\d]/g, ""))} />
          </div>
          <FormField label="Описание" value={f.description} onChange={(v) => set("description", v)} textarea />
          <FormField label="Фото (ссылка или /assets/…)" value={f.image} onChange={(v) => set("image", v)} ph="/assets/merch-hoodie.jpg" />
          <p className="font-mono text-[11px] text-[var(--c-text-3)]">Размеры/варианты добавляются позже в Directus Studio (поле variants_json).</p>
        </div>
        <div className="mt-5 flex gap-2">
          <button type="submit" disabled={!valid || busy} className="foc flex-1 rounded-[11px] bg-[var(--c-accent)] py-2.5 font-semibold text-[var(--c-on-accent)] disabled:opacity-50">{busy ? "Создаём…" : "Создать"}</button>
          <button type="button" onClick={onClose} className="foc flex-1 rounded-[11px] border border-[var(--c-line)] py-2.5 font-semibold">Отмена</button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Поле формы. Одно на все семь форм контента, поэтому оформление меняется здесь.
 * Помечаем не обязательные поля, а необязательные: звёздочка у половины полей
 * – это шум, а «необязательно» у меньшинства сразу говорит, что можно пропустить.
 */
function FormField({ label: name, value, onChange, ph, required, textarea }: { label: string; value: string; onChange: (v: string) => void; ph?: string; required?: boolean; textarea?: boolean }) {
  const id = useId();
  const st: React.CSSProperties = { ...field, width: "100%", marginTop: 7, padding: "11px 13px", fontSize: 15 };
  return (
    <div>
      <label htmlFor={id} style={{ ...label, display: "block" }}>
        {name}{!required && <span style={{ textTransform: "none", letterSpacing: 0, opacity: 0.7 }}> · необязательно</span>}
      </label>
      {textarea
        ? <textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={ph} rows={3} className="foc" style={{ ...st, resize: "vertical" }} />
        : <input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={ph} required={required} className="foc" style={st} />}
    </div>
  );
}
