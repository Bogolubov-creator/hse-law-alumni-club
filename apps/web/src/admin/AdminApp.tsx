import { useId, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useHead } from "../lib/title.js";
import { VisionToggle } from "../components/Vision.js";
import { adminLogin, adminSession, adminLogout, useOverview } from "../lib/admin.js";
import { type Section } from "./ui.js";
import { Overview } from "./sections/Overview.js";
import { Orders } from "./sections/Orders.js";
import { Members } from "./sections/Members.js";
import { Content } from "./sections/Content.js";
import { AuditLog } from "./sections/Audit.js";

/**
 * Админка офиса на реальных данных (Фаза 4). Подключена к /api/admin/*.
 * Верификация, ручные баллы, персональная скидка, статусы заявок.
 * Контент (новости/программы/товары/блоки) редактируется в Directus Studio.
 */

export default function AdminApp() {
  useHead({ title: "Админ-панель", noindex: true }); // офисная зона — не индексируем
  // Сессия проверяется по httpOnly-cookie (JS токен не хранит). Пока проверяем —
  // тихий плейсхолдер; нет сессии (401) — вход; есть — панель.
  const session = useQuery({ queryKey: ["adm", "session"], queryFn: adminSession, retry: false });
  if (session.isPending) return <div className="min-h-screen bg-kost-2" />;
  if (session.isError) return <AdminGate onAuthed={() => session.refetch()} />;
  return <AdminShell onLogout={async () => { await adminLogout(); location.reload(); }} />;
}

function AdminGate({ onAuthed }: { onAuthed: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const emailId = useId();
  const passId = useId();
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null); setBusy(true);
    try { await adminLogin(email, password); onAuthed(); }
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

  // На вход выкидываем ТОЛЬКО при 401 (истёкшая сессия). Прочие ошибки (5xx/сеть)
  // не должны маскироваться под разлогин — показываем ретрай в основной области.
  if (ov.isError && (ov.error as { status?: number })?.status === 401)
    return <AdminGate onAuthed={() => location.reload()} />;

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
        <div className="mt-3 px-1"><VisionToggle compact /></div>
        <button onClick={onLogout} className="foc mt-auto rounded-[11px] border border-[rgba(251,243,232,.14)] px-3.5 py-2.5 text-left font-mono text-[12px] text-kost">Выйти</button>
      </aside>

      <main className="min-w-0 px-8 py-7 max-md:px-5">
        <h1 className="mb-6 font-display text-3xl font-extrabold tracking-tight">{titles[section]}</h1>
        {ov.isError && (
          <p className="mb-5 rounded-[10px] bg-[rgba(181,51,27,.08)] px-4 py-3 font-mono text-xs text-karmin">
            Не удалось загрузить данные (ошибка сети или сервера).{" "}
            <button onClick={() => ov.refetch()} className="foc underline">Повторить</button>
          </p>
        )}
        {section === "overview" && <Overview onGo={setSection} />}
        {section === "orders" && <Orders />}
        {section === "members" && <Members />}
        {section === "content" && <Content />}
        {section === "audit" && <AuditLog />}
      </main>
    </div>
  );
}
