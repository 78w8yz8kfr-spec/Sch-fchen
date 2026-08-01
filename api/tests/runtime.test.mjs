import test from "node:test";
import assert from "node:assert/strict";
import { compareApplicationVersions } from "../src/app.mjs";

test("verpflichtende Updates vergleichen semantische App-Versionen", () => {
  assert.equal(compareApplicationVersions("0.42.0", "0.42.0"), 0);
  assert.equal(compareApplicationVersions("0.43.0", "0.42.9"), 1);
  assert.equal(compareApplicationVersions("0.41.12", "0.42.0"), -1);
  assert.equal(compareApplicationVersions("v1.2", "1.2.0"), 0);
  assert.equal(compareApplicationVersions(undefined, "0.42.0"), null);
  assert.equal(compareApplicationVersions("nicht-eine-version", "0.42.0"), null);
});
