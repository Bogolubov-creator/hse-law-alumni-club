const SCOPE = self.registration.scope;
const CACHE_PREFIX = `club-pwa-${encodeURIComponent(SCOPE)}-`;
const CACHE = `${CACHE_PREFIX}v8`;
const PAGES_CACHE = `${CACHE}-pages`;
const MAX_PAGES = 60;
const MAX_ASSETS = 384;
const PAGE_LIFETIME = 7 * 24 * 60 * 60 * 1000;
const BUILT_ASSETS = [];
const PWA_PARAMS = {};

function scoped(path) {
  return new URL(String(path).replace(/^\//, ""), SCOPE).href;
}

const PRECACHE = [
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
  ...BUILT_ASSETS,
].map(scoped);

function pageKey(request) {
  const url = new URL(request.url);
  for (const [name, value] of Object.entries(PWA_PARAMS)) if (url.searchParams.get(name) === value) url.searchParams.delete(name);
  return new Request(url.href);
}

async function put(cache, request, response, limit, pinned = []) {
  await cache.delete(request);
  await cache.put(request, response);
  const keys = await cache.keys();
  await Promise.all(keys.filter(key => !pinned.includes(key.url)).slice(0, Math.max(0, keys.length - limit)).map(key => cache.delete(key)));
}

async function savePage(request, response) {
  if (response.headers.get("X-Club-Offline") !== "public" || !response.ok || response.redirected) return;
  const headers = new Headers(response.headers);
  headers.delete("Content-Encoding");
  headers.delete("Content-Length");
  headers.set("X-Club-Saved-At", String(Date.now()));
  const saved = new Response(await response.clone().arrayBuffer(), { status: response.status, headers });
  await put(await caches.open(PAGES_CACHE), pageKey(request), saved, MAX_PAGES, [scoped("./"), scoped("./saved")]);
}

async function savedPage(request) {
  const cache = await caches.open(PAGES_CACHE);
  request = pageKey(request);
  const saved = await cache.match(request);
  if (!saved) return null;
  const timestamp = Number(saved.headers.get("X-Club-Saved-At"));
  if (!timestamp || Date.now() - timestamp > PAGE_LIFETIME) {
    await cache.delete(request);
    return null;
  }
  const html = (await saved.text()).replace("<html", `<html data-offline-copy="${timestamp}"`);
  const headers = new Headers(saved.headers);
  headers.delete("Content-Length");
  headers.delete("Content-Encoding");
  headers.delete("ETag");
  headers.set("Cache-Control", "no-store");
  return new Response(html, { status: 200, headers });
}

async function unavailable() {
  const offline = await (await caches.open(CACHE)).match(scoped("./offline.html"));
  if (!offline) return Response.error();
  const html = (await offline.text()).replace("<head>", `<head><base href="${SCOPE}">`);
  const headers = new Headers(offline.headers);
  headers.delete("Content-Length");
  headers.delete("Content-Encoding");
  headers.set("Cache-Control", "no-store");
  return new Response(html, { headers });
}

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then(async (c) => {
      await Promise.all(
        PRECACHE.map((u) => c.add(u).catch(() => {})),
      );
      await Promise.all(["./", "./saved"].map(async path => {
        const request = new Request(scoped(path), { credentials: "omit" });
        try { await savePage(request, await fetch(request)); } catch {}
      }));
    }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE && k !== PAGES_CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

function pathInScope(pathname) {
  const basePath = new URL(SCOPE).pathname.replace(/\/$/, "");
  if (!basePath) return pathname;
  if (pathname === basePath) return "/";
  if (pathname.startsWith(`${basePath}/`)) return pathname.slice(basePath.length);
  return null;
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;
  const path = pathInScope(url.pathname);
  if (path === null || path.startsWith("/api")) return;
  if (e.request.headers.has("authorization") || e.request.headers.has("x-cart-session")) return;

  if (
    path.startsWith("/assets/")
    || path.startsWith("/fonts/")
    || PRECACHE.includes(url.href)
  ) {
    e.respondWith(
      caches.open(CACHE).then((cache) => cache.match(e.request)).then(
        (hit) =>
          hit
          || fetch(e.request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              e.waitUntil(caches.open(CACHE).then((c) => put(c, e.request, copy, MAX_ASSETS)).catch(() => {}));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (e.request.mode === "navigate" || e.request.headers.get("x-club-save-page") === "1") {
    e.respondWith(
      (async () => {
        if (e.request.headers.get("x-club-save-page") === "1") {
          const saved = await savedPage(e.request);
          if (saved) return saved;
        }
        try {
          const response = await fetch(e.request);
          if (response.status === 404 || response.status === 410) await (await caches.open(PAGES_CACHE)).delete(pageKey(e.request));
          try { await savePage(e.request, response); } catch {}
          return response;
        } catch {
          return (await savedPage(e.request)) || unavailable();
        }
      })(),
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
