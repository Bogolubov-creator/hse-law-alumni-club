import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api.js";
import { useLkTokens, lkSurface } from "../../lib/lk-theme.js";
import { TOKEN_KEY, mono, disp } from "./shared.js";

/** Чек-лист новичка: 4 шага освоиться в клубе. Прячется, когда всё сделано
    (или после «Скрыть» — localStorage). Состояния собираются из уже
    существующих источников: /me, /me/tg-link, /events, PushManager. */
export function NewbieChecklist({ me }: { me: import("../../lib/api.js").Me }) {
  const t = useLkTokens();
  const surface = lkSurface(t);
  const tok = localStorage.getItem(TOKEN_KEY) ?? "";
  const [hidden, setHidden] = useState(() => localStorage.getItem("club_checklist_done") === "1");
  const [pushOn, setPushOn] = useState<boolean | null>(null);
  const tg = useQuery({ queryKey: ["tg-link"], queryFn: () => apiGet<{ linked: boolean }>("/me/tg-link", tok), staleTime: 60_000 });
  const evq = useQuery({ queryKey: ["events", tok], queryFn: () => apiGet<{ my_rsvp: boolean; my_attended: boolean }[]>("/events", tok), staleTime: 60_000 });

  useEffect(() => {
    void (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) { setPushOn(null); return; }
      try {
        const reg = await navigator.serviceWorker.ready;
        setPushOn(!!(await reg.pushManager.getSubscription()) && Notification.permission === "granted");
      } catch { setPushOn(null); }
    })();
  }, []);

  if (hidden) return null;
  const profileDone = !!me.alumni.avatar || (me.alumni.interests?.length ?? 0) > 0;
  const eventDone = (evq.data ?? []).some((e) => e.my_rsvp || e.my_attended);
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
  const items: { label: string; done: boolean; hint: string; action: () => void }[] = [
    { label: "Заполнить профиль", done: profileDone, hint: "фото или интересы — вас найдут однокурсники", action: () => { window.location.href = "/lk/profile"; } },
    ...(pushOn === null ? [] : [{ label: "Включить уведомления", done: pushOn, hint: "заявки в друзья и анонсы — сразу на устройство", action: () => scrollTo("push-bell") }]),
    { label: "Привязать Telegram", done: tg.data?.linked ?? false, hint: "бот покажет баллы и календарь", action: () => scrollTo("tg-link") },
    { label: "Записаться на событие", done: eventDone, hint: "за участие начисляются баллы", action: () => { window.location.href = "/events"; } },
  ];
  const doneCnt = items.filter((i) => i.done).length;
  if (doneCnt === items.length) {
    localStorage.setItem("club_checklist_done", "1");
    return null;
  }
  return (
    <div style={{ ...surface, padding: "22px 28px", marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ ...disp, fontWeight: 600, fontSize: 18 }}>Освойтесь в клубе · {doneCnt}/{items.length}</div>
        <button onClick={() => { localStorage.setItem("club_checklist_done", "1"); setHidden(true); }} className="foc" style={{ ...mono, fontSize: 11, color: t.muted, background: "transparent", border: "none", cursor: "pointer" }}>скрыть</button>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: t.progressTrack, overflow: "hidden", marginTop: 12 }}>
        <div style={{ height: "100%", borderRadius: 999, background: "linear-gradient(90deg,#EC5A13,#C9450E)", width: `${Math.round((doneCnt / items.length) * 100)}%`, transition: "width .4s" }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10, marginTop: 16 }}>
        {items.map((it) => (
          <button key={it.label} onClick={it.action} disabled={it.done} className="foc"
            style={{ textAlign: "left", padding: "12px 14px", borderRadius: 12, cursor: it.done ? "default" : "pointer", border: `1.5px solid ${it.done ? "#1F8A5B" : t.ghostBtnBorder}`, background: it.done ? "rgba(31,138,91,.08)" : t.ghostBtnBg, color: t.text }}>
            <div style={{ fontWeight: 600, fontSize: 13.5, color: it.done ? "#1F8A5B" : t.text }}>{it.done ? "✓ " : "○ "}{it.label}</div>
            {!it.done && <div style={{ ...mono, fontSize: 11, color: t.muted, marginTop: 5, lineHeight: 1.4 }}>{it.hint}</div>}
          </button>
        ))}
      </div>
    </div>
  );
}
