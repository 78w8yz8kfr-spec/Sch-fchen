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
// Deshalb liest dieses Modul den Kopf des Belegs aus - Lieferscheinnummer und
// Datum - und gibt den erkannten Text unveraendert mit zurueck.
//
// Die Positionen liest es ebenfalls, aber nach einer anderen Regel: eine Zeile
// wird nur dann zu einem Vorschlag, wenn ihre Artikelnummer im eigenen
// Artikelstamm wirklich existiert. Damit entscheidet nicht die Erkennung,
// sondern der Abgleich. Aus "NYM-)" wird kein Artikel, weil es keinen Artikel
// "NYM-)" gibt; aus "NYM3X15" schon, weil genau dieser Artikel angelegt ist.
//
// Die Messungen dazu waren eindeutig: auf einem Handyfoto in voller Aufloesung
// kamen Artikelnummer und Menge fehlerfrei durch - "1055-04", "100 Stk",
// "NYM3X15", "500m" -, waehrend die Klartext-Bezeichnung danebenlag. Deshalb
// wird ueber die Nummer zugeordnet und nie ueber den Namen.
//
// Gebucht wird davon nichts. Der Vorschlag landet in denselben Feldern, die
// sonst getippt werden, und geht denselben Weg: speichern, pruefen, buchen.
// Eine falsch erkannte Menge waere schlimmer als gar keine - sie saehe aus wie
// eine Eingabe -, und deshalb steht sie sichtbar im Formular statt still im
// Bestand.

import { spawn } from "node:child_process";

/**
 * Wie lange Tesseract hoechstens rechnen darf.
 *
 * Zwanzig Sekunden waren zu knapp, und zwar nachweislich: im Betrieb lief die
 * Erkennung eines Handyfotos in die Grenze. Auf dem Pruefrechner braucht
 * derselbe Beleg mit Rauschen und Hintergrund 2,1 Sekunden auf einem Kern -
 * eine geteilte Instanz mit einem Bruchteil davon liegt schnell beim
 * Zwanzigfachen.
 *
 * Die eigentliche Abhilfe steht nicht hier, sondern im Browser: das Bild geht
 * seit dieser Fassung auf 2000 Bildpunkte verkleinert los, was dieselbe Zahl
 * auf 0,8 Sekunden drueckt. Diese Grenze ist das Netz darunter, kein Ersatz
 * dafuer - und lieber grosszuegig, denn ein Abbruch kostet den ganzen Beleg,
 * waehrend ein paar Sekunden Warten nur Geduld kosten.
 */
const ZEITGRENZE_MS = 60_000;

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
      // Der Wortlaut sagt, was zu tun ist, und nicht nur, was war. Er wird
      // dem Aufrufer angehaengt, deshalb steht hier kein zweites Mal
      // "Texterkennung" - sonst stottert die Meldung auf dem Telefon.
      scheitert(new Error("das Bild war zu gross oder der Server zu langsam."));
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
 * Die Einheiten, die auf deutschen Lieferscheinen stehen.
 *
 * Links steht, was gedruckt wird, rechts, wie es im Artikelstamm heisst. Ohne
 * diese Uebersetzung waere "Stck" auf dem Papier und "Stk" im Stamm ein
 * Widerspruch, den jemand von Hand aufloesen muesste - jedes Mal aufs Neue.
 *
 * Bewusst nicht dabei: "x". Es steht auf einem Beleg oefter zwischen zwei
 * Massen ("3x1,5") als vor einer Menge.
 */
const EINHEITEN = new Map([
  ["stk", "Stk"], ["st", "Stk"], ["stck", "Stk"], ["stück", "Stk"],
  ["stueck", "Stk"], ["stk.", "Stk"], ["pcs", "Stk"],
  ["m", "m"], ["meter", "m"], ["mtr", "m"], ["lfm", "m"], ["lfdm", "m"],
  ["km", "km"], ["cm", "cm"], ["mm", "mm"],
  ["kg", "kg"], ["g", "g"], ["t", "t"],
  ["l", "l"], ["ltr", "l"], ["liter", "l"], ["ml", "ml"],
  ["m2", "m²"], ["m²", "m²"], ["qm", "m²"],
  ["pack", "Pack"], ["pck", "Pack"], ["packung", "Pack"],
  ["ve", "VE"], ["karton", "Karton"], ["kt", "Karton"], ["ktn", "Karton"],
  ["rolle", "Rolle"], ["rlle", "Rolle"], ["ring", "Ring"],
  ["btl", "Beutel"], ["beutel", "Beutel"], ["sack", "Sack"],
  ["set", "Set"], ["paar", "Paar"], ["dose", "Dose"], ["eimer", "Eimer"]
]);

