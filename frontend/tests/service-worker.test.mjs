import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const frontendDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workerPath = resolve(frontendDirectory, "sw.js");
const workerSource = await readFile(workerPath, "utf8");

const ORIGIN = "https://schaefchen.example";

// Der Service Worker liest von seinen Anfragen nur Adresse, Methode und Modus.
// Ein schlankes Doppel bildet das vollständig ab und hält den Test unabhängig
// von den Eigenheiten der Request-Implementierung in Node.
function requestFor(path, { method = "GET", mode = "no-cors", origin = ORIGIN } = {}) {
  return { url: `${origin}${path}`, method, mode };
}

function cacheKey(request) {
  return typeof request === "string" ? request : request.url;
}

class FakeCache {
  constructor() {
    this.entries = new Map();
  }

  async put(request, response) {
    this.entries.set(cacheKey(request), response);
  }

  async match(request, options = {}) {
    const treffer = this.entries.get(cacheKey(request));
    if (treffer || !options.ignoreSearch) return treffer;
    // Wie im Browser: ohne Fragezeichenteil vergleichen. So findet eine Anfrage
    // nach app.js?v=0.44.9 die abgelegte app.js?v=0.42.1.
    const ohneAbfrage = (wert) => new URL(wert, ORIGIN).pathname;
    const gesucht = ohneAbfrage(cacheKey(request));
    for (const [schluessel, antwort] of this.entries) {
      if (ohneAbfrage(schluessel) === gesucht) return antwort;
    }
    return undefined;
  }

  async addAll(urls) {
    for (const url of urls) this.entries.set(url, new Response(`Inhalt von ${url}`));
  }
}

class FakeCacheStorage {
  constructor() {
    this.stores = new Map();
  }

  async open(name) {
    if (!this.stores.has(name)) this.stores.set(name, new FakeCache());
    return this.stores.get(name);
  }

  async keys() {
    return [...this.stores.keys()];
  }

  async delete(name) {
    return this.stores.delete(name);
  }

  async match(request, options) {
    for (const store of this.stores.values()) {
      const hit = await store.match(request, options);
      if (hit) return hit;
    }
    return undefined;
  }
}

// Lädt sw.js in einer nachgebildeten Service-Worker-Umgebung und gibt die
// registrierten Ereignisbehandlungen zurück. Die Quelldatei bleibt dabei
// unverändert; getestet wird genau der Stand, der ausgeliefert wird.
function loadServiceWorker({ fetchImplementation } = {}) {
  const handlers = new Map();
  const fetchCalls = [];
  const caches = new FakeCacheStorage();
  const worker = {
    skipWaitingCalled: false,
    clientsClaimCalled: false
  };

  const self = {
    location: { origin: ORIGIN },
    addEventListener(type, handler) {
      handlers.set(type, handler);
    },
    skipWaiting() {
      worker.skipWaitingCalled = true;
    },
    clients: {
      claim() {
        worker.clientsClaimCalled = true;
      }
    }
  };

  const fetchDouble = async (request, options) => {
    fetchCalls.push({ url: cacheKey(request), options });
    if (!fetchImplementation) return new Response("Netzantwort", { status: 200 });
    return fetchImplementation(request, options);
  };

  const context = vm.createContext({
    self,
    caches,
    fetch: fetchDouble,
    Response,
    URL,
    console
  });
  vm.runInContext(workerSource, context, { filename: workerPath });

  const dispatch = (type, event) => {
    const handler = handlers.get(type);
    assert.ok(handler, `Für ${type} ist keine Behandlung registriert`);
    return handler(event);
  };

  return { caches, dispatch, fetchCalls, handlers, worker };
}

// Führt ein fetch-Ereignis aus und liefert die Antwort, die der Service Worker
// über respondWith übernimmt, oder null, wenn er die Anfrage durchreicht.
async function runFetch(worker, request) {
  let responded = null;
  worker.dispatch("fetch", {
    request,
    respondWith(value) {
      responded = value;
    },
    waitUntil() {}
  });
  return responded === null ? null : await responded;
}

