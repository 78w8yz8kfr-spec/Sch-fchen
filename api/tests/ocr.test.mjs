import test from "node:test";
import assert from "node:assert/strict";

import {
  datumAusText,
  einheitNormal,
  lieferscheinnummerAusText,
  positionenAusText,
  zahlAusText
} from "../src/ocr.mjs";

test("die Lieferscheinnummer wird an ihrer Beschriftung gefunden", () => {
  // Verankert an der Beschriftung und nicht an "irgendeine lange Zahl": auf
  // dem Blatt stehen Kunden-, Auftrags- und Telefonnummer daneben.
  assert.equal(
    lieferscheinnummerAusText("Lieferschein-Nr.: LS-2026-004711"),
    "LS-2026-004711"
  );
  assert.equal(lieferscheinnummerAusText("Lieferschein Nr 4711/26"), "4711/26");
  assert.equal(lieferscheinnummerAusText("LS-Nummer: 0099887766"), "0099887766");

  // Ohne Beschriftung wird nicht geraten.
  assert.equal(lieferscheinnummerAusText("Kundennummer: 55012"), null);
  assert.equal(lieferscheinnummerAusText("Bestellung: B-2026-000815"), null);
  assert.equal(lieferscheinnummerAusText(""), null);
  assert.equal(lieferscheinnummerAusText(null), null);
});

test("eine falsch gelesene Nummer wird lieber verworfen als übernommen", () => {
  // Eine falsche Nummer ist schlimmer als keine: sie sieht aus wie eine
  // Eingabe. Beide Fälle stammen aus echten Erkennungsläufen auf einem
  // schiefen, unscharfen Foto.
  assert.equal(lieferscheinnummerAusText("Lieferschein-Nr: 11.08.2026"), null,
    "Eine verrutschte Zeile liefert das Datum - das ist keine Nummer");
  assert.equal(lieferscheinnummerAusText("Lieferschein-Nr.: AB-12"), null,
    "Zu wenige Ziffern für eine Lieferscheinnummer");
});

test("das Datum wird in beiden gebräuchlichen Schreibweisen gelesen", () => {
  assert.equal(datumAusText("Datum: 11.08.2026"), "2026-08-11");
  assert.equal(datumAusText("Lieferdatum 1.9.2026"), "2026-09-01");
  assert.equal(datumAusText("2026-08-11"), "2026-08-11");

  // Zweistellige Jahre werden nicht ergänzt: "11.08.26" könnte 1926 heißen,
  // und ein geratenes Jahrhundert im Wareneingang findet später niemand mehr.
  assert.equal(datumAusText("Datum: 11.08.26"), null);
  assert.equal(datumAusText("ohne Datum"), null);
});

test("Mengen werden in deutscher Schreibweise gelesen", () => {
  assert.equal(zahlAusText("100"), 100);
  assert.equal(zahlAusText("1,5"), 1.5);
  assert.equal(zahlAusText("1.000"), 1000, "Drei Ziffern hinter dem Punkt sind Tausender");
  assert.equal(zahlAusText("1.000,5"), 1000.5);
  assert.equal(zahlAusText("2.5"), 2.5, "Zwei Ziffern hinter dem Punkt sind Nachkommastellen");

  // Was keine Menge ist, wird auch keine.
  assert.equal(zahlAusText("0"), null, "Eine Lieferung von null ist keine Position");
  assert.equal(zahlAusText("Stk"), null);
  assert.equal(zahlAusText(""), null);
});

test("die Einheit wird in die Schreibweise des Artikelstamms übersetzt", () => {
  assert.equal(einheitNormal("Stck"), "Stk");
  assert.equal(einheitNormal("STÜCK"), "Stk");
  assert.equal(einheitNormal("Meter"), "m");
  assert.equal(einheitNormal("lfm"), "m");
  // Unbekannte Einheiten bleiben stehen statt verworfen zu werden: der
  // Artikelstamm kennt Einheiten, die kein Lieferschein druckt.
  assert.equal(einheitNormal("Bund"), "Bund");
  assert.equal(einheitNormal(""), null);
});

test("Positionszeilen werden erkannt, der Briefkopf nicht", () => {
  // Wortlaut aus einem echten Erkennungslauf auf einem Handyfoto: die
  // Bezeichnung ist verstümmelt ("NYM-)"), Artikelnummer und Menge nicht.
  const positionen = positionenAusText([
    "Elektro-Großhandel Nord GmbH",
    "Hafenstraße 14 - 20457 Hamburg",
    "Lieferschein-Nr.: LS-2026-004711",
    "Datum: 11.08.2026",
    "Kundennummer: 55012",
    "Bestellung: B-2026-000815",
    "Pos Artikel-Nr. Bezeichnung Menge",
    "1 1055-04 Schalterdose tief 100 Stk",
    "2 NYM3X15 NYM-) 3x1,5 Ring 500m"
  ].join("\n"));

  assert.equal(positionen.length, 2,
    "Briefkopf, Kunden- und Bestellnummer tragen keine Einheit und sind deshalb keine Positionen");

  assert.deepEqual(
    positionen.map(({ code, quantity, unit }) => ({ code, quantity, unit })),
    [
      { code: "1055-04", quantity: 100, unit: "Stk" },
      { code: "NYM3X15", quantity: 500, unit: "m" }
    ]
  );
});

test("die letzte Menge der Zeile zählt, nicht die erste", () => {
  // "3x1,5" ist der Querschnitt des Kabels. Wer die erste Zahl nimmt, bucht
  // drei Meter statt fünfhundert.
  const [zeile] = positionenAusText("2 NYM3X15 NYM-J 3x1,5 Ring 500 m");
  assert.equal(zeile.quantity, 500);
  assert.equal(zeile.code, "NYM3X15");
});

test("ohne Artikelnummer entsteht keine Position", () => {
  // Eine Menge allein reicht nicht: ohne Nummer gäbe es nichts zuzuordnen,
  // und der Vorschlag wäre eine Behauptung.
  assert.deepEqual(positionenAusText("Verpackungseinheit 100 Stk"), []);
  assert.deepEqual(positionenAusText("Gewicht der Sendung 12 kg"), []);
  assert.deepEqual(positionenAusText(""), []);
});

test("die Positionsziffer am Zeilenanfang wird nicht für die Artikelnummer gehalten", () => {
  const [zeile] = positionenAusText("3. 4711-99 Kabelbinder 200mm 500 Stk");
  assert.equal(zeile.code, "4711-99");
});
