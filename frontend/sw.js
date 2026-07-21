const CACHE_NAME = "schaefchen-online-v18";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=0.18.0",
  "./app.js?v=0.18.0",
  "./manifest.webmanifest",
  "./assets/mark.svg",
  "./assets/company-logos/schaaf-elektro.webp",
  "./assets/baustellen-import-vorlage.xlsx"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }
  if (requestUrl.pathname.startsWith("/api/") || requestUrl.pathname === "/health") {
    return;
  }

  if (event.request.mode === "navigate" || requestUrl.pathname === "/" || requestUrl.pathname.endsWith(".html")) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .then((response) => {
          if (response?.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy));
          }
          return response;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type === "opaque") {
          return response;
        }

        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      });
    })
  );
});
