import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../../lib/api.js";
import { useToast } from "../../components/Toast.js";
import { useLkTokens, lkSurface } from "../../lib/lk-theme.js";
import { TOKEN_KEY, mono, disp } from "./shared.js";

/** Кнопка «🔔 Включить уведомления»: подписывает браузер на web-push (заявки в
    друзья, события, подкасты). Прячется, если пуши не сконфигурированы на
    сервере или браузер их не умеет (например, Safari без установки на экран). */
export function PushBell() {
  const t = useLkTokens();
  const surface = lkSurface(t);
  const toast = useToast();
  const [state, setState] = useState<"hidden" | "off" | "on" | "busy">("hidden");

  useEffect(() => {
    void (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
      try {
        const cfg = await apiGet<{ enabled: boolean; key: string | null }>("/push/vapid");
        if (!cfg.enabled || !cfg.key) return;
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setState(sub && Notification.permission === "granted" ? "on" : "off");
      } catch {
        /* API недоступен – просто не показываем кнопку */
      }
    })();
  }, []);

  if (state === "hidden") return null;

  const b64ToU8 = (b64: string) => {
    const pad = "=".repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  };

  const enable = async () => {
    setState("busy");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { toast("Уведомления запрещены в браузере", "err"); setState("off"); return; }
      const cfg = await apiGet<{ enabled: boolean; key: string | null }>("/push/vapid");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(cfg.key!) });
      const j = sub.toJSON();
      await apiPost("/me/push/subscribe", { endpoint: sub.endpoint, keys: j.keys }, undefined, localStorage.getItem(TOKEN_KEY) ?? undefined);
      setState("on");
      toast("Уведомления включены ✓");
    } catch {
      toast("Не удалось включить уведомления", "err");
      setState("off");
    }
  };

  const disable = async () => {
    setState("busy");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await apiPost("/me/push/unsubscribe", { endpoint: sub.endpoint }, undefined, localStorage.getItem(TOKEN_KEY) ?? undefined).catch(() => undefined);
        await sub.unsubscribe();
      }
      setState("off");
      toast("Уведомления выключены");
    } catch {
      setState("on");
    }
  };

  return (
    <div style={{ ...surface, padding: "20px 28px", marginTop: 22, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
      <div>
        <div style={{ ...disp, fontWeight: 600, fontSize: 17 }}>🔔 Уведомления клуба</div>
        <div style={{ ...mono, fontSize: 12, color: t.muted, marginTop: 5 }}>Заявки в друзья, новые события и подкасты – сразу на устройство</div>
      </div>
      {state === "on" ? (
        <button onClick={disable} className="foc" style={{ fontWeight: 600, fontSize: 14, padding: "11px 20px", borderRadius: 12, border: "1.5px solid #1F8A5B", background: t.ghostBtnBg, color: "#1F8A5B", cursor: "pointer", flex: "none" }}>Включены ✓ (выключить)</button>
      ) : (
        <button onClick={enable} disabled={state === "busy"} className="foc" style={{ fontWeight: 600, fontSize: 14, padding: "11px 20px", borderRadius: 12, border: "none", background: "#EC5A13", color: "#FBF3E8", cursor: state === "busy" ? "wait" : "pointer", flex: "none" }}>{state === "busy" ? "Включаем…" : "Включить уведомления"}</button>
      )}
    </div>
  );
}
