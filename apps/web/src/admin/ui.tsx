import { useId } from "react";
import Modal from "../components/Modal.js";

export type Section = "overview" | "orders" | "members" | "content" | "audit";

const CATALOG_STATUS: Record<string, string> = { published: "На витрине", draft: "Черновик", archived: "Архив" };

export const stPill = (s: string) =>
  s === "new" || s === "pending" ? "bg-[rgba(236,90,19,.14)] text-ohra-deep"
    : s === "in_progress" ? "bg-[rgba(46,111,174,.14)] text-[#2E6FAE]"
      : s === "confirmed" || s === "verified" || s === "done" ? "bg-[rgba(31,138,91,.14)] text-[#1F8A5B]"
        : "bg-[rgba(181,51,27,.12)] text-karmin";

export function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[18px] border border-[#E5E7EB] bg-white p-6">{children}</div>;
}

export function StatusToggle({ status, onSet, busy }: { status: string; onSet: (s: string) => void; busy: boolean }) {
  return (
    <select value={status} disabled={busy} onChange={(e) => onSet(e.target.value)} className={`foc rounded-full border-none px-3 py-1.5 font-mono text-[11px] ${status === "published" ? "bg-[rgba(31,138,91,.14)] text-[#1F8A5B]" : status === "draft" ? "bg-[rgba(46,111,174,.14)] text-[#2E6FAE]" : "bg-[rgba(107,114,128,.14)] text-grafit-soft"}`}>
      {Object.entries(CATALOG_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  );
}

export function ConfirmDelete({ title, hint, busy, onCancel, onConfirm }: { title: string; hint: string; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
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

export function FormField({ label, value, onChange, ph, required, textarea }: { label: string; value: string; onChange: (v: string) => void; ph?: string; required?: boolean; textarea?: boolean }) {
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
