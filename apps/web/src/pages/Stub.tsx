import { Link } from "react-router-dom";
import { useHead } from "../lib/title.js";

// Заглушка для ненайденных/будущих экранов. noindex: soft-404 не должен индексироваться
// (SPA отдаёт index.html с HTTP 200, поэтому закрываем на уровне meta для Googlebot).
export default function Stub({ title }: { title: string }) {
  useHead({ title, noindex: true });
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-start justify-center px-6">
      <p className="font-mono text-xs uppercase tracking-[0.16em] text-ohra">Клуб выпускников факультета права Вышки</p>
      <h1 className="mt-3 font-display text-4xl font-extrabold">{title}</h1>
      <p className="mt-4 text-grafit-soft">Этот раздел скоро появится.</p>
      <Link to="/" className="foc mt-6 font-display text-sm font-bold text-ohra-deep">
        ← На главную
      </Link>
    </main>
  );
}
