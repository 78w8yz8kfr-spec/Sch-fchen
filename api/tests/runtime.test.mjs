import test from "node:test";
import assert from "node:assert/strict";
import { compareApplicationVersions } from "../src/app.mjs";
import { securityHeaders } from "../src/static.mjs";

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
