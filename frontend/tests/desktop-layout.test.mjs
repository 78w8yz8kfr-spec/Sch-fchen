import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const frontendDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readFrontendFile = (path) => readFile(resolve(frontendDirectory, path), "utf8");

const [html, styles, designSystem, app] = await Promise.all([
  readFrontendFile("index.html"),
  readFrontendFile("styles.css"),
  readFrontendFile("design-system.css"),
  readFrontendFile("app.js")
]);

// Holt den Inhalt jedes "@media (min-width: NNNpx) { ... }"-Blocks auf oberster
// Ebene. Das Projekt verschachtelt Medienabfragen nicht, ein einfacher
// Klammerzähler genügt deshalb, statt einen vollen CSS-Parser mitzubringen -
// styles.test.mjs macht es aus demselben Grund genauso schlicht.
function medienBloecke(css, minWidthPx) {
  const treffer = [];
  const muster = new RegExp(
    String.raw`@media\s*\(min-width:\s*${minWidthPx}px\)\s*\{`,
    "g"
  );
  let start;
  while ((start = muster.exec(css))) {
    let tiefe = 1;
    let ende = muster.lastIndex;
    while (tiefe > 0 && ende < css.length) {
      if (css[ende] === "{") tiefe += 1;
      else if (css[ende] === "}") tiefe -= 1;
      ende += 1;
    }
    treffer.push(css.slice(muster.lastIndex, ende - 1));
  }
  return treffer;
}

test("--ui-content-max-width wächst mit dem Bildschirm, statt endlos leerzustehen", () => {
  // Gemessen (Auftrag): bei 1920×1080 blieben 192px, bei 2560×1440 sogar
  // 512px des Inhaltsbereichs ungenutzt, weil die Grenze immer bei 1320px
  // lag. Der Test leitet die Werte mechanisch aus der Datei ab, statt sie
  // als Wunschliste zu wiederholen - er soll den nächsten Rückschritt fangen,
  // nicht nur den heutigen Stand abschreiben.
  const basis = designSystem.match(/:root\s*\{[^}]*--ui-content-max-width:\s*(\d+)px/);
  assert.ok(basis, "Der Basiswert von --ui-content-max-width fehlt im :root");
  const basisWert = Number(basis[1]);

  const stufe1600 = medienBloecke(designSystem, 1600)
    .map((block) => block.match(/--ui-content-max-width:\s*(\d+)px/))
    .find(Boolean);
  const stufe2100 = medienBloecke(designSystem, 2100)
    .map((block) => block.match(/--ui-content-max-width:\s*(\d+)px/))
    .find(Boolean);
  assert.ok(stufe1600, "Ab 1600px fehlt eine breitere Grenze für --ui-content-max-width");
  assert.ok(stufe2100, "Ab 2100px fehlt eine noch breitere Grenze für --ui-content-max-width");

  const wert1600 = Number(stufe1600[1]);
  const wert2100 = Number(stufe2100[1]);
  assert.ok(
    wert1600 > basisWert,
    `Die Grenze ab 1600px (${wert1600}px) muss größer sein als die Grundeinstellung (${basisWert}px)`
  );
  assert.ok(
    wert2100 > wert1600,
    `Die Grenze ab 2100px (${wert2100}px) muss größer sein als die ab 1600px (${wert1600}px)`
  );

  // Bei 1280 und 1440 Pixeln Breite war die Seite laut Auftrag schon in
  // Ordnung - die Grundeinstellung (1080–1599px) bleibt deshalb unverändert
  // bei 1320px, und die neuen Stufen greifen erst darüber.
  assert.equal(basisWert, 1320, "Die Grundeinstellung darf 1280/1440 nicht verändern");
});

