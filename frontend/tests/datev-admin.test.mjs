import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { FULL_PLANNING_ROLES } from "../core/permissions.js";

// Diese Tests pruefen die Oberflaeche der DATEV-Lohnschnittstelle (Stufe 1)
// textbasiert gegen index.html und app.js - wie smoke.mjs es fuer die
// uebrige Oberflaeche schon tut. app.js ist eine einzelne IIFE ohne eigene
// Exporte; ein Modul-Import der Render- und Formular-Logik ist deshalb nicht
// moeglich, und die etablierte Pruefung fuer genau diesen Fall ist eine
// Textzusicherung gegen die ausgelieferte Datei selbst.

const testDirectory = dirname(fileURLToPath(import.meta.url));
const frontendDirectory = resolve(testDirectory, "..");

const [html, app] = await Promise.all([
  readFile(resolve(frontendDirectory, "index.html"), "utf8"),
  readFile(resolve(frontendDirectory, "app.js"), "utf8")
]);

test("Die DATEV-Rollen der Oberflaeche entsprechen genau dem API-Vertrag", () => {
  // api/src/datev.mjs (FULL_PLANNER_ROLES) verlangt exakt diese sechs Rollen.
  // FULL_PLANNING_ROLES ist dieselbe Liste, die auch canPlan() und
  // isProjectScopedSession() zugrunde liegt - ein Auseinanderlaufen wuerde
  // hier auffallen, statt erst am 403 datev_administration_forbidden.
  assert.deepEqual(
    [...FULL_PLANNING_ROLES].sort(),
    ["admin", "dispatch_office", "executive_assistant", "managing_director", "office", "planner"]
  );
});

test("DATEV ist ein Reiter der Einstellungen, kein eigener Navigationsbereich", () => {
  assert.match(html, /data-settings-view="datev"[^>]*>DATEV</);
  // Kein eigener Eintrag in der unteren Leiste - der Smoke-Test wacht ueber
  // deren Schluessel, und dort hat DATEV nichts zu suchen.
  assert.doesNotMatch(html, /id="nav-datev"/);
  assert.match(app, /const allowed = new Set\(\["time-accounts", "holidays", "time-rules", "datev", "account"\]\);/);
});

