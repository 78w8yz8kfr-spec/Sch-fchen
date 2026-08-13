import assert from "node:assert/strict";
import test from "node:test";
import {
  ANLAESSE,
  ablesungFormular,
  datumText,
  detailAnsicht,
  fiTestFormular,
  fristText,
  listeAnsicht,
  schlimmereLage,
  standAusText,
  standortText
} from "../core/power-module.js";

const frist = (lage, tage, dueOn = null) => ({ lage, tage, dueOn });

test("Fristen sprechen in Tagen, solange es knapp ist, sonst im Datum", () => {
  assert.equal(fristText("nie", null, null), "noch nie geprüft");
  assert.equal(fristText("ueberfaellig", -1, "2026-08-12"), "seit 1 Tag überfällig");
  assert.equal(fristText("ueberfaellig", -12, "2026-08-01"), "seit 12 Tagen überfällig");
  assert.equal(fristText("bald", 0, "2026-08-13"), "heute fällig");
  assert.equal(fristText("bald", 1, "2026-08-14"), "in 1 Tag");
  assert.equal(fristText("bald", 9, "2026-08-22"), "in 9 Tagen");
  assert.equal(fristText("gut", 60, "2026-10-12"), "bis 12.10.2026");
});

test("Das Datum steht so da, wie es auf dem Papier daneben steht", () => {
  assert.equal(datumText("2026-08-13"), "13.08.2026");
  assert.equal(datumText(null), "");
  assert.equal(datumText(""), "");
});

// Eine Zeile traegt eine Farbe. Welche, entscheidet die schlimmere der beiden
// Fristen - sonst faerbt ein frisch gedrueckter FI-Knopf eine abgelaufene
// Pruefung gruen.
test("Die Zeile folgt der schlimmeren der beiden Fristen", () => {
  assert.equal(
    schlimmereLage({ inspection: frist("ueberfaellig", -3), rcdTest: frist("gut", 25) }),
    "ueberfaellig"
  );
  assert.equal(
    schlimmereLage({ inspection: frist("gut", 70), rcdTest: frist("bald", 2) }),
    "bald"
  );
  assert.equal(
    schlimmereLage({ inspection: frist("gut", 70), rcdTest: frist("gut", 20) }),
    "gut"
  );
  // Ohne jede Angabe ist der Verteiler ungeprueft, nicht in Ordnung.
  assert.equal(schlimmereLage({}), "nie");
  assert.equal(schlimmereLage(null), "nie");
});

test("Gesucht wird nach der Baustelle, deshalb steht sie vor dem Lagerort", () => {
  assert.equal(
    standortText({ constructionSiteName: "Neubau Ost", locationName: "Halle 2" }),
    "Neubau Ost"
  );
  assert.equal(standortText({ locationName: "Halle 2" }), "Halle 2");
  assert.equal(standortText({}), "ohne Standort");
});

test("Zählerstände werden in deutscher Schreibweise eingetippt", () => {
  assert.equal(standAusText("1850,5"), 1850.5);
  assert.equal(standAusText("1.850,5"), 1850.5);
  assert.equal(standAusText("1850"), 1850);
  assert.equal(standAusText("0"), 0);
  assert.equal(standAusText(" 12 34 "), 1234);
  assert.equal(standAusText(""), null);
  assert.equal(standAusText(null), null);
  assert.equal(standAusText("abc"), null);
  assert.equal(standAusText("-5"), null);
});

test("Die Liste zeigt Fristen, Standort und den fehlenden Zählerstand", () => {
  const html = listeAnsicht([
    {
      id: "a1",
      name: "Verteiler 63A",
      inventoryNumber: "BV-004",
      constructionSiteName: "Neubau Ost",
      inspection: frist("ueberfaellig", -3, "2026-08-10"),
      rcdTest: frist("gut", 20, "2026-09-02"),
      meter: { readingKwh: "1850.5", readOn: "2026-08-01" }
    },
    {
      id: "a2",
      name: "Verteiler klein",
      inventoryNumber: "BV-005",
      inspection: frist("nie", null, null),
      rcdTest: frist("nie", null, null),
      meter: null
    }
  ]);

  assert.match(html, /power-row--schlecht/);
  assert.match(html, /data-verteiler="a1"/);
  assert.match(html, /Neubau Ost/);
  assert.match(html, /seit 3 Tagen überfällig/);
  assert.match(html, /1850\.5 kWh/);
  assert.match(html, /noch kein Zählerstand/);
  assert.match(html, /ohne Standort/);
});

