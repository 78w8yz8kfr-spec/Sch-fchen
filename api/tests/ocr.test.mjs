import test from "node:test";
import assert from "node:assert/strict";

import { cpus } from "node:os";

import {
  datumAusText,
  fadengrenze,
  werkzeugstand,
  einheitNormal,
  lieferscheinnummerAusText,
  positionenAusText,
  texterkennung,
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

test("das Datum wird an seiner Beschriftung gefunden, nicht irgendwo", () => {
  assert.equal(datumAusText("Datum: 11.08.2026"), "2026-08-11");
  assert.equal(datumAusText("Lieferdatum 1.9.2026"), "2026-09-01");
  assert.equal(datumAusText("Lieferdatum: 2026-08-11"), "2026-08-11");
  assert.equal(datumAusText("geliefert am 03.07.2026"), "2026-07-03");

  // Auf einem echten Beleg stehen fünf Datumsangaben. Wer das erste nimmt,
  // das wie ein Datum aussieht, nimmt fast immer das falsche — im Betrieb
  // stand danach der 22.06. im Feld, auf einem Beleg vom August.
  assert.equal(datumAusText("Auftrag vom 22.06.2026"), null);
  assert.equal(datumAusText("Zahlbar bis 30.09.2026 ohne Abzug"), null);

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
  assert.equal(zeile.quantity, 500, "\"200mm\" ist ein Maß aus der Bezeichnung, keine Menge");
});

test("Zeilen eines echten Großhändlerbelegs", () => {
  // Wortlaut aus dem Betrieb. Vorher las das Programm hier "00010" als
  // Artikelnummer — die Positionsnummer, weil sie fünfstellig gedruckt wird
  // und die Regel nur bis zu drei Stellen fallen ließ.
  const [zeile] = positionenAusText("00010 33803088 P-5A0 4 4 ST");
  assert.equal(zeile.code, "33803088");
  assert.equal(zeile.quantity, 4);
  assert.equal(zeile.unit, "Stk");
});

test("das Kleingedruckte wird nicht zur Position", () => {
  // Ebenfalls aus dem Betrieb: aus einer Zeile Fußnotentext wurde eine
  // Position über "3 t" — drei Tonnen Kleinmaterial. Zwei Regeln verhindern
  // das: Maßeinheiten wie t, g und mm zählen nicht als Liefermenge, und die
  // Artikelnummer muss vorn stehen, nicht irgendwo im Satz.
  assert.deepEqual(
    positionenAusText("Geschäfte ug GUN: 4016708000008 * FU F3 T1r 1661991 > Persönieh haltende MN hafterin: UNL ELEKTRO Fac"),
    []
  );
  assert.deepEqual(positionenAusText("Es gilt unser Gerichtsstand 12345 Hamburg, Zahlung 30 Tage"), []);
  assert.deepEqual(positionenAusText("Sendungsgewicht 3 t"), [],
    "Eine Tonne ist keine Liefereinheit für Elektromaterial");
});

test("eine abgebrochene Erkennung meldet sich verständlich", async () => {
  // Der Wortlaut wird vom Aufrufer angehängt ("Der Beleg ließ sich nicht
  // lesen: …"). Stünde hier noch einmal "Texterkennung", stotterte die
  // Meldung auf dem Telefon — genau so stand sie im Betrieb.
  await assert.rejects(
    () => texterkennung(Buffer.from("kein Bild"), { befehl: "gibt-es-nicht-auf-diesem-rechner" }),
    (fehler) => {
      assert.ok(!/texterkennung/i.test(fehler.message),
        `Die Meldung wiederholt das Wort des Aufrufers: ${fehler.message}`);
      return true;
    }
  );
});

test("die Fadenzahl richtet sich nach der Zuteilung, nicht nach den gemeldeten Kernen", () => {
  // Der Kern des Problems: `os.cpus()` meldet die Kerne des Wirts. Steht dem
  // Behälter nur ein Bruchteil davon zu, drängeln sich ebenso viele Fäden um
  // ihn und warten mehr aufeinander, als sie rechnen. Gemessen an 48 MP: mit
  // vier freien Kernen 1,5 s ohne Grenze gegen 8,8 s mit fester Grenze eins —
  // auf einem Kern bei vier gemeldeten dagegen 0,75 s gegen 0,40 s. Fest zu
  // begrenzen wäre also genauso falsch wie gar nicht.
  const grenze = fadengrenze();
  assert.ok(Number.isInteger(grenze) && grenze >= 1,
    `Es muss mindestens ein Faden herauskommen, bekommen: ${grenze}`);
  assert.ok(grenze <= Math.max(1, cpus().length),
    "Mehr Fäden als gemeldete Kerne wären in keinem Fall sinnvoll");
});

test("der Werkzeugstand nennt, was für eine spätere Diagnose nötig ist", () => {
  // Nach drei Anläufen im Betrieb steht das in der Fehlermeldung: die Zahl
  // der Kerne entscheidet über OpenMP, die Größe des Sprachmodells über die
  // Rechenzeit. Das schnelle deutsche Modell misst rund anderthalb Megabyte,
  // das genaue ein Vielfaches.
  const stand = werkzeugstand();
  assert.match(stand, /Kerne gemeldet/);
  assert.match(stand, /genutzt/);
  assert.match(stand, /Modell \d+ KB|Sprachmodell nicht gefunden/);
});
