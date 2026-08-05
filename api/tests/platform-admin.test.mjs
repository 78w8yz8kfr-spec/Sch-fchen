import assert from "node:assert/strict";
import test from "node:test";
import {
  enumValue,
  integer,
  optionalText,
  optionalTimestamp,
  requiredText
} from "../src/platform-admin.mjs";

// Die Eingabepruefungen der Plattformverwaltung waren bisher nur mittelbar
// ueber den Integrationstest abgedeckt, und dort nur auf den erfolgreichen
// Wegen. Gerade hier entscheidet sich, ob ein Tippfehler eines
// Plattformadministrators zu einer verstuemmelten Firmenakte fuehrt.

const meldung = (fn) => {
  try {
    fn();
    return null;
  } catch (fehler) {
    return fehler.message;
  }
};

test("Ein Pflichttext verlangt Inhalt und begrenzt die Laenge", () => {
  assert.equal(requiredText("  Schaaf Elektro  ", "Firmenname"), "Schaaf Elektro");
  for (const leer of ["", "   ", null, undefined, 42, {}, []]) {
    assert.match(meldung(() => requiredText(leer, "Firmenname")) || "", /Firmenname/);
  }
  assert.equal(requiredText("a".repeat(20), "Kurzname", 20).length, 20);
  assert.match(meldung(() => requiredText("a".repeat(21), "Kurzname", 20)) || "", /höchstens 20/);
  // Fuehrende Leerzeichen zaehlen nicht gegen die Grenze.
  assert.equal(requiredText(`  ${"a".repeat(20)}  `, "Kurzname", 20).length, 20);
});

test("Ein freiwilliger Text darf fehlen, aber nicht falsch sein", () => {
  assert.equal(optionalText(null, "Notiz"), null);
  assert.equal(optionalText("", "Notiz"), null);
  assert.equal(optionalText(undefined, "Notiz"), null);
  assert.equal(optionalText("  Hinweis  ", "Notiz"), "Hinweis");
  // Ein Leerzeichenstring ist keine Angabe, aber auch kein gueltiger Text.
  assert.match(meldung(() => optionalText("   ", "Notiz")) || "", /Notiz/);
  assert.match(meldung(() => optionalText("a".repeat(11), "Notiz", 10)) || "", /höchstens 10/);
});

test("Eine Ganzzahl haelt ihre Grenzen ein", () => {
  assert.equal(integer(5, "Nutzerzahl"), 5);
  assert.equal(integer(0, "Nutzerzahl"), 0);
  assert.equal(integer(10, "Nutzerzahl", 1, 10), 10);
  for (const ungueltig of [1.5, "5", null, undefined, Number.NaN, Infinity, true]) {
    assert.match(meldung(() => integer(ungueltig, "Nutzerzahl")) || "", /Nutzerzahl ist ungültig/);
  }
  assert.match(meldung(() => integer(0, "Nutzerzahl", 1)) || "", /ungültig/);
  assert.match(meldung(() => integer(11, "Nutzerzahl", 1, 10)) || "", /ungültig/);
  // Eine negative Zahl faellt unter die Vorgabe von null.
  assert.match(meldung(() => integer(-1, "Nutzerzahl")) || "", /ungültig/);
});

test("Eine Auswahl laesst nur vorgesehene Werte zu", () => {
  const erlaubt = new Set(["permanent", "trial", "inactive"]);
  assert.equal(enumValue("trial", erlaubt, "Status"), "trial");
  for (const ungueltig of ["Trial", "unbekannt", "", null, undefined, 0]) {
    assert.match(meldung(() => enumValue(ungueltig, erlaubt, "Status")) || "", /Status ist ungültig/);
  }
});

test("Ein freiwilliger Zeitpunkt wird auf eine einheitliche Form gebracht", () => {
  assert.equal(optionalTimestamp(null, "Ende"), null);
  assert.equal(optionalTimestamp("", "Ende"), null);
  assert.equal(optionalTimestamp("2026-08-04T10:00:00Z", "Ende"), "2026-08-04T10:00:00.000Z");
  // Auch ein reines Datum ist zulaessig und wird ergaenzt.
  assert.equal(optionalTimestamp("2026-08-04", "Ende"), "2026-08-04T00:00:00.000Z");
  for (const ungueltig of ["gestern", "2026-13-45", "irgendwas"]) {
    assert.match(meldung(() => optionalTimestamp(ungueltig, "Ende")) || "", /Ende ist ungültig/);
  }
});
