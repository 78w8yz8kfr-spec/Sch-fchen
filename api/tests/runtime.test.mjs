import test from "node:test";
import assert from "node:assert/strict";
import { compareApplicationVersions } from "../src/app.mjs";
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