test("Installation legt genau die App-Shell im Versionscache ab", async () => {
  const worker = loadServiceWorker();
  const waited = [];
  worker.dispatch("install", { waitUntil: (promise) => waited.push(promise) });
  await Promise.all(waited);

  assert.equal(worker.worker.skipWaitingCalled, true);
  const names = await worker.caches.keys();
  assert.deepEqual(names, ["schaefchen-online-v91"]);
  const shell = await worker.caches.open("schaefchen-online-v91");
  const cachedPaths = [...shell.entries.keys()];
  for (const required of [
    "./", "./index.html", "./design-system.css?v=0.44.9", "./app.js?v=0.44.9",
    "./core/device-management.js?v=0.44.9", "./core/apprentice-view.js?v=0.44.9",
    "./vendor/qr-scanner.min.js?v=0.44.9",
    "./vendor/qr-scanner-worker.min.js",
    "./platform-admin.html", "./vde/index.html", "./manifest.webmanifest", "./assets/mark.svg"
  ]) {
    assert.ok(cachedPaths.includes(required), `${required} fehlt in der App-Shell`);
  }
});

test("Aktivierung räumt alte Caches ab, behält aber die Offline-Dokumente", async () => {
  const worker = loadServiceWorker();
  await worker.caches.open("schaefchen-online-v91");
  await worker.caches.open("schaefchen-online-v41");
  await worker.caches.open("irgendein-fremder-cache");
  await worker.caches.open("schaefchen-documents-v42-11111111-1111-4111-8111-111111111111");

  const waited = [];
  worker.dispatch("activate", { waitUntil: (promise) => waited.push(promise) });
  await Promise.all(waited);

  assert.equal(worker.worker.clientsClaimCalled, true);
  const remaining = (await worker.caches.keys()).sort();
  assert.deepEqual(remaining, [
    "schaefchen-documents-v42-11111111-1111-4111-8111-111111111111",
    "schaefchen-online-v91"
  ]);
});

test("Nicht zwischenspeicherbare Anfragen bleiben unberührt am Netz", async () => {
  const worker = loadServiceWorker();

  // Schreibende Zugriffe, fremde Herkunft, API und Health werden durchgereicht.
  assert.equal(await runFetch(worker, requestFor("/api/v1/time-entries", { method: "POST" })), null);
  assert.equal(
    await runFetch(worker, requestFor("/analytics.js", { origin: "https://fremde.example" })),
    null
  );
  assert.equal(await runFetch(worker, requestFor("/api/v1/session")), null);
  assert.equal(await runFetch(worker, requestFor("/health")), null);
  assert.equal(worker.fetchCalls.length, 0, "Der Service Worker darf hier gar nicht selbst laden");
});

test("Baustellendokumente kommen online aus dem Netz und werden nicht nebenbei gespeichert", async () => {
  const worker = loadServiceWorker({
    fetchImplementation: async () => new Response("Aktuelles Dokument", { status: 200 })
  });
  const scope = "11111111-1111-4111-8111-111111111111";
  const response = await runFetch(
    worker,
    requestFor(`/api/v1/construction-sites/abc/documents/def/content?offlineScope=${scope}`)
  );

  assert.equal(await response.text(), "Aktuelles Dokument");
  assert.deepEqual(await worker.caches.keys(), [], "Der Service Worker legt Dokumente nicht selbst ab");
});

