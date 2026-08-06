import assert from "node:assert/strict";
import test from "node:test";
import { compareVersions, serverIsNewer } from "../core/versions.js";

test("Fassungen werden zahlenweise verglichen, nicht als Zeichenketten", () => {
  // Genau hier liegt der Grund fuer diese Datei: als Zeichenkette waere
  // "0.42.9" groesser als "0.42.28", und die Warnung bliebe genau dann aus,
  // wenn sie gebraucht wird.
  assert.equal(compareVersions("0.42.9", "0.42.28"), -1);
  assert.equal(compareVersions("0.42.28", "0.42.9"), 1);
  assert.equal(compareVersions("0.42.28", "0.42.28"), 0);
  assert.equal(compareVersions("0.9.0", "0.10.0"), -1);
  assert.equal(compareVersions("1.0.0", "0.99.99"), 1);

  // Fehlende Stellen zaehlen als null: "0.43" ist dasselbe wie "0.43.0".
  assert.equal(compareVersions("0.43", "0.43.0"), 0);
  assert.equal(compareVersions("0.43", "0.43.1"), -1);
});

test("Unbrauchbare Angaben führen zu keinem Vergleich", () => {
  // Ein Server, der etwas anderes schickt als eine Fassung, darf keine
  // Warnung ausloesen - und erst recht keine falsche.
  for (const unbrauchbar of [null, undefined, "", "unbekannt", "0.42.x", "abc"]) {
    assert.equal(compareVersions(unbrauchbar, "0.42.28"), null, String(unbrauchbar));
    assert.equal(compareVersions("0.42.28", unbrauchbar), null, String(unbrauchbar));
    assert.equal(serverIsNewer("0.42.28", unbrauchbar), false, String(unbrauchbar));
  }
});

test("Gewarnt wird nur, wenn die Seite hinterherhängt", () => {
  assert.equal(serverIsNewer("0.42.24", "0.42.28"), true);
  assert.equal(serverIsNewer("0.42.28", "0.42.28"), false);
  // Waehrend einer Veroeffentlichung kann die Seite kurz neuer sein als der
  // Dienst. Neuladen hilft dann nicht, und ein Hinweis waere nur Unruhe.
  assert.equal(serverIsNewer("0.42.28", "0.42.24"), false);
});
