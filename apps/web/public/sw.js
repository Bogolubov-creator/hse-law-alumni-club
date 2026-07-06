/* Service worker для установки на экран (PWA).
   Стратегия: сеть в приоритете (сайт живой, данные из API), статика /assets —
   из кэша с обновлением в фоне. Никогда не кэшируем /api (персональные данные). */
const CACHE = "club-v3";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/", "/manifest.webmanifest", "/icon-192.png"])));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.pathname.startsWith("/api")) return; // API не трогаем

  // Хешированная статика Vite — кэш навсегда (имя меняется при новой сборке)
  if (url.pathname.startsWith("/assets/") || /\.(png|jpe?g|webp|woff2?)$/.test(url.pathname)) {
    e.respondWith(
      caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })),
    );
    return;
  }

  // Навигация: сеть, при офлайне — закэшированная оболочка
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).catch(() => caches.match("/")));
  }
});

/* Web-push: показать уведомление и открыть нужный раздел по клику. */
self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { title: "Клуб выпускников", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(data.title || "Клуб выпускников", {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: data.url || "/" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) {
      if ("focus" in c) { c.navigate(url); return c.focus(); }
    }
    return clients.openWindow(url);
  }));
});
