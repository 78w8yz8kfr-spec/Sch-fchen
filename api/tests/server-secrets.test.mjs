import test from "node:test";
import assert from "node:assert/strict";
import { serveStatic } from "../src/static.mjs";

test("Statische Auslieferung blockiert Geheimnisdateien bereits vor jedem Dateizugriff", async () => {
  const response = { writeHead() { assert.fail("Geheimnisdatei wurde ausgeliefert"); }, end() {} };
  for (const path of ["/.env", "/.env.production", "/assets/.env", "/assets/client.key", "/backup.sql", "/%2eenv", "/x/../.env", "/cert.pem"]) {
    assert.equal(await serveStatic({ method: "GET" }, response, "/any/frontend", path), false, path);
  }
});
