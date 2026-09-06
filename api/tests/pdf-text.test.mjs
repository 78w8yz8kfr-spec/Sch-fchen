import assert from "node:assert/strict";
import test from "node:test";
import { pdfSafeText } from "../src/pdf-text.mjs";

// Diese Funktion ist der gemeinsame Zeichenschutz, den alle vier
// PDF-Erzeuger nutzen. Sie wird hier isoliert getestet, damit ein Fehler
// darin nicht erst in einem der vier viel größeren PDF-Tests auffällt.

test("Latin-1 bleibt unverändert", () => {
  assert.equal(pdfSafeText("Müller, Köln, Straße"), "Müller, Köln, Straße");
});

test("Halbgeviertstrich und typografische Anführungszeichen werden auf ASCII abgebildet", () => {
  // Diese Zeichen liegen zwar außerhalb von Latin-1, WinAnsi kennt sie aber
  // vollständig - eine verbreitete Fehlannahme ist, sie deshalb für ein
  // Absturzrisiko zu halten. Die Ersetzungstabelle bildet sie dennoch auf ein
  // ASCII-Äquivalent ab, damit die Ausgabe unabhängig vom Encoder stabil ist.
  assert.equal(pdfSafeText("Montag – Freitag"), "Montag - Freitag");
  assert.equal(pdfSafeText("„Zitat“"), "\"Zitat\"");
});

test("Zeichen außerhalb von Latin-1 mit bekannter Ersetzung werden lesbar ersetzt", () => {
  assert.equal(pdfSafeText("230 Ω"), "230 Ohm");
  assert.equal(pdfSafeText("ΔU"), "DeltaU");
  assert.equal(pdfSafeText("5 €"), "5 EUR");
});

test("Unbekannte Zeichen außerhalb von Latin-1 werden durch ein Fragezeichen ersetzt statt die Erzeugung abzubrechen", () => {
  // Namen mit osteuropäischen Sonderzeichen und Emoji haben keine sinnvolle
  // Ersetzung - hier zählt nur, dass daraus kein Absturz wird.
  assert.equal(pdfSafeText("Łukasz"), "?ukasz");
  assert.equal(pdfSafeText("Şahin"), "?ahin");
  assert.equal(pdfSafeText("Đorđe"), "?or?e");
  assert.equal(pdfSafeText("Hallo 😀"), "Hallo ?");
});

test("Leere und fehlende Werte werden zu leeren Zeichenketten", () => {
  assert.equal(pdfSafeText(null), "");
  assert.equal(pdfSafeText(undefined), "");
  assert.equal(pdfSafeText(""), "");
});
