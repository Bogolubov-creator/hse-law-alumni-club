import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App.js";
import { ToastProvider } from "./components/Toast.js";
import { installMirrorFetch } from "./lib/mirror.js";
import { isMirror, publicUrl, routerBasename } from "./lib/public-url.js";
import "./index.css";

installMirrorFetch();

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
});

// PWA: на зеркале Pages SW отключён (офлайн-страница всё равно с относительными
// путями). В проде register под Vite base; sw.js сам резолвит scope (club-v6).
const serviceWorker = navigator.serviceWorker;
const enableSw =
  !isMirror &&
  (import.meta.env.PROD || import.meta.env.VITE_ENABLE_SW === "true");
if (serviceWorker && enableSw) {
  window.addEventListener("load", () => {
    serviceWorker.register(publicUrl("sw.js")).catch(() => { /* не критично */ });
  });
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
