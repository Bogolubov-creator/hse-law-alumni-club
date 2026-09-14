import { useState } from "react";
import { rub } from "../lib/api.js";
import { ORDER_STATUS_RU } from "@club/shared";
import { mono, label, actionGhost, field, statusTone } from "./ui.js";
import { useAdminOrders, useOrderMutations, downloadOrdersCsv, type AdminOrder } from "../lib/admin.js";

export const ORDER_FLOW = ["new", "in_progress", "confirmed", "done", "canceled", "expired"];

export const ORDERS_PER_PAGE = 50;

export function Orders() {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  // Поиск и фильтр считает сервер: в панели больше нет «последних 100»,
  // видно все заявки постранично.
  const orders = useAdminOrders({ q: q.trim() || undefined, status: statusFilter || undefined, page, limit: ORDERS_PER_PAGE });
  const { setOrderStatus } = useOrderMutations();
  const [csvBusy, setCsvBusy] = useState(false);
  const list = orders.data?.items ?? [];
  const total = orders.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / ORDERS_PER_PAGE));
  // Смена запроса/фильтра всегда возвращает на первую страницу – иначе пустой
  // экран «страница 7» при выборке из трёх заявок.
  const resetTo = (fn: () => void) => { fn(); setPage(1); };
  const exportCsv = async () => {
    setCsvBusy(true);
    try { await downloadOrdersCsv(); } catch { alert("Не удалось выгрузить CSV"); } finally { setCsvBusy(false); }
  };
  return (
    <>
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 16 }}>
      <input aria-label="Поиск по заявкам" value={q} onChange={(e) => resetTo(() => setQ(e.target.value))}
        placeholder="Номер, ФИО, телефон, почта…" className="foc" style={{ ...field, width: 280, maxWidth: "100%" }} />
      <select value={statusFilter} onChange={(e) => resetTo(() => setStatusFilter(e.target.value))} aria-label="Фильтр по статусу" className="foc" style={field}>
        <option value="">Все статусы</option>
        {ORDER_FLOW.map((s) => <option key={s} value={s}>{ORDER_STATUS_RU[s]}</option>)}
      </select>
      <span style={label}>всего: {total}</span>
      <button onClick={exportCsv} disabled={csvBusy} className="foc" style={{ ...actionGhost, marginLeft: "auto", cursor: csvBusy ? "wait" : "pointer" }}>
        {csvBusy ? "Готовим…" : "Выгрузить CSV"}
      </button>
    </div>

    <div>
      {/* Шапка описи: те же колонки, что и у записей ниже */}
      <div className="adm-order-head" style={{ display: "grid", gridTemplateColumns: "108px 1fr 1fr 172px 152px", gap: 14, padding: "0 0 10px" }}>
        <span style={label}>номер</span><span style={label}>клиент</span><span style={label}>контакты</span><span style={label}>сумма</span><span style={label}>статус</span>
      </div>

      {list.map((o: AdminOrder) => (
        <div key={o.id} style={{ padding: "12px 0", borderTop: "1px solid var(--c-line)" }}>
          <div className="adm-order" style={{ display: "grid", gridTemplateColumns: "108px 1fr 1fr 172px 152px", gap: 14, alignItems: "center" }}>
            <span style={{ ...label, fontSize: 10 }}>{o.number}</span>
            <span style={{ fontSize: 14, fontWeight: 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.contact_fio}</span>
            <span style={{ ...mono, fontSize: 12, color: "var(--c-text-3)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.contact_phone}</span>
            <span style={{ ...mono, fontSize: 13, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
              {rub(o.total_estimate)}
              {/* Вебхук ЮKassa пометил заявку: пришла не та сумма. Молча оставлять нельзя. */}
              {o.payment_status === "review" && (
                <span title="Оплата пришла на другую сумму – проверьте вручную"
                  style={{ ...mono, fontSize: 10, letterSpacing: "var(--tr-data)", color: "var(--c-danger-text)", border: "1px solid var(--c-danger-text)", borderRadius: 999, padding: "2px 7px", whiteSpace: "nowrap" }}>сумма ≠</span>
              )}
              {o.payment_status === "succeeded" && (
                <span style={{ ...label, fontSize: 10, color: "var(--c-ok-text)", whiteSpace: "nowrap" }}>оплачено</span>
              )}
            </span>
            <select aria-label={`Статус заявки ${o.number}`} value={o.status}
              onChange={(e) => setOrderStatus.mutate({ id: o.id, status: e.target.value })} className="foc"
              style={{ ...mono, fontSize: 11, letterSpacing: "var(--tr-data)", padding: "6px 10px", borderRadius: 999,
                border: `1px solid ${statusTone(o.status).border}`, color: statusTone(o.status).color,
                background: "transparent", cursor: "pointer" }}>
              {ORDER_FLOW.map((s) => <option key={s} value={s}>{ORDER_STATUS_RU[s]}</option>)}
            </select>
          </div>
          {/* Состав заявки – офис видит позиции без похода в Directus */}
          {(o.items_json?.length || o.address || o.comment) && (
            <div className="adm-order-items" style={{ ...mono, fontSize: 11, lineHeight: 1.6, color: "var(--c-text-3)", marginTop: 6, paddingLeft: 122 }}>
              {o.items_json?.map((i) => `${i.title}${i.variant_sku ? ` (${i.variant_sku})` : ""} ×${i.qty}`).join("; ")}
              {o.address ? ` · доставка: ${o.address}` : ""}
              {o.comment ? ` · «${o.comment}»` : ""}
            </div>
          )}
        </div>
      ))}
      {list.length > 0 && <div style={{ borderTop: "1px solid var(--c-line)" }} />}
      {!orders.isLoading && list.length === 0 && (
        <p style={{ ...label, textTransform: "none", letterSpacing: 0, textAlign: "center", padding: "40px 0", borderTop: "1px solid var(--c-line)" }}>
          {q || statusFilter ? "По запросу ничего не найдено." : "Заявок нет."}
        </p>
      )}
    </div>

    {pages > 1 && (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginTop: 20 }}>
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="foc" style={{ ...actionGhost, opacity: page <= 1 ? 0.4 : 1 }}>← назад</button>
        <span style={label}>стр. {page} из {pages}</span>
        <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages} className="foc" style={{ ...actionGhost, opacity: page >= pages ? 0.4 : 1 }}>вперёд →</button>
      </div>
    )}
    </>
  );
}
