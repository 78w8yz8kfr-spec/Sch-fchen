import assert from "node:assert/strict";
import test from "node:test";
import readXlsxFile from "read-excel-file/node";
import { buildTimesheetWorkbook } from "../src/timesheet-export.mjs";

test("Excel-Export enthält Stundenzettel und unveränderliche Buchungen", async () => {
  const content = await buildTimesheetWorkbook({
    companyName: "Schaaf Elektro GmbH",
    from: "2026-07-27",
    to: "2026-08-02",
    workDays: [{
      personnelNumber: "M-17",
      employeeName: "Max Monteur",
      workDate: "2026-07-28",
      workflowStatus: "completed",
      firstClockInAt: "2026-07-28T05:00:00.000Z",
      lastClockOutAt: "2026-07-28T13:30:00.000Z",
      targetWorkMinutes: 510,
      grossMinutes: 510,
      breakMinutes: 60,
      workMinutes: 450,
      travelMinutes: 75,
      overtimeMinutes: 0,
      siteNames: ["Musterstraße 12"],
      warnings: []
    }],
    entries: [{
      personnelNumber: "M-17",
      employeeName: "Max Monteur",
      workDate: "2026-07-28",
      recordedAt: "2026-07-28T05:00:00.000Z",
      entryType: "clock_in",
      siteName: null,
      source: "offline",
      historyStatus: "Wirksam"
    }]
  });

  assert.ok(content.length > 5_000);
  const sheets = await readXlsxFile(content);
  const overview = sheets.find((sheet) => sheet.sheet === "Stundenzettel").data;
  const entries = sheets.find((sheet) => sheet.sheet === "Buchungen").data;
  assert.equal(overview[4][1], "Max Monteur");
  assert.equal(overview[4][3], "Abgeschlossen");
  assert.equal(overview[4][4].toISOString(), "2026-07-28T07:00:00.000Z");
  assert.equal(entries[4][4], "Arbeitsbeginn");
});
