import { DashboardAdmin } from "./DashboardAdmin.js";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ORDER_STATUS_RU } from "@club/shared";
import { mono, label, action, actionGhost, field, Panel, PanelTitle, Pill, Row, Stat } from "./ui.js";
import { useOverview, useAdminOrders, useMembers, useMemberMutations, adminReq, type Member } from "../lib/admin.js";
import { MemberModal } from "./MembersAdmin.js";
import { type Section } from "./common.js";

export function Overview({ onGo }: { onGo: (s: Section) => void }) {
  const ov = useOverview();
  const orders = useAdminOrders({ limit: 5 }); // дашборду хватает пяти строк
  const members = useMembers({ status: "pending", limit: 100 });
  const { patchMember } = useMemberMutations();
  const [sel, setSel] = useState<Member | null>(null);
  const pending = members.data?.items ?? [];
  const d = ov.data;
  const inbox = [
    { key: "orders", count: d?.new_orders ?? 0, title: "Новые заявки", hint: "разобрать статус и оплату", go: "orders" as Section },
    { key: "verify", count: d?.pending_verifications ?? 0, title: "На верификацию", hint: "подтвердить выпуск", go: "members" as Section },
  ].filter((x) => x.count > 0);
  // Вся статистика сайта – одним экраном.
  /**
   * Акцентом помечены только те два числа, по которым офис действует прямо
   * сейчас. Раньше каждый показатель был своего цвета – десять акцентов
   * означают, что акцента нет ни одного.
   */
  const stats = [
    { label: "Новые заявки", value: d?.new_orders ?? 0, act: true },
    { label: "На верификацию", value: d?.pending_verifications ?? 0, act: true },
    { label: "Выпускников", value: d?.alumni_count ?? 0, note: `подтверждено ${d?.alumni_verified ?? 0}` },
    { label: "Заявок всего", value: d?.orders_count ?? 0, note: `оплачено ${d?.orders_paid ?? 0}` },
    { label: "Программ ДПО", value: d?.programs_total ?? 0, note: `актуальный набор ${d?.programs_actual ?? 0}` },
    { label: "Товаров мерча", value: d?.products_count ?? 0 },
    { label: "Новостей", value: d?.news_count ?? 0 },
    { label: "Дружеских связей", value: d?.friendships ?? 0, note: `заявок в друзья ${d?.friend_requests ?? 0}` },
    { label: "Подкастов", value: d?.podcasts_count ?? 0, note: `подписчиков ${d?.podcast_subscribers ?? 0}` },
    { label: "Баллов у выпускников", value: d?.points_total ?? 0 },
  ] as { label: string; value: number; note?: string; act?: boolean }[];
  return (
    <>
      <DashboardAdmin onAnalytics={() => onGo("analytics")} />
      {!d ? <p role="status">{ov.isError ? "Операционная сводка недоступна." : "Загружаем сводку…"}</p> : <>
      <Panel>
        <PanelTitle>Требует действия</PanelTitle>
        {inbox.length === 0 && (
          <p style={{ ...label, margin: "12px 0 0", textTransform: "none", letterSpacing: 0, lineHeight: 1.5 }}>
            Очередь пуста – новых заявок и ожидающих верификации нет.
          </p>
        )}
        {inbox.map((item) => (
          <Row key={item.key} cols="minmax(0,1fr) auto">
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{item.title} · {item.count}</div>
              <div style={{ ...label, marginTop: 4, textTransform: "none", letterSpacing: 0, color: "var(--c-text-2)" }}>{item.hint}</div>
            </div>
            <button type="button" onClick={() => onGo(item.go)} className="foc" style={{ ...action, padding: "10px 14px" }}>открыть</button>
          </Row>
        ))}
      </Panel>

      <div className="adm-stats" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: "0 28px", marginTop: 26 }}>
        {stats.map((s) => <Stat key={s.label} name={s.label} value={s.value} note={s.note} accent={s.act} />)}
      </div>
      <div className="adm-two" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20, marginTop: 26 }}>
        <Panel>
          <PanelTitle right={<button type="button" onClick={() => onGo("orders")} className="foc" style={{ ...label, color: "var(--c-accent-text)", background: "none", border: "none", cursor: "pointer" }}>все →</button>}>
            Последние заявки
          </PanelTitle>
          {(orders.data?.items ?? []).slice(0, 5).map((o) => (
            <Row key={o.id} cols="104px minmax(0, 1fr) auto">
              <span style={{ ...label, fontSize: 10 }}>{o.number}</span>
              <span style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.contact_fio}</span>
              <Pill status={o.status}>{ORDER_STATUS_RU[o.status]}</Pill>
            </Row>
          ))}
          {orders.data?.items.length === 0 && <p style={{ ...label, margin: "12px 0 0", textTransform: "none", letterSpacing: 0 }}>Заявок пока нет.</p>}
        </Panel>

        <Panel>
          <PanelTitle right={<button type="button" onClick={() => onGo("members")} className="foc" style={{ ...label, color: "var(--c-accent-text)", background: "none", border: "none", cursor: "pointer" }}>все →</button>}>
            На верификацию
          </PanelTitle>
          {pending.length === 0 && <p style={{ ...label, margin: 0, textTransform: "none", letterSpacing: 0 }}>Нет ожидающих.</p>}
          {pending.map((m) => (
            <div key={m.id} style={{ padding: "12px 0", borderTop: "1px solid var(--c-line)" }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{m.fio}</div>
              <div style={{ ...label, fontSize: 10, marginTop: 3 }}>
                {[m.email, m.cohort ? `выпуск ${m.cohort}` : null].filter(Boolean).join(" · ") || "анкета без почты"}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                <button type="button" disabled={patchMember.isPending} onClick={() => patchMember.mutate({ id: m.id, verification_status: "verified" })} className="foc" style={{ ...action, flex: 1, textAlign: "center" }}>Подтвердить</button>
                <button type="button" disabled={patchMember.isPending} onClick={() => patchMember.mutate({ id: m.id, verification_status: "rejected" })} className="foc" style={{ ...actionGhost, flex: 1, textAlign: "center", color: "var(--c-danger-text)", borderColor: "var(--c-danger-text)" }}>Отклонить</button>
                <button type="button" onClick={() => setSel(m)} className="foc" style={{ ...actionGhost, flex: 1, textAlign: "center" }}>карточка</button>
              </div>
            </div>
          ))}
        </Panel>
      </div>
      <div className="adm-two" style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 20, marginTop: 20 }}>
        <Panel>
          <PanelTitle right={<button type="button" onClick={() => onGo("content")} className="foc" style={{ ...label, color: "var(--c-accent-text)", background: "none", border: "none", cursor: "pointer" }}>события →</button>}>
            Ближайшее событие
          </PanelTitle>
          {d?.next_event ? (
            <div style={{ paddingTop: 12, borderTop: "1px solid var(--c-line)" }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{d.next_event.title}</div>
              <div style={{ ...label, fontSize: 10, marginTop: 5 }}>
                {new Date(d.next_event.starts_at).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
              </div>
              <div style={{ ...mono, fontSize: 13, marginTop: 10 }}>записались: {d.next_event.rsvps}</div>
            </div>
          ) : (
            <p style={{ ...label, margin: 0, textTransform: "none", letterSpacing: 0, lineHeight: 1.5 }}>Анонсов нет – создайте событие во вкладке «Контент → События».</p>
          )}
        </Panel>
        <PushBroadcast subs={d?.push_subs_count ?? 0} />
      </div>
      {sel && <MemberModal member={sel} onClose={() => setSel(null)} />}
      </>}
    </>
  );
}

