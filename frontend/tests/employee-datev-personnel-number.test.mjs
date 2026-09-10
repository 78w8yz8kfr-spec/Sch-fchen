import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

// Die DATEV-Personalnummer gehoert zum Mitarbeiter (Betreiberauftrag: "Das
// soll dem mitarbeiter in der App zugeordnet werden koennen") und soll direkt
// im Anlegen- und im Bearbeiten-Formular eintragbar sein, statt nur in der
// separaten DATEV-Liste (#datev-personnel-numbers-admin). Diese Tests pruefen
// das textbasiert gegen index.html und app.js - wie datev-admin.test.mjs es
// fuer die DATEV-Liste bereits tut. app.js ist eine einzelne IIFE ohne eigene
// Exporte, ein Modul-Import der Formularlogik ist deshalb nicht moeglich.

const testDirectory = dirname(fileURLToPath(import.meta.url));
const frontendDirectory = resolve(testDirectory, "..");

const [html, app] = await Promise.all([
  readFile(resolve(frontendDirectory, "index.html"), "utf8"),
  readFile(resolve(frontendDirectory, "app.js"), "utf8")
]);

test("Das Feld steht in beiden Formularen direkt nach der Personalnummer", () => {
  assert.match(
    html,
    /id="employee-personnel-number"[^>]*>\s*<label for="employee-datev-personnel-number">DATEV-Personalnummer/
  );
  assert.match(
    html,
    /id="employee-edit-personnel-number"[^>]*>\s*<label for="employee-edit-datev-personnel-number">DATEV-Personalnummer/
  );
});

test("Das Feld ist in beiden Formularen freiwillig - keine Pflichtmarkierung, kein required", () => {
  for (const id of ["employee-datev-personnel-number", "employee-edit-datev-personnel-number"]) {
    const match = html.match(new RegExp(`<input\\s+id="${id}"[\\s\\S]*?>`));
    assert.ok(match, `Feld ${id} wurde nicht gefunden.`);
    assert.doesNotMatch(match[0], /\brequired\b/, `${id} darf nicht required sein.`);
  }
  assert.match(html, /<label for="employee-datev-personnel-number">DATEV-Personalnummer <span>\(optional\)<\/span><\/label>/);
  assert.match(html, /<label for="employee-edit-datev-personnel-number">DATEV-Personalnummer <span>\(optional\)<\/span><\/label>/);
});

test("Wofuer das Feld gut ist, steht knapp dabei", () => {
  assert.match(html, /id="employee-datev-personnel-number"[\s\S]{0,400}Für den DATEV-Lohnexport/);
  assert.match(html, /id="employee-edit-datev-personnel-number"[\s\S]{0,400}Für den DATEV-Lohnexport/);
});

test("Das erlaubte Format steht vorher im Formular, nicht erst als Fehlermeldung danach", () => {
  assert.match(html, /id="employee-datev-personnel-number"[\s\S]{0,300}Ein bis fünf Ziffern, nicht mit 0\s*\n?\s*beginnend/);
  assert.match(html, /id="employee-edit-datev-personnel-number"[\s\S]{0,300}Ein bis fünf Ziffern, nicht mit 0\s*\n?\s*beginnend/);
});

test("Zahlenfelder oeffnen den Ziffernblock am Telefon", () => {
  for (const id of ["employee-datev-personnel-number", "employee-edit-datev-personnel-number"]) {
    assert.match(html, new RegExp(`id="${id}"[\\s\\S]{0,80}inputmode="numeric"`), id);
  }
});

test("Barrierefreiheit: Eingabefelder sind per Label verknuepft, Rueckmeldung ueber das vorhandene aria-live-Feld", () => {
  assert.match(html, /<label for="employee-datev-personnel-number">DATEV-Personalnummer[\s\S]{0,40}<\/label>\s*<input\s+id="employee-datev-personnel-number"/);
  assert.match(html, /<label for="employee-edit-datev-personnel-number">DATEV-Personalnummer[\s\S]{0,40}<\/label>\s*<input\s+id="employee-edit-datev-personnel-number"/);
  // Kein neues aria-live-Feld - die Rueckmeldung laeuft ueber das jeweils
  // schon vorhandene Formularfeld.
  assert.match(html, /id="employee-message" class="form-message" aria-live="polite"/);
  assert.match(html, /id="employee-edit-message" class="form-message" aria-live="polite"/);
});

