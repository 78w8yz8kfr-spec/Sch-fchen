import assert from "node:assert/strict";
import test from "node:test";
import readXlsxFile from "read-excel-file/node";
import { buildTimesheetWorkbook } from "../src/timesheet-export.mjs";

test("Excel-Export trennt Mitarbeiter, sortiert Tage und zeigt Stundensummen", async () => {
  const content = await buildTimesheetWorkbook({
    companyName: "Schaaf Elektro GmbH",
    from: "2026-07-27",
    to: "2026-08-02",
    workDays: [
      {
        personnelNumber: "M-17",
        employeeName: "Max Monteur",
        workDate: "2026-07-29",
        approvalStatus: "approved",
        workflowStatus: "completed",
        firstClockInAt: "2026-07-29T05:00:00.000Z",
        lastClockOutAt: "2026-07-29T13:30:00.000Z",
        targetWorkMinutes: 510,
        grossMinutes: 510,
        breakMinutes: 60,
        workMinutes: 450,
        travelMinutes: 75,
        overtimeMinutes: 0,
        siteNames: ["Musterstraße 12"],
        warnings: []
      },
      {
        personnelNumber: "A-02",
        employeeName: "Anna Aufbau",
        workDate: "2026-07-28",
        approvalStatus: "locked",
        workflowStatus: "billed",
        firstClockInAt: "2026-07-28T04:30:00.000Z",
        lastClockOutAt: "2026-07-28T13:00:00.000Z",
        targetWorkMinutes: 480,
        grossMinutes: 510,
        breakMinutes: 30,
        workMinutes: 480,
        travelMinutes: 60,
        overtimeMinutes: 0,
        siteNames: ["Hafenweg 4"],
        warnings: []
      },
      {
        personnelNumber: "M-17",
        employeeName: "Max Monteur",
        workDate: "2026-07-28",
        approvalStatus: "approved",
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
      }
    ],
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
  const overview = sheets.find((sheet) => sheet.sheet === "Übersicht").data;
  const anna = sheets.find((sheet) => sheet.sheet === "A-02 Anna Aufbau").data;
  const max = sheets.find((sheet) => sheet.sheet === "M-17 Max Monteur").data;
  const entries = sheets.find((sheet) => sheet.sheet === "Buchungen").data;
  assert.deepEqual(sheets.map((sheet) => sheet.sheet), [
    "Übersicht",
    "A-02 Anna Aufbau",
    "M-17 Max Monteur",
    "Buchungen"
  ]);
  assert.equal(overview[4][1], "Anna Aufbau");
  assert.equal(overview[5][1], "Max Monteur");
  assert.equal(overview[5][2], 2);
  assert.equal(overview[5][4], 0.625);
  assert.equal(anna[5][1], "Abgerechnet");
  assert.equal(anna[5][2], "06:30");
  assert.equal(max[5][1], "Freigegeben");
  assert.equal(max[5][0].toISOString(), "2026-07-28T00:00:00.000Z");
  assert.equal(max[6][0].toISOString(), "2026-07-29T00:00:00.000Z");
  assert.equal(max[2][1], 0.625);
  assert.equal(max[7][7], 0.625);
  assert.equal(entries[4][4], "Arbeitsbeginn");
});