test("Offline liefert nur der eigene Dokumentencache ein Baustellendokument", async () => {
  const ownScope = "11111111-1111-4111-8111-111111111111";
  const foreignScope = "22222222-2222-4222-8222-222222222222";
  const documentPath = "/api/v1/construction-sites/abc/documents/def/content";

  const worker = loadServiceWorker({
    fetchImplementation: async () => {
      throw new Error("offline");
    }
  });
  const ownCache = await worker.caches.open(`schaefchen-documents-v42-${ownScope}`);
  const foreignCache = await worker.caches.open(`schaefchen-documents-v42-${foreignScope}`);
  const ownRequest = requestFor(`${documentPath}?offlineScope=${ownScope}`);
  await ownCache.put(ownRequest, new Response("Eigenes Dokument"));

  const own = await runFetch(worker, ownRequest);
  assert.equal(own.status, 200);
  assert.equal(await own.text(), "Eigenes Dokument");

  // Entscheidend: Der Service Worker sieht ausschließlich in den Cache des
  // eigenen Kontos. Dasselbe Dokument im Cache eines anderen Kontos bleibt
  // unerreichbar, obwohl es unter genau diesem Schlüssel dort abgelegt ist.
  const otherDocument = requestFor(
    `/api/v1/construction-sites/abc/documents/nur-im-fremden-cache/content?offlineScope=${ownScope}`
  );
  await foreignCache.put(otherDocument, new Response("Fremdes Dokument"));

  const leaked = await runFetch(worker, otherDocument);
  assert.equal(leaked.status, 503);
  assert.match(await leaked.text(), /nicht für die Offline-Ansicht gespeichert/);
});

test("Ohne gültigen Geltungsbereich bleibt der Dokumentencache offline verschlossen", async () => {
  const scope = "11111111-1111-4111-8111-111111111111";
  const documentPath = "/api/v1/construction-sites/abc/documents/def/content";
  const worker = loadServiceWorker({
    fetchImplementation: async () => {
      throw new Error("offline");
    }
  });
  const cache = await worker.caches.open(`schaefchen-documents-v42-${scope}`);
  await cache.put(requestFor(`${documentPath}?offlineScope=${scope}`), new Response("Eigenes Dokument"));

  // Für jeden ungültigen Geltungsbereich wird zusätzlich der Cache angelegt, den
  // eine ungeprüfte Namensbildung ansteuern würde. Erst dadurch trägt der Test
  // die UUID-Prüfung wirklich und schlägt fehl, wenn sie entfällt.
  for (const query of ["", "?offlineScope=", "?offlineScope=nicht-uuid", "?offlineScope=../../etc"]) {
    const request = requestFor(`${documentPath}${query}`);
    const rawScope = new URL(request.url).searchParams.get("offlineScope");
    const guessableCache = await worker.caches.open(`schaefchen-documents-v42-${rawScope}`);
    await guessableCache.put(request, new Response("Fremdes Dokument"));

    const response = await runFetch(worker, request);
    assert.equal(response.status, 503, `Geltungsbereich "${query}" hätte nichts liefern dürfen`);
    assert.match(await response.text(), /nicht für die Offline-Ansicht gespeichert/);
  }
});

test("Seitenaufrufe laden ohne Zwischenspeicher und sichern die Hülle für offline", async () => {
  const worker = loadServiceWorker({
    fetchImplementation: async () => new Response("<!doctype html>frisch", { status: 200 })
  });
  const response = await runFetch(worker, requestFor("/", { mode: "navigate" }));

  assert.equal(await response.text(), "<!doctype html>frisch");
  assert.equal(worker.fetchCalls[0].options.cache, "no-store");
  const shell = await worker.caches.open("schaefchen-online-v91");
  assert.ok(await shell.match("./index.html"), "Die Hülle wurde nicht für offline gesichert");
});

test("Offline führt jeder Bereich auf seine eigene Hülle zurück", async () => {
  for (const [path, fallback, content] of [
    ["/", "./index.html", "Monteurhülle"],
    ["/vde/index.html", "./vde/index.html", "VDE-Hülle"],
    ["/platform-admin.html", "./platform-admin.html", "Plattformhülle"]
  ]) {
    const worker = loadServiceWorker({
      fetchImplementation: async () => {
        throw new Error("offline");
      }
    });
    const shell = await worker.caches.open("schaefchen-online-v91");
    await shell.put(fallback, new Response(content));

    const response = await runFetch(worker, requestFor(path, { mode: "navigate" }));
    assert.equal(await response.text(), content, `${path} führte nicht auf ${fallback}`);
  }
});