// Laengste Schreibweise zuerst, sonst schluckt "m" das "meter" daneben.
const EINHEIT_MUSTER = [...EINHEITEN.keys()]
  .sort((eins, zwei) => zwei.length - eins.length)
  .map((wort) => wort.replace(/[.²]/g, (zeichen) => `\\${zeichen}`))
  .join("|");

const MENGE_MIT_EINHEIT = new RegExp(`(\\d[\\d.,]*)\\s*(${EINHEIT_MUSTER})(?![A-Za-zÄÖÜäöüß])`, "gi");

/** Die Einheit in der Schreibweise des Artikelstamms. */
export function einheitNormal(roh) {
  const wort = String(roh || "").trim().toLowerCase();
  return EINHEITEN.get(wort) || (wort ? String(roh).trim() : null);
}

/**
 * Eine Zahl, wie sie auf einem deutschen Beleg steht.
 *
 * "1.000,5" und "1000,5" und "1000.5" meinen dasselbe. Der Punkt ist der
 * schwierige Fall: er trennt Tausender oder Nachkommastellen, je nachdem, was
 * dahinter steht. Drei Ziffern hinter dem letzten Punkt heissen Tausender -
 * anders herum waere "1.000" ein Meter statt tausend.
 */
export function zahlAusText(roh) {
  const text = String(roh || "").trim();
  if (!/^\d[\d.,]*$/.test(text)) return null;

  let normal;
  if (text.includes(",")) {
    normal = text.replace(/\./g, "").replace(",", ".");
  } else {
    const teile = text.split(".");
    normal = teile.length > 1 && teile[teile.length - 1].length === 3
      ? teile.join("")
      : text;
  }
  const zahl = Number(normal);
  return Number.isFinite(zahl) && zahl > 0 ? zahl : null;
}

/**
 * Sieht dieses Wort aus wie eine Artikelnummer?
 *
 * Mindestens vier Zeichen, mindestens eine Ziffer, und nichts darin, was in
 * einer Artikelnummer nicht vorkommt. "Schalterdose" faellt an der Ziffer
 * durch, "tief" an der Laenge, "NYM-)" an der Klammer.
 */
function siehtAusWieNummer(wort) {
  if (wort.length < 4 || wort.length > 40) return false;
  if (!/\d/.test(wort)) return false;
  return /^[A-Za-z0-9][A-Za-z0-9\-_./]*$/.test(wort);
}

/**
 * Die Positionszeilen eines Belegs.
 *
 * Eine Zeile zaehlt nur, wenn sie beides hat: eine Menge mit Einheit und davor
 * etwas, das wie eine Artikelnummer aussieht. Diese Bedingung wirft den
 * Briefkopf, die Kundennummer und das Datum von allein hinaus - keine davon
 * traegt eine Einheit.
 *
 * Genommen wird die LETZTE Menge der Zeile. In "NYM-J 3x1,5 Ring 500m" ist die
 * erste Zahl ein Querschnitt und die letzte die Lieferung; andersherum
 * gerechnet stuenden 3 Meter Kabel im Lager.
 */
export function positionenAusText(text) {
  const zeilen = String(text || "").split(/\r?\n/);
  const gefunden = [];

  zeilen.forEach((zeile, nummer) => {
    const treffer = [...zeile.matchAll(MENGE_MIT_EINHEIT)];
    if (!treffer.length) return;
    const letzte = treffer[treffer.length - 1];
    const menge = zahlAusText(letzte[1]);
    if (menge === null) return;

    // Vor der Menge steht die Nummer. Eine fuehrende Positionsziffer faellt
    // weg, sonst waere "1" der Artikel und nicht die Zeilennummer.
    const woerter = zeile.slice(0, letzte.index).trim().split(/\s+/).filter(Boolean);
    if (woerter.length > 1 && /^\d{1,3}[.)]?$/.test(woerter[0])) woerter.shift();
    const code = woerter.find(siehtAusWieNummer);
    if (!code) return;

    gefunden.push({
      line: nummer + 1,
      text: zeile.trim(),
      code: code.replace(/[.\-/]+$/, ""),
      quantity: menge,
      unit: einheitNormal(letzte[2])
    });
  });

  return gefunden;
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
    deliveredOn: datumAusText(text),
    positions: positionenAusText(text)
  };
}
