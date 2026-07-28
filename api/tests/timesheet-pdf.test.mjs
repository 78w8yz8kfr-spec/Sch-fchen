import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { buildTimesheetPdf } from "../src/timesheet-pdf.mjs";

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
