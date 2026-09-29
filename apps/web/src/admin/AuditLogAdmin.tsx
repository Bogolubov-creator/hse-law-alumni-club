import { useState } from "react";
import { useAuditLog, type AuditEntry } from "../lib/admin.js";

export const AUDIT_RU: Record<string, { label: string; icon: string; group: string }> = {
  "login.ok": { label: "Вход выпускника", icon: "🔓", group: "Входы" },
  "login.fail": { label: "Неудачный вход", icon: "⚠️", group: "Входы" },
  "login.locked": { label: "Вход заблокирован (перебор)", icon: "⛔", group: "Входы" },
  "admin.login.ok": { label: "Вход администратора", icon: "🔐", group: "Входы" },
  "admin.login.fail": { label: "Неудачный вход админа", icon: "⚠️", group: "Входы" },
  "admin.login.locked": { label: "Вход админа заблокирован", icon: "⛔", group: "Входы" },
  "register": { label: "Заявка на вступление", icon: "🎓", group: "Входы" },
  "password.forgot": { label: "Запрос восстановления пароля", icon: "🔁", group: "Входы" },
  "password.reset": { label: "Пароль изменён", icon: "🔑", group: "Входы" },
  "payment.succeeded": { label: "Оплата прошла", icon: "💳", group: "Платежи" },
  "payment.canceled": { label: "Оплата отменена", icon: "↩️", group: "Платежи" },
  "payment.webhook.badip": { label: "Webhook с чужого IP (отклонён)", icon: "🛡️", group: "Платежи" },
  "order.created": { label: "Создана заявка", icon: "🧾", group: "Заявки" },
  "order.status": { label: "Смена статуса заявки", icon: "📋", group: "Заявки" },
  "orders.export": { label: "Выгрузка заявок в CSV", icon: "📤", group: "Заявки" },
  "member.patch": { label: "Изменение выпускника", icon: "👤", group: "Изменения" },
  "podcast.sub.grant": { label: "Выдана подписка на подкасты", icon: "🎧", group: "Платежи" },
  "podcast.sub.request": { label: "Запрошена подписка", icon: "🎧", group: "Платежи" },
  "avatar.upload": { label: "Загружено фото профиля", icon: "🖼️", group: "Изменения" },
  "avatar.reject": { label: "Отклонён файл аватара (не изображение)", icon: "🚫", group: "Изменения" },
  "admin.logout": { label: "Выход администратора", icon: "🔒", group: "Входы" },
  // Контент витрин: раньше правки цен и публикаций не логировались вовсе.
  "program.create": { label: "Добавлена программа ДПО", icon: "🎓", group: "Изменения" },
  "program.patch": { label: "Изменена программа ДПО", icon: "🎓", group: "Изменения" },
  "program.delete": { label: "Удалена программа ДПО", icon: "🗑️", group: "Изменения" },
  "product.create": { label: "Добавлен товар", icon: "🧢", group: "Изменения" },
  "product.patch": { label: "Изменён товар (цена/остаток)", icon: "🧢", group: "Изменения" },
  "product.delete": { label: "Удалён товар", icon: "🗑️", group: "Изменения" },
  "news.create": { label: "Опубликована новость", icon: "📰", group: "Изменения" },
  "news.patch": { label: "Изменена новость", icon: "📰", group: "Изменения" },
  "news.delete": { label: "Удалена новость", icon: "🗑️", group: "Изменения" },
  "timeline.create": { label: "Добавлен пункт истории", icon: "📜", group: "Изменения" },
  "timeline.patch": { label: "Изменён пункт истории", icon: "📜", group: "Изменения" },
  "timeline.delete": { label: "Удалён пункт истории", icon: "🗑️", group: "Изменения" },
  "podcast.create": { label: "Добавлен подкаст", icon: "🎙️", group: "Изменения" },
  "podcast.patch": { label: "Изменён подкаст", icon: "🎙️", group: "Изменения" },
  "podcast.delete": { label: "Удалён подкаст", icon: "🗑️", group: "Изменения" },
  "page.patch": { label: "Изменено наполнение страницы", icon: "📝", group: "Изменения" },
  "catalog.dpo_sync": { label: "Синхронизация каталога ДПО", icon: "🔄", group: "Изменения" },
  "member.points": { label: "Ручное начисление баллов", icon: "⭐", group: "Изменения" },
  "friend.decline": { label: "Отклонена заявка в друзья", icon: "🙅", group: "Изменения" },
  "friend.remove": { label: "Удаление из друзей", icon: "🙅", group: "Изменения" },
  "payment.amount_mismatch": { label: "Оплата на другую сумму – проверить", icon: "🚨", group: "Платежи" },
  "password.reset.replay": { label: "Повторное использование ссылки сброса", icon: "⛔", group: "Входы" },
  "event.patch": { label: "Изменено событие", icon: "📅", group: "Изменения" },
  "event.delete": { label: "Удалено событие", icon: "🗑️", group: "Изменения" },
  "points.service": { label: "Служебное начисление баллов", icon: "⭐", group: "Изменения" },
  "push.sub.reassign": { label: "Пуш-подписка переназначена (общее устройство)", icon: "📱", group: "Изменения" },
};

