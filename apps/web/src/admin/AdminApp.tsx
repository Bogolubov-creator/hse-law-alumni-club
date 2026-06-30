import { useState, type FormEvent } from "react";
import { rub } from "../lib/api.js";
import {
  adminLogin, adminToken, setAdminToken, clearAdminToken,
  useOverview, useAdminOrders, useMembers, useAdminMutations,
  type AdminOrder, type Member,
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

type Section = "overview" | "orders" | "members" | "content";

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
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null); setBusy(true);
    try { const r = await adminLogin(email, password); onAuthed(r.token); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <main className="flex min-h-screen items-center justify-center bg-grafit px-6 font-body">
      <form onSubmit={submit} className="w-full max-w-[400px] rounded-[22px] bg-white p-8 shadow-2xl">
        <div className="font-display text-xl font-extrabold">Админка клуба</div>
        <p className="mt-1 font-mono text-[11px] text-grafit-soft">учебный офис</p>
        <label className="mt-6 block font-mono text-[11px] uppercase text-grafit-soft">Почта</label>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="foc mt-1.5 w-full rounded-soft border-[1.5px] border-[#E5E7EB] px-3.5 py-3 outline-none focus:border-ohra" />
        <label className="mt-4 block font-mono text-[11px] uppercase text-grafit-soft">Пароль</label>
        <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="foc mt-1.5 w-full rounded-soft border-[1.5px] border-[#E5E7EB] px-3.5 py-3 outline-none focus:border-ohra" />
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
  ];
  const titles: Record<Section, string> = { overview: "Обзор", orders: "Заявки и заказы", members: "Выпускники", content: "Контент" };

  if (ov.isError) return <AdminGate onAuthed={() => location.reload()} />;

  return (
    <div className="grid min-h-screen grid-cols-[248px_1fr] bg-kost-2 font-body text-grafit max-md:grid-cols-1">
      <aside className="sticky top-0 flex h-screen flex-col gap-1.5 bg-grafit p-4 text-kost max-md:h-auto">
        <div className="px-2 pb-4 pt-1.5">
          <div className="font-display text-sm font-extrabold">Админка</div>
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
  const stats = [
    { label: "Новые заявки", value: ov.data?.new_orders ?? 0, color: "#EC5A13" },
    { label: "На верификацию", value: ov.data?.pending_verifications ?? 0, color: "#a07d2e" },
    { label: "Выпускников", value: ov.data?.alumni_count ?? 0, color: "#11296B" },
    { label: "Заявок всего", value: ov.data?.orders_count ?? 0, color: "#1F8A5B" },
  ];
  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <div className="font-mono text-[11px] text-grafit-soft">{s.label}</div>
            <div className="mt-2 font-display text-4xl font-extrabold" style={{ color: s.color }}>{s.value}</div>
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
                <button onClick={() => patchMember.mutate({ id: m.id, verification_status: "verified" })} className="foc flex-1 rounded-[9px] bg-[#1F8A5B] py-2 text-[13px] font-semibold text-white">Подтвердить</button>
                <button onClick={() => patchMember.mutate({ id: m.id, verification_status: "rejected" })} className="foc flex-1 rounded-[9px] border-[1.5px] border-[#E5E7EB] py-2 text-[13px] font-semibold text-karmin">Отклонить</button>
              </div>
            </div>
          ))}
        </Card>
      </div>
    </>
  );
}

function Orders() {
  const orders = useAdminOrders();
  const { setOrderStatus } = useAdminMutations();
  return (
    <div className="overflow-hidden rounded-[18px] border border-[#E5E7EB] bg-white">
      <div className="grid grid-cols-[110px_1fr_1fr_130px_150px] gap-3 bg-[#FBF7EF] px-6 py-3.5 font-mono text-[11px] uppercase tracking-wide text-grafit-soft">
        <span>Номер</span><span>Клиент</span><span>Контакты</span><span>Сумма</span><span>Статус</span>
      </div>
      {(orders.data ?? []).map((o: AdminOrder) => (
        <div key={o.id} className="grid grid-cols-[110px_1fr_1fr_130px_150px] items-center gap-3 border-t border-[#f0ece2] px-6 py-3.5 text-sm">
          <span className="font-mono text-[12px]">{o.number}</span>
          <span className="min-w-0 truncate font-semibold">{o.contact_fio}</span>
          <span className="min-w-0 truncate font-mono text-[12px] text-grafit-soft">{o.contact_phone}</span>
          <span className="font-mono text-[13px]">{rub(o.total_estimate)}</span>
          <select value={o.status} onChange={(e) => setOrderStatus.mutate({ id: o.id, status: e.target.value })} className={`foc rounded-full border-none px-3 py-1.5 font-mono text-[11px] ${stPill(o.status)}`}>
            {ORDER_FLOW.map((s) => <option key={s} value={s}>{ORDER_STATUS[s]}</option>)}
          </select>
        </div>
      ))}
      {orders.data?.length === 0 && <p className="p-10 text-center font-mono text-sm text-grafit-soft">Заявок нет.</p>}
    </div>
  );
}

