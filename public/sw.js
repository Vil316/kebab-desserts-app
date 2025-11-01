// public/sw.js
const CACHE_NAME = "relay-app-shell-v2"; // ⬅️ bump this to bust old caches

const APP_SHELL = ["/", "/index.html"];

// Install: pre-cache app shell
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

// Activate: delete old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

// Fetch strategy:
// - **Network-first** for "/" and "/index.html" so new builds are picked up.
// - **Stale-while-revalidate** for Vite-bundled static files under /assets/.
// - Let network handle everything else (Firestore, etc.).
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  const isShell = request.method === "GET" &&
                  (url.pathname === "/" || url.pathname === "/index.html");
  const isStatic = request.method === "GET" && url.pathname.startsWith("/assets/");

  if (isShell) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  if (isStatic) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, copy));
          return res;
        });
        return cached || fetchPromise;
      })
    );
  }
});