import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Lagerstruktur und Abwesenheitsfreigabe waren eigenstaendige Seiten ohne
// Seitenleiste und Kopfzeile. Der Nutzer hat das zu Recht bemaengelt ("sieht
// aus wie eine Handy-App, wo ist die Seitenleiste?"). Beide sind jetzt
// Bereiche der Arbeitsapp; die alten Dateien sind nur noch Weiterleitungen
// fuer gesetzte Lesezeichen. Diese Tests sichern genau diese Naht.

const frontendDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lies = (datei) => readFile(resolve(frontendDirectory, datei), "utf8");

test("Beide eingefalteten Bereiche liegen als data-dashboard-pane in der Arbeitsapp", async () => {
  const html = await lies("index.html");
  for (const bereich of ["inventory", "absences"]) {
    assert.match(
      html,
      new RegExp(`data-dashboard-pane="${bereich}"`),
      `index.html: Bereich "${bereich}" fehlt`
    );
  }
});

test("Jeder Bereich der Arbeitsapp hat einen Titel in der copy-Tabelle", async () => {
  // Mechanisch abgeleitet statt Handliste: die Bereichsnamen kommen aus
  // index.html, die Titel aus der Tabelle in app.js. Ein neuer Bereich ohne
  // Titel faellt damit auf, sobald ihn jemand anlegt - vorher stand dort
  // stillschweigend "Uebersicht".
  const html = await lies("index.html");
  const js = await lies("app.js");
  const bereiche = new Set(
    [...html.matchAll(/data-dashboard-pane="([a-z-]+)"/g)].map((m) => m[1])
  );
  const tabelle = /const title = \{([\s\S]*?)\}\[pane\]/.exec(js);
  assert.ok(tabelle, "app.js: keine copy-Tabelle fuer Bereichstitel gefunden");
  // "start" traegt die Begruessung und steht bewusst nicht in der Tabelle.
  for (const bereich of bereiche) {
    if (bereich === "start") continue;
    assert.match(
      tabelle[1],
      new RegExp(`\\b${bereich}:`),
      `app.js: Bereich "${bereich}" hat keinen Titel in der copy-Tabelle`
    );
  }
});

test("Keine Kennung kommt in index.html doppelt vor", async () => {
  // Beim Einfalten trafen zwei Seiten aufeinander, die beide "search",
  // "message", "history", "reload", "save", "workspace" und "form-message"
  // benutzten. In einem gemeinsamen Dokument gewinnt bei doppelter Kennung
  // immer das erste Element - der zweite Bereich waere still kaputt gegangen.
  const html = await lies("index.html");
  const kennungen = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const doppelt = kennungen.filter((wert, index) => kennungen.indexOf(wert) !== index);
  assert.deepEqual([...new Set(doppelt)], [], "doppelte Kennungen in index.html");
});

test("Die Weiterleitungsseiten verdrahten keine Bedienelemente, die es dort nicht gibt", async () => {
  // Der Fehler, den das faengt: in inventory.js hing der submit-Lauscher des
  // Formulars VOR der "embedded"-Schranke. Auf der Weiterleitungsseite lief er
  // gegen ein nicht vorhandenes "#inventory-form", warf "Cannot read
  // properties of null" - und die Sprunganweisung darunter wurde nie erreicht.
  // Das alte Lesezeichen blieb dadurch auf einer leeren Seite stehen.
  // Mechanisch geprueft: jeder addEventListener ohne "?." muss hinter der
  // Schranke stehen.
  for (const datei of ["inventory.js", "absence-approvals.js"]) {
    const js = await lies(datei);
    const schranke = js.indexOf("if (embedded) {");
    assert.ok(schranke > 0, `${datei}: keine "embedded"-Schranke gefunden`);
    for (const treffer of js.matchAll(/addEventListener/g)) {
      const davor = js.slice(Math.max(0, treffer.index - 2), treffer.index);
      // Lauscher auf frisch erzeugten Knoten und optionale Aufrufe ("?.") sind
      // unbedenklich - sie laufen nie gegen ein fehlendes Element.
      if (davor.endsWith("?.")) continue;
      const zeile = js.slice(js.lastIndexOf("\n", treffer.index) + 1, treffer.index);
      if (/\bnode\.$|\bknopf\.$|\bbutton\.$|\binput\.$/.test(zeile)) continue;
      assert.ok(
        treffer.index > schranke,
        `${datei}: addEventListener vor der "embedded"-Schranke (Zeichen ${treffer.index})`
      );
    }
  }
});

test("Die alten Adressen springen in die Arbeitsapp statt eine zweite Oberflaeche zu zeigen", async () => {
  for (const [datei, ziel] of [
    ["inventory.js", "./?pane=inventory"],
    ["absence-approvals.js", "./?pane=absences"]
  ]) {
    const js = await lies(datei);
    assert.ok(
      js.includes(ziel),
      `${datei}: springt nicht auf "${ziel}"`
    );
    assert.match(
      js,
      /window\.location\.replace\(/,
      `${datei}: kein Sprung per location.replace (sonst bleibt das Lesezeichen im Verlauf haengen)`
    );
  }
});

test("Jede vom Bereichsskript angesprochene Kennung gibt es auch im Markup", async () => {
  // Der Fehler, den das faengt - und der mir selbst passiert ist: der
  // $-Helfer beider Module haengt seit dem Einfalten ein Praefix an JEDE
  // Kennung ("inventory-"/"aa-"), weil beide Seiten in einem gemeinsamen
  // Dokument dieselben kurzen Namen benutzten. Wer den Helfer umstellt, aber
  // nur einen Teil der Kennungen im Markup nachzieht, bekommt keinen
  // Testfehler, sondern eine still nicht mehr startende App: jeder
  // addEventListener laeuft dann gegen null. Genau das ist passiert.
  //
  // Mechanisch abgeleitet statt Handliste: die Kennungen kommen aus den
  // $()-Aufrufen der Module selbst, das Praefix aus ihrer Helferzeile.
  const markup = (await lies("index.html"))
    + (await lies("inventory.html"))
    + (await lies("absence-approvals.html"));
  for (const datei of ["inventory.js", "absence-approvals.js"]) {
    const js = await lies(datei);
    const helfer = /document\.getElementById\(`([a-z-]+)\$\{id\}`\)/.exec(js);
    assert.ok(helfer, `${datei}: kein praefixierender $-Helfer gefunden`);
    const praefix = helfer[1];
    const kennungen = new Set(
      [...js.matchAll(/\$\(["']([a-z0-9-]+)["']\)/g)].map((m) => m[1])
    );
    assert.ok(kennungen.size > 0, `${datei}: keine $()-Aufrufe gefunden`);
    for (const kennung of kennungen) {
      assert.ok(
        markup.includes(`id="${praefix}${kennung}"`),
        `${datei}: $("${kennung}") sucht #${praefix}${kennung} - im Markup gibt es das nicht`
      );
    }
  }
});
