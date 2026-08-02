import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ORDER_STATUS_RU } from "@club/shared";
import { useOverview, useAdminOrders, useMembers, useAdminMutations, adminReq } from "../../lib/admin.js";
import { Card, stPill, type Section } from "../ui.js";

export function Overview({ onGo }: { onGo: (s: Section) => void }) {
  const ov = useOverview();
  const orders = useAdminOrders();
  const members = useMembers({ status: "pending", limit: 100 });
  const { patchMember } = useAdminMutations();
  const pending = members.data?.items ?? [];
  const d = ov.data;
  // Вся статистика сайта – одним экраном.
  const stats = [
    { label: "Новые заявки", value: d?.new_orders ?? 0, color: "#EC5A13" },
    { label: "На верификацию", value: d?.pending_verifications ?? 0, color: "#a07d2e" },
    { label: "Выпускников", value: d?.alumni_count ?? 0, color: "#11296B", note: `подтверждено ${d?.alumni_verified ?? 0}` },
    { label: "Заявок всего", value: d?.orders_count ?? 0, color: "#1F8A5B", note: `оплачено ${d?.orders_paid ?? 0}` },
    { label: "Программ ДПО", value: d?.programs_total ?? 0, color: "#2E6FAE", note: `актуальный набор ${d?.programs_actual ?? 0}` },
    { label: "Товаров мерча", value: d?.products_count ?? 0, color: "#C9450E" },
    { label: "Новостей", value: d?.news_count ?? 0, color: "#2C6E80" },
    { label: "Дружеских связей", value: d?.friendships ?? 0, color: "#C49A45", note: `заявок в друзья ${d?.friend_requests ?? 0}` },
    { label: "Подкастов", value: d?.podcasts_count ?? 0, color: "#B5331B", note: `подписчиков ${d?.podcast_subscribers ?? 0}` },
    { label: "Баллов у выпускников", value: d?.points_total ?? 0, color: "#14181F" },
  ] as { label: string; value: number; color: string; note?: string }[];
  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <div className="font-mono text-[11px] text-grafit-soft">{s.label}</div>
            <div className="mt-2 font-display text-4xl font-extrabold" style={{ color: s.color }}>{s.value}</div>
            {s.note && <div className="mt-1 font-mono text-[11px] text-grafit-soft">{s.note}</div>}
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
              <span className={`rounded-full px-2.5 py-1 font-mono text-[11px] ${stPill(o.status)}`}>{ORDER_STATUS_RU[o.status]}</span>
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
                <button disabled={patchMember.isPending} onClick={() => patchMember.mutate({ id: m.id, verification_status: "verified" })} className="foc flex-1 rounded-[9px] bg-[#1F8A5B] py-2 text-[13px] font-semibold text-white disabled:opacity-60">Подтвердить</button>
                <button disabled={patchMember.isPending} onClick={() => patchMember.mutate({ id: m.id, verification_status: "rejected" })} className="foc flex-1 rounded-[9px] border-[1.5px] border-[#E5E7EB] py-2 text-[13px] font-semibold text-karmin disabled:opacity-60">Отклонить</button>
              </div>
            </div>
          ))}
        </Card>
      </div>
      <div className="mt-5 grid grid-cols-[1fr_1.4fr] gap-5 max-md:grid-cols-1">
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <div className="font-display text-lg font-semibold">Ближайшее событие</div>
            <button onClick={() => onGo("content")} className="foc text-[13px] font-semibold text-[#2E6FAE]">К событиям →</button>
          </div>
          {d?.next_event ? (
            <>
              <div className="mt-1 text-sm font-semibold">{d.next_event.title}</div>
              <div className="mt-1.5 font-mono text-[12px] text-grafit-soft">{new Date(d.next_event.starts_at).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</div>
              <div className="mt-3 inline-flex rounded-full bg-[rgba(46,111,174,.12)] px-3 py-1.5 font-mono text-[12px] text-[#2E6FAE]">записались: {d.next_event.rsvps}</div>
            </>
          ) : (
            <p className="mt-3 font-mono text-[12px] text-grafit-soft">Анонсов нет – создайте событие во вкладке «Контент → События».</p>
          )}
        </Card>
        <PushBroadcast subs={d?.push_subs_count ?? 0} />
      </div>
    </>
  );
}

/** Ручная пуш-рассылка: анонс на все подписанные устройства (журналируется). */
function PushBroadcast({ subs }: { subs: number }) {
  const [f, setF] = useState({ title: "", body: "", url: "/events" });
  const [sent, setSent] = useState<string | null>(null);
  const send = useMutation({
    mutationFn: () => adminReq<{ ok: boolean; subscribers: number }>("POST", "/admin/push/broadcast", f),
    onSuccess: (r) => { setSent(`Отправлено на ${r.subscribers} устройств ✓`); setF({ title: "", body: "", url: "/events" }); },
    onError: (e) => setSent((e as Error).message),
  });
  const valid = f.title.trim().length >= 3 && f.body.trim().length >= 3 && /^\/[a-z0-9\-\/]*$/i.test(f.url);
  return (
    <Card>
      <div className="font-display text-lg font-semibold">Пуш-рассылка</div>
      <p className="mt-1 font-mono text-[11px] text-grafit-soft">уйдёт на {subs} подписанных устройств · попадает в журнал безопасности</p>
      <div className="mt-3 grid grid-cols-[1fr_1fr_170px] gap-2.5 max-md:grid-cols-1">
        <input value={f.title} onChange={(e) => setF((s) => ({ ...s, title: e.target.value }))} placeholder="Заголовок (например: Новое событие)" className="foc rounded-[11px] border-[1.5px] border-[#E5E7EB] bg-kost px-3 py-2.5 text-sm" />
        <input value={f.body} onChange={(e) => setF((s) => ({ ...s, body: e.target.value }))} placeholder="Текст уведомления" className="foc rounded-[11px] border-[1.5px] border-[#E5E7EB] bg-kost px-3 py-2.5 text-sm" />
        <input value={f.url} onChange={(e) => setF((s) => ({ ...s, url: e.target.value }))} placeholder="/events" className="foc rounded-[11px] border-[1.5px] border-[#E5E7EB] bg-kost px-3 py-2.5 font-mono text-sm" />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button disabled={!valid || send.isPending || subs === 0} onClick={() => send.mutate()} className="foc rounded-[11px] bg-ohra px-5 py-2.5 text-sm font-semibold text-kost disabled:opacity-50">{send.isPending ? "Отправляем…" : "Отправить всем"}</button>
        {sent && <span className="font-mono text-[12px] text-[#1F8A5B]">{sent}</span>}
        {subs === 0 && <span className="font-mono text-[11px] text-grafit-soft">подписчиков пока нет</span>}
      </div>
    </Card>
  );
}
