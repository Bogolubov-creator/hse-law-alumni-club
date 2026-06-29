import { useEffect, useState } from "react";
import { LEVELS } from "@club/shared";
import AdminApp from "./admin/AdminApp.js";

type Ready = { status: string; directus?: { ok: boolean; levelsSeeded?: number; serviceUser?: string | null } };

function useHash() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

export default function App() {
  const hash = useHash();
  if (hash.startsWith("#/admin")) return <AdminApp />;
  return <Phase0Stub />;
}

// Заглушка Фазы 0: проверяет связку web → Caddy → api → Directus и импорт @club/shared.
// Реальные экраны рисует Claude Design в следующих фазах.
function Phase0Stub() {
  const [ready, setReady] = useState<Ready | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ready")
      .then((r) => r.json())
      .then(setReady)
      .catch((e) => setErr(String(e)));
  }, []);

  const ok = ready?.directus?.ok;

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="font-display text-xs uppercase tracking-[0.22em] text-ohra-deep">НИУ ВШЭ · Факультет права</p>
      <h1 className="mt-3 font-display text-4xl font-extrabold leading-tight">
        Клуб выпускников <span className="text-ohra">факультета права</span>
      </h1>
      <p className="mt-4 max-w-xl text-grafit-soft">
        Каркас Фазы 0. Эта страница — техническая заглушка: подтверждает, что стек поднят и связан.
      </p>

      <section className="mt-10 rounded-card border border-grafit/10 bg-white p-6 shadow-sm">
        <h2 className="font-display text-lg font-bold">Статус стека</h2>
        {err && <p className="mt-3 text-karmin">Ошибка запроса /api/ready: {err}</p>}
        {!err && !ready && <p className="mt-3 text-grafit-soft">Проверяем связь с API…</p>}
        {ready && (
          <ul className="mt-3 space-y-1 font-body text-sm">
            <li>api /ready: <b className={ok ? "text-ohra-deep" : "text-karmin"}>{ready.status}</b></li>
            <li>Directus: <b className={ok ? "text-ohra-deep" : "text-karmin"}>{ok ? "подключён" : "недоступен"}</b></li>
            <li>Уровней засеяно: <b>{ready.directus?.levelsSeeded ?? 0}</b></li>
            <li>Сервисный пользователь: <b>{ready.directus?.serviceUser ?? "—"}</b></li>
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-card border border-grafit/10 bg-white p-6 shadow-sm">
        <h2 className="font-display text-lg font-bold">Уровни членства (из @club/shared)</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {LEVELS.map((l) => (
            <div key={l.key} className="rounded-soft bg-kost-2 p-3">
              <div className="font-display text-sm font-bold">{l.title}</div>
              <div className="text-xs text-grafit-soft">от {l.min_points} баллов</div>
              <div className="mt-1 font-display text-lg text-ohra">{l.discount_percent}%</div>
            </div>
          ))}
        </div>
      </section>

      <a href="#/admin" className="mt-6 inline-block font-display text-sm font-bold text-ohra-deep">
        → Админка офиса
      </a>
    </main>
  );
}
