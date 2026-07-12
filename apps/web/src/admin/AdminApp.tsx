import { useId, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import Modal from "../components/Modal.js";
import { rub } from "../lib/api.js";
import { computeLevel } from "@club/shared";

const DIRECTUS_URL = (import.meta.env.VITE_DIRECTUS_URL as string) || "http://localhost:8055";
import {
  adminLogin, adminToken, setAdminToken, clearAdminToken,
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

const ORDER_STATUS: Record<string, string> = { new: "Новая", in_progress: "В работе", confirmed: "Подтверждена", done: "Готово", canceled: "Отменена" };
const ORDER_FLOW = ["new", "in_progress", "confirmed", "done", "canceled"];
const VERIF: Record<string, string> = { pending: "На проверке", verified: "Верифицирован", rejected: "Отклонён" };
const LEVEL_RU: Record<string, string> = { graduate: "Выпускник", friend: "Друг клуба", expert: "Знаток", ambassador: "Амбассадор" };

const stPill = (s: string) =>
  s === "new" || s === "pending" ? "bg-[rgba(236,90,19,.14)] text-ohra-deep"
    : s === "in_progress" ? "bg-[rgba(46,111,174,.14)] text-[#2E6FAE]"
      : s === "confirmed" || s === "verified" || s === "done" ? "bg-[rgba(31,138,91,.14)] text-[#1F8A5B]"
        : "bg-[rgba(181,51,27,.12)] text-karmin";

type Section = "overview" | "orders" | "members" | "content" | "audit";

export default function AdminApp() {
  const [token, setToken] = useState<string | null>(() => adminToken());
  if (!token) return <AdminGate onAuthed={(t) => { setAdminToken(t); setToken(t); }} />;
  return <AdminShell onLogout={() => { clearAdminToken(); setToken(null); }} />;
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
    <main className="flex min-h-screen items-center justify-center bg-grafit px-6 font-body">
      <form onSubmit={submit} className="w-full max-w-[400px] rounded-[22px] bg-white p-8 shadow-2xl">
        <div className="font-display text-xl font-extrabold">Админ-панель клуба</div>
        <label htmlFor={emailId} className="mt-6 block font-mono text-[11px] uppercase text-grafit-soft">Почта</label>
        <input id={emailId} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="foc mt-1.5 w-full rounded-soft border-[1.5px] border-[#E5E7EB] px-3.5 py-3 outline-none focus:border-ohra" />
        <label htmlFor={passId} className="mt-4 block font-mono text-[11px] uppercase text-grafit-soft">Пароль</label>
        <input id={passId} type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="foc mt-1.5 w-full rounded-soft border-[1.5px] border-[#E5E7EB] px-3.5 py-3 outline-none focus:border-ohra" />
        {err && <p className="mt-3 font-mono text-xs text-karmin">{err}</p>}
        <button disabled={busy} className="foc mt-5 w-full rounded-[11px] bg-ohra py-3 font-semibold text-kost disabled:opacity-60">{busy ? "Входим…" : "Войти"}</button>
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
    { key: "content", label: "Контент" },
    { key: "audit", label: "Журнал" },
  ];
  const titles: Record<Section, string> = { overview: "Обзор", orders: "Заявки и заказы", members: "Выпускники", content: "Контент", audit: "Журнал безопасности" };

  // Истёкшая сессия: сохранить СВЕЖИЙ токен перед перезагрузкой, иначе вечный цикл логина.
  if (ov.isError) return <AdminGate onAuthed={(t) => { setAdminToken(t); location.reload(); }} />;

  return (
    <div className="grid min-h-screen grid-cols-[248px_1fr] bg-kost-2 font-body text-grafit max-md:grid-cols-1">
      <aside className="sticky top-0 flex h-screen flex-col gap-1.5 bg-grafit p-4 text-kost max-md:h-auto">
        <div className="px-2 pb-4 pt-1.5">
          <div className="font-display text-sm font-extrabold">Админ-панель</div>
          <div className="mt-0.5 font-mono text-[9px] tracking-wider text-[#8a93a3]">клуб выпускников</div>
        </div>
        {nav.map((n) => (
          <button key={n.key} onClick={() => setSection(n.key)} className={`foc flex items-center justify-between rounded-[11px] px-3.5 py-3 text-left text-sm font-semibold ${section === n.key ? "bg-[rgba(236,90,19,.18)] text-kost" : "text-[#c8cdd6]"}`}>
            {n.label}{n.badge ? <span className="rounded-full bg-ohra px-1.5 font-mono text-[11px]">{n.badge}</span> : null}
          </button>
        ))}
        <button onClick={onLogout} className="foc mt-auto rounded-[11px] border border-[rgba(251,243,232,.14)] px-3.5 py-2.5 text-left font-mono text-[12px] text-kost">Выйти</button>
      </aside>

      <main className="min-w-0 px-8 py-7 max-md:px-5">
        <h1 className="mb-6 font-display text-3xl font-extrabold tracking-tight">{titles[section]}</h1>
        {section === "overview" && <Overview onGo={setSection} />}
        {section === "orders" && <Orders />}
        {section === "members" && <Members />}
        {section === "content" && <Content />}
        {section === "audit" && <AuditLog />}
      </main>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[18px] border border-[#E5E7EB] bg-white p-6">{children}</div>;
}

function Overview({ onGo }: { onGo: (s: Section) => void }) {
  const ov = useOverview();
  const orders = useAdminOrders();
  const members = useMembers();
  const { patchMember } = useAdminMutations();
  const pending = (members.data ?? []).filter((m) => m.verification_status === "pending");
  const d = ov.data;
  // Вся статистика сайта — одним экраном.
  const stats = [
    { label: "Новые заявки", value: d?.new_orders ?? 0, color: "#EC5A13" },
    { label: "На верификацию", value: d?.pending_verifications ?? 0, color: "#a07d2e" },
    { label: "Выпускников", value: d?.alumni_count ?? 0, color: "#11296B", note: `подтверждено ${d?.alumni_verified ?? 0}` },
    { label: "Заявок всего", value: d?.orders_count ?? 0, color: "#1F8A5B", note: `оплачено ${d?.orders_paid ?? 0}` },
    { label: "Программ ДПО", value: d?.programs_total ?? 0, color: "#2E6FAE", note: `актуальный набор ${d?.programs_actual ?? 0}` },
    { label: "Товаров мерча", value: d?.products_count ?? 0, color: "#C9450E" },
    { label: "Новостей", value: d?.news_count ?? 0, color: "#2C6E80" },
    { label: "Дружеских связей", value: d?.friendships ?? 0, color: "#C49A45", note: `заявок в друзья ${d?.friend_requests ?? 0}` },
    { label: "Подкастов", value: d?.podcasts_count ?? 0, color: "#B5331B", note: `подписчиков ${d?.podcast_subscribers ?? 0}` },
    { label: "Баллов у выпускников", value: d?.points_total ?? 0, color: "#14181F" },
  ] as { label: string; value: number; color: string; note?: string }[];
  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <div className="font-mono text-[11px] text-grafit-soft">{s.label}</div>
            <div className="mt-2 font-display text-4xl font-extrabold" style={{ color: s.color }}>{s.value}</div>
            {s.note && <div className="mt-1 font-mono text-[11px] text-grafit-soft">{s.note}</div>}
          </Card>
        ))}
      </div>
      <div className="mt-6 grid grid-cols-[1.4fr_1fr] gap-5 max-md:grid-cols-1">
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <div className="font-display text-lg font-semibold">Последние заявки</div>
            <button onClick={() => onGo("orders")} className="foc text-[13px] font-semibold text-[#2E6FAE]">Все →</button>
          </div>
          {(orders.data ?? []).slice(0, 5).map((o) => (
            <div key={o.id} className="flex items-center gap-3 border-t border-[#f0ece2] py-3 text-sm">
              <span className="font-mono text-[11px] text-grafit-soft">{o.number}</span>
              <span className="flex-1 truncate font-semibold">{o.contact_fio}</span>
              <span className={`rounded-full px-2.5 py-1 font-mono text-[11px] ${stPill(o.status)}`}>{ORDER_STATUS[o.status]}</span>
            </div>
          ))}
          {orders.data?.length === 0 && <p className="py-3 font-mono text-[12px] text-grafit-soft">Заявок пока нет.</p>}
        </Card>
        <Card>
          <div className="font-display text-lg font-semibold">На верификацию</div>
          {pending.length === 0 && <p className="mt-3 font-mono text-[12px] text-grafit-soft">Нет ожидающих.</p>}
          {pending.map((m) => (
            <div key={m.id} className="border-t border-[#f0ece2] py-3">
              <div className="text-sm font-semibold">{m.fio}</div>
              <div className="font-mono text-[11px] text-grafit-soft">Выпуск {m.cohort}</div>
              <div className="mt-2 flex gap-2">
                <button disabled={patchMember.isPending} onClick={() => patchMember.mutate({ id: m.id, verification_status: "verified" })} className="foc flex-1 rounded-[9px] bg-[#1F8A5B] py-2 text-[13px] font-semibold text-white disabled:opacity-60">Подтвердить</button>
                <button disabled={patchMember.isPending} onClick={() => patchMember.mutate({ id: m.id, verification_status: "rejected" })} className="foc flex-1 rounded-[9px] border-[1.5px] border-[#E5E7EB] py-2 text-[13px] font-semibold text-karmin disabled:opacity-60">Отклонить</button>
              </div>
            </div>
          ))}
        </Card>
      </div>
      <div className="mt-5 grid grid-cols-[1fr_1.4fr] gap-5 max-md:grid-cols-1">
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <div className="font-display text-lg font-semibold">Ближайшее событие</div>
            <button onClick={() => onGo("content")} className="foc text-[13px] font-semibold text-[#2E6FAE]">К событиям →</button>
          </div>
          {d?.next_event ? (
            <>
              <div className="mt-1 text-sm font-semibold">{d.next_event.title}</div>
              <div className="mt-1.5 font-mono text-[12px] text-grafit-soft">{new Date(d.next_event.starts_at).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</div>
              <div className="mt-3 inline-flex rounded-full bg-[rgba(46,111,174,.12)] px-3 py-1.5 font-mono text-[12px] text-[#2E6FAE]">записались: {d.next_event.rsvps}</div>
            </>
          ) : (
            <p className="mt-3 font-mono text-[12px] text-grafit-soft">Анонсов нет — создайте событие во вкладке «Контент → События».</p>
          )}
        </Card>
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
  return (
    <Card>
      <div className="font-display text-lg font-semibold">Пуш-рассылка</div>
      <p className="mt-1 font-mono text-[11px] text-grafit-soft">уйдёт на {subs} подписанных устройств · попадает в журнал безопасности</p>
      <div className="mt-3 grid grid-cols-[1fr_1fr_170px] gap-2.5 max-md:grid-cols-1">
        <input value={f.title} onChange={(e) => setF((s) => ({ ...s, title: e.target.value }))} placeholder="Заголовок (например: Новое событие)" className="foc rounded-[11px] border-[1.5px] border-[#E5E7EB] bg-kost px-3 py-2.5 text-sm" />
        <input value={f.body} onChange={(e) => setF((s) => ({ ...s, body: e.target.value }))} placeholder="Текст уведомления" className="foc rounded-[11px] border-[1.5px] border-[#E5E7EB] bg-kost px-3 py-2.5 text-sm" />
        <input value={f.url} onChange={(e) => setF((s) => ({ ...s, url: e.target.value }))} placeholder="/events" className="foc rounded-[11px] border-[1.5px] border-[#E5E7EB] bg-kost px-3 py-2.5 font-mono text-sm" />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button disabled={!valid || send.isPending || subs === 0} onClick={() => send.mutate()} className="foc rounded-[11px] bg-ohra px-5 py-2.5 text-sm font-semibold text-kost disabled:opacity-50">{send.isPending ? "Отправляем…" : "Отправить всем"}</button>
        {sent && <span className="font-mono text-[12px] text-[#1F8A5B]">{sent}</span>}
        {subs === 0 && <span className="font-mono text-[11px] text-grafit-soft">подписчиков пока нет</span>}
      </div>
    </Card>
  );
}

function Orders() {
  const orders = useAdminOrders();
  const { setOrderStatus } = useAdminMutations();
  const [q, setQ] = useState("");
  const [csvBusy, setCsvBusy] = useState(false);
  const list = (orders.data ?? []).filter((o) => {
    if (!q.trim()) return true;
    const hay = `${o.number} ${o.contact_fio} ${o.contact_phone} ${o.contact_email}`.toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  });
  const exportCsv = async () => {
    setCsvBusy(true);
    try { await downloadOrdersCsv(); } catch { alert("Не удалось выгрузить CSV"); } finally { setCsvBusy(false); }
  };
  return (
    <>
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск: номер, ФИО, телефон, email…" className="foc w-80 max-w-full rounded-[11px] border-[1.5px] border-[#E5E7EB] px-3.5 py-2.5 text-sm outline-none focus:border-ohra" />
      {q && <span className="font-mono text-[12px] text-grafit-soft">найдено: {list.length}</span>}
      <button onClick={exportCsv} disabled={csvBusy} className="foc ml-auto rounded-[11px] border border-[#E5E7EB] bg-white px-4 py-2.5 text-sm font-semibold disabled:opacity-60">
        {csvBusy ? "Готовим…" : "📤 Выгрузить CSV"}
      </button>
    </div>
    <div className="overflow-hidden rounded-[18px] border border-[#E5E7EB] bg-white">
      <div className="grid grid-cols-[110px_1fr_1fr_130px_150px] gap-3 bg-[#FBF7EF] px-6 py-3.5 font-mono text-[11px] uppercase tracking-wide text-grafit-soft">
        <span>Номер</span><span>Клиент</span><span>Контакты</span><span>Сумма</span><span>Статус</span>
      </div>
      {list.map((o: AdminOrder) => (
        <div key={o.id} className="border-t border-[#f0ece2] px-6 py-3.5 text-sm">
          <div className="grid grid-cols-[110px_1fr_1fr_130px_150px] items-center gap-3">
            <span className="font-mono text-[12px]">{o.number}</span>
            <span className="min-w-0 truncate font-semibold">{o.contact_fio}</span>
            <span className="min-w-0 truncate font-mono text-[12px] text-grafit-soft">{o.contact_phone}</span>
            <span className="font-mono text-[13px]">{rub(o.total_estimate)}</span>
            <select value={o.status} onChange={(e) => setOrderStatus.mutate({ id: o.id, status: e.target.value })} className={`foc rounded-full border-none px-3 py-1.5 font-mono text-[11px] ${stPill(o.status)}`}>
              {ORDER_FLOW.map((s) => <option key={s} value={s}>{ORDER_STATUS[s]}</option>)}
            </select>
          </div>
          {/* Состав заявки — офис видит позиции без похода в Directus */}
          {(o.items_json?.length || o.address || o.comment) && (
            <div className="mt-1.5 pl-[122px] font-mono text-[11px] leading-relaxed text-grafit-soft">
              {o.items_json?.map((i) => `${i.title}${i.variant_sku ? ` (${i.variant_sku})` : ""} ×${i.qty}`).join("; ")}
              {o.address ? ` · доставка: ${o.address}` : ""}
              {o.comment ? ` · «${o.comment}»` : ""}
            </div>
          )}
        </div>
      ))}
      {!orders.isLoading && list.length === 0 && <p className="p-10 text-center font-mono text-sm text-grafit-soft">{q ? "По запросу ничего не найдено." : "Заявок нет."}</p>}
    </div>
    </>
  );
}

function Members() {
  const members = useMembers();
  const [sel, setSel] = useState<Member | null>(null);
  const [q, setQ] = useState("");
  const [vf, setVf] = useState<string>("all");
  const all = members.data ?? [];
  const pendingCount = all.filter((m) => m.verification_status === "pending").length;
  const list = all
    .filter((m) => vf === "all" || m.verification_status === vf)
    .filter((m) => {
      if (!q.trim()) return true;
      const hay = `${m.fio ?? ""} ${m.cohort ?? ""} ${m.email ?? ""} ${VERIF[m.verification_status] ?? ""}`.toLowerCase();
      return hay.includes(q.trim().toLowerCase());
    })
    // Новые заявки на вступление — всегда сверху.
    .sort((a, b) => (a.verification_status === "pending" ? 0 : 1) - (b.verification_status === "pending" ? 0 : 1));
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[
          { key: "all", label: "Все" },
          { key: "pending", label: `Заявки на вступление${pendingCount ? ` · ${pendingCount}` : ""}` },
          { key: "verified", label: "Подтверждённые" },
          { key: "rejected", label: "Отклонённые" },
        ].map((f) => (
          <button key={f.key} onClick={() => setVf(f.key)} className={`foc rounded-full px-3.5 py-2 text-[13px] font-semibold ${vf === f.key ? "bg-grafit text-kost" : f.key === "pending" && pendingCount ? "border border-ohra bg-[rgba(236,90,19,.1)] text-ohra-deep" : "border border-[#E5E7EB] bg-white"}`}>{f.label}</button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск: ФИО, почта, год…" className="foc ml-auto w-72 max-w-full rounded-[11px] border-[1.5px] border-[#E5E7EB] px-3.5 py-2.5 text-sm outline-none focus:border-ohra" />
        {q && <span className="font-mono text-[12px] text-grafit-soft">найдено: {list.length}</span>}
      </div>
      <div className="overflow-hidden rounded-[18px] border border-[#E5E7EB] bg-white">
        <div className="grid grid-cols-[1fr_80px_120px_80px_80px_80px_90px] gap-3 bg-[#FBF7EF] px-6 py-3.5 font-mono text-[11px] uppercase tracking-wide text-grafit-soft">
          <span>Выпускник</span><span>Выпуск</span><span>Статус</span><span>Баллы</span><span>Скидка</span><span>Друзья</span><span>Подкасты</span>
        </div>
        {list.map((m) => (
          <button key={m.id} onClick={() => setSel(m)} className="arow foc grid w-full grid-cols-[1fr_80px_120px_80px_80px_80px_90px] items-center gap-3 border-t border-[#f0ece2] px-6 py-3.5 text-left text-sm">
            <span className="font-semibold">{m.fio}</span>
            <span className="font-mono text-[12px] text-grafit-soft">{m.cohort}</span>
            <span><span className={`rounded-full px-2.5 py-1 font-mono text-[11px] ${stPill(m.verification_status)}`}>{VERIF[m.verification_status]}</span></span>
            <span className="font-mono text-[13px]">{m.points_cached}</span>
            <span className="font-mono text-[13px]">{m.verification_status === "verified" ? `−${computeLevel(m.points_cached ?? 0).discount_percent + (m.personal_discount ?? 0)}%` : "—"}</span>
            <span className="font-mono text-[13px]">{m.friends_count ?? 0}</span>
            <span className={`font-mono text-[11px] ${m.podcast_active ? "text-[#1F8A5B]" : "text-grafit-soft"}`}>{m.podcast_active ? "подписка ✓" : "—"}</span>
          </button>
        ))}
        {!members.isLoading && list.length === 0 && <p className="p-10 text-center font-mono text-sm text-grafit-soft">{q ? "По запросу ничего не найдено." : "Выпускников нет."}</p>}
      </div>
      {sel && <MemberModal member={sel} onClose={() => setSel(null)} />}
    </>
  );
}

function MemberModal({ member, onClose }: { member: Member; onClose: () => void }) {
  const { patchMember, addPoints, grantPodcastSub, anonymizeMember } = useAdminMutations();
  const [discount, setDiscount] = useState(String(member.personal_discount));
  const [delta, setDelta] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  return (
    <Modal onClose={onClose} labelledBy="member-modal-title" maxWidth={460}>
      <div className="relative rounded-[22px] bg-white p-7 shadow-2xl" style={{ animation: "g-pop .26s cubic-bezier(.2,.8,.2,1)" }}>
        <button onClick={onClose} aria-label="Закрыть" className="foc absolute right-4 top-4 h-9 w-9 rounded-[10px] border border-[#E5E7EB] text-grafit-soft">✕</button>
        <div id="member-modal-title" className="font-display text-2xl font-bold">{member.fio}</div>
        <div className="mt-1 font-mono text-[12px] text-grafit-soft">Выпуск {member.cohort} · {LEVEL_RU[member.level_cached] ?? member.level_cached} · {member.points_cached} баллов · в друзьях: {member.friends_count ?? 0}</div>

        {/* Анкета из формы вступления — всё, что заполнил выпускник */}
        <div className="mt-4 rounded-[14px] bg-[#FBF7EF] px-4 py-3 font-mono text-[12px] leading-relaxed text-grafit-soft">
          {member.email && <div>Почта: <b className="text-grafit">{member.email}</b></div>}
          {(member.edu_level || member.edu_program) && <div>Образование: <b className="text-grafit">{[member.edu_level, member.edu_program && `ОП «${member.edu_program}»`].filter(Boolean).join(" · ")}</b></div>}
          {member.contacts_json && Object.entries(member.contacts_json).filter(([, v]) => v).map(([k, v]) => <div key={k}>{k}: <b className="text-grafit">{v}</b></div>)}
          {!!member.interests_json?.length && <div>Интересы: <b className="text-grafit">{member.interests_json.join(", ")}</b></div>}
          {member.joined_at && <div>Заявка подана: {new Date(member.joined_at).toLocaleDateString("ru-RU")}</div>}
        </div>

        <div className="mt-5 font-mono text-[11px] uppercase text-grafit-soft">Верификация</div>
        <div className="mt-2 flex gap-2">
          <button disabled={patchMember.isPending} onClick={() => patchMember.mutate({ id: member.id, verification_status: "verified" })} className="foc flex-1 rounded-[10px] bg-[#1F8A5B] py-2.5 text-sm font-semibold text-white disabled:opacity-60">Подтвердить</button>
          <button disabled={patchMember.isPending} onClick={() => patchMember.mutate({ id: member.id, verification_status: "rejected" })} className="foc flex-1 rounded-[10px] border-[1.5px] border-[#E5E7EB] py-2.5 text-sm font-semibold text-karmin disabled:opacity-60">Отклонить</button>
        </div>

        <div className="mt-5 font-mono text-[11px] uppercase text-grafit-soft">Ручные баллы</div>
        <div className="mt-2 flex gap-2">
          <input value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="напр. 60 или −30" className="foc flex-1 rounded-[10px] border-[1.5px] border-[#E5E7EB] px-3 py-2.5 text-sm outline-none focus:border-ohra" />
          <button disabled={addPoints.isPending} onClick={() => { const d = parseInt(delta, 10); if (!isNaN(d)) { addPoints.mutate({ id: member.id, delta: d }); setDelta(""); } }} className="foc rounded-[10px] bg-hse-blue px-5 text-sm font-semibold text-kost disabled:opacity-60">Начислить</button>
        </div>

        <div className="mt-5 font-mono text-[11px] uppercase text-grafit-soft">Персональная скидка (0–10%)</div>
        <div className="mt-2 flex gap-2">
          <input value={discount} onChange={(e) => setDiscount(e.target.value)} type="number" min={0} max={10} className="foc flex-1 rounded-[10px] border-[1.5px] border-[#E5E7EB] px-3 py-2.5 text-sm outline-none focus:border-ohra" />
          <button disabled={patchMember.isPending} onClick={() => patchMember.mutate({ id: member.id, personal_discount: Math.max(0, Math.min(10, parseInt(discount, 10) || 0)) })} className="foc rounded-[10px] bg-ohra px-5 text-sm font-semibold text-kost disabled:opacity-60">Сохранить</button>
        </div>

        <div className="mt-5 font-mono text-[11px] uppercase text-grafit-soft">Подкасты · подписка {member.podcast_active ? "активна ✓" : "нет"}</div>
        <button disabled={grantPodcastSub.isPending} onClick={() => grantPodcastSub.mutate(member.id)} className="foc mt-2 w-full rounded-[10px] border-[1.5px] border-[#E5E7EB] py-2.5 text-sm font-semibold disabled:opacity-60">
          {grantPodcastSub.isPending ? "Продлеваем…" : "Продлить подписку на год (оплата по счёту)"}
        </button>

        {/* 152-ФЗ: исполнение запроса на удаление/стирание ПДн (без разработчика) */}
        <div className="mt-6 rounded-[12px] border border-[rgba(181,51,27,.3)] p-3">
          <div className="font-mono text-[11px] uppercase text-karmin">Удаление данных (152-ФЗ)</div>
          {anonymizeMember.isSuccess ? (
            <p className="mt-2 font-mono text-[12px] text-[#1F8A5B]">Данные участника обезличены ✓</p>
          ) : !confirmDel ? (
            <button onClick={() => setConfirmDel(true)} className="foc mt-2 w-full rounded-[10px] border-[1.5px] border-karmin py-2.5 text-sm font-semibold text-karmin">Обезличить и закрыть доступ</button>
          ) : (
            <div className="mt-2">
              <p className="font-mono text-[11px] leading-relaxed text-grafit-soft">Профиль, контакты, аватар и заявки будут обезличены, аккаунт входа удалён. Необратимо.</p>
              <div className="mt-2 flex gap-2">
                <button disabled={anonymizeMember.isPending} onClick={() => anonymizeMember.mutate(member.id)} className="foc flex-1 rounded-[10px] bg-karmin py-2.5 text-sm font-semibold text-white disabled:opacity-60">{anonymizeMember.isPending ? "Удаляем…" : "Подтвердить удаление"}</button>
                <button onClick={() => setConfirmDel(false)} className="foc flex-1 rounded-[10px] border-[1.5px] border-[#E5E7EB] py-2.5 text-sm font-semibold">Отмена</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ── Журнал безопасности: кто входил, что менял, какие оплаты прошли ──
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
    iso ? new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {AUDIT_GROUPS.map((g) => (
          <button key={g} onClick={() => setGroup(g)} className={`foc rounded-full px-3.5 py-2 text-[13px] font-semibold ${group === g ? "bg-grafit text-kost" : "border border-[#E5E7EB] bg-white"}`}>{g}</button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск: email, IP, номер заявки…" className="foc ml-auto w-72 max-w-full rounded-[11px] border-[1.5px] border-[#E5E7EB] px-3.5 py-2 text-sm outline-none focus:border-ohra" />
      </div>
      <div className="overflow-hidden rounded-[18px] border border-[#E5E7EB] bg-white">
        <div className="grid grid-cols-[110px_1fr_1fr_1fr_120px] gap-3 bg-[#FBF7EF] px-6 py-3.5 font-mono text-[11px] uppercase tracking-wide text-grafit-soft">
          <span>Когда</span><span>Событие</span><span>Кто</span><span>Объект</span><span>IP</span>
        </div>
        {log.isLoading && <p className="p-8 text-center font-mono text-sm text-grafit-soft">Загрузка…</p>}
        {rows.map((r: AuditEntry) => {
          const meta = AUDIT_RU[r.event];
          const danger = r.event.includes("fail") || r.event.includes("locked") || r.event.includes("badip");
          return (
            <div key={r.id} title={r.detail ? JSON.stringify(r.detail) : undefined} className="grid grid-cols-[110px_1fr_1fr_1fr_120px] items-center gap-3 border-t border-[#f0ece2] px-6 py-3 text-sm">
              <span className="font-mono text-[12px] text-grafit-soft">{fmt(r.created_at)}</span>
              <span className={`font-semibold ${danger ? "text-karmin" : ""}`}>{meta?.icon ?? "•"} {meta?.label ?? r.event}</span>
              <span className="min-w-0 truncate font-mono text-[12px] text-grafit-soft">{r.actor ?? "—"}</span>
              <span className="min-w-0 truncate font-mono text-[12px] text-grafit-soft">{r.subject ?? "—"}</span>
              <span className="font-mono text-[12px] text-grafit-soft">{r.ip ?? "—"}</span>
            </div>
          );
        })}
        {!log.isLoading && rows.length === 0 && <p className="p-8 text-center font-mono text-sm text-grafit-soft">Записей не найдено.</p>}
      </div>
      <p className="mt-3 font-mono text-[11px] text-grafit-soft">Последние 300 событий · обновляется раз в минуту · наведите на строку, чтобы увидеть детали.</p>
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
          <button key={t.key} onClick={() => setTab(t.key)} className={`foc rounded-[11px] px-4 py-2.5 text-sm font-semibold ${tab === t.key ? "bg-grafit text-kost" : "border border-[#E5E7EB] bg-white"}`}>{t.label}</button>
        ))}
        <a href={DIRECTUS_URL} target="_blank" rel="noopener noreferrer" className="foc ml-auto rounded-[11px] border border-[#E5E7EB] bg-white px-4 py-2.5 font-mono text-[12px] text-grafit-soft">Directus Studio → медиа</a>
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
    <div className="overflow-hidden rounded-[18px] border border-[#E5E7EB] bg-white">
      <div className="flex items-center justify-between gap-3 bg-[#FBF7EF] px-6 py-3.5">
        <span className="font-mono text-[11px] uppercase tracking-wide text-grafit-soft">События · {events.data?.length ?? "…"} · отметка «был ✓» начисляет баллы автоматически</span>
        <button onClick={() => setShowCreate(true)} className="foc rounded-[10px] bg-ohra px-4 py-2 text-sm font-semibold text-kost">+ Добавить событие</button>
      </div>
      {(events.data ?? []).map((e) => (
        <div key={e.id} className="border-t border-[#f0ece2] px-6 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[12px] text-grafit-soft">{fmt(e.starts_at)}</span>
            <span className="min-w-0 flex-1 truncate font-semibold">{e.title}</span>
            <span className="font-mono text-[11px] text-[#a07d2e]">+{e.points} б.</span>
            <select value={e.status} disabled={patchEvent.isPending} onChange={(ev) => patchEvent.mutate({ id: e.id, status: ev.target.value })} className={`foc rounded-full border-none px-3 py-1.5 font-mono text-[11px] ${e.status === "published" ? "bg-[rgba(31,138,91,.14)] text-[#1F8A5B]" : e.status === "done" ? "bg-[rgba(46,111,174,.14)] text-[#2E6FAE]" : "bg-kost-2 text-grafit-soft"}`}>
              <option value="published">Анонс</option><option value="done">Прошло</option><option value="draft">Черновик</option><option value="canceled">Отменено</option>
            </select>
            <button aria-label={`Редактировать ${e.title}`} onClick={() => setEditing(e)} className="foc h-8 w-8 rounded-[9px] text-grafit-soft hover:bg-kost-2">✎</button>
            <button aria-label={`Удалить ${e.title}`} onClick={() => setConfirmDel(e)} className="foc h-8 w-8 rounded-[9px] text-karmin hover:bg-[rgba(181,51,27,.08)]">✕</button>
          </div>
          {e.rsvps.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-2 pl-1">
              {e.rsvps.map((r) => (
                <button key={r.id} disabled={r.attended || markAttended.isPending} onClick={() => markAttended.mutate(r.id)}
                  title={r.attended ? "Баллы начислены" : "Отметить посещение (+баллы)"}
                  className={`foc rounded-full px-3 py-1.5 font-mono text-[11px] ${r.attended ? "bg-[rgba(31,138,91,.14)] text-[#1F8A5B]" : "border border-[#E5E7EB] bg-white hover:border-ohra"}`}>
                  {r.fio} {r.attended ? "✓" : "· был?"}
                </button>
              ))}
            </div>
          )}
          {e.rsvps.length === 0 && <p className="mt-2 pl-1 font-mono text-[11px] text-grafit-soft">записей пока нет</p>}
        </div>
      ))}
      {events.data?.length === 0 && <p className="p-10 text-center font-mono text-sm text-grafit-soft">Событий нет — добавьте первое.</p>}
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
      <form onSubmit={submit} className="rounded-[18px] bg-white p-7">
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
              <span className="font-mono text-[11px] uppercase tracking-wide text-grafit-soft">Формат</span>
              <select value={f.format} onChange={(e) => set("format", e.target.value)} className="foc mt-1.5 w-full rounded-[11px] border-[1.5px] border-[#E5E7EB] bg-kost px-3 py-2.5 text-[15px]">
                <option value="offline">Очно</option><option value="online">Онлайн</option>
              </select>
            </label>
          </div>
          <FormField label="Картинка-анонс (ссылка или /assets/…)" value={f.cover} onChange={(v) => set("cover", v)} ph="/assets/event-networking.jpg" />
          {f.cover.trim() && <img src={f.cover.trim()} alt="Предпросмотр анонса" className="h-24 w-full rounded-[10px] object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />}
          <FormField label="Ссылка на регистрацию (если есть внешняя форма)" value={f.reg_url} onChange={(v) => set("reg_url", v)} ph="https://hse-law.timepad.ru/event/…" />
          {!regOk && <p className="font-mono text-[11px] text-karmin">Ссылка должна начинаться с http(s)://</p>}
        </div>
        <div className="mt-5 flex gap-2">
          <button type="submit" disabled={!valid || busy} className="foc flex-1 rounded-[11px] bg-ohra py-2.5 font-semibold text-kost disabled:opacity-50">{busy ? "Сохраняем…" : initial ? "Сохранить" : "Создать"}</button>
          <button type="button" onClick={onClose} className="foc flex-1 rounded-[11px] border border-[#E5E7EB] py-2.5 font-semibold">Отмена</button>
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
    <div className="overflow-hidden rounded-[18px] border border-[#E5E7EB] bg-white">
      <div className="flex items-center justify-between gap-3 bg-[#FBF7EF] px-6 py-3.5">
        <span className="font-mono text-[11px] uppercase tracking-wide text-grafit-soft">Новости · {news.data?.length ?? "…"}</span>
        <button onClick={() => setShowCreate(true)} className="foc rounded-[10px] bg-ohra px-4 py-2 text-sm font-semibold text-kost">+ Написать новость</button>
      </div>
      {(news.data ?? []).map((n) => (
        <div key={n.id} className="grid grid-cols-[1fr_130px_36px] items-center gap-3 border-t border-[#f0ece2] px-6 py-3.5 text-sm">
          <div className="min-w-0">
            <div className="truncate font-semibold">{n.title}</div>
            {n.excerpt && <div className="truncate font-mono text-[11px] text-grafit-soft">{n.excerpt}</div>}
          </div>
          <select value={n.status} disabled={patchNews.isPending} onChange={(e) => patchNews.mutate({ id: n.id, status: e.target.value })} className={`foc rounded-full border-none px-3 py-1.5 font-mono text-[11px] ${n.status === "published" ? "bg-[rgba(31,138,91,.14)] text-[#1F8A5B]" : "bg-[rgba(46,111,174,.14)] text-[#2E6FAE]"}`}>
            <option value="published">Опубликована</option><option value="draft">Черновик</option>
          </select>
          <button aria-label={`Удалить ${n.title}`} onClick={() => setConfirmDel(n)} className="foc h-8 w-8 rounded-[9px] text-karmin hover:bg-[rgba(181,51,27,.08)]">✕</button>
        </div>
      ))}
      {news.data?.length === 0 && <p className="p-10 text-center font-mono text-sm text-grafit-soft">Новостей нет — напишите первую.</p>}
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
      <form onSubmit={submit} className="rounded-[18px] bg-white p-7">
        <h3 id="news-form-title" className="font-display text-lg font-bold">Новая новость</h3>
        <div className="mt-4 space-y-3">
          <FormField label="Заголовок" value={f.title} onChange={(v) => set("title", v)} required />
          <FormField label="Короткий анонс" value={f.excerpt} onChange={(v) => set("excerpt", v)} />
          <FormField label="Текст новости" value={f.body} onChange={(v) => set("body", v)} textarea />
        </div>
        <div className="mt-5 flex gap-2">
          <button type="submit" disabled={!valid || busy} className="foc flex-1 rounded-[11px] bg-ohra py-2.5 font-semibold text-kost disabled:opacity-50">{busy ? "Публикуем…" : "Опубликовать"}</button>
          <button type="button" onClick={onClose} className="foc flex-1 rounded-[11px] border border-[#E5E7EB] py-2.5 font-semibold">Отмена</button>
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
    <div className="overflow-hidden rounded-[18px] border border-[#E5E7EB] bg-white">
      <div className="flex items-center justify-between gap-3 bg-[#FBF7EF] px-6 py-3.5">
        <span className="font-mono text-[11px] uppercase tracking-wide text-grafit-soft">История на главной · {timeline.data?.length ?? "…"} вех</span>
        <button onClick={() => setShowCreate(true)} className="foc rounded-[10px] bg-ohra px-4 py-2 text-sm font-semibold text-kost">+ Добавить веху</button>
      </div>
      {(timeline.data ?? []).map((t) => (
        <div key={t.id} className="grid grid-cols-[64px_1fr_130px_36px] items-center gap-3 border-t border-[#f0ece2] px-6 py-3.5 text-sm">
          <span className="font-display text-lg font-extrabold text-hse-blue">{t.year}</span>
          <div className="min-w-0">
            <div className="truncate font-semibold">{t.title}</div>
            <div className="truncate font-mono text-[11px] text-grafit-soft">{t.text}{t.metric ? ` · ${t.metric}` : ""}</div>
          </div>
          <select value={t.status} disabled={patchTimeline.isPending} onChange={(e) => patchTimeline.mutate({ id: t.id, status: e.target.value })} className={`foc rounded-full border-none px-3 py-1.5 font-mono text-[11px] ${t.status === "published" ? "bg-[rgba(31,138,91,.14)] text-[#1F8A5B]" : "bg-[rgba(46,111,174,.14)] text-[#2E6FAE]"}`}>
            <option value="published">На сайте</option><option value="draft">Скрыта</option>
          </select>
          <button aria-label={`Удалить ${t.title}`} onClick={() => setConfirmDel(t)} className="foc h-8 w-8 rounded-[9px] text-karmin hover:bg-[rgba(181,51,27,.08)]">✕</button>
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
      <form onSubmit={submit} className="rounded-[18px] bg-white p-7">
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
          <button type="submit" disabled={!valid || busy} className="foc flex-1 rounded-[11px] bg-ohra py-2.5 font-semibold text-kost disabled:opacity-50">{busy ? "Добавляем…" : "Добавить"}</button>
          <button type="button" onClick={onClose} className="foc flex-1 rounded-[11px] border border-[#E5E7EB] py-2.5 font-semibold">Отмена</button>
        </div>
      </form>
    </Modal>
  );
}

// ── Подкасты (доступ слушателям — по подписке 3 999 ₽/год) ──────────
function PodcastsAdmin() {
  const podcasts = useAdminPodcasts();
  const { createPodcast, patchPodcast, deletePodcast } = useAdminMutations();
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDel, setConfirmDel] = useState<AdminPodcast | null>(null);
  return (
    <div className="overflow-hidden rounded-[18px] border border-[#E5E7EB] bg-white">
      <div className="flex items-center justify-between gap-3 bg-[#FBF7EF] px-6 py-3.5">
        <span className="font-mono text-[11px] uppercase tracking-wide text-grafit-soft">Подкасты · {podcasts.data?.length ?? "…"} · доступ по подписке 3 999 ₽/год</span>
        <button onClick={() => setShowCreate(true)} className="foc rounded-[10px] bg-ohra px-4 py-2 text-sm font-semibold text-kost">+ Добавить подкаст</button>
      </div>
      {(podcasts.data ?? []).map((p) => (
        <div key={p.id} className="grid grid-cols-[52px_1fr_110px_90px_130px_36px] items-center gap-3 border-t border-[#f0ece2] px-6 py-3.5 text-sm">
          {p.cover ? <img src={p.cover} alt="" className="h-12 w-12 rounded-[10px] object-cover" /> : <div className="h-12 w-12 rounded-[10px] bg-kost-2" />}
          <div className="min-w-0">
            <div className="truncate font-semibold">{p.title}</div>
            <div className="truncate font-mono text-[11px] text-grafit-soft">{p.description}</div>
          </div>
          <button
            onClick={() => patchPodcast.mutate({ id: p.id, is_free: !p.is_free })}
            disabled={patchPodcast.isPending}
            title="Пробный выпуск слушается без подписки"
            className={`foc rounded-full px-3 py-1.5 font-mono text-[11px] ${p.is_free ? "bg-[rgba(31,138,91,.14)] text-[#1F8A5B]" : "bg-kost-2 text-grafit-soft"}`}
          >
            {p.is_free ? "пробный ✓" : "по подписке"}
          </button>
          <span className="font-mono text-[12px] text-grafit-soft">{p.duration ?? "—"}</span>
          <select value={p.status} disabled={patchPodcast.isPending} onChange={(e) => patchPodcast.mutate({ id: p.id, status: e.target.value })} className={`foc rounded-full border-none px-3 py-1.5 font-mono text-[11px] ${p.status === "published" ? "bg-[rgba(31,138,91,.14)] text-[#1F8A5B]" : "bg-[rgba(46,111,174,.14)] text-[#2E6FAE]"}`}>
            <option value="published">Опубликован</option><option value="draft">Черновик</option>
          </select>
          <button aria-label={`Удалить ${p.title}`} onClick={() => setConfirmDel(p)} className="foc h-8 w-8 rounded-[9px] text-karmin hover:bg-[rgba(181,51,27,.08)]">✕</button>
        </div>
      ))}
      {podcasts.data?.length === 0 && <p className="p-10 text-center font-mono text-sm text-grafit-soft">Подкастов нет — добавьте первый.</p>}
      {showCreate && <PodcastForm busy={createPodcast.isPending} onClose={() => setShowCreate(false)} onSave={(v) => createPodcast.mutate(v, { onSuccess: () => setShowCreate(false) })} />}
      {confirmDel && (
        <ConfirmDelete title={confirmDel.title} busy={deletePodcast.isPending} hint="Подкаст исчезнет с витрины подкастов."
          onCancel={() => setConfirmDel(null)} onConfirm={() => deletePodcast.mutate(confirmDel.id, { onSuccess: () => setConfirmDel(null) })} />
      )}
    </div>
  );
}

function PodcastForm({ busy, onClose, onSave }: { busy: boolean; onClose: () => void; onSave: (v: { title: string; description?: string | null; cover?: string | null; audio_url?: string | null; duration?: string | null }) => void }) {
  const [f, setF] = useState({ title: "", description: "", cover: "", audio_url: "", duration: "" });
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const valid = f.title.trim().length >= 3;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (valid) onSave({ title: f.title.trim(), description: f.description.trim() || null, cover: f.cover.trim() || null, audio_url: f.audio_url.trim() || null, duration: f.duration.trim() || null });
  };
  return (
    <Modal onClose={onClose} labelledBy="pod-form-title" maxWidth={520}>
      <form onSubmit={submit} className="rounded-[18px] bg-white p-7">
        <h3 id="pod-form-title" className="font-display text-lg font-bold">Новый подкаст</h3>
        <div className="mt-4 space-y-3">
          <FormField label="Название" value={f.title} onChange={(v) => set("title", v)} required />
          <FormField label="Описание" value={f.description} onChange={(v) => set("description", v)} textarea />
          <FormField label="Картинка (ссылка или /assets/…)" value={f.cover} onChange={(v) => set("cover", v)} ph="/assets/dpo-hero.jpg" />
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <FormField label="Аудио (ссылка на mp3)" value={f.audio_url} onChange={(v) => set("audio_url", v)} ph="https://…/episode.mp3" />
            <FormField label="Длительность" value={f.duration} onChange={(v) => set("duration", v)} ph="42 мин" />
          </div>
        </div>
        <div className="mt-5 flex gap-2">
          <button type="submit" disabled={!valid || busy} className="foc flex-1 rounded-[11px] bg-ohra py-2.5 font-semibold text-kost disabled:opacity-50">{busy ? "Добавляем…" : "Добавить"}</button>
          <button type="button" onClick={onClose} className="foc flex-1 rounded-[11px] border border-[#E5E7EB] py-2.5 font-semibold">Отмена</button>
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

  if (page.data && !loaded) {
    const h = page.data.blocks.hero ?? {}, c = page.data.blocks.cta ?? {};
    setHero({ badge: h.badge ?? "", title_pre: h.title_pre ?? "", title_accent: h.title_accent ?? "", subtitle: h.subtitle ?? "", cta_primary: h.cta_primary ?? "", cta_secondary: h.cta_secondary ?? "" });
    setCta({ title: c.title ?? "", text: c.text ?? "", button: c.button ?? "" });
    setHistory({ history_eyebrow: h.history_eyebrow ?? "История клуба", history_title: h.history_title ?? "От первого выпуска – к сообществу", history_hint: h.history_hint ?? "↓ листайте – таймлайн движется вбок" });
    setMarquee((h.marquee?.length ? h.marquee : ["Выпуск ’24", "Выпуск ’25", "Менторы клуба", "Учебный офис", "Партнёры", "ДПО", "Мерч", "Нетворкинг"]).join(", "));
    setLoaded(true);
  }

  const hset = (k: string, v: string) => setHero((s) => ({ ...s, [k]: v }));
  const cset = (k: string, v: string) => setCta((s) => ({ ...s, [k]: v }));
  const xset = (k: string, v: string) => setHistory((s) => ({ ...s, [k]: v }));
  const save = () => savePage.mutate({
    slug: "home",
    hero: { ...hero, ...history, marquee: marquee.split(",").map((x) => x.trim()).filter(Boolean) },
    cta,
  });

  if (page.isLoading) return <Card><p className="font-mono text-sm text-grafit-soft">Загрузка…</p></Card>;
  if (page.isError) return <Card><p className="font-mono text-sm text-karmin">Не удалось загрузить страницу.</p></Card>;

  return (
    <div className="grid grid-cols-2 gap-5 max-md:grid-cols-1">
      <Card>
        <div className="font-display text-lg font-semibold">Главная · Hero</div>
        <p className="mt-1 font-mono text-[11px] text-grafit-soft">Первый экран: бейдж, заголовок, подзаголовок, кнопки.</p>
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
        <p className="mt-1 font-mono text-[11px] text-grafit-soft">Тёмный блок призыва внизу страницы.</p>
        <div className="mt-4 space-y-3">
          <FormField label="Заголовок" value={cta.title ?? ""} onChange={(v) => cset("title", v)} />
          <FormField label="Текст" value={cta.text ?? ""} onChange={(v) => cset("text", v)} textarea />
          <FormField label="Кнопка" value={cta.button ?? ""} onChange={(v) => cset("button", v)} />
        </div>
      </Card>

      <Card>
        <div className="font-display text-lg font-semibold">Главная · История клуба и лента</div>
        <p className="mt-1 font-mono text-[11px] text-grafit-soft">Заголовок секции «История клуба» и бегущая лента над ней.</p>
        <div className="mt-4 space-y-3">
          <FormField label="Надзаголовок (мелкий, оранжевый)" value={history.history_eyebrow ?? ""} onChange={(v) => xset("history_eyebrow", v)} ph="История клуба" />
          <FormField label="Заголовок секции" value={history.history_title ?? ""} onChange={(v) => xset("history_title", v)} ph="От первого выпуска – к сообществу" />
          <FormField label="Подсказка под заголовком" value={history.history_hint ?? ""} onChange={(v) => xset("history_hint", v)} ph="↓ листайте – таймлайн движется вбок" />
          <FormField label="Бегущая лента (пункты через запятую)" value={marquee} onChange={setMarquee} textarea ph="Выпуск ’24, Выпуск ’25, Менторы клуба, …" />
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-3">
          <button onClick={save} disabled={savePage.isPending} className="foc rounded-[11px] bg-ohra px-6 py-2.5 font-semibold text-kost disabled:opacity-60">
            {savePage.isPending ? "Сохраняем…" : "Сохранить все секции"}
          </button>
          {savePage.isSuccess && <span className="font-mono text-[12px] text-[#1F8A5B]">сохранено ✓ — уже на сайте</span>}
          {savePage.isError && <span className="font-mono text-[12px] text-karmin">не удалось сохранить</span>}
        </div>
      </Card>
    </div>
  );
}

function StatusToggle({ status, onSet, busy }: { status: string; onSet: (s: string) => void; busy: boolean }) {
  return (
    <select value={status} disabled={busy} onChange={(e) => onSet(e.target.value)} className={`foc rounded-full border-none px-3 py-1.5 font-mono text-[11px] ${status === "published" ? "bg-[rgba(31,138,91,.14)] text-[#1F8A5B]" : status === "draft" ? "bg-[rgba(46,111,174,.14)] text-[#2E6FAE]" : "bg-[rgba(107,114,128,.14)] text-grafit-soft"}`}>
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
    <div className="overflow-hidden rounded-[18px] border border-[#E5E7EB] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#FBF7EF] px-6 py-3.5">
        <span className="font-mono text-[11px] uppercase tracking-wide text-grafit-soft">Каталог ДПО · {programs.data?.length ?? "…"} программ</span>
        <div className="flex items-center gap-2">
          <button onClick={() => syncDpo.mutate()} disabled={syncDpo.isPending} title="Забрать актуальный набор с hse.ru (факультет права)" className="foc rounded-[10px] border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-semibold disabled:opacity-60">
            {syncDpo.isPending ? "Синхронизируем…" : "⟳ Обновить с hse.ru"}
          </button>
          <button onClick={() => setShowCreate(true)} className="foc rounded-[10px] bg-ohra px-4 py-2 text-sm font-semibold text-kost">+ Добавить программу</button>
        </div>
      </div>
      {syncDpo.isSuccess && <p className="border-t border-[#f0ece2] bg-[rgba(31,138,91,.07)] px-6 py-2.5 font-mono text-[12px] text-[#1F8A5B]">Синхронизировано с hse.ru: +{syncDpo.data.created} новых, {syncDpo.data.updated} обновлено, {syncDpo.data.archived} в архив (актуальный набор {(syncDpo.data as any).actual ?? "—"}, закрытые {(syncDpo.data as any).nonactual ?? "—"}). Ночная автосинхронизация — ежедневно в 05:00.</p>}
      {syncDpo.isError && <p className="border-t border-[#f0ece2] px-6 py-2.5 font-mono text-[12px] text-karmin">Синхронизация не удалась: {(syncDpo.error as Error).message}</p>}
      {(programs.data ?? []).map((p) => (
        <div key={p.id} className="grid grid-cols-[1fr_150px_120px_130px_36px] items-center gap-3 border-t border-[#f0ece2] px-6 py-3.5 text-sm max-md:grid-cols-1">
          <div className="min-w-0">
            <div className="truncate font-semibold">{p.title}</div>
            <div className="font-mono text-[11px] text-grafit-soft">
              <span className={`mr-1.5 rounded-full px-2 py-0.5 ${p.source_url ? "bg-[rgba(17,41,107,.1)] text-hse-blue" : "bg-[rgba(236,90,19,.14)] text-ohra-deep"}`}>{p.source_url ? "ВШЭ · синк" : "Клуба"}</span>
              {p.direction} · {FORMAT_RU[p.format] ?? p.format} · {p.duration}{p.dates?.start ? ` · старт ${p.dates.start}` : ""}{p.enrollment === "nonactual" ? " · набор закрыт" : ""}
            </div>
          </div>
          <span className="font-mono text-[13px]">{rub(p.price)}</span>
          <span className="font-mono text-[11px] text-grafit-soft">{p.slug}</span>
          <StatusToggle status={p.status} busy={patchProgram.isPending} onSet={(s) => patchProgram.mutate({ id: p.id, status: s })} />
          <button aria-label={`Удалить ${p.title}`} onClick={() => setConfirmDel(p)} className="foc h-8 w-8 rounded-[9px] text-karmin hover:bg-[rgba(181,51,27,.08)]">✕</button>
        </div>
      ))}
      {programs.data?.length === 0 && <p className="p-10 text-center font-mono text-sm text-grafit-soft">Программ нет — добавьте первую.</p>}
      {(createProgram.isError || deleteProgram.isError || patchProgram.isError) && <p className="px-6 py-3 font-mono text-xs text-karmin">Не удалось сохранить изменение — попробуйте ещё раз.</p>}

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
    <div className="overflow-hidden rounded-[18px] border border-[#E5E7EB] bg-white">
      <div className="flex items-center justify-between gap-3 bg-[#FBF7EF] px-6 py-3.5">
        <span className="font-mono text-[11px] uppercase tracking-wide text-grafit-soft">Мерч · {products.data?.length ?? "…"} товаров</span>
        <button onClick={() => setShowCreate(true)} className="foc rounded-[10px] bg-ohra px-4 py-2 text-sm font-semibold text-kost">+ Добавить товар</button>
      </div>
      {(products.data ?? []).map((p) => (
        <div key={p.id} className="grid grid-cols-[1fr_150px_110px_130px_36px] items-center gap-3 border-t border-[#f0ece2] px-6 py-3.5 text-sm max-md:grid-cols-1">
          <div className="min-w-0">
            <div className="truncate font-semibold">{p.title}</div>
            <div className="font-mono text-[11px] text-grafit-soft">{p.category}{p.variants_json?.length ? ` · ${p.variants_json.length} вар.` : ""}</div>
          </div>
          <span className="font-mono text-[13px]">{rub(p.price)}</span>
          <span className="font-mono text-[12px] text-grafit-soft">склад: {p.stock}</span>
          <StatusToggle status={p.status} busy={patchProduct.isPending} onSet={(s) => patchProduct.mutate({ id: p.id, status: s })} />
          <button aria-label={`Удалить ${p.title}`} onClick={() => setConfirmDel(p)} className="foc h-8 w-8 rounded-[9px] text-karmin hover:bg-[rgba(181,51,27,.08)]">✕</button>
        </div>
      ))}
      {products.data?.length === 0 && <p className="p-10 text-center font-mono text-sm text-grafit-soft">Товаров нет — добавьте первый.</p>}
      {(createProduct.isError || deleteProduct.isError || patchProduct.isError) && <p className="px-6 py-3 font-mono text-xs text-karmin">Не удалось сохранить изменение — попробуйте ещё раз.</p>}

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
      <div className="rounded-[18px] bg-white p-7">
        <h3 id="confirm-del-title" className="font-display text-lg font-bold">Удалить «{title}»?</h3>
        <p className="mt-2 text-sm text-grafit-soft">{hint}</p>
        <div className="mt-5 flex gap-2">
          <button onClick={onConfirm} disabled={busy} className="foc flex-1 rounded-[11px] bg-karmin py-2.5 font-semibold text-kost disabled:opacity-60">{busy ? "Удаляем…" : "Удалить"}</button>
          <button onClick={onCancel} className="foc flex-1 rounded-[11px] border border-[#E5E7EB] py-2.5 font-semibold">Отмена</button>
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
      <form onSubmit={submit} className="rounded-[18px] bg-white p-7">
        <h3 id="prog-form-title" className="font-display text-lg font-bold">Новая программа клуба</h3>
        <p className="mt-1 font-mono text-[11px] leading-relaxed text-grafit-soft">Собственная программа клуба выпускников: запись и оплата — через сайт (корзина, скидка выпускника). Программы ВШЭ добавлять не нужно — они приходят из синка с hse.ru и ведут на маркетплейс.</p>
        <div className="mt-4 space-y-3">
          <FormField label="Название" value={f.title} onChange={(v) => set("title", v)} required />
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Направление" value={f.direction} onChange={(v) => set("direction", v)} required />
            <label className="block">
              <span className="font-mono text-[11px] uppercase tracking-wide text-grafit-soft">Формат</span>
              <select value={f.format} onChange={(e) => set("format", e.target.value)} className="foc mt-1.5 w-full rounded-[11px] border-[1.5px] border-[#E5E7EB] bg-kost px-3 py-2.5 text-[15px]">
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
          <button type="submit" disabled={!valid || busy} className="foc flex-1 rounded-[11px] bg-ohra py-2.5 font-semibold text-kost disabled:opacity-50">{busy ? "Создаём…" : "Создать"}</button>
          <button type="button" onClick={onClose} className="foc flex-1 rounded-[11px] border border-[#E5E7EB] py-2.5 font-semibold">Отмена</button>
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
      <form onSubmit={submit} className="rounded-[18px] bg-white p-7">
        <h3 id="prod-form-title" className="font-display text-lg font-bold">Новый товар</h3>
        <div className="mt-4 space-y-3">
          <FormField label="Название" value={f.title} onChange={(v) => set("title", v)} required />
          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="font-mono text-[11px] uppercase tracking-wide text-grafit-soft">Категория</span>
              <select value={f.category} onChange={(e) => set("category", e.target.value)} className="foc mt-1.5 w-full rounded-[11px] border-[1.5px] border-[#E5E7EB] bg-kost px-3 py-2.5 text-[15px]">
                <option>Одежда</option><option>Аксессуары</option><option>Канцелярия</option>
              </select>
            </label>
            <FormField label="Цена, ₽" value={f.priceRub} onChange={(v) => set("priceRub", v.replace(/[^\d]/g, ""))} ph="4200" required />
            <FormField label="Остаток, шт." value={f.stock} onChange={(v) => set("stock", v.replace(/[^\d]/g, ""))} />
          </div>
          <FormField label="Описание" value={f.description} onChange={(v) => set("description", v)} textarea />
          <FormField label="Фото (ссылка или /assets/…)" value={f.image} onChange={(v) => set("image", v)} ph="/assets/merch-hoodie.jpg" />
          <p className="font-mono text-[11px] text-grafit-soft">Размеры/варианты добавляются позже в Directus Studio (поле variants_json).</p>
        </div>
        <div className="mt-5 flex gap-2">
          <button type="submit" disabled={!valid || busy} className="foc flex-1 rounded-[11px] bg-ohra py-2.5 font-semibold text-kost disabled:opacity-50">{busy ? "Создаём…" : "Создать"}</button>
          <button type="button" onClick={onClose} className="foc flex-1 rounded-[11px] border border-[#E5E7EB] py-2.5 font-semibold">Отмена</button>
        </div>
      </form>
    </Modal>
  );
}

function FormField({ label, value, onChange, ph, required, textarea }: { label: string; value: string; onChange: (v: string) => void; ph?: string; required?: boolean; textarea?: boolean }) {
  const id = useId();
  const cls = "foc mt-1.5 w-full rounded-[11px] border-[1.5px] border-[#E5E7EB] bg-kost px-3 py-2.5 text-[15px] outline-none focus:border-ohra";
  return (
    <label htmlFor={id} className="block">
      <span className="font-mono text-[11px] uppercase tracking-wide text-grafit-soft">{label}{required && " *"}</span>
      {textarea
        ? <textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={ph} rows={3} className={cls} />
        : <input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={ph} required={required} className={cls} />}
    </label>
  );
}
