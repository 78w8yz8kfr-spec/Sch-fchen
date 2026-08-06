import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { buildTimesheetPdf } from "../src/timesheet-pdf.mjs";
import { ausserhalbDesBlattes, seitenStroeme } from "./helpers/pdf-messen.mjs";

function day(overrides = {}) {
  return {
    personnelNumber: "1",
    employeeName: "Markus Dehnert",
    workDate: "2026-07-28",
    approvalStatus: "approved",
    workflowStatus: "completed",
    firstClockInAt: "2026-07-28T04:30:00.000Z",
    lastClockOutAt: "2026-07-28T14:24:00.000Z",
    targetWorkMinutes: 510,
    grossMinutes: 594,
    breakMinutes: 60,
    workMinutes: 534,
    travelMinutes: 54,
    overtimeMinutes: 24,
    siteNames: ["Draisdorfer Straße / Blankenburger Straße"],
    warnings: [],
    ...overrides
  };
}

test("Persönlicher PDF-Stundenzettel ist ein lesbares A4-Dokument", async () => {
  const content = await buildTimesheetPdf({
    companyName: "Schaaf Elektro GmbH",
    from: "2026-07-27",
    to: "2026-08-02",
    workDays: [
      day(),
      day({
        workDate: "2026-07-29",
        approvalStatus: "locked",
        siteNames: ["Musterstraße 12"]
      })
    ]
  });

  assert.equal(content.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(content.length > 2_000);
  const document = await PDFDocument.load(content);
  assert.equal(document.getTitle(), "Stundenzettel");
  assert.equal(document.getSubject(), "Freigegebene Arbeitszeiten");
  assert.equal(document.getPageCount(), 1);
  assert.deepEqual(
    document.getPage(0).getSize(),
    { width: 595.28, height: 841.89 }
  );
});

test("Büro-PDF beginnt für jeden Mitarbeiter auf einer eigenen Seite", async () => {
  const content = await buildTimesheetPdf({
    companyName: "Schaaf Elektro GmbH",
    from: "2026-07-27",
    to: "2026-08-02",
    workDays: [
      day(),
      day({
        personnelNumber: "20",
        employeeName: "Klaus Dehnert",
        workDate: "2026-07-27"
      })
    ]
  });

  const document = await PDFDocument.load(content);
  assert.equal(document.getPageCount(), 2);
});

test("Ein voller Monat wird sauber auf Folgeseiten fortgesetzt", async () => {
  const workDays = Array.from({ length: 31 }, (_, index) => day({
    workDate: `2026-07-${String(index + 1).padStart(2, "0")}`,
    siteNames: ["Draisdorfer Straße / Blankenburger Straße", "Verwaltungsgebäude Nord"]
  }));
  const content = await buildTimesheetPdf({
    companyName: "Schaaf Elektro GmbH",
    from: "2026-07-01",
    to: "2026-07-31",
    workDays
  });

  const document = await PDFDocument.load(content);
  assert.ok(document.getPageCount() >= 2);
});

// Ein PDF sieht auch dann heil aus, wenn die Haelfte davon neben dem Blatt
// liegt: pdf-lib zaehlt Inhalt ausserhalb der Seite mit, das Papier zeigt ihn
// nicht. Im Berichtsheft ist genau das passiert und waere ohne Nachmessen bis
// zum ersten Ausdruck unbemerkt geblieben. Deshalb wird der Stundenzettel hier
// unter Last nachgemessen statt nur gezaehlt.
test("Auch unter Last bleibt jeder Strich auf dem Blatt", async () => {
  const faelle = {
    "eine Woche": Array.from({ length: 5 }, (_, index) => day({
      workDate: `2026-07-${String(index + 1).padStart(2, "0")}`
    })),
    "drei Jahre am Stück": Array.from({ length: 1000 }, (_, index) => day({
      workDate: `2026-07-${String((index % 28) + 1).padStart(2, "0")}`,
      employeeName: `Mitarbeiter Nummer ${Math.floor(index / 25) + 1}`
    })),
    "lange Namen, Baustellen und Hinweise": Array.from({ length: 20 }, (_, index) => day({
      workDate: `2026-07-${String(index + 1).padStart(2, "0")}`,
      employeeName: "Marie-Charlotte von und zu Hohenstein-Wittgenstein",
      siteNames: [
        "Draisdorfer Straße / Blankenburger Straße / Ecke Bahnhofstraße, Hinterhof links",
        "Zweite sehr lange Baustellenbezeichnung mit Zusatz und Hausnummer"
      ],
      warnings: ["Pause zu kurz", "Kein Feierabend gebucht", "Fahrzeit über Arbeitszeit"]
    }))
  };

  for (const [name, workDays] of Object.entries(faelle)) {
    const content = await buildTimesheetPdf({
      companyName: "Schaaf Elektro GmbH",
      from: "2026-07-01",
      to: "2026-07-31",
      workDays
    });
    const { seiten } = await seitenStroeme(content);
    const daneben = ausserhalbDesBlattes(seiten);
    assert.deepEqual(daneben, [], `${name}: gezeichnet bei ${daneben.slice(0, 3).join(", ")}`);
  }
});
