import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildAssignmentImportPreview,
  cleanEmployeeLabel,
  normalizeImportText,
  parseAssignmentWorkbookRows,
  validateAssignmentImportPayload
} from "../src/assignment-import.mjs";

const fixtureBase64 = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "fixtures/assignment-import.xlsx.base64"),
  "utf8"
).trim();

function sampleRows() {
  const rows = Array.from({ length: 5 }, () => Array(11).fill(null));
  rows[0][8] = "Woche vom";
  rows[0][9] = "20.07.2026";
  rows[0][10] = "24.07.2026";
  rows[1][0] = "Baustelle";
  rows[1][1] = "Musterstraße 12";
  rows[1][6] = "Urlaub (U) / krank (K)";
  rows[2][0] = "Schaaf Elektro";
  rows[2].splice(1, 5, "Mo", "Die", "Mi", "Do", "Fr");
  rows[2].splice(6, 5, "Mo", "Die", "Mi", "Do", "Fr");
  rows[3][0] = "Mara Montage 2.LJ";
  rows[3][1] = "X";
  rows[3][2] = "x";
  rows[3][6] = "U";
  rows[4][0] = "Vorarbeiter";
  return rows;
}

test("Excel-Wochenplan erkennt X-Zuweisungen und ignoriert Abwesenheiten", () => {
  const plan = parseAssignmentWorkbookRows(sampleRows());
  assert.equal(plan.weekStart, "2026-07-20");
  assert.equal(plan.weekEnd, "2026-07-24");
  assert.equal(plan.marks.length, 2);
  assert.equal(plan.marks[0].employeeLabel, "Mara Montage");
  assert.deepEqual(plan.marks.map((mark) => mark.workDate), ["2026-07-20", "2026-07-21"]);
  assert.deepEqual(plan.statusCounts, { U: 1 });
});

test("Namen werden robust vereinheitlicht", () => {
  assert.equal(cleanEmployeeLabel("Merzdorf, Tom"), "Tom Merzdorf");
  assert.equal(cleanEmployeeLabel("Piet Kästner 2.LJ"), "Piet Kästner");
  assert.equal(normalizeImportText("Großöhme / Prüfung"), "grossOhme prufung".toLowerCase());
});

test("Vorschau ordnet bekannte Werte zu und schützt bestehende Tage", () => {
  const plan = parseAssignmentWorkbookRows(sampleRows());
  const employees = [{
    id: "employee-1",
    firstName: "Mara",
    lastName: "Montage",
    personnelNumber: "M-1"
  }];
  const sites = [{
    id: "site-1",
    name: "Musterstraße 12",
    projectName: "Musterprojekt",
    shortText: null
  }];
  const preview = buildAssignmentImportPreview(plan, employees, sites);
  assert.equal(preview.readyCount, 2);
  assert.equal(preview.ignoredStatusCount, 1);
  assert.deepEqual(preview.unmatchedEmployees, []);
  assert.deepEqual(preview.unmatchedSites, []);

  const protectedPreview = buildAssignmentImportPreview(plan, employees, sites, [{
    employeeId: "employee-1",
    siteId: "other-site",
    siteName: "Andere Baustelle",
    workDate: "2026-07-20"
  }]);
  assert.equal(protectedPreview.readyCount, 1);
  assert.equal(protectedPreview.conflicts.length, 1);
});

test("Unbekannte Baustellen verhindern unvollständige Tagesimporte", () => {
  const plan = parseAssignmentWorkbookRows(sampleRows());
  const preview = buildAssignmentImportPreview(plan, [{
    id: "employee-1",
    firstName: "Mara",
    lastName: "Montage",
    personnelNumber: "M-1"
  }], []);
  assert.equal(preview.readyCount, 0);
  assert.equal(preview.incompleteDayCount, 2);
  assert.deepEqual(preview.unmatchedSites, [{ name: "Musterstraße 12", assignments: 2 }]);
});

test("Upload akzeptiert nur kleine XLSX-Dateien", () => {
  const payload = validateAssignmentImportPayload({
    fileName: "Wochenplan.xlsx",
    contentBase64: fixtureBase64
  });
  assert.equal(payload.fileName, "Wochenplan.xlsx");
  assert.throws(
    () => validateAssignmentImportPayload({ fileName: "Wochenplan.xls", contentBase64: "UEsDBA==" }),
    /\.xlsx/
  );
  assert.throws(
    () => validateAssignmentImportPayload({ fileName: "Wochenplan.xlsx", contentBase64: "UEsDBA==" }),
    /gültige \.xlsx/
  );
});