test("Die Reiterleiste der Betriebsmittelverwaltung bricht am Schreibtisch um, statt Reiter zu verstecken", () => {
  // Gemessen (Auftrag): bei 1280×720 lag der zehnte Reiter ("Historie") 58px
  // hinter dem rechten Rand, weil ".device-tabs" wie am Telefon waagerecht
  // schiebt. Der Test verlangt echten Umbruch (kein horizontales Schieben
  // mehr) in jedem Desktop-Block ab 1080px.
  const bloecke = medienBloecke(designSystem, 1080);
  assert.ok(bloecke.length > 0, "Es fehlt ein @media(min-width:1080px)-Block im Designsystem");
  const treffer = bloecke
    .map((block) => block.match(/\.device-tabs\s*\{([^}]*)\}/))
    .find(Boolean);
  assert.ok(treffer, "Für .device-tabs fehlt eine Desktop-Regel ab 1080px");
  const eigenschaften = treffer[1];
  assert.match(
    eigenschaften,
    /flex-wrap:\s*wrap/,
    ".device-tabs muss am Schreibtisch umbrechen (flex-wrap: wrap)"
  );

  // Die Telefon-Regel (kein @media, gilt überall) muss weiterhin schieben -
  // sonst verschwinden am Telefon zehn Reiter zu einer unbedienbaren Wand.
  const basisRegel = styles.match(/\.device-tabs\s*\{([^}]*)\}/);
  assert.ok(basisRegel, "Die Grundregel für .device-tabs fehlt");
  assert.match(
    basisRegel[1],
    /overflow-x:\s*auto/,
    "Am Telefon muss .device-tabs weiterhin waagerecht schieben können"
  );
});

test("„Meine Woche“ heißt in der Seitenleiste, in der Überschrift und im Fenstertitel gleich", () => {
  // Vorher: die Leiste sagte "Meine Woche" (nav-week), die Überschrift nur
  // "Woche" - dieselbe Seite unter zwei Namen. Die drei Fundstellen werden
  // hier gegeneinander geprüft, nicht gegen eine feste Zeichenkette, damit
  // eine künftige Umbenennung nicht an genau dieser Stelle wieder auseinanderläuft.
  const navText = html.match(
    /id="nav-week"[\s\S]*?<span>([^<]+)<\/span>\s*<\/button>/
  );
  assert.ok(navText, "Der Beschriftungstext von nav-week wurde nicht gefunden");

  const headingText = html.match(/<h2 id="week-title">([^<]+)<\/h2>/);
  assert.ok(headingText, "Die Überschrift #week-title wurde nicht gefunden");

  const titleText = app.match(/week:\s*"([^"]+)"/);
  assert.ok(titleText, "Der Eintrag für \"week\" im Fenstertitel-Katalog fehlt");

  assert.equal(
    headingText[1],
    navText[1],
    `Überschrift ("${headingText[1]}") und Navigationseintrag ("${navText[1]}") weichen voneinander ab`
  );
  assert.equal(
    titleText[1],
    navText[1],
    `Fenstertitel ("${titleText[1]}") und Navigationseintrag ("${navText[1]}") weichen voneinander ab`
  );
});

// Die drei Akten (Baustelle, Kunde, Mitarbeiter) scrollen beim Öffnen an
// ihren eigenen Anfang - die Liste darüber verschwindet dabei aus dem Blick.
// Jede bekommt denselben Brotkrumen-Aufbau: einen Link, der zur Liste
// zurückführt, ohne eine zweite, eigene Schließen-Logik zu erfinden.
const brotkrumen = [
  {
    bezeichnung: "Baustellenakte",
    linkId: "site-dashboard-breadcrumb",
    aktuellId: "site-dashboard-breadcrumb-current",
    zielId: "site-dashboard-close",
    formularId: null
  },
  {
    bezeichnung: "Kundenformular",
    linkId: "customer-edit-breadcrumb",
    aktuellId: "customer-edit-breadcrumb-current",
    zielId: "customerEditCancel",
    formularId: "customer-edit-form"
  },
  {
    bezeichnung: "Mitarbeiterformular",
    linkId: "employee-edit-breadcrumb",
    aktuellId: "employee-edit-breadcrumb-current",
    zielId: "closeEmployeeEditor",
    formularId: "employee-edit-form"
  }
];