test("Sichtbarkeit folgt exakt der Planungsrolle, keiner engeren", () => {
  assert.match(app, /function canManageDatev\(\) \{\s*return canPlan\(\) && !isProjectScopedSession\(\);/);
});

test("Stammdaten: Feldlaengen und Pflichtfelder wie im API-Vertrag", () => {
  assert.match(html, /id="datev-consultant-number"[\s\S]{0,120}pattern="\[0-9\]\{1,7\}"/);
  assert.match(html, /id="datev-client-number"[\s\S]{0,120}pattern="\[0-9\]\{1,5\}"/);
  assert.match(html, /<option value="lodas">LODAS<\/option>/);
  assert.match(html, /<option value="lug">Lohn und Gehalt<\/option>/);
  // rowVersion 0 beim ersten Anlegen, sonst der geladene Stand - kein
  // stummes Ueberschreiben.
  assert.match(app, /rowVersion: datevSettingsState\?\.rowVersion \?\? 0/);
  assert.match(app, /error\.code === "row_version_conflict"/);
});

test("Lohnartenzuordnung bietet nur die festen Schluessel an, keine freie Eingabe", () => {
  assert.match(app, /const DATEV_TIME_TYPE_KEYS = \["work", "travel", "overtime"\];/);
  assert.match(
    app,
    /const DATEV_ABSENCE_TYPE_KEYS = \[\s*"vacation", "unpaid_vacation", "time_off", "leave", "special_leave",\s*"sick", "training", "vocational_school", "other"\s*\];/
  );
  // Die Uebersetzung der Abwesenheitsarten wird wiederverwendet, nicht ein
  // zweites Mal von Hand gepflegt.
  assert.match(app, /category === "time_type" \? datevTimeTypeLabel\(mappingKey\) : absenceTypeLabel\(mappingKey\)/);
});

test("Lohnartenzuordnung: Zeitart und Abwesenheitsart mit unterschiedlichen Pflichtfeldern", () => {
  assert.match(app, /elements\.datevMappingAbsenceCodeField\.hidden = isTimeType;/);
  assert.match(app, /elements\.datevMappingWageType\.required = isTimeType;/);
  assert.match(app, /elements\.datevMappingAbsenceCode\.required = !isTimeType;/);
  assert.match(app, /if \(isTimeType && !wageTypeNumber\)/);
  assert.match(app, /if \(!isTimeType && !absenceCode\)/);
  assert.match(html, /Bei Abwesenheitsarten optional zusätzlich zur Lohnartennummer/);
});

test("Der Ausfallschlüssel wird bei einer Zeitart immer als null verschickt, nie nur ausgeblendet", () => {
  // Migration 151 erzwingt per Check-Constraint
  // (datev_wage_type_mappings_time_type_shape_check) absence_code IS NULL
  // fuer category = 'time_type'. Das Formularfeld ist bei einer Zeitart nur
  // versteckt (hidden), nicht geleert: wer vorher eine Abwesenheitsart
  // bearbeitet hat, kann darin noch eine Zahl stehen haben. Die if-Schranken
  // oben pruefen nur die Formularregeln vor dem Absenden - diese Zusicherung
  // prueft den tatsaechlichen Anfragerumpf, denn genau dort muss die
  // Zeitart den Wert unabhaengig vom Feldinhalt auf null erzwingen, sonst
  // lehnt die Datenbank eine Eingabe ab, die der Nutzer gar nicht gemacht hat.
  const postCall = app.match(
    /requestJson\("\.\/api\/v1\/admin\/datev\/wage-type-mappings", \{\s*method: "POST",\s*body: JSON\.stringify\(\{([\s\S]*?)\}\)\s*\}\);/
  );
  assert.ok(postCall, "Der POST-Aufruf fuer die Lohnartenzuordnung wurde nicht gefunden.");
  assert.match(postCall[1], /absenceCode: isTimeType \? null : absenceCode,/);
});

test("Eine geänderte Zuordnung legt einen neuen Stand an, statt zu überschreiben", () => {
  // Kein PUT, kein PATCH, kein DELETE auf wage-type-mappings - nur GET und
  // POST, exakt wie der Server es serviert (Migration 151: nur SELECT/INSERT).
  assert.match(app, /requestJson\("\.\/api\/v1\/admin\/datev\/wage-type-mappings", \{\s*method: "POST"/);
  assert.doesNotMatch(app, /admin\/datev\/wage-type-mappings\/[^"]*",\s*\{\s*method: "(PUT|PATCH|DELETE)"/);
  assert.match(html, /Eine geänderte Zuordnung überschreibt die bisherige nicht/);
  assert.match(app, /includeHistory=true/);
  assert.match(html, /Frühere Zuordnungen anzeigen/);
  assert.match(app, /const history = \(datevMappingHistoryState \|\| \[\]\)\.filter\(\(mapping\) => mapping\.validUntil\);/);
});

test("Fehlende Zuordnungen springen ins Auge, statt zu verschwinden", () => {
  assert.match(app, /badge\.textContent = mapping \? "Gepflegt" : "Fehlt";/);
  assert.match(app, /missingCount === 0\s*\? "Alle Zuordnungen gepflegt"\s*: `\$\{missingCount\} von \$\{definitions\.length\} fehlen`/);
  assert.match(app, /if \(!line\.mapped\) row\.className = "datev-preview-row--missing";/);
  assert.match(html, /Diese Zuordnungen fehlen im gewählten Zeitraum/);
  assert.match(app, /create\.textContent = "Jetzt anlegen";/);
});

test("Der Kasten mit fehlenden Zuordnungen schaltet wirklich sichtbar, nicht nur seinen Inhalt", () => {
  // Ein richtig befuellter Kasten nuetzt nichts, wenn "hidden" ihn trotzdem
  // verdeckt - eine Vorschau, die eine Luecke verschweigt, ist gefaehrlicher
  // als gar keine (DATEV_EXPORT.md). Beide Richtungen zaehlen: ohne
  // fehlende Zuordnung bleibt der Kasten verborgen, mit mindestens einer
  // wird er sichtbar geschaltet - nicht umgekehrt fest verdrahtet.
  const fn = app.match(/function renderDatevPreview\(\) \{([\s\S]*?)\n {2}\}\n/);
  assert.ok(fn, "renderDatevPreview wurde nicht gefunden.");
  const body = fn[1];
  // Richtung 1: der Rueckstellwert vor jeder Fallunterscheidung ist "verborgen".
  assert.match(body, /elements\.datevPreviewMissing\.hidden = true;[\s\S]*if \(!datevPreviewState\)/);
  // Richtung 2: genau der Zweig mit einer tatsaechlichen Luecke schaltet ihn
  // sichtbar.
  assert.match(
    body,
    /if \(state\.missingMappings\.length > 0\) \{\s*elements\.datevPreviewMissing\.hidden = false;/
  );
});

test("Die Vorschau begrenzt den Zeitraum auf ein Jahr und erzeugt keine Datei", () => {
  assert.match(app, /if \(dayCount > 366\)/);
  assert.match(app, /if \(to < from\)/);
  assert.match(html, /Diese Vorschau erzeugt keine Exportdatei und überträgt nichts an/);
  // Keine vorgetaeuschte Export-Schaltflaeche in diesem Bereich.
  const datevSection = html.slice(html.indexOf('id="datev-settings-admin"'), html.indexOf('id="datev-preview-admin"') + 4000);
  assert.doesNotMatch(datevSection, />\s*Exportieren\s*</);
  assert.doesNotMatch(datevSection, />\s*Herunterladen\s*</);
  assert.doesNotMatch(datevSection, /An DATEV senden/);
});

test("Zahlenfelder oeffnen den Ziffernblock am Telefon", () => {
  for (const id of [
    "datev-consultant-number",
    "datev-client-number",
    "datev-mapping-wage-type",
    "datev-mapping-absence-code"
  ]) {
    assert.match(html, new RegExp(`id="${id}"[\\s\\S]{0,80}inputmode="numeric"`), id);
  }
});

test("Breite Tabellen scrollen in einem eigenen Container, nie die ganze Seite", () => {
  assert.match(html, /<div class="time-account-table-wrap">\s*<table id="datev-preview-table"/);
});
