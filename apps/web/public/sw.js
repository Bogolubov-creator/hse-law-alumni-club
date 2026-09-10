/* Service worker PWA.
   Сеть в приоритете для HTML; статика – cache-first.
   /api никогда не кэшируем (персональные данные).

   Кэш: поднимайте CACHE (club-vN) при каждом релизе оболочки/статики,
   иначе клиенты держат sticky-кэш. install → skipWaiting; activate →
   clients.claim + удаление чужих club-* кэшей.

   Пути – относительно scope регистрации (корень прода или Vite base).
   На зеркале Pages SW не регистрируется (см. main.tsx). */
const CACHE = "club-v6";
const SCOPE = self.registration.scope;

/** Абсолютный URL внутри scope SW (`offline.html` → …/offline.html). */
function scoped(path) {
  return new URL(String(path).replace(/^\//, ""), SCOPE).href;
}

const PRECACHE = [
  "./",
  "./offline.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./icon-180.png",
  "./icon-152.png",
  "./icon-167.png",
  "./favicon.ico",
  "./fonts/fonts.css",
].map(scoped);

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

/** Pathname без Vite/base prefix (`/club-…/assets/x` → `/assets/x`). */
function pathInScope(pathname) {
  const basePath = new URL(SCOPE).pathname.replace(/\/$/, "");
  if (!basePath) return pathname;
  if (pathname === basePath) return "/";
  if (pathname.startsWith(`${basePath}/`)) return pathname.slice(basePath.length);
  return pathname;
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;
  const path = pathInScope(url.pathname);
  if (path.startsWith("/api")) return;

  // Хешированные ассеты Vite и шрифты/иконки – cache-first
  if (
    path.startsWith("/assets/")
    || path.startsWith("/fonts/")
    || /\.(png|jpe?g|webp|svg|ico|woff2?)$/i.test(path)
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

  // Навигация: сеть → обновить оболочку; офлайн → / или offline.html
  if (e.request.mode === "navigate") {
    const shell = scoped("./");
    const offline = scoped("./offline.html");
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(shell, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() =>
          caches.match(shell).then((r) => r || caches.match(offline)),
        ),
    );
  }
});

self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; }
  catch { data = { title: "Клуб выпускников", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(data.title || "Клуб выпускников", {
    body: data.body || "",
    icon: scoped("./icon-192.png"),
    badge: scoped("./icon-192.png"),
    data: { url: data.url || scoped("./") },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || scoped("./");
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) {
      if ("focus" in c) { c.navigate(url); return c.focus(); }
    }
    return clients.openWindow(url);
  }));
});