test("Jede geöffnete Akte trägt einen Brotkrumen zurück zur Liste", () => {
  for (const eintrag of brotkrumen) {
    assert.match(
      html,
      new RegExp(`id="${eintrag.linkId}"[^>]*class="workspace-breadcrumb__link"`),
      `${eintrag.bezeichnung}: Der Brotkrumen-Link #${eintrag.linkId} fehlt oder trägt nicht die gemeinsame Komponentenklasse`
    );
    assert.match(
      html,
      new RegExp(`id="${eintrag.aktuellId}"[^>]*workspace-breadcrumb__current`),
      `${eintrag.bezeichnung}: Das aktuelle Ziel #${eintrag.aktuellId} fehlt`
    );
  }

  // Jeder Brotkrumen loest denselben Klick aus wie die vorhandene
  // Schliessen/Abbrechen-Schaltflaeche - er erfindet keine eigene Aktion.
  assert.match(
    app,
    /elements\.siteDashboardBreadcrumb\.addEventListener\("click",\s*\(\)\s*=>\s*\{\s*elements\.siteDashboardClose\.click\(\);/,
    "Der Brotkrumen der Baustellenakte muss denselben Klick wie \"Schließen\" auslösen"
  );
  assert.match(
    app,
    /elements\.customerEditBreadcrumb\.addEventListener\("click",\s*\(\)\s*=>\s*\{\s*elements\.customerEditCancel\.click\(\);/,
    "Der Brotkrumen des Kundenformulars muss denselben Klick wie \"Abbrechen\" auslösen"
  );
  assert.match(
    app,
    /elements\.employeeEditBreadcrumb\.addEventListener\("click",\s*closeEmployeeEditor\)/,
    "Der Brotkrumen des Mitarbeiterformulars muss dieselbe Funktion wie \"Abbrechen\" aufrufen"
  );
});

test("Kunden- und Mitarbeiterformular bleiben beim Öffnen unter der klebenden Kopfzeile sichtbar", () => {
  // Die Kachel ".entity-management-panel" hatte schon "scroll-margin-top",
  // aber app.js ruft scrollIntoView() auf dem FORMULAR darin auf - die
  // Eigenschaft muss am tatsächlich gescrollten Element stehen, sonst
  // verschwinden Brotkrumen und Überschrift unter der Kopfzeile.
  assert.match(
    app,
    /elements\.customerEditForm\.scrollIntoView/,
    "Vorbedingung geändert: app.js scrollt nicht mehr auf #customer-edit-form"
  );
  assert.match(
    app,
    /elements\.employeeEditForm\.scrollIntoView/,
    "Vorbedingung geändert: app.js scrollt nicht mehr auf #employee-edit-form"
  );

  const regel = styles.match(/#employee-edit-form,\s*#customer-edit-form\s*\{([^}]*)\}/);
  assert.ok(regel, "Für #employee-edit-form/#customer-edit-form fehlt eine gemeinsame scroll-margin-top-Regel");
  const pixelwert = Number((regel[1].match(/scroll-margin-top:\s*(\d+)px/) || [])[1]);
  assert.ok(
    Number.isFinite(pixelwert) && pixelwert > 0,
    "scroll-margin-top muss einen positiven Pixelwert haben"
  );

  const kopfzeilenhoehe = Number(
    (designSystem.match(/--ui-header-height:\s*(\d+)px/) || [])[1]
  );
  assert.ok(Number.isFinite(kopfzeilenhoehe), "--ui-header-height wurde nicht gefunden");
  assert.ok(
    pixelwert >= kopfzeilenhoehe,
    `scroll-margin-top (${pixelwert}px) muss mindestens die Kopfzeilenhöhe (${kopfzeilenhoehe}px) abdecken`
  );
});