test("Dieselbe Formatpruefung wie im DATEV-Reiter, vorab im Formular", () => {
  assert.match(
    app,
    /function readEmployeeDatevPersonnelNumber\(inputElement\) \{\s*const raw = inputElement\.value\.trim\(\);\s*if \(raw !== "" && !DATEV_PERSONNEL_NUMBER_PATTERN\.test\(raw\)\) return \{ ok: false \};\s*return \{ ok: true, value: raw === "" \? null : raw \};\s*\}/
  );
  assert.match(app, /readEmployeeDatevPersonnelNumber\(elements\.employeeDatevPersonnelNumber\)/);
  assert.match(app, /readEmployeeDatevPersonnelNumber\(elements\.employeeEditDatevPersonnelNumber\)/);
});

test("Anlegen: Beim Absenden landet die geprüfte Nummer im tatsächlichen Anfragerumpf", () => {
  const fn = app.match(/elements\.employeeForm\.addEventListener\("submit", async \(event\) => \{([\s\S]*?)\n {2}\}\);/);
  assert.ok(fn, "Der Anlegen-Handler wurde nicht gefunden.");
  const body = fn[1];
  // Vorabpruefung blockiert das Absenden bei einem falschen Format, statt es
  // dem Server zu ueberlassen.
  assert.match(body, /if \(!datevPersonnelNumber\.ok\) \{\s*elements\.employeeMessage\.textContent =/);
  // Und im tatsaechlichen Nutzlast-Objekt steht der geprüfte Wert - nicht der
  // rohe Feldinhalt und kein per Hand nachgebautes "|| ''".
  assert.match(body, /personnelNumber: elements\.employeePersonnelNumber\.value,\s*datevPersonnelNumber: datevPersonnelNumber\.value,/);
  assert.doesNotMatch(body, /datevPersonnelNumber: elements\.employeeDatevPersonnelNumber\.value/);
});

test("Bearbeiten: Beim Absenden landet die geprüfte Nummer im tatsächlichen PATCH-Rumpf", () => {
  const fn = app.match(/elements\.employeeEditForm\.addEventListener\("submit", async \(event\) => \{([\s\S]*?)\n {2}\}\);/);
  assert.ok(fn, "Der Bearbeiten-Handler wurde nicht gefunden.");
  const body = fn[1];
  assert.match(body, /if \(!datevPersonnelNumber\.ok\) \{\s*elements\.employeeEditMessage\.textContent =/);
  const patchCall = body.match(
    /method: "PATCH",\s*body: JSON\.stringify\(\{([\s\S]*?)\}\)\s*\}\);/
  );
  assert.ok(patchCall, "Der PATCH-Aufruf wurde nicht gefunden.");
  assert.match(patchCall[1], /personnelNumber: elements\.employeeEditPersonnelNumber\.value,\s*datevPersonnelNumber: datevPersonnelNumber\.value,/);
  assert.doesNotMatch(patchCall[1], /datevPersonnelNumber: elements\.employeeEditDatevPersonnelNumber\.value/);
});

test("Ein leeres Feld ergibt echtes null im Anfragerumpf, nicht einen leeren Text", () => {
  // Diese Zusicherung prueft nicht nur die Formatpruefung (die kennt "null"
  // gar nicht), sondern die tatsaechliche Nutzlast beider Formulare: beide
  // verschicken die Variable "datevPersonnelNumber.value", die laut
  // readEmployeeDatevPersonnelNumber bei einem leeren Feld ausdruecklich auf
  // null gesetzt wird - nie auf "" und nie auf raw direkt.
  assert.match(app, /return \{ ok: true, value: raw === "" \? null : raw \};/);
  assert.doesNotMatch(app, /datevPersonnelNumber: raw \|\| ""/);
  assert.doesNotMatch(app, /datevPersonnelNumber: datevPersonnelNumber\.value \|\| ""/);
});

