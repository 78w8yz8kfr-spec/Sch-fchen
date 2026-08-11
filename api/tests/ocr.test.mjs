import test from "node:test";
import assert from "node:assert/strict";

import { datumAusText, lieferscheinnummerAusText } from "../src/ocr.mjs";

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
