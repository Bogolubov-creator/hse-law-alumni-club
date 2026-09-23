import { prepareTelegram } from "./telegram/bridge.js";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App.js";
import { ToastProvider } from "./components/Toast.js";
import { isMirror, publicUrl, routerBasename } from "./lib/public-url.js";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
});

// PWA: на зеркале Pages SW отключён (офлайн-страница всё равно с относительными
// путями). В проде register под Vite base; sw.js изолирует кэш по scope.
const serviceWorker = navigator.serviceWorker;
const enableSw =
  !isMirror &&
  (import.meta.env.PROD || import.meta.env.VITE_ENABLE_SW === "true");
if (serviceWorker && enableSw) {
  window.addEventListener("load", () => {
    serviceWorker.register(publicUrl("sw.js")).catch(() => { /* не критично */ });
  });
}

async function start() {
  await prepareTelegram();
  // Перехват должен быть готов до первых запросов React; обычная сборка его не включает.
  if (import.meta.env.VITE_MIRROR === "true") {
    const { installMirrorFetch } = await import("./lib/mirror.js");
    installMirrorFetch();
  }
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter basename={routerBasename()}>
          <ToastProvider>
            <App />
          </ToastProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </React.StrictMode>,
  );
}

void start();
