// Absicherungen für die Formularüberarbeitung (Nutzerauftrag Punkt 5):
// wiederverwendbare Feldprüfung, Fehlermeldung direkt am Feld, Schutz vor
// Verlust ungespeicherter Eingaben und sichtbares Speichern.
//
// Wo sich eine Regel mechanisch aus dem Quelltext ableiten lässt, tut dieser
// Test das - statt einer Handliste von Feldnamen, die den nächsten Fall nicht
// mehr fängt. Nur die vier tatsächlich umgestellten Formulare werden dazu
// namentlich genannt; das ist keine Handliste von Feldern, sondern die
// eigentliche Abgrenzung dieser Änderung.
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const frontendDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readFrontendFile = (path) => readFile(resolve(frontendDirectory, path), "utf8");

const [html, app, styles] = await Promise.all([
  readFrontendFile("index.html"),
  readFrontendFile("app.js"),
  readFrontendFile("styles.css")
]);

// Die in diesem Auftrag vollständig umgestellten Bürobearbeitungsformulare.
// Vehicle-form und assignment-edit-form sind bewusst NICHT gelistet - sie
// wurden nicht umgestellt (siehe Abschlussbericht).
const MIGRIERTE_FORMULARE = ["customer-form", "customer-edit-form", "site-form", "site-edit-form"];

// Schneidet den Inhalt eines <form id="..."> ... </form> aus dem Markup.
// Formulare verschachteln sich in dieser Datei nicht ineinander, ein
// einfacher indexOf-Bereich genügt deshalb.
function formularBlock(quelltext, formularId) {
  const startMuster = new RegExp(`<form\\b[^>]*\\bid="${formularId}"[^>]*>`);
  const startTreffer = startMuster.exec(quelltext);
  assert.ok(startTreffer, `Formular #${formularId} nicht im Markup gefunden`);
  const inhaltStart = startTreffer.index + startTreffer[0].length;
  const inhaltEnde = quelltext.indexOf("</form>", inhaltStart);
  assert.ok(inhaltEnde > inhaltStart, `Schließendes </form> für #${formularId} nicht gefunden`);
  return quelltext.slice(inhaltStart, inhaltEnde);
}

// Alle id="..."-Werte, die in einem Ausschnitt vorkommen.
function idsIn(ausschnitt) {
  return [...ausschnitt.matchAll(/\bid="([\w-]+)"/g)].map((treffer) => treffer[1]);
}

test("Jedes migrierte Formular existiert im Markup und trägt novalidate (die native Sammelmeldung des Browsers ersetzt keine Feldprüfung)", () => {
  for (const formularId of MIGRIERTE_FORMULARE) {
    const öffnendesTag = new RegExp(`<form\\b[^>]*\\bid="${formularId}"[^>]*>`).exec(html)[0];
    assert.match(öffnendesTag, /\bnovalidate\b/, `#${formularId} sollte novalidate tragen, da app.js selbst validiert`);
  }
});

// ---------------------------------------------------------------------
// Mechanische Regel 1: jedes im Markup STATISCH als required markierte
// <input> in einem migrierten Formular hat ein eigenes Fehler-Element
// direkt daneben (id="<feld-id>-error", class enthält field-error).
// ---------------------------------------------------------------------
function statischPflichtfelder(formularHtml) {
  const tags = formularHtml.match(/<input\b[^>]*>/g) || [];
  return tags
    .filter((tag) => /\brequired\b/.test(tag))
    .map((tag) => /\bid="([\w-]+)"/.exec(tag)?.[1])
    .filter(Boolean);
}

test("Jedes statisch als required markierte Eingabefeld eines migrierten Formulars hat ein eigenes Fehler-Element", () => {
  let geprüfteFelder = 0;
  for (const formularId of MIGRIERTE_FORMULARE) {
    const block = formularBlock(html, formularId);
    const pflichtfelder = statischPflichtfelder(block);
    for (const feldId of pflichtfelder) {
      geprüfteFelder += 1;
      const fehlerMuster = new RegExp(`id="${feldId}-error"[^>]*class="field-error"`);
      assert.match(
        block,
        fehlerMuster,
        `#${formularId}: Pflichtfeld #${feldId} hat kein eigenes Fehler-Element #${feldId}-error`
      );
    }
  }
  // Belegt, dass die Schleife tatsächlich etwas geprüft hat - ein leerer
  // Durchlauf wäre grün, ohne irgendetwas zu beweisen.
  assert.ok(geprüfteFelder >= 8, `Erwartet mindestens 8 geprüfte Pflichtfelder, waren ${geprüfteFelder}`);
});

// ---------------------------------------------------------------------
// Mechanische Regel 2: jedes Feld, das app.js zur Laufzeit auf required
// schaltet (elements.X.required = ...) UND dessen DOM-Id innerhalb eines
// migrierten Formulars liegt, hat ebenfalls ein eigenes Fehler-Element.
// Das fängt die bedingten Pflichtfelder (Firmenname/Vorname/Nachname je
// nach Kundenart, neuer Kunde, Projektzuordnung), die im Markup selbst
// keine feste required-Markierung tragen.
// ---------------------------------------------------------------------