test("Beim Oeffnen des Bearbeiten-Formulars steht die vorhandene DATEV-Personalnummer im Feld", () => {
  // Ohne diese Zeile wuerde der erste Speichervorgang die vorhandene Nummer
  // unbemerkt mit nichts ueberschreiben, weil das Formular immer den
  // aktuellen Feldinhalt verschickt.
  const fn = app.match(/function openEmployeeEditor\(employee\) \{([\s\S]*?)\n {2}\}\n/);
  assert.ok(fn, "openEmployeeEditor wurde nicht gefunden.");
  assert.match(
    fn[1],
    /elements\.employeeEditDatevPersonnelNumber\.value = employee\.datevPersonnelNumber \|\| "";/
  );
});

test("Eine vergebene Nummer zeigt die Servermeldung unveraendert, ersetzt sie nicht durch einen eigenen Text", () => {
  // submitAdminForm (Anlegen) setzt error.message unveraendert - dieselbe
  // Regel wie im DATEV-Reiter.
  const helper = app.match(/async function submitAdminForm\([\s\S]*?\n {2}\}\n/);
  assert.ok(helper, "submitAdminForm wurde nicht gefunden.");
  assert.match(helper[0], /messageElement\.textContent = error\.message;/);
  // Und im Bearbeiten-Handler ebenso, kein Sonderfall fuer
  // datev_personnel_number_taken.
  const fn = app.match(/elements\.employeeEditForm\.addEventListener\("submit", async \(event\) => \{([\s\S]*?)\n {2}\}\);/);
  assert.ok(fn, "Der Bearbeiten-Handler wurde nicht gefunden.");
  assert.match(fn[1], /\} catch \(error\) \{\s*elements\.employeeEditMessage\.textContent = error\.message;\s*\} finally \{/);
  assert.doesNotMatch(fn[1], /datev_personnel_number_taken/);
});

test("Ein Mitarbeiter-Speichern haelt die DATEV-Liste nicht veraltet - beide Formulare rufen refreshAdmin auf", () => {
  const createFn = app.match(/elements\.employeeForm\.addEventListener\("submit", async \(event\) => \{([\s\S]*?)\n {2}\}\);/);
  const editFn = app.match(/elements\.employeeEditForm\.addEventListener\("submit", async \(event\) => \{([\s\S]*?)\n {2}\}\);/);
  assert.ok(createFn && editFn, "Formular-Handler wurden nicht gefunden.");
  assert.match(createFn[1], /refreshAdmin\(\)/);
  assert.match(editFn[1], /refreshAdmin\(\)/);
  // refreshAdmin() selbst haelt den DATEV-Bereich (inklusive der
  // Personalnummern-Liste) frisch - kein separater, leicht vergessener Aufruf.
  const refreshAdminFn = app.match(/async function refreshAdmin\([\s\S]*?\n {2}\}\n/);
  assert.ok(refreshAdminFn, "refreshAdmin wurde nicht gefunden.");
  assert.match(refreshAdminFn[0], /refreshDatevAdmin\(\)/);
  const refreshDatevAdminFn = app.match(/async function refreshDatevAdmin\(\) \{([\s\S]*?)\n {2}\}\n/);
  assert.ok(refreshDatevAdminFn, "refreshDatevAdmin wurde nicht gefunden.");
  assert.match(refreshDatevAdminFn[1], /refreshDatevPersonnelNumbers\(\)/);
  // refreshDatevPersonnelNumbers selbst holt die Liste tatsaechlich neu vom
  // Server, statt nur einen zwischengespeicherten Stand erneut anzuzeigen.
  assert.match(app, /requestJson\("\.\/api\/v1\/admin\/datev\/personnel-numbers"\)/);
});
