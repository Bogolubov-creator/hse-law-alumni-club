import { Link } from "react-router-dom";
import { useHead } from "../lib/title.js";
import { V2Shell, pageTitle } from "../v2/Shell.js";
import { action, actionGhost } from "../styles/primitives.js";

/** Страница-заглушка для неизвестных адресов: в общей оболочке, честная копия, два выхода. */
export default function Stub({ title }: { title: string }) {
  useHead({ title, noindex: true });
  return (
    <V2Shell>
      <main id="main" style={{ maxWidth: "var(--container)", margin: "0 auto", padding: "var(--rh-section) 28px" }}>
        <h1 style={{ ...pageTitle, fontSize: "var(--t-h1-page)", lineHeight: 1.08, margin: 0 }}>{title}</h1>
        <p style={{ margin: "16px 0 0", maxWidth: "52ch", color: "var(--c-text-2)", lineHeight: 1.5 }}>
          Такой страницы нет – возможно, адрес устарел или в нём опечатка.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 28 }}>
          <Link to="/" className="foc" style={action}>На главную</Link>
          <Link to="/dpo" className="foc" style={actionGhost}>Программы ДПО</Link>
        </div>
      </main>
    </V2Shell>
  );
}
