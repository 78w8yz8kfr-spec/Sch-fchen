import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, decodePDFRawStream } from "pdf-lib";
import { buildApprenticeReportPdf, isoWeekNumber, trainingYear } from "../src/apprentice-pdf.mjs";

// Den Inhaltsstrom jeder Seite als Text zurueckgeben. Nur so laesst sich
// pruefen, was wirklich auf dem Papier landet.
async function seitenStroeme(bytes) {
  const document = await PDFDocument.load(bytes);
  const seiten = [];
  for (let index = 0; index < document.getPageCount(); index += 1) {
    const page = document.getPage(index);
    const contents = page.node.Contents();
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

// Ein PDF sieht auch dann heil aus, wenn die Haelfte davon neben dem Blatt
// liegt: pdf-lib zaehlt Inhalt ausserhalb der Seite mit, das Papier zeigt ihn
// nicht. Deshalb wird hier nachgemessen, wo tatsaechlich gezeichnet wurde.
//
// Kaesten zeichnet pdf-lib verschoben: erst "1 0 0 1 x y cm", dann die Ecken
// relativ dazu. Wer die Verschiebung nicht mitrechnet, misst bei jedem Kasten
// den Nullpunkt statt seiner Lage. Darum wird der Strom hier Zeile fuer Zeile
// gelesen und der Stapel aus q/Q mitgefuehrt.
function zeichenpunkte(seiten) {
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
function lesbarerText(seite) {
  return [...seite.matchAll(/<([0-9A-Fa-f]+)> Tj/g)]
    .map((treffer) => Buffer.from(treffer[1], "hex").toString("latin1"))
    .join(" ");
}

const A4_HOEHE = 841.89;
const A4_BREITE = 595.28;

const tag = (datum, anzahl, laenge = "kurz") => ({
  workDate: datum,
  activities: Array.from({ length: anzahl }, (_, index) => laenge === "lang"
    ? `Ausführliche Tätigkeit ${index + 1} mit Werkzeug, Material und Prüfung der Funktion vor Ort`
    : ["Steckdosen und Schalter gesetzt", "Leitungen im Obergeschoss verlegt",
       "Unterverteilung verdrahtet und geprüft", "Baustelle aufgeräumt",
       "Material aus dem Lager geholt"][index]),
  absence: null,
  workedMinutes: 465
});

const bericht = (overrides = {}) => ({
  weekStart: "2024-05-13",
  weekRemark: "Ruhige Woche ohne besondere Vorkommnisse.",
  apprenticeSignatureName: "Max Mustermann",
  submittedAt: "2024-05-17T14:00:00.000Z",
  trainerSignatureName: "Steffen Schaer",
  reviewedAt: "2024-05-17T16:00:00.000Z",
  dailyEntries: [
    tag("2024-05-13", 3),
    tag("2024-05-14", 2),
    { workDate: "2024-05-15", activities: [], absence: "Krank", workedMinutes: 0 }
  ],
  ...overrides
});

const azubi = {
  name: "Max Mustermann",
  occupation: "Elektroniker für Energie- und Gebäudetechnik",
  trainingYear: 2
};

const firma = { legalName: "Schaaf Elektro GmbH", displayName: "Schaaf Elektro" };

const blatt = (overrides = {}, person = azubi) =>
  buildApprenticeReportPdf({ report: bericht(overrides), apprentice: person, company: firma });

test("Die Kalenderwoche zählt nach ISO 8601", () => {
  // Dieselbe Zaehlung, die auf jedem deutschen Kalender steht. Der 13.05.2024
  // liegt in Woche 20, und der 30.12.2024 gehoert bereits zu Woche 1 des
  // Folgejahres - ohne die ISO-Regel stuende dort Woche 53 von 2024.
  assert.deepEqual(isoWeekNumber("2024-05-13"), { week: 20, year: 2024 });
  assert.deepEqual(isoWeekNumber("2024-12-30"), { week: 1, year: 2025 });
  assert.deepEqual(isoWeekNumber("2026-01-05"), { week: 2, year: 2026 });
});

test("Das Lehrjahr ergibt sich aus dem Ausbildungsbeginn", () => {
  // Von Hand gepflegt waere es spaetestens im zweiten Jahr falsch.
  assert.equal(trainingYear("2024-08-01", "2024-09-02"), 1);
  assert.equal(trainingYear("2024-08-01", "2025-09-01"), 2);
  assert.equal(trainingYear("2024-08-01", "2027-09-06"), 4);
  // Ueber das vierte Lehrjahr hinaus gibt es keines.
  assert.equal(trainingYear("2024-08-01", "2031-09-01"), 4);
  // Vor dem Beginn und ohne Beginn gibt es keine Angabe.
  assert.equal(trainingYear("2024-08-01", "2024-07-01"), null);
  assert.equal(trainingYear(null, "2026-03-02"), null);
});

test("Der Wochenbericht ist genau eine A4-Seite", async () => {
  const content = await blatt();

  assert.equal(content.subarray(0, 5).toString("ascii"), "%PDF-");
  const { document } = await seitenStroeme(content);
  // Eine Woche ist eine Seite. Zwei Seiten waeren im Ordner der Kammer eine
  // Woche zu viel.
  assert.equal(document.getPageCount(), 1);
  assert.deepEqual(document.getPage(0).getSize(), { width: A4_BREITE, height: A4_HOEHE });
  assert.equal(document.getTitle(), "Berichtsheft Woche 20 / 2024");
  assert.match(document.getSubject(), /Max Mustermann/);
});

test("Auch eine volle Arbeitswoche bleibt auf einem Blatt", async () => {
  // Fuenf Tage mit je drei Zeilen ist das, was ein Auszubildender wirklich
  // schreibt. Das muss auf das eine Blatt passen, ohne dass jemand kuerzt.
  const dailyEntries = Array.from({ length: 5 }, (_, index) => tag(`2024-05-${13 + index}`, 3));
  const content = await blatt({ dailyEntries });
  const { document } = await seitenStroeme(content);
  assert.equal(document.getPageCount(), 1);
});

test("Nichts wird neben das Blatt gezeichnet", async () => {
  // Der Fehler, den dieser Test findet: die Tabelle waechst mit dem Text und
  // schiebt Bemerkungen und Unterschriften unter den Blattrand. Auf dem
  // Bildschirm faellt das nicht auf, auf Papier fehlt die halbe Woche.
  for (const dailyEntries of [
    [],
    [tag("2024-05-13", 1)],
    Array.from({ length: 5 }, (_, index) => tag(`2024-05-${13 + index}`, 3)),
    Array.from({ length: 6 }, (_, index) => tag(`2024-05-${13 + index}`, 5)),
    Array.from({ length: 7 }, (_, index) => tag(`2024-05-${13 + index}`, 5, "lang"))
  ]) {
    const content = await blatt({
      dailyEntries,
      weekRemark: "Eine ausführliche Bemerkung zur Woche, ".repeat(12)
    });
    const { seiten } = await seitenStroeme(content);
    const punkte = zeichenpunkte(seiten);
    const tiefster = Math.min(...punkte.map((punkt) => punkt.y));
    const hoechster = Math.max(...punkte.map((punkt) => punkt.y));
    const rechtester = Math.max(...punkte.map((punkt) => punkt.x));
    assert.ok(tiefster >= 40, `Etwas steht bei y=${tiefster} unter dem Blattrand`);
    assert.ok(hoechster <= A4_HOEHE, `Etwas steht bei y=${hoechster} über dem Blattrand`);
    assert.ok(rechtester <= A4_BREITE, `Etwas steht bei x=${rechtester} neben dem Blatt`);
  }
});

test("Eine übervolle Woche verliert keine Zeile, sondern bekommt ein zweites Blatt", async () => {
  // Sieben Tage mit je fuenf langen Zeilen schreibt kaum jemand. Wenn doch,
  // dann steht alles Geschriebene im Ausdruck - notfalls auf zwei Blaettern.
  // Wegzulassen waere schlimmer: der Nachweis waere unvollstaendig.
  const dailyEntries = Array.from({ length: 7 }, (_, index) => tag(`2024-05-${13 + index}`, 5, "lang"));
  const content = await blatt({ dailyEntries });
  const { document, seiten } = await seitenStroeme(content);
  assert.ok(document.getPageCount() > 1);

  const seitenzahlen = seiten.map(lesbarerText)
    .map((text) => text.match(/Seite \d+ von \d+/)?.[0]);
  assert.deepEqual(seitenzahlen, seitenzahlen.map((_, index) =>
    `Seite ${index + 1} von ${seitenzahlen.length}`));

  // Jede geschriebene Zeile taucht im Ausdruck auf.
  const gesamttext = seiten.map(lesbarerText).join(" ");
  for (const eintrag of dailyEntries.flatMap((zeile) => zeile.activities)) {
    assert.ok(gesamttext.includes(eintrag.slice(0, 30)), `Es fehlt: ${eintrag}`);
  }
});

test("Ohne Unterschriften entsteht trotzdem ein Blatt zum Ausdrucken", async () => {
  // Ein Entwurf laesst sich mitnehmen und von Hand unterschreiben. Der Hinweis
  // am Fuss sagt, dass er ohne Unterschriften nicht gilt.
  const content = await blatt(
    { apprenticeSignatureName: null, submittedAt: null, trainerSignatureName: null, reviewedAt: null },
    { name: "Max Mustermann", occupation: null, trainingYear: null }
  );
  const { document, seiten } = await seitenStroeme(content);
  assert.equal(document.getPageCount(), 1);
  const text = seiten.map(lesbarerText).join(" ");
  assert.match(text, /ohne Unterschriften ungültig/);
  assert.match(text, /Datum:/);
});

test("Ein unlesbares Firmenlogo verhindert den Ausdruck nicht", async () => {
  const content = await buildApprenticeReportPdf({
    report: bericht(),
    apprentice: azubi,
    company: firma,
    companyLogo: Buffer.from("kein brauchbares Bild")
  });
  const document = await PDFDocument.load(content);
  assert.equal(document.getPageCount(), 1);
});

