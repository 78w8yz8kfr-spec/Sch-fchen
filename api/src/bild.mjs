// Ein fotografierter Beleg auf Arbeitsmass bringen.
//
// WARUM DAS HIER STEHT UND NICHT NUR IM BROWSER
//
// Verkleinert wird zuerst im Browser, wo das Bild ohnehin liegt - das spart
// die Daten auf dem Weg. Verlassen kann man sich darauf nicht: ein Telefon
// liefert HEIC statt JPEG, ein aelterer Browser kennt kein Canvas, oder das
// Bild ist so gross, dass das Zeichnen still misslingt. In allen drei Faellen
// ging bisher das Original los, und der Server rechnete sich daran fest.
//
// Genau das ist im Betrieb passiert, zweimal: erst mit zwoelf Megapixeln,
// dann noch einmal, nachdem der Browser verkleinern sollte. Deshalb steht
// hier die zweite Sicherung - der Server nimmt an, dass er ein zu grosses
// Bild bekommt, und richtet es sich selbst her.
//
// DER JPEG-HINWEIS IST DER GANZE TRICK
//
// Gemessen an einem Beleg mit 48 Megapixeln, auf einem Kern:
//
//   direkt an die Texterkennung                      6,5 s
//   verkleinern, dann erkennen                       5,4 s
//   verkleinern MIT `jpeg:size`, dann erkennen       1,6 s
//
// Ohne den Hinweis dekodiert die Bibliothek erst das ganze Bild und wirft
// dann neun Zehntel davon weg. Mit ihm springt libjpeg beim Dekodieren
// gleich auf die naechstkleinere Stufe - die Arbeit entfaellt, statt
// hinterher verworfen zu werden.
//
// Der Hinweis steht bewusst hoeher als das Ziel (2400 statt 2000): libjpeg
// kann nur in Stufen halbieren, und wer knapp unter dem Ziel landet, hat
// nichts mehr zum Herunterrechnen.

import { spawn } from "node:child_process";

/** Die laengste Kante, mit der ein Beleg in die Erkennung geht. */
export const ARBEITSKANTE = 2000;

/** Wie lange das Verkleinern hoechstens dauern darf. */
const ZEITGRENZE_MS = 30_000;

/** ImageMagick 7 heisst `magick`, ImageMagick 6 `convert`. */
const BEFEHLE = ["magick", "convert"];

function einmalVersuchen(befehl, bild, kante) {
  return new Promise((fertig, scheitert) => {
    let lauf;
    try {
      lauf = spawn(befehl, [
        // Der Hinweis muss VOR der Eingabe stehen, sonst ist das Bild schon
        // dekodiert, wenn er gelesen wird.
        "-define", `jpeg:size=${Math.round(kante * 1.2)}x${Math.round(kante * 1.2)}`,
        "-",
        // Das Zeichen ">" heisst: nur verkleinern, nie vergroessern. Ein Scan
        // mit 1200 Bildpunkten soll nicht aufgeblasen werden.
        "-resize", `${kante}x${kante}>`,
        // Die Drehung aus den Kameradaten wird eingerechnet und danach
        // entfernt: ein quer gehaltenes Telefon liefert sonst ein Bild, das
        // aufrecht gespeichert, aber liegend gemeint ist.
        "-auto-orient",
        "-quality", "85",
        "jpeg:-"
      ]);
    } catch (fehler) {
      scheitert(fehler);
      return;
    }

    const teile = [];
    let fehlerstrom = "";
    const uhr = setTimeout(() => {
      lauf.kill("SIGKILL");
      scheitert(new Error("das Verkleinern hat zu lange gebraucht"));
    }, ZEITGRENZE_MS);

    lauf.stdout.on("data", (teil) => teile.push(teil));
    lauf.stderr.on("data", (teil) => { fehlerstrom += teil.toString("utf8"); });
    lauf.on("error", (fehler) => { clearTimeout(uhr); scheitert(fehler); });
    lauf.on("close", (code) => {
      clearTimeout(uhr);
      const heraus = Buffer.concat(teile);
      if (code !== 0 || !heraus.length) {
        scheitert(new Error(fehlerstrom.trim() || `Abbruchcode ${code}`));
        return;
      }
      fertig(heraus);
    });

    lauf.stdin.on("error", () => {
      // Bricht das Programm vorzeitig ab, ist die Leitung zu. Der Abbruchcode
      // oben sagt, was los war.
    });
    lauf.stdin.end(bild);
  });
}

/**
 * Das Bild auf Arbeitsmass bringen.
 *
 * Gibt immer ein brauchbares Bild zurueck: gelingt das Verkleinern nicht -
 * ImageMagick fehlt, das Format ist unbekannt, der Aufruf bricht ab -, kommt
 * das Original unveraendert zurueck. Ein grosses Bild ist langsam, ein
 * fehlendes ist nutzlos.
 *
 * `verkleinert` sagt, welcher der beiden Faelle eingetreten ist. Der Aufrufer
 * kann es melden, statt raten zu muessen, warum etwas lange dauerte.
 */
export async function bildVerkleinern(bild, { kante = ARBEITSKANTE } = {}) {
  let letzterFehler = null;
  for (const befehl of BEFEHLE) {
    try {
      const kleiner = await einmalVersuchen(befehl, bild, kante);
      // Ein bereits kleines Bild kommt manchmal groesser zurueck, weil es neu
      // kodiert wurde. Dann ist das Original die bessere Wahl.
      if (kleiner.length >= bild.length) {
        return { bild, verkleinert: false, grund: "war schon klein genug" };
      }
      return { bild: kleiner, verkleinert: true, grund: null };
    } catch (fehler) {
      letzterFehler = fehler;
    }
  }
  return { bild, verkleinert: false, grund: letzterFehler?.message || "kein Bildwerkzeug vorhanden" };
}
