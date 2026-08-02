import { useState } from "react";
import { rub } from "../../lib/api.js";
import { ORDER_STATUS_RU } from "@club/shared";
import { useAdminOrders, useAdminMutations, downloadOrdersCsv, type AdminOrder } from "../../lib/admin.js";
import { stPill } from "../ui.js";

const ORDER_FLOW = ["new", "in_progress", "confirmed", "done", "canceled"];

export function Orders() {
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
              {ORDER_FLOW.map((s) => <option key={s} value={s}>{ORDER_STATUS_RU[s]}</option>)}
            </select>
          </div>
          {/* Состав заявки – офис видит позиции без похода в Directus */}
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
