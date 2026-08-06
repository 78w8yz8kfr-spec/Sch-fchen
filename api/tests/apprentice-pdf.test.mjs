import assert from "node:assert/strict";
import test from "node:test";
import {
  buildApprenticeReportBookPdf,
  buildApprenticeReportPdf,
  isoWeekNumber,
  trainingYear
} from "../src/apprentice-pdf.mjs";
import {
  A4_BREITE,
  A4_HOEHE,
  lesbarerText,
  seitenStroeme,
  zeichenpunkte
} from "./helpers/pdf-messen.mjs";


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

test("Mehrere Wochen ergeben ein Heft mit einer Seite je Woche", async () => {
  // Am Ende der Ausbildung sind das gut hundertfuenfzig Blaetter. Sie einzeln
  // zu laden und von Hand zu heften ist genau die Arbeit, die abgenommen
  // werden soll.
  const reports = ["2024-05-13", "2024-05-20", "2024-05-27"].map((weekStart) => ({
    ...bericht(),
    weekStart,
    dailyEntries: [tag(weekStart, 2)]
  }));
  const content = await buildApprenticeReportBookPdf({
    reports: [reports[2], reports[0], reports[1]],
    apprentice: azubi,
    company: firma
  });
  const { document, seiten } = await seitenStroeme(content);
  assert.equal(document.getPageCount(), 3);
  assert.equal(document.getTitle(), "Berichtsheft Woche 20 / 2024 bis Woche 22 / 2024");

  // Ungeordnet uebergeben, geordnet gedruckt: im Ordner stehen die Wochen
  // hintereinander.
  const texte = seiten.map(lesbarerText);
  assert.match(texte[0], /Woche 20 \/ 2024/);
  assert.match(texte[1], /Woche 21 \/ 2024/);
  assert.match(texte[2], /Woche 22 \/ 2024/);
  // Durchgezaehlt wird ueber das ganze Heft, nicht je Woche neu.
  texte.forEach((text, index) => {
    assert.ok(text.includes(`Seite ${index + 1} von 3`), `Seite ${index + 1} ist falsch gezaehlt`);
  });
  assert.ok(zeichenpunkte(seiten).every((punkt) => punkt.y >= 40));
});

test("Das Lehrjahr wandert im Heft mit", async () => {
  // Ein Heft ueber zwei Lehrjahre truege sonst auf allen Blaettern dasselbe.
  const content = await buildApprenticeReportBookPdf({
    reports: ["2024-09-02", "2025-09-01"].map((weekStart) => ({
      ...bericht(), weekStart, dailyEntries: [tag(weekStart, 1)]
    })),
    apprentice: { name: "Max Mustermann", occupation: "Elektroniker", startedOn: "2024-08-01" },
    company: firma
  });
  const { seiten } = await seitenStroeme(content);
  assert.match(lesbarerText(seiten[0]), /1\. Lehrjahr/);
  assert.match(lesbarerText(seiten[1]), /2\. Lehrjahr/);
});

test("Ein unlesbares Firmenlogo verhindert den Ausdruck nicht", async () => {
  const content = await buildApprenticeReportPdf({
    report: bericht(),
    apprentice: azubi,
    company: firma,
    companyLogo: Buffer.from("kein brauchbares Bild")
  });
  const { document } = await seitenStroeme(content);
  assert.equal(document.getPageCount(), 1);
});

