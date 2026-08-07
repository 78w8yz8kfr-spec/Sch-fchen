const CACHE_NAME = "schaefchen-online-v76";
const DOCUMENT_CACHE_VERSION = "v42";
const DOCUMENT_CACHE_PREFIX = `schaefchen-documents-${DOCUMENT_CACHE_VERSION}-`;
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=0.42.34",
  "./app.js?v=0.42.34",
  "./core/work-time.js?v=0.42.34",
  "./core/sync-queue.js?v=0.42.34",
  "./core/permissions.js?v=0.42.34",
  "./core/state-store.js?v=0.42.34",
  "./core/versions.js?v=0.42.34",
  "./version.js?v=0.42.34",
  "./platform-admin.html",
  "./platform-admin.css?v=0.42.34",
  "./platform-admin.js?v=0.42.34",
  "./vde/index.html",
  "./vde/styles.css?v=0.42.34",
  "./vde/app.js?v=0.42.34",
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
    caches.match(event.request).then(async (cached) => {
      if (cached) {
        return cached;
      }

      // Diese Datei liegt noch nicht im Speicher. Das ist der Normalfall
      // unmittelbar nach einer Veroeffentlichung: die Seite selbst wird immer
      // frisch geholt und verweist dann auf Dateien mit neuer Fassungsnummer.
      //
      // Genau in diesem Moment ist der Server aber nicht erreichbar - waehrend
      // einer Veroeffentlichung oder wenn der Dienst erst wieder anlaeuft. Ohne
      // Rueckfall bekam das Geraet dann eine neue index.html, aber kein app.js
      // dazu: die App blieb weiss und liess sich gar nicht mehr oeffnen.
      //
      // Deshalb zaehlt im Fehlerfall dieselbe Datei aus einer frueheren
      // Fassung. Eine Fassung zu alt und laufend ist besser als gar keine.
      const fruehereFassung = () => caches.match(event.request, { ignoreSearch: true });

      let response;
      try {
        response = await fetch(event.request);
      } catch (fehler) {
        const ersatz = await fruehereFassung();
        if (ersatz) return ersatz;
        throw fehler;
      }

      if (!response || response.status !== 200 || response.type === "opaque") {
        // Ein anlaufender oder gerade ausgetauschter Dienst antwortet mit einer
        // Fehlerseite statt mit der Datei. Die waere als Javascript unlesbar.
        if (response && response.status >= 500) {
          const ersatz = await fruehereFassung();
          if (ersatz) return ersatz;
        }
        return response;
      }

      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      return response;
    })
  );
});