function PushBroadcast({ subs }: { subs: number }) {
  const [f, setF] = useState({ title: "", body: "", url: "/events" });
  const [sent, setSent] = useState<string | null>(null);
  const send = useMutation({
    mutationFn: () => adminReq<{ ok: boolean; subscribers: number }>("POST", "/admin/push/broadcast", f),
    onSuccess: (r) => { setSent(`Отправлено на ${r.subscribers} устройств ✓`); setF({ title: "", body: "", url: "/events" }); },
    onError: (e) => setSent((e as Error).message),
  });
  const valid = f.title.trim().length >= 3 && f.body.trim().length >= 3 && /^\/[a-z0-9\-\/]*$/i.test(f.url);
  const blocked = !valid || send.isPending || subs === 0;
  return (
    <Panel>
      <PanelTitle>Пуш-рассылка</PanelTitle>
      <p style={{ ...label, margin: "0 0 12px", textTransform: "none", letterSpacing: 0, lineHeight: 1.5 }}>
        Уйдёт на {subs} подписанных устройств. Действие попадает в журнал безопасности.
      </p>
      <div className="adm-push" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 170px", gap: 10, paddingTop: 12, borderTop: "1px solid var(--c-line)" }}>
        <input aria-label="Заголовок пуш-уведомления" value={f.title} onChange={(e) => setF((s) => ({ ...s, title: e.target.value }))} placeholder="Заголовок (например: Новое событие)" className="foc" style={field} />
        <input aria-label="Текст пуш-уведомления" value={f.body} onChange={(e) => setF((s) => ({ ...s, body: e.target.value }))} placeholder="Текст уведомления" className="foc" style={field} />
        <input aria-label="Ссылка, куда ведёт уведомление" value={f.url} onChange={(e) => setF((s) => ({ ...s, url: e.target.value }))} placeholder="/events" className="foc" style={{ ...field, ...mono }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12, marginTop: 14 }}>
        {/* Заблокированная кнопка называет причину, а не молчит бледной охрой */}
        <button disabled={blocked} onClick={() => send.mutate()} className="foc"
          style={blocked
            ? { ...actionGhost, cursor: send.isPending ? "wait" : "not-allowed", color: "var(--c-text-3)" }
            : action}>
          {send.isPending ? "Отправляем…" : subs === 0 ? "Подписчиков пока нет" : !valid ? "Заполните заголовок и текст" : "Отправить всем"}
        </button>
        {sent && <span role="status" style={{ ...mono, fontSize: "var(--t-caption)", color: "var(--c-ok-text)" }}>{sent}</span>}
      </div>
    </Panel>
  );
}
