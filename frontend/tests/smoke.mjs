import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const frontendDirectory = resolve(testDirectory, "..");
const repositoryDirectory = resolve(frontendDirectory, "..");

const readFrontendFile = (path) => readFile(resolve(frontendDirectory, path), "utf8");

const [html, styles, app, worker, manifestSource, uiSpecification] = await Promise.all([
  readFrontendFile("index.html"),
  readFrontendFile("styles.css"),
  readFrontendFile("app.js"),
  readFrontendFile("sw.js"),
  readFrontendFile("manifest.webmanifest"),
  readFile(resolve(repositoryDirectory, "docs/PHASE1_UI_SPEC.md"), "utf8")
]);

const manifest = JSON.parse(manifestSource);

assert.match(html, /lang="de"/);
assert.match(html, /id="login-view"/);
assert.match(html, /id="dashboard-view"/);
assert.match(html, /id="open-preview"/);
assert.match(html, /aria-live="polite"/);
assert.match(html, /Öffentliche Vorschau/);
assert.doesNotMatch(html, /https?:\/\//, "Die PWA darf keine externen Laufzeitressourcen laden");

assert.match(styles, /env\(safe-area-inset-bottom\)/);
assert.match(styles, /:focus-visible/);
assert.match(styles, /min-width: 320px/);

assert.match(app, /navigator\.serviceWorker\.register/);
assert.match(app, /Es wurden keine Daten gespeichert/);

assert.equal(manifest.name, "Schäfchen");
assert.equal(manifest.display, "standalone");
assert.equal(manifest.start_url, "./");
assert.ok(manifest.icons.length > 0);

for (const asset of ["./index.html", "./styles.css", "./app.js", "./manifest.webmanifest", "./assets/mark.svg"]) {
  assert.ok(worker.includes(`"${asset}"`), `${asset} fehlt im App-Shell-Cache`);
}

assert.match(uiSpecification, /keine echte\s+Serveranmeldung/i);
assert.match(uiSpecification, /keine GPS-Abfrage/i);

console.log("PWA-Smoke-Test erfolgreich.");
