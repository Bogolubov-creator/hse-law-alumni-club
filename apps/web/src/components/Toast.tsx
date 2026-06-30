import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Show = (msg: string, kind?: "ok" | "err") => void;
const ToastCtx = createContext<Show>(() => {});
export const useToast = (): Show => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
  const show = useCallback<Show>((msg, kind = "ok") => {
    setToast({ msg, kind });
    window.setTimeout(() => setToast(null), 2600);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{ position: "fixed", left: "50%", bottom: 24, transform: "translateX(-50%)", zIndex: 200, background: toast.kind === "err" ? "#B5331B" : "#14181F", color: "#FBF3E8", padding: "12px 22px", borderRadius: 999, fontWeight: 600, fontSize: 14, boxShadow: "0 18px 40px -16px rgba(0,0,0,.5)", maxWidth: "90vw", textAlign: "center" }}
        >
          {toast.msg}
        </div>
      )}
    </ToastCtx.Provider>
  );
}
