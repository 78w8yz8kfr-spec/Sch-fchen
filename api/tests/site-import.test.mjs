import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSiteImportPreview,
  parseSiteWorkbook,
  parseSiteWorkbookRows
} from "../src/site-import.mjs";

function sampleRows() {
  return [
    ["Kunde", "Baustelle", "Aufgabe", "Straße", "Hausnummer", "PLZ", "Ort"],
    ["Muster GmbH", "Neubau Nord", "Verteilung", "Nordweg", "7", "01234", "Dresden"],
    ["Bestand AG", "Umbau Süd", "", "Südstraße", "12a", "98765", "Leipzig"]
  ];
}

test("Baustellenliste erkennt Pflichtspalten und bewahrt die PLZ als Text", () => {
  const plan = parseSiteWorkbookRows(sampleRows());
  assert.equal(plan.sourceRowCount, 2);
  assert.equal(plan.rows.length, 2);
  assert.equal(plan.rows[0].postalCode, "01234");
  assert.equal(plan.rows[0].projectName, null);
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
  rows.push(["Kunde", "Ohne Adresse", "", "", "", "", ""]);
  const plan = parseSiteWorkbookRows(rows);
  assert.equal(plan.rows.length, 2);
  assert.equal(plan.invalidRows.length, 1);
  assert.equal(plan.invalidRows[0].sourceRow, 4);
});

test("Die mitgelieferte Vorlage laesst sich importieren", async () => {
  // Die Vorlage enthielt zwei leere Blaetter: keine Ueberschriften, keine
  // Beispielzeile. Wer sie herunterlud, wusste nicht, welche Spalten gefuellt
  // werden muessen, und jeder Upload endete mit "Die Excel-Datei enthält keine
  // Baustellenzeilen."
  const pfad = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../frontend/assets/baustellen-import-vorlage.xlsx"
  );
  const plan = await parseSiteWorkbook(await readFile(pfad));
  assert.equal(plan.sourceRowCount, 1, "Die Vorlage enthaelt genau eine Beispielzeile");
  assert.equal(plan.rows.length, 1);

  const beispiel = plan.rows[0];
  for (const feld of ["customerName", "siteName", "street", "houseNumber", "postalCode", "city"]) {
    assert.ok(beispiel[feld], `Die Beispielzeile fuellt die Pflichtspalte ${feld}`);
  }

  // Ohne vorhandene Stammdaten ist die Zeile bereit zum Anlegen.
  const vorschau = buildSiteImportPreview(plan, [], []);
  assert.equal(vorschau.readyCount, 1);
  assert.equal(vorschau.conflictCount, 0);
  assert.equal(vorschau.duplicateCount, 0);
});
