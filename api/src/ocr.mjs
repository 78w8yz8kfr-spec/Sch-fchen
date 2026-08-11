// Texterkennung auf einem fotografierten Beleg.
//
// Erkannt wird mit Tesseract, das im Produktionsimage mitliegt. Kein Dienst im
// Netz: ein Lieferschein nennt Lieferant, Preise und Mengen und verlaesst
// deshalb das Haus nicht.
//
// WAS DAS HIER LEISTET UND WAS NICHT
//
// Ein abfotografierter Lieferschein ist selten ein sauberes Blatt. Er ist
// geknickt, im Thermodruck verblasst, schraeg gehalten und im Halbdunkel des
// Lieferwagens aufgenommen. Tesseract liest daraus die grossen, geraden Dinge
// zuverlaessig - Nummern, Datumsangaben, Ueberschriften. Positionszeilen mit
// Artikelnummern und Mengen liest es oft falsch: aus einer 8 wird eine 3, aus
// "1,5" wird "15", und ein verrutschter Spaltenrand macht aus zwei Zeilen
// eine.
//
// Deshalb liest dieses Modul ausdruecklich NUR den Kopf des Belegs aus -
// Lieferscheinnummer und Datum - und gibt den erkannten Text unveraendert mit
// zurueck. Die Positionen tippt weiterhin ein Mensch.
//
// Das ist keine Sparsamkeit, sondern der Kern der Sache: eine falsch erkannte
// Menge waere schlimmer als gar keine. Sie sieht aus wie eine Eingabe, wird
// gebucht und faellt erst bei der Inventur auf. Eine falsch erkannte
// Lieferscheinnummer dagegen faellt sofort auf, weil sie neben dem Papier
// steht, das der Fahrer dagelassen hat.

import { spawn } from "node:child_process";

/** Wie lange Tesseract hoechstens rechnen darf. */
const ZEITGRENZE_MS = 20_000;

/**
 * Erkennt den Text eines Bildes.
 *
 * Tesseract wird als Programm aufgerufen und nicht als Bibliothek eingebunden:
 * das haelt die Abhaengigkeiten der API bei fuenf und macht den Ausfall
 * harmlos - fehlt das Programm, scheitert diese eine Anfrage und sonst nichts.
 */
export function texterkennung(bild, { sprache = "deu", befehl = "tesseract" } = {}) {
  return new Promise((fertig, scheitert) => {
    let lauf;
    try {
      // `stdin` als Quelle und `stdout` als Ziel: kein Zwischenspeichern auf
      // der Platte, und damit auch keine Reste, wenn etwas abbricht.
      lauf = spawn(befehl, ["stdin", "stdout", "-l", sprache, "--psm", "6"]);
    } catch (fehler) {
      scheitert(fehler);
      return;
    }

    let text = "";
    let fehlerstrom = "";
    const uhr = setTimeout(() => {
      lauf.kill("SIGKILL");
      scheitert(new Error("Die Texterkennung hat zu lange gebraucht."));
    }, ZEITGRENZE_MS);

    lauf.stdout.on("data", (teil) => { text += teil.toString("utf8"); });
    lauf.stderr.on("data", (teil) => { fehlerstrom += teil.toString("utf8"); });
    lauf.on("error", (fehler) => { clearTimeout(uhr); scheitert(fehler); });
    lauf.on("close", (code) => {
      clearTimeout(uhr);
      if (code !== 0) {
        scheitert(new Error(`Die Texterkennung ist fehlgeschlagen: ${fehlerstrom.trim()}`));
        return;
      }
      fertig(text);
    });

    lauf.stdin.on("error", () => {
      // Bricht Tesseract vorzeitig ab, ist die Leitung zu. Das ist kein
      // eigener Fehler - der Abbruchcode sagt oben, was los war.
    });
    lauf.stdin.end(bild);
  });
}

/**
 * Die Lieferscheinnummer aus dem erkannten Text.
 *
 * Gesucht wird zuerst dort, wo sie wirklich steht: hinter einer Beschriftung
 * wie "Lieferschein-Nr." Ohne diese Verankerung waere jede lange Zahl auf dem
 * Blatt ein Kandidat - die Kundennummer, die Auftragsnummer, die
 * Telefonnummer des Lieferanten -, und geraten waere schlimmer als nichts.
 */
export function lieferscheinnummerAusText(text) {
  const zeilen = String(text || "").split(/\r?\n/);
  const beschriftung = /(liefer(schein|be?leg)|ls)[\s.\-–—]*(nr\.?|nummer|no\.?|#)?\s*[:.]?\s*/i;

  for (const zeile of zeilen) {
    const treffer = beschriftung.exec(zeile);
    if (!treffer) continue;
    const rest = zeile.slice(treffer.index + treffer[0].length);
    // Mindestens vier Zeichen, mindestens eine Ziffer: kuerzere Fetzen sind
    // fast immer Reste der Beschriftung selbst.
    const nummer = /([A-Z0-9][A-Z0-9\-/.]{3,})/i.exec(rest);
    if (!nummer) continue;
    const gelesen = nummer[1].replace(/[.\-/]+$/, "");

    // Auf einem schlechten Foto liest Tesseract die Beschriftung noch richtig
    // und die Nummer daneben schon falsch - aus "LS-2026-004711" wird
    // "15-2026". Eine falsche Nummer ist schlimmer als keine: sie sieht aus
    // wie eine Eingabe. Deshalb zwei Bedingungen, die eine echte
    // Lieferscheinnummer erfuellt und ein Lesefehler meist nicht.
    const ziffern = (gelesen.match(/\d/g) || []).length;
    if (ziffern < 4) continue;
    // Was sich als Datum liest, ist keins: "11.08.2026" hinter der
    // Beschriftung heisst, dass die Zeile verrutscht ist.
    if (/^\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}$/.test(gelesen)) continue;
    return gelesen;
  }
  return null;
}

/**
 * Das Lieferdatum.
 *
 * Zwei Schreibweisen decken die deutschen Belege ab: 11.08.2026 und
 * 2026-08-11. Zweistellige Jahre werden bewusst NICHT ergaenzt - "11.08.26"
 * koennte 1926 heissen, und ein geratenes Jahrhundert im Wareneingang ist
 * genau die Art Fehler, die niemand mehr findet.
 */
export function datumAusText(text) {
  const gefunden = /\b(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})\b/.exec(String(text || ""));
  if (gefunden) {
    const [, tag, monat, jahr] = gefunden;
    return `${jahr}-${monat.padStart(2, "0")}-${tag.padStart(2, "0")}`;
  }
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(String(text || ""));
  return iso ? iso[0] : null;
}

/**
 * Was aus einem Foto herauszuholen ist.
 *
 * `text` steht immer dabei, auch wenn nichts erkannt wurde. Wer sieht, was das
 * Programm gelesen hat, versteht sofort, warum ein Feld leer blieb - und
 * fotografiert das naechste Mal gerader statt zu raten.
 */
export async function belegAuslesen(bild, optionen = {}) {
  const text = await texterkennung(bild, optionen);
  return {
    text: text.trim(),
    deliveryNoteNumber: lieferscheinnummerAusText(text),
    deliveredOn: datumAusText(text)
  };
}