export const AUDIT_GROUPS = ["Все", "Входы", "Платежи", "Заявки", "Изменения"];

export function AuditLog() {
  const log = useAuditLog();
  const [group, setGroup] = useState("Все");
  const [q, setQ] = useState("");
  const rows = (log.data ?? []).filter((r) => {
    const meta = AUDIT_RU[r.event];
    if (group !== "Все" && (meta?.group ?? "Изменения") !== group) return false;
    if (!q.trim()) return true;
    const hay = `${r.event} ${meta?.label ?? ""} ${r.actor ?? ""} ${r.subject ?? ""} ${r.ip ?? ""}`.toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  });
  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "–";

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {AUDIT_GROUPS.map((g) => (
          <button key={g} onClick={() => setGroup(g)} className={`foc rounded-full px-3.5 py-2 text-[13px] font-semibold ${group === g ? "bg-[var(--c-accent)] text-[var(--c-on-accent)]" : "border border-[var(--c-line)] text-[var(--c-text-2)]"}`}>{g}</button>
        ))}
        <input aria-label="Поиск по журналу безопасности" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск: email, IP, номер заявки…" className="foc ml-auto w-72 max-w-full rounded-[11px] border-[1.5px] border-[var(--c-line)] px-3.5 py-2 text-sm outline-none focus:border-ohra" />
      </div>
      <div className="overflow-hidden rounded-[18px] border border-[var(--c-line)] bg-[var(--c-bg-raised)]">
        <div className="grid grid-cols-[110px_1fr_1fr_1fr_120px] gap-3 bg-[var(--c-bg-sunken)] px-6 py-3.5 font-mono text-[11px] uppercase tracking-wide text-[var(--c-text-3)]">
          <span>Когда</span><span>Событие</span><span>Кто</span><span>Объект</span><span>IP</span>
        </div>
        {log.isLoading && <p className="p-8 text-center font-mono text-sm text-[var(--c-text-3)]">Загрузка…</p>}
        {rows.map((r: AuditEntry) => {
          const meta = AUDIT_RU[r.event];
          const danger = r.event.includes("fail") || r.event.includes("locked") || r.event.includes("badip");
          return (
            <div key={r.id} title={r.detail ? JSON.stringify(r.detail) : undefined} className="grid grid-cols-[110px_1fr_1fr_1fr_120px] items-center gap-3 border-t border-[var(--c-line)] px-6 py-3 text-sm">
              <span className="font-mono text-[12px] text-[var(--c-text-3)]">{fmt(r.created_at)}</span>
              <span className={`font-semibold ${danger ? "text-[var(--c-danger-text)]" : ""}`}>{meta?.icon ?? "•"} {meta?.label ?? r.event}</span>
              <span className="min-w-0 truncate font-mono text-[12px] text-[var(--c-text-3)]">{r.actor ?? "–"}</span>
              <span className="min-w-0 truncate font-mono text-[12px] text-[var(--c-text-3)]">{r.subject ?? "–"}</span>
              <span className="font-mono text-[12px] text-[var(--c-text-3)]">{r.ip ?? "–"}</span>
            </div>
          );
        })}
        {!log.isLoading && rows.length === 0 && <p className="p-8 text-center font-mono text-sm text-[var(--c-text-3)]">Записей не найдено.</p>}
      </div>
      <p className="mt-3 font-mono text-[11px] text-[var(--c-text-3)]">Последние 300 событий · обновляется раз в минуту · наведите на строку, чтобы увидеть детали.</p>
    </>
  );
}
