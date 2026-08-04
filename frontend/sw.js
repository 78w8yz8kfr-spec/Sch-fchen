const CACHE_NAME = "schaefchen-online-v42";
const DOCUMENT_CACHE_VERSION = "v42";
const DOCUMENT_CACHE_PREFIX = `schaefchen-documents-${DOCUMENT_CACHE_VERSION}-`;
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=0.42.0",
  "./app.js?v=0.42.0",
  "./core/work-time.js?v=0.42.0",
  "./core/sync-queue.js?v=0.42.0",
  "./core/permissions.js?v=0.42.0",
  "./version.js?v=0.42.0",
  "./platform-admin.html",
  "./platform-admin.css?v=0.42.0",
  "./platform-admin.js?v=0.42.0",
  "./vde/index.html",
  "./vde/styles.css?v=0.42.0",
  "./vde/app.js?v=0.42.0",
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
      keys
        .filter((key) => key !== CACHE_NAME && !key.startsWith(DOCUMENT_CACHE_PREFIX))
        .map((key) => caches.delete(key))
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
  const siteDocumentContent =
    /\/api\/v1\/construction-sites\/[^/]+\/documents\/[^/]+\/content$/
      .test(requestUrl.pathname);
  if (siteDocumentContent) {
    const offlineScope = requestUrl.searchParams.get("offlineScope");
    const scopedCacheName = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(offlineScope || "")
      ? `${DOCUMENT_CACHE_PREFIX}${offlineScope}`
      : null;
    event.respondWith(
      fetch(event.request)
        .catch(async () => {
          let cachedResponse = null;
          if (scopedCacheName) {
            const cacheNames = await caches.keys();
            if (cacheNames.includes(scopedCacheName)) {
              cachedResponse = await (await caches.open(scopedCacheName)).match(event.request);
            }
          }
          return cachedResponse || new Response("Dieses Dokument wurde nicht für die Offline-Ansicht gespeichert.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" }
          });
        })
    );
    return;
  }
  if (requestUrl.pathname.startsWith("/api/") || requestUrl.pathname === "/health") {
    return;
  }

  if (event.request.mode === "navigate" || requestUrl.pathname === "/" || requestUrl.pathname.endsWith(".html")) {
    const fallbackDocument = requestUrl.pathname.includes("/vde/")
      ? "./vde/index.html"
      : requestUrl.pathname.endsWith("/platform-admin.html")
        ? "./platform-admin.html"
        : "./index.html";
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .then((response) => {
          if (response?.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(fallbackDocument, copy));
          }
          return response;
        })
        .catch(() => caches.match(fallbackDocument))
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
