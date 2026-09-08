import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App.js";
import { ToastProvider } from "./components/Toast.js";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
});

// PWA: сервис-воркер (прод или явный VITE_ENABLE_SW=true на стенде).
const serviceWorker = navigator.serviceWorker;
const enableSw = import.meta.env.PROD || import.meta.env.VITE_ENABLE_SW === "true";
if (serviceWorker && enableSw) {
  window.addEventListener("load", () => {
    serviceWorker.register("/sw.js").catch(() => { /* не критично */ });
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* future-флаги v7 больше не нужны: с React Router 7 это поведение по умолчанию. */}
      <BrowserRouter>
        <ToastProvider>
          <App />
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
