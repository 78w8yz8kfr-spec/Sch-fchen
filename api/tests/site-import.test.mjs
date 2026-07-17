import assert from "node:assert/strict";
import test from "node:test";
import { buildSiteImportPreview, parseSiteWorkbookRows } from "../src/site-import.mjs";

function sampleRows() {
  return [
    ["Kunde", "Baustelle", "Projekt", "Aufgabe", "Straße", "Hausnummer", "PLZ", "Ort"],
    ["Muster GmbH", "Neubau Nord", "Neubau", "Verteilung", "Nordweg", "7", "01234", "Dresden"],
    ["Bestand AG", "Umbau Süd", "", "", "Südstraße", "12a", "98765", "Leipzig"]
  ];
}

test("Baustellenliste erkennt Pflichtspalten und bewahrt die PLZ als Text", () => {
  const plan = parseSiteWorkbookRows(sampleRows());
  assert.equal(plan.sourceRowCount, 2);
  assert.equal(plan.rows.length, 2);
  assert.equal(plan.rows[0].postalCode, "01234");
  assert.equal(plan.rows[0].projectName, "Neubau");
});

test("Baustellenvorschau schützt Bestand und verwendet bekannte Kunden", () => {
  const plan = parseSiteWorkbookRows(sampleRows());
  const preview = buildSiteImportPreview(plan, [{
    id: "site-1",
    number: "SE-B-2026-0001",
    name: "Umbau Süd"
  }], [{ id: "customer-1", name: "Muster GmbH" }]);
  assert.equal(preview.readyCount, 1);
  assert.equal(preview.duplicateCount, 1);
  assert.equal(preview.rows[0].customerAction, "existing");
});

test("Fehlerhafte Zeilen werden einzeln gemeldet", () => {
  const rows = sampleRows();
  rows.push(["Kunde", "Ohne Adresse", "", "", "", "", "", ""]);
  const plan = parseSiteWorkbookRows(rows);
  assert.equal(plan.rows.length, 2);
  assert.equal(plan.invalidRows.length, 1);
  assert.equal(plan.invalidRows[0].sourceRow, 4);
});
