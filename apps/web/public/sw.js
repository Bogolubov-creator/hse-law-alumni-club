/* Service worker PWA.
   Сеть в приоритете для HTML; статика – cache-first.
   /api никогда не кэшируем (персональные данные). */
const CACHE = "club-v4";
const PRECACHE = [
  "/",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/icon-180.png",
  "/favicon.ico",
  "/fonts/fonts.css",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.all(
        PRECACHE.map((u) => c.add(u).catch(() => { /* optional asset */ })),
      ),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api")) return;

  // Хешированные ассеты Vite и шрифты/иконки – cache-first
  if (
    url.pathname.startsWith("/assets/")
    || url.pathname.startsWith("/fonts/")
    || /\.(png|jpe?g|webp|svg|ico|woff2?)$/i.test(url.pathname)
  ) {
    e.respondWith(
      caches.match(e.request).then(
        (hit) =>
          hit
          || fetch(e.request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Навигация: сеть → обновить оболочку; офлайн → /
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put("/", copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match("/").then((r) => r || caches.match("/manifest.webmanifest"))),
    );
  }
});

self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; }
  catch { data = { title: "Клуб выпускников", body: e.data ? e.data.text() : "" }; }
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
