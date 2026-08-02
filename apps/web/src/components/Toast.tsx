import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type Show = (msg: string, kind?: "ok" | "err") => void;
const ToastCtx = createContext<Show>(() => {});
export const useToast = (): Show => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
  const timer = useRef<number>();
  const show = useCallback<Show>((msg, kind = "ok") => {
    window.clearTimeout(timer.current); // таймер прежнего тоста не гасит новый
    setToast({ msg, kind });
    timer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {/* Live-region смонтирован постоянно (меняется только текст) – иначе скринридеры
          часто не озвучивают ПЕРВЫЙ тост, появившийся вместе с самим регионом. */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={toast
          ? { position: "fixed", left: "50%", bottom: 24, transform: "translateX(-50%)", zIndex: 200, background: toast.kind === "err" ? "#B5331B" : "#14181F", color: "#FBF3E8", padding: "12px 22px", borderRadius: 999, fontWeight: 600, fontSize: 14, boxShadow: "0 18px 40px -16px rgba(0,0,0,.5)", maxWidth: "90vw", textAlign: "center" }
          : { position: "fixed", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", clipPath: "inset(50%)", whiteSpace: "nowrap" }}
      >
        {toast?.msg ?? ""}
      </div>
    </ToastCtx.Provider>
  );
}