function Members() {
  const members = useMembers();
  const [sel, setSel] = useState<Member | null>(null);
  return (
    <>
      <div className="overflow-hidden rounded-[18px] border border-[#E5E7EB] bg-white">
        <div className="grid grid-cols-[1fr_90px_120px_90px_110px] gap-3 bg-[#FBF7EF] px-6 py-3.5 font-mono text-[11px] uppercase tracking-wide text-grafit-soft">
          <span>Выпускник</span><span>Выпуск</span><span>Статус</span><span>Баллы</span><span>Скидка</span>
        </div>
        {(members.data ?? []).map((m) => (
          <button key={m.id} onClick={() => setSel(m)} className="arow foc grid w-full grid-cols-[1fr_90px_120px_90px_110px] items-center gap-3 border-t border-[#f0ece2] px-6 py-3.5 text-left text-sm">
            <span className="font-semibold">{m.fio}</span>
            <span className="font-mono text-[12px] text-grafit-soft">{m.cohort}</span>
            <span><span className={`rounded-full px-2.5 py-1 font-mono text-[11px] ${stPill(m.verification_status)}`}>{VERIF[m.verification_status]}</span></span>
            <span className="font-mono text-[13px]">{m.points_cached}</span>
            <span className="font-mono text-[13px]">−{m.personal_discount}%</span>
          </button>
        ))}
        {members.data?.length === 0 && <p className="p-10 text-center font-mono text-sm text-grafit-soft">Выпускников нет.</p>}
      </div>
      {sel && <MemberModal member={sel} onClose={() => setSel(null)} />}
    </>
  );
}

function MemberModal({ member, onClose }: { member: Member; onClose: () => void }) {
  const { patchMember, addPoints } = useAdminMutations();
  const [discount, setDiscount] = useState(String(member.personal_discount));
  const [delta, setDelta] = useState("");
  return (
    <div onClick={onClose} className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(15,18,24,.55)] p-6 backdrop-blur-sm">
      <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-[460px] rounded-[22px] bg-white p-7 shadow-2xl" style={{ animation: "g-pop .26s cubic-bezier(.2,.8,.2,1)" }}>
        <button onClick={onClose} className="foc absolute right-4 top-4 h-9 w-9 rounded-[10px] border border-[#E5E7EB] text-grafit-soft">✕</button>
        <div className="font-display text-2xl font-bold">{member.fio}</div>
        <div className="mt-1 font-mono text-[12px] text-grafit-soft">Выпуск {member.cohort} · {LEVEL_RU[member.level_cached] ?? member.level_cached} · {member.points_cached} баллов</div>

        <div className="mt-5 font-mono text-[11px] uppercase text-grafit-soft">Верификация</div>
        <div className="mt-2 flex gap-2">
          <button onClick={() => patchMember.mutate({ id: member.id, verification_status: "verified" })} className="foc flex-1 rounded-[10px] bg-[#1F8A5B] py-2.5 text-sm font-semibold text-white">Подтвердить</button>
          <button onClick={() => patchMember.mutate({ id: member.id, verification_status: "rejected" })} className="foc flex-1 rounded-[10px] border-[1.5px] border-[#E5E7EB] py-2.5 text-sm font-semibold text-karmin">Отклонить</button>
        </div>

        <div className="mt-5 font-mono text-[11px] uppercase text-grafit-soft">Ручные баллы</div>
        <div className="mt-2 flex gap-2">
          <input value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="напр. 60 или −30" className="foc flex-1 rounded-[10px] border-[1.5px] border-[#E5E7EB] px-3 py-2.5 text-sm outline-none focus:border-ohra" />
          <button onClick={() => { const d = parseInt(delta, 10); if (!isNaN(d)) { addPoints.mutate({ id: member.id, delta: d }); setDelta(""); } }} className="foc rounded-[10px] bg-hse-blue px-5 text-sm font-semibold text-kost">Начислить</button>
        </div>

        <div className="mt-5 font-mono text-[11px] uppercase text-grafit-soft">Персональная скидка (0–10%)</div>
        <div className="mt-2 flex gap-2">
          <input value={discount} onChange={(e) => setDiscount(e.target.value)} type="number" min={0} max={10} className="foc flex-1 rounded-[10px] border-[1.5px] border-[#E5E7EB] px-3 py-2.5 text-sm outline-none focus:border-ohra" />
          <button onClick={() => patchMember.mutate({ id: member.id, personal_discount: Math.max(0, Math.min(10, parseInt(discount, 10) || 0)) })} className="foc rounded-[10px] bg-ohra px-5 text-sm font-semibold text-kost">Сохранить</button>
        </div>
      </div>
    </div>
  );
}

function Content() {
  return (
    <Card>
      <div className="font-display text-lg font-semibold">Контент сайта</div>
      <p className="mt-2 max-w-[560px] text-sm text-grafit-soft">
        Новости, программы ДПО, товары и блоки главной страницы редактируются в админке Directus — там готовые формы, загрузка медиа и история изменений. Изменения сразу попадают на сайт через API.
      </p>
      <a href="http://localhost:8055" target="_blank" rel="noopener noreferrer" className="foc mt-4 inline-block rounded-[11px] bg-grafit px-5 py-3 font-semibold text-kost">Открыть Directus Studio →</a>
      <p className="mt-3 font-mono text-[11px] text-grafit-soft">На проде — https://admin.&lt;домен&gt;</p>
    </Card>
  );
}
