import { Link } from "react-router-dom";

// Заглушка для ещё не реализованных экранов (Фазы 2–3).
export default function Stub({ title }: { title: string }) {
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
