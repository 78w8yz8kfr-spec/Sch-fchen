import test from "node:test";
import assert from "node:assert/strict";
import { compareApplicationVersions, inlineDocument } from "../src/app.mjs";
import { securityHeaders } from "../src/static.mjs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { serveStatic } from "../src/static.mjs";

test("verpflichtende Updates vergleichen semantische App-Versionen", () => {
  assert.equal(compareApplicationVersions("0.42.1", "0.42.1"), 0);
  assert.equal(compareApplicationVersions("0.43.0", "0.42.9"), 1);
  assert.equal(compareApplicationVersions("0.41.12", "0.42.1"), -1);
  assert.equal(compareApplicationVersions("v1.2", "1.2.0"), 0);
  assert.equal(compareApplicationVersions(undefined, "0.42.1"), null);
  assert.equal(compareApplicationVersions("nicht-eine-version", "0.42.1"), null);
});

test("Browser-Sicherheitsregeln erlauben nur Schäfchens eigene QR-Kamera", () => {
  const headers = securityHeaders();
  assert.equal(headers["Permissions-Policy"], "camera=(self), geolocation=(), microphone=()");
  assert.match(headers["Content-Security-Policy"], /worker-src 'self' blob:/);
  assert.match(headers["Content-Security-Policy"], /img-src 'self' data: blob:/);
  assert.match(headers["Content-Security-Policy"], /frame-ancestors 'none'/);
});

// Der Barcode-Leser des Lagers ist die erste ausgelieferte .mjs-Datei. Fehlt
// ihr Typ in der Tabelle, kommt sie als application/octet-stream an, und der
// Browser lehnt sie als Modul ab - ohne dass im Serverprotokoll etwas
// auffaellt.
test("ausgelieferte .mjs-Dateien kommen als JavaScript beim Browser an", async () => {
  const frontend = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "frontend");
  const server = createServer((request, response) => {
    void serveStatic(request, response, frontend, new URL(request.url, "http://intern").pathname);
  });
  await new Promise((fertig) => server.listen(0, "127.0.0.1", fertig));
  const { port } = server.address();

  try {
    const skript = await fetch(`http://127.0.0.1:${port}/app.js`);
    assert.equal(skript.headers.get("content-type"), "text/javascript; charset=utf-8");
  } finally {
    await new Promise((fertig) => server.close(fertig));
  }
});

// attachment() macht es vorbildlich: ASCII-Rückfallname im filename-Parameter
// plus der volle Name im RFC-5987-codierten filename*. inlineDocument() setzte
// den Dateinamen bisher ungeschützt in denselben Kopf - dieser Test belegt,
// dass beide jetzt denselben sicheren Kopfaufbau verwenden.
test("Die Dokumentvorschau baut denselben sicheren Content-Disposition-Kopf wie der Download", () => {
  let geschriebeneHeader;
  const response = {
    writeHead(status, headers) {
      geschriebeneHeader = headers;
    },
    end() {}
  };
  inlineDocument(response, {
    fileName: "Zählerfoto Übergabe.pdf",
    mimeType: "application/pdf",
    content: Buffer.from("%PDF-1.4")
  });
  const disposition = geschriebeneHeader["Content-Disposition"];
  assert.match(disposition, /^inline; filename="[A-Za-z0-9._-]+"; filename\*=UTF-8''/);
  const encodedName = disposition.split("filename*=UTF-8''")[1];
  assert.equal(decodeURIComponent(encodedName), "Zählerfoto Übergabe.pdf");
});

// Diese drei Pruefungen halten fest, was ohne sie lautlos verschwindet: alle
// drei Werte sind Einzeiler, die niemand vermisst, bis der Betrieb steht.
test("Der Pool bricht haengende Abfragen ab, statt eine Verbindung zu verlieren", async () => {
  const { loadConfig } = await import("../src/config.mjs");
  const vorher = { ...process.env };
  Object.assign(process.env, {
    NODE_ENV: "test",
    DATABASE_URL: "postgres://nutzer:geheim@127.0.0.1:5432/schaefchen",
    API_DB_USER: "schaefchen_api_login",
    API_DB_PASSWORD: "nur-fuer-den-test",
    API_ALLOWED_ORIGIN: "https://beispiel.test",
    INITIAL_SETUP_TOKEN: "a".repeat(24),
    PLATFORM_SETUP_TOKEN: "b".repeat(24)
  });
  try {
    const config = loadConfig();
    // Ohne Grenze haelt eine haengende Abfrage ihre Verbindung fuer immer.
    // Der Pool hat zehn; zehn solche Abfragen, und die API antwortet keiner
    // Firma mehr.
    assert.ok(
      config.database.statement_timeout > 0,
      "Ohne statement_timeout blockiert eine haengende Abfrage ihre Poolverbindung dauerhaft"
    );
    assert.ok(config.database.connectionTimeoutMillis > 0);
    assert.ok(config.database.idleTimeoutMillis > 0);
  } finally {
    for (const schluessel of Object.keys(process.env)) {
      if (!(schluessel in vorher)) delete process.env[schluessel];
    }
    Object.assign(process.env, vorher);
  }
});

test("Ein Fehler an einer ruhenden Poolverbindung beendet nicht den Prozess", async () => {
  const { createPool } = await import("../src/database.mjs");
  const gemeldet = [];
  // Ohne Zuhoerer auf dem Fehlerereignis behandelt Node genau das als
  // unbehandelte Ausnahme - ein banaler Netzwerkhaenger reisst dann alle
  // laufenden Anfragen mit.
  const pool = createPool(
    { host: "127.0.0.1", port: 1, database: "x", user: "y" },
    { error: (nachricht) => gemeldet.push(nachricht) }
  );
  assert.equal(pool.listenerCount("error"), 1, "Der Pool braucht einen Fehlerzuhoerer");
  pool.emit("error", new Error("Verbindung vom Server zurueckgestellt"));
  assert.equal(gemeldet.length, 1);
  assert.match(gemeldet[0], /zurueckgestellt/);
  await pool.end().catch(() => {});
});

test("Der HTTP-Server laesst keine Anfrage unbegrenzt offen", async () => {
  const { readFile } = await import("node:fs/promises");
  const quelle = await readFile(new URL("../src/server.mjs", import.meta.url), "utf8");
  const wert = (name) => Number(new RegExp(`server\\.${name} = (\\d+)`).exec(quelle)?.[1]);
  const keepAlive = wert("keepAliveTimeout");
  const header = wert("headersTimeout");
  const anfrage = wert("requestTimeout");
  for (const [name, zahl] of [["keepAliveTimeout", keepAlive], ["headersTimeout", header], ["requestTimeout", anfrage]]) {
    assert.ok(zahl > 0, `${name} fehlt - ein tropfenweise sendender Client haelt sonst beliebig lange eine Verbindung`);
  }
  // Die Reihenfolge ist nicht beliebig: schliesst der Server frueher, als der
  // Client die Verbindung fuer nutzbar haelt, bekommt der einen abgerissenen
  // Aufruf statt einer Antwort.
  assert.ok(keepAlive < header, "keepAliveTimeout muss kleiner sein als headersTimeout");
});
