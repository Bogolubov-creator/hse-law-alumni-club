import { useId } from "react";
import Modal from "../components/Modal.js";
import { label, field, Panel } from "./ui.js";

export const VERIF: Record<string, string> = { pending: "На проверке", verified: "Верифицирован", rejected: "Отклонён" };

export type Section = "overview" | "analytics" | "orders" | "members" | "subs" | "content" | "audit" | "support";

export function Card({ children }: { children: React.ReactNode }) {
  return <Panel>{children}</Panel>;
}

export const CATALOG_STATUS: Record<string, string> = { published: "На витрине", draft: "Черновик", archived: "Архив" };

export function StatusToggle({ status, onSet, busy }: { status: string; onSet: (s: string) => void; busy: boolean }) {
  return (
    <select aria-label="Статус публикации" value={status} disabled={busy} onChange={(e) => onSet(e.target.value)} className={`foc rounded-full border-none px-3 py-1.5 font-mono text-[11px] ${status === "published" ? "bg-[rgba(31,138,91,.14)] text-[var(--c-ok-text)]" : status === "draft" ? "bg-[rgba(46,111,174,.14)] text-[var(--c-link)]" : "bg-[rgba(107,114,128,.14)] text-[var(--c-text-3)]"}`}>
      {Object.entries(CATALOG_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  );
}

export function ConfirmDelete({ title, hint, busy, onCancel, onConfirm }: { title: string; hint: string; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
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

export function FormField({ label: name, value, onChange, ph, required, textarea }: { label: string; value: string; onChange: (v: string) => void; ph?: string; required?: boolean; textarea?: boolean }) {
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
