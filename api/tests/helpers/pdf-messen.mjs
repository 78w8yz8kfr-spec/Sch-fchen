import { PDFDocument, decodePDFRawStream } from "pdf-lib";

// Nachmessen, was wirklich auf dem Papier landet.
//
// Ein PDF sieht auch dann heil aus, wenn die Haelfte davon neben dem Blatt
// liegt: pdf-lib zaehlt Inhalt ausserhalb der Seite mit, das Papier zeigt ihn
// nicht. Eine Pruefung auf die Seitenzahl allein sagt darum nichts - genau
// dieser Fehler ist im Berichtsheft aufgetreten und waere ohne diese Messung
// bis zum ersten Ausdruck unbemerkt geblieben.
//
// Deshalb wird hier der Inhaltsstrom jeder Seite gelesen und ausgewertet:
// wohin gezeichnet wurde und welcher Text dort steht.

export const A4_BREITE = 595.28;
export const A4_HOEHE = 841.89;

export async function seitenStroeme(bytes) {
  const document = await PDFDocument.load(bytes);
  const seiten = [];
  for (let index = 0; index < document.getPageCount(); index += 1) {
    const page = document.getPage(index);
    const contents = page.node.Contents();
    if (!contents) {
      seiten.push("");
      continue;
    }
    const refs = typeof contents.asArray === "function" ? contents.asArray() : [contents];
    let strom = "";
    for (const ref of refs) {
      const stream = page.node.context.lookup(ref);
      strom += Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1");
    }
    seiten.push(strom);
  }
  return { document, seiten };
}

// Kaesten zeichnet pdf-lib verschoben: erst "1 0 0 1 x y cm", dann die Ecken
// relativ dazu. Wer die Verschiebung nicht mitrechnet, misst bei jedem Kasten
// den Nullpunkt statt seiner Lage. Darum wird der Strom Zeile fuer Zeile
// gelesen und der Stapel aus q/Q mitgefuehrt.
export function zeichenpunkte(seiten) {
  const punkte = [];
  for (const seite of seiten) {
    let verschiebung = { x: 0, y: 0 };
    const stapel = [];
    for (const zeile of seite.split("\n").map((eintrag) => eintrag.trim())) {
      if (zeile === "q") {
        stapel.push(verschiebung);
        continue;
      }
      if (zeile === "Q") {
        verschiebung = stapel.pop() || { x: 0, y: 0 };
        continue;
      }
      const verschoben = /^1 0 0 1 (-?[\d.]+) (-?[\d.]+) cm$/.exec(zeile);
      if (verschoben) {
        verschiebung = {
          x: verschiebung.x + Number(verschoben[1]),
          y: verschiebung.y + Number(verschoben[2])
        };
        continue;
      }
      const gezeichnet = /^(?:1 0 0 1 )?(-?[\d.]+) (-?[\d.]+) (?:Tm|m|l)$/.exec(zeile);
      if (gezeichnet) {
        punkte.push({
          x: verschiebung.x + Number(gezeichnet[1]),
          y: verschiebung.y + Number(gezeichnet[2])
        });
      }
    }
  }
  return punkte;
}

// Die Zeichenketten stehen hexadezimal im Strom; hier wieder als Text.
export function lesbarerText(seite) {
  return [...seite.matchAll(/<([0-9A-Fa-f]+)> Tj/g)]
    .map((treffer) => Buffer.from(treffer[1], "hex").toString("latin1"))
    .join(" ");
}

// Liegt alles auf dem Blatt? Gibt die Verstoesse zurueck, damit die
// Fehlermeldung sagt, wo gezeichnet wurde - eine blosse Zahl "false" schickt
// den Naechsten wieder auf die Suche.
//
// Der Rand nach unten ist bewusst bei null: eine Fussnote darf dicht an der
// Kante stehen, aber nichts darf darunter verschwinden.
export function ausserhalbDesBlattes(seiten, { breite = A4_BREITE, hoehe = A4_HOEHE } = {}) {
  const punkte = zeichenpunkte(seiten);
  return punkte
    .filter((punkt) => punkt.y < 0 || punkt.y > hoehe || punkt.x < 0 || punkt.x > breite)
    .map((punkt) => `x=${punkt.x.toFixed(0)} y=${punkt.y.toFixed(0)}`);
}