// Der Bereich legt keine Verteiler an. Steht die Liste leer da, muss sie
// sagen, wo sie entstehen - sonst sucht jemand hier einen Knopf, den es
// bewusst nicht gibt.
test("Die leere Liste verweist auf die Geräteverwaltung", () => {
  const html = listeAnsicht([]);
  assert.match(html, /Maschinen &amp; Geräte/);
  assert.match(html, /Baustromverteiler/);
  assert.doesNotMatch(html, /<li/);
});

// Ohne Kopf beginnt die Seite mitten in den Zeilen, und die Reihenfolge sieht
// zufällig aus statt nach Dringlichkeit sortiert.
test("Die Liste sagt in ihrem Kopf, wonach sie sortiert", () => {
  const html = listeAnsicht([]);
  assert.match(html, /<h1>Baustrom<\/h1>/);
  assert.match(html, /Dringlichkeit/);
});

test("Ein Fehler steht als Warnung über der Liste", () => {
  const html = listeAnsicht([], "Die Liste ließ sich nicht laden.");
  assert.match(html, /role="alert"/);
  assert.match(html, /Die Liste ließ sich nicht laden\./);
});

test("Fremder Text kommt als Text an, nicht als Auszeichnung", () => {
  const html = listeAnsicht([{
    id: "x",
    name: '<img src=x onerror="alert(1)">',
    inventoryNumber: "BV-1",
    inspection: frist("gut", 30, "2026-09-12"),
    rcdTest: frist("gut", 10, "2026-08-23")
  }]);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img/);
});

test("Die Akte trennt Prüfung und FI-Test sichtbar voneinander", () => {
  const html = detailAnsicht({
    distributor: {
      id: "a1",
      name: "Verteiler 63A",
      inventoryNumber: "BV-004",
      constructionSiteName: "Neubau Ost",
      inspection: frist("gut", 40, "2026-09-22"),
      rcdTest: frist("bald", 3, "2026-08-16")
    },
    readings: [
      { readOn: "2026-08-01", readingKwh: "1850.5", reason: "interim", readBy: "M. Klein", note: null }
    ],
    rcdTests: [
      { testedOn: "2026-07-16", result: "passed", testedBy: "M. Klein", note: null }
    ]
  });

  assert.match(html, /Prüfung nach DGUV V3/);
  assert.match(html, /FI-Test/);
  // Der Satz ist der Grund fuer die getrennte Buchung und muss dastehen.
  assert.match(html, /ersetzt die vierteljährliche/);
  assert.match(html, /verschiebt ihren Termin nicht/);
  assert.match(html, /Zwischenablesung/);
  assert.match(html, /bestanden/);
});

test("Eine leere Akte rendert nichts statt einer halben Seite", () => {
  assert.equal(detailAnsicht(null), "");
  assert.equal(detailAnsicht({}), "");
});

test("Das Ablesungsformular nennt den letzten Stand und verlangt einen Anlass", () => {
  const html = ablesungFormular("1850.5");
  assert.match(html, /Letzter Stand: 1850\.5 kWh/);
  Object.values(ANLAESSE).forEach((wort) => assert.match(html, new RegExp(wort)));
  assert.match(html, /name="readingKwh"[^>]*required/);
  assert.doesNotMatch(ablesungFormular(null), /Letzter Stand/);
});

// Ein vorbelegtes "bestanden" waere ein Klick, der immer dasselbe sagt.
test("Der FI-Test hat zwei Ausgänge, nicht einen vorbelegten", () => {
  const html = fiTestFormular();
  assert.match(html, /Ausgelöst — bestanden/);
  assert.match(html, /Nicht ausgelöst/);
  assert.match(html, /nicht zu benutzen/);
});