// Baut aus dem "const elements = { ... }"-Objektliteral eine Abbildung
// JS-Eigenschaftsname -> DOM-Id. Ein einfacher Klammerzähler genügt, da
// dieses Objekt in der Datei nicht mit anderen "const x = {" verschachtelt
// vorkommt (siehe auch medienBloecke() in desktop-layout.test.mjs für
// dasselbe Vorgehen bei CSS-Blöcken).
function elementsAbbildung(appJs) {
  const startMuster = /const elements = \{/;
  const startTreffer = startMuster.exec(appJs);
  assert.ok(startTreffer, "const elements = { ... } nicht gefunden");
  let tiefe = 1;
  let ende = startTreffer.index + startTreffer[0].length;
  while (tiefe > 0 && ende < appJs.length) {
    if (appJs[ende] === "{") tiefe += 1;
    else if (appJs[ende] === "}") tiefe -= 1;
    ende += 1;
  }
  const objektInhalt = appJs.slice(startTreffer.index + startTreffer[0].length, ende - 1);
  const abbildung = new Map();
  for (const treffer of objektInhalt.matchAll(/(\w+):\s*document\.querySelector\("#([\w-]+)"\)/g)) {
    abbildung.set(treffer[1], treffer[2]);
  }
  return abbildung;
}

test("Jedes von app.js dynamisch auf required geschaltete Feld eines migrierten Formulars hat ein eigenes Fehler-Element", () => {
  const abbildung = elementsAbbildung(app);
  const migrierteIds = new Set(
    MIGRIERTE_FORMULARE.flatMap((formularId) => idsIn(formularBlock(html, formularId)))
  );
  const dynamischePflichtfelder = [...app.matchAll(/elements\.(\w+)\.required\s*=/g)]
    .map((treffer) => treffer[1])
    .filter((eigenschaft) => migrierteIds.has(abbildung.get(eigenschaft)));

  assert.ok(
    dynamischePflichtfelder.length >= 5,
    `Erwartet mindestens 5 dynamisch gesteuerte Pflichtfelder in migrierten Formularen, waren ${dynamischePflichtfelder.length}`
  );
  for (const eigenschaft of dynamischePflichtfelder) {
    const feldId = abbildung.get(eigenschaft);
    const fehlerEigenschaft = `${eigenschaft}Error`;
    assert.ok(
      abbildung.has(fehlerEigenschaft),
      `elements.${eigenschaft} (#${feldId}) wird dynamisch pflicht, hat aber kein elements.${fehlerEigenschaft}`
    );
    const fehlerId = abbildung.get(fehlerEigenschaft);
    assert.match(
      html,
      new RegExp(`id="${fehlerId}"[^>]*class="field-error"`),
      `#${feldId}: erwartetes Fehler-Element #${fehlerId} fehlt im Markup oder trägt nicht class="field-error"`
    );
  }
});

// ---------------------------------------------------------------------
// Die wiederverwendbare Hilfsfunktion selbst: es gibt nur eine Fassung,
// und das Vorbild-Formular (Baustellenwahl) nutzt sie, statt eine eigene
// Kopie zu behalten.
// ---------------------------------------------------------------------
test("pruefeFormularFelder() existiert genau einmal und ersetzt die frühere Kopie im Vorbild-Formular", () => {
  const definitionen = [...app.matchAll(/function pruefeFormularFelder\(/g)];
  assert.equal(definitionen.length, 1, "pruefeFormularFelder() sollte nur eine einzige Definition haben");
  assert.match(
    app,
    /function validateFieldSiteForm\(\)\s*\{[\s\S]{0,300}?return pruefeFormularFelder\(fieldSiteValidation\);/,
    "validateFieldSiteForm() sollte die gemeinsame Hilfsfunktion aufrufen, statt eine eigene Prüfschleife zu behalten"
  );
});

test("pruefeFormularFelder() setzt aria-invalid, zeigt die Meldung an und springt zum ersten Fehler", () => {
  assert.match(app, /function pruefeFormularFelder\(validierungsTabelle\)\s*\{[\s\S]*?firstInvalid\.scrollIntoView/);
  assert.match(app, /feld\.setAttribute\("aria-invalid", ungueltig \? "true" : "false"\)/);
});

test("bindeFeldFehlerAufraeumen() räumt Fehlermeldung und aria-invalid beim Tippen wieder auf", () => {
  assert.match(
    app,
    /function bindeFeldFehlerAufraeumen\(validierungsTabelle\)\s*\{[\s\S]*?addEventListener\("input"[\s\S]*?aria-invalid", "false"\)/
  );
});

for (const formularId of MIGRIERTE_FORMULARE) {
  const kamel = formularId.replace(/-([a-z])/g, (_, buchstabe) => buchstabe.toUpperCase());
  test(`${formularId}: die Absenden-Behandlung ruft pruefeFormularFelder() auf, bevor etwas gesendet wird`, () => {
    const eigenschaft = `elements.${kamel}`;
    const submitMuster = new RegExp(
      `${eigenschaft.replace(/\./g, "\\.")}\\.addEventListener\\("submit",[\\s\\S]{0,400}?pruefeFormularFelder\\(`
    );
    assert.match(app, submitMuster, `${formularId}: kein pruefeFormularFelder()-Aufruf im submit-Handler gefunden`);
  });
}

// ---------------------------------------------------------------------
// Schutz vor Verlust ungespeicherter Eingaben: Zustand kommt aus dem
// tatsächlichen Feldvergleich (formularIstGeaendert), nicht aus einem
// Merker, der schon beim Hineinklicken anspringt.
// ---------------------------------------------------------------------
test("formularIstGeaendert() vergleicht den aktuellen Feldstand gegen die geladene Basis, statt einen Merker zu setzen", () => {
  assert.match(
    app,
    /function formularIstGeaendert\(form\)\s*\{[\s\S]*?formularBasisWerte\.get\(form\)[\s\S]*?feldwerteErfassen\(form\)/,
    "formularIstGeaendert() sollte die Basis mit dem aktuell erfassten Feldstand vergleichen"
  );
  // Kein einfacher Boolean, der schon bei einem einzigen Tastendruck kippt -
  // es muss tatsächlich verglichen werden.
  assert.match(app, /if \(basis\[key\] !== aktuell\[key\]\) return true;/);
});

test("beforeunload fragt nur nach, wenn wirklich ein registriertes Formular geändert ist", () => {
  assert.match(
    app,
    /window\.addEventListener\("beforeunload", \(event\) => \{\s*if \(!irgendeinFormularGeaendert\(\)\) return;\s*event\.preventDefault\(\);/
  );
});

test("Der Bereichswechsel (showDashboardPane) fragt bei ungespeicherten Änderungen nach, bevor er den Bereich wechselt", () => {
  assert.match(
    app,
    /function showDashboardPane\(pane, smooth = true\)\s*\{\s*(?:\/\/[^\n]*\n\s*)*if \(pane !== currentDashboardPane && !verlassenTrotzAenderungBestaetigt\(\)\) return;/
  );
});

test("Die migrierten Bearbeitungsformulare setzen beim Öffnen eine Basis und löschen sie nach Abbrechen oder Speichern", () => {
  for (const eigenschaft of ["customerEditForm", "siteEditForm"]) {
    const setzenMuster = new RegExp(`formularBasisSetzen\\(elements\\.${eigenschaft}\\)`);
    const loeschenMuster = new RegExp(`formularBasisLoeschen\\(elements\\.${eigenschaft}\\)`, "g");
    assert.match(app, setzenMuster, `elements.${eigenschaft}: kein formularBasisSetzen() beim Öffnen gefunden`);
    const loeschTreffer = [...app.matchAll(loeschenMuster)];
    assert.ok(
      loeschTreffer.length >= 2,
      `elements.${eigenschaft}: formularBasisLoeschen() sollte sowohl beim Abbrechen als auch nach erfolgreichem Speichern stehen (gefunden: ${loeschTreffer.length})`
    );
  }
});

// ---------------------------------------------------------------------
// Sichtbares Speichern: der Knopf selbst zeigt den laufenden Vorgang,
// nicht nur disabled (das sieht wie "geht nicht", nicht wie "läuft").
// ---------------------------------------------------------------------
test("Es gibt eine sichtbare Speichert-Darstellung (Text + CSS-Klasse), keine bloße disabled-Schaltung", () => {
  assert.match(app, /function setzeSpeichertZustand\(button, speichertText\)\s*\{[\s\S]*?classList\.add\("button--saving"\)/);
  assert.match(app, /function raeumeSpeichertZustandAuf\(button\)\s*\{[\s\S]*?classList\.remove\("button--saving"\)/);
  assert.match(styles, /\.button--saving\s*\{/);
});

test("submitAdminForm() und die migrierten Bearbeiten-Formulare nutzen die sichtbare Speichert-Darstellung", () => {
  assert.match(
    app,
    /async function submitAdminForm\([^)]*\)\s*\{[\s\S]*?setzeSpeichertZustand\(submit,/,
    "submitAdminForm() sollte setzeSpeichertZustand() statt einer bloßen disabled-Schaltung nutzen"
  );
  for (const eigenschaft of ["customerEditForm", "siteEditForm"]) {
    const muster = new RegExp(
      `elements\\.${eigenschaft}\\.addEventListener\\("submit",[\\s\\S]{0,900}?setzeSpeichertZustand\\(submit,`
    );
    assert.match(app, muster, `elements.${eigenschaft}: kein setzeSpeichertZustand()-Aufruf im submit-Handler`);
  }
});