test("Statische Dateien kommen zuerst aus dem Cache und werden sonst nachgeladen", async () => {
  const worker = loadServiceWorker({
    fetchImplementation: async () => new Response("Frisch geladen", { status: 200 })
  });
  const shell = await worker.caches.open("schaefchen-online-v91");
  const cachedRequest = requestFor("/styles.css?v=0.44.9");
  await shell.put(cachedRequest, new Response("Aus dem Cache"));

  const fromCache = await runFetch(worker, cachedRequest);
  assert.equal(await fromCache.text(), "Aus dem Cache");
  assert.equal(worker.fetchCalls.length, 0, "Ein Treffer im Cache darf nichts nachladen");

  const missing = requestFor("/assets/mark.svg");
  const fromNetwork = await runFetch(worker, missing);
  assert.equal(await fromNetwork.text(), "Frisch geladen");
  assert.equal(worker.fetchCalls.length, 1);
  await new Promise((done) => setImmediate(done));
  assert.ok(await shell.match(missing), "Die nachgeladene Datei wurde nicht abgelegt");
});

test("Waehrend einer Veroeffentlichung springt die vorherige Fassung ein", async () => {
  // Der eigentliche Fehler: die Seite selbst wird immer frisch geholt. Direkt
  // nach einer Veroeffentlichung verweist sie auf Dateien mit neuer
  // Fassungsnummer - und genau dann ist der Server kurz nicht erreichbar. Das
  // Geraet hatte dann die neue Seite, aber kein app.js dazu: die App blieb
  // weiss und liess sich nicht mehr oeffnen.
  const worker = loadServiceWorker({
    fetchImplementation: async () => { throw new Error("Der Server antwortet nicht."); }
  });
  const shell = await worker.caches.open("schaefchen-online-v91");
  await shell.put(requestFor("/app.js?v=0.42.1"), new Response("Vorherige Fassung"));

  const neu = requestFor("/app.js?v=0.44.9");
  const antwort = await runFetch(worker, neu);
  assert.equal(await antwort.text(), "Vorherige Fassung");
});

test("Eine Fehlerseite des anlaufenden Dienstes ersetzt keine Datei", async () => {
  // Ein Dienst, der gerade wieder anlaeuft, antwortet mit einer Fehlerseite
  // statt mit der Datei. Als Javascript waere sie unlesbar.
  const worker = loadServiceWorker({
    fetchImplementation: async () => new Response("<html>Dienst nicht erreichbar</html>", { status: 503 })
  });
  const shell = await worker.caches.open("schaefchen-online-v91");
  await shell.put(requestFor("/styles.css?v=0.42.1"), new Response("Vorherige Gestaltung"));

  const antwort = await runFetch(worker, requestFor("/styles.css?v=0.44.9"));
  assert.equal(await antwort.text(), "Vorherige Gestaltung");
});

test("Ohne vorherige Fassung bleibt der Fehler sichtbar", async () => {
  // Ein Rueckfall darf nichts erfinden. Ist die Datei nie dagewesen, muss der
  // Fehler durchschlagen, sonst sucht niemand die Ursache.
  const worker = loadServiceWorker({
    fetchImplementation: async () => { throw new Error("Der Server antwortet nicht."); }
  });
  await assert.rejects(() => runFetch(worker, requestFor("/assets/neu.svg")));
});

test("Fehlerhafte und undurchsichtige Antworten landen nicht im Cache", async () => {
  // Eine undurchsichtige Antwort lässt sich mit Response nicht nachbilden, weil
  // type nur lesbar ist. Der Service Worker liest davon ohnehin nur Status, Typ
  // und clone.
  const opaque = { status: 200, type: "opaque", clone: () => opaque };
  for (const response of [new Response("Nicht gefunden", { status: 404 }), opaque]) {
    const worker = loadServiceWorker({ fetchImplementation: async () => response });
    const request = requestFor("/assets/fehlt.svg");
    await runFetch(worker, request);
    await new Promise((done) => setImmediate(done));
    const shell = await worker.caches.open("schaefchen-online-v91");
    assert.equal(await shell.match(request), undefined, "Diese Antwort hätte nicht abgelegt werden dürfen");
  }
});
