import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const frontendDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stylesheets = ["styles.css", "design-system.css", "vde/styles.css", "platform-admin.css"];

// Zerlegt ein Stylesheet grob in Regeln. Verschachtelte Angaben sind in diesem
// Projekt nicht gebraeuchlich, deshalb genuegt ein flacher Durchlauf, der sich
// die zuletzt geoeffnete Medienabfrage merkt.
function leseRegeln(quelltext) {
  // Kommentare durch Leerzeichen gleicher Laenge ersetzen: so bleiben die
  // Zeilennummern erhalten, ohne dass Kommentartext in einen Selektor rutscht.
  const css = quelltext.replace(/\/\*[\s\S]*?\*\//g, (treffer) =>
    treffer.replace(/[^\n]/g, " "));
  const regeln = [];
  const stapel = [];
  const muster = /([^{}]+)\{([^{}]*)\}|@[a-z-]+[^{;]*\{|\}/g;
  let treffer;
  while ((treffer = muster.exec(css))) {
    if (treffer[0].endsWith("{") && treffer[0].startsWith("@")) {
      stapel.push(treffer[0].slice(1, -1).trim());
      continue;
    }
    if (treffer[0] === "}") {
      stapel.pop();
      continue;
    }
    const selektor = treffer[1].trim().replace(/\s+/g, " ");
    if (!selektor || selektor.startsWith("@")) continue;
    const eigenschaften = new Map();
    for (const angabe of treffer[2].split(";")) {
      const trenner = angabe.indexOf(":");
      if (trenner < 1) continue;
      eigenschaften.set(angabe.slice(0, trenner).trim(), angabe.slice(trenner + 1).trim());
    }
    regeln.push({
      position: treffer.index,
      zeile: css.slice(0, treffer.index).split("\n").length,
      selektor,
      eigenschaften,
      umgebung: stapel[stapel.length - 1] ?? null
    });
  }
  return regeln;
}

test("Das gemeinsame Designsystem hält die Proportionen der Desktop-Referenz fest", async () => {
  const css = await readFile(resolve(frontendDirectory, "design-system.css"), "utf8");
  const regeln = leseRegeln(css);
  const wurzel = regeln.find((regel) => regel.umgebung === null && regel.selektor === ":root");
  assert.ok(wurzel, "Dem Designsystem fehlen die globalen Tokens");

  const erwartet = new Map([
    ["--ui-brand", "#e30613"],
    ["--ui-sidebar", "#17191d"],
    ["--ui-sidebar-width", "216px"],
    ["--ui-sidebar-collapsed-width", "72px"],
    ["--ui-header-height", "58px"],
    ["--ui-content-max-width", "1320px"],
    ["--ui-control-height", "38px"],
    ["--ui-table-row-height", "44px"]
  ]);
  for (const [name, wert] of erwartet) {
    assert.equal(wurzel.eigenschaften.get(name), wert, `${name} weicht von der Referenz ab`);
  }

  assert.doesNotMatch(css, /(?:linear|radial)-gradient\(/, "Das zentrale UI braucht keine Verläufe");
});

test("Keine Anpassung fuer schmale Geraete wird von einer spaeteren Grundregel aufgehoben", async () => {
  const befunde = [];
  for (const datei of stylesheets) {
    const css = await readFile(resolve(frontendDirectory, datei), "utf8");
    const regeln = leseRegeln(css);
    const inMedien = regeln.filter((regel) => regel.umgebung?.startsWith("media"));
    const grundregeln = regeln.filter((regel) => regel.umgebung === null);
    for (const regel of inMedien) {
      for (const spaeter of grundregeln) {
        if (spaeter.position < regel.position || spaeter.selektor !== regel.selektor) continue;
        for (const [name, wert] of regel.eigenschaften) {
          if (!spaeter.eigenschaften.has(name)) continue;
          if (spaeter.eigenschaften.get(name) === wert) continue;
          befunde.push(
            `${datei}:${regel.zeile} "${regel.selektor} { ${name} }" aus @${regel.umgebung}`
            + ` wird in Zeile ${spaeter.zeile} wieder ueberschrieben`
          );
        }
      }
    }
  }
  // Bei gleicher Spezifitaet gewinnt die zuletzt notierte Regel. Eine
  // Medienabfrage weiter oben in der Datei bleibt deshalb wirkungslos, obwohl
  // sie zutrifft: genau so war die Wochenansicht auf dem Handy rechtsbuendig
  // geblieben. Anpassungen fuer schmale Geraete gehoeren ans Dateiende.
  assert.deepEqual([...new Set(befunde)], []);
});

test("Der Azubi erreicht sein Berichtsheft in der mobilen Leiste", async () => {
  // Das Designsystem blendet alle Desktop-Eintraege der unteren Leiste mit
  // `display: none !important` aus. Die Ausnahme fuer den Auszubildenden stand
  // in styles.css ohne !important und in der frueher geladenen Datei - sie war
  // damit wirkungslos, und "Azubi" fehlte am Telefon vollstaendig. Weil app.js
  // genau diesen Eintrag aus der Liste unter "Mehr" herausnimmt, sobald er in
  // die Hauptleiste gehoert, fuehrte anschliessend kein Weg mehr in den
  // Nachweis. Die Ausnahme muss deshalb dieselbe Durchsetzung mitbringen wie
  // die Regel, die sie aufhebt - und hinter ihr stehen.
  const designSystem = await readFile(resolve(frontendDirectory, "design-system.css"), "utf8");
  const regeln = leseRegeln(designSystem);
  const versteckt = regeln.findLast((regel) =>
    regel.umgebung?.startsWith("media")
    && regel.selektor.includes(".nav-item--desktop")
    && !regel.selektor.includes("apprentice")
    && regel.eigenschaften.get("display")?.startsWith("none"));
  assert.ok(versteckt, "Die mobile Leiste blendet die Desktop-Eintraege nicht mehr aus");

  const ausnahme = regeln.findLast((regel) =>
    regel.umgebung?.startsWith("media")
    && regel.selektor.includes(".nav-item--apprentice-mobile")
    && regel.eigenschaften.has("display"));
  assert.ok(ausnahme, "Das Berichtsheft hat in der mobilen Leiste keine Ausnahme");
  assert.ok(
    ausnahme.position > versteckt.position,
    "Die Ausnahme fuer das Berichtsheft muss hinter der allgemeinen Regel stehen"
  );
  const durchsetzung = versteckt.eigenschaften.get("display").includes("!important");
  assert.equal(
    ausnahme.eigenschaften.get("display").includes("!important"),
    durchsetzung,
    "Die Ausnahme braucht dieselbe Durchsetzung wie die Regel, die sie aufhebt"
  );
  assert.match(ausnahme.umgebung, /max-width/);

  // Der Eintrag fehlt unter "Mehr", solange er zur Hauptleiste gehoert. Ohne
  // die Ausnahme oben gaebe es damit ueberhaupt keinen Weg mehr.
  const app = await readFile(resolve(frontendDirectory, "app.js"), "utf8");
  assert.match(app, /!knopf\.classList\.contains\("nav-item--apprentice-mobile"\)/);
});

test("Firmenzeichen und Firmenname stehen im Kopf nebeneinander", async () => {
  // `.company-brand-line` legt display: flex fest, `.brand--small span` weiter
  // unten display: block. Die zweite Regel ist genauer und gewann: das
  // Firmenzeichen stand allein in einer eigenen Zeile ueber dem Firmennamen.
  // Dieselbe Falle wie bei den Medienabfragen, nur ohne Medienabfrage.
  const css = await readFile(resolve(frontendDirectory, "styles.css"), "utf8");
  const regeln = leseRegeln(css);
  const zeile = regeln.filter((regel) =>
    regel.umgebung === null
    && regel.selektor.includes("company-brand-line")
    && !regel.selektor.includes(">")
    && regel.eigenschaften.has("display"));
  assert.ok(zeile.length > 0, "Keine Regel legt die Darstellung der Firmenzeile fest");
  assert.equal(zeile.at(-1).eigenschaften.get("display"), "flex");

  const stoerer = regeln.findLast((regel) =>
    regel.umgebung === null
    && regel.selektor === ".brand--small strong, .brand--small span"
    && regel.eigenschaften.get("display") === "block");
  if (stoerer) {
    assert.ok(
      zeile.at(-1).position > stoerer.position,
      "Die Firmenzeile muss nach der allgemeinen Regel fuer .brand--small span stehen"
    );
  }
});

test("Auf der Einsatzkarte stehen Text und Schaltflaechen nicht nebeneinander", async () => {
  // Gemessen auf dem Handy: eine Karte der Plantafel ist 163 Pixel breit. Die
  // beiden Schaltflaechen "Aendern" und "Kopieren" brauchen zusammen 113 davon,
  // denn jede muss mindestens 44 Pixel messen. Nebeneinander blieben fuer den
  // Text 20 Pixel - Baustellenname, Hinweis und das Kennzeichen des
  // Vorarbeiters liefen aus ihrer Spalte heraus und lagen unter den
  // Schaltflaechen. Die Karte hat deshalb genau eine Spalte.
  const css = await readFile(resolve(frontendDirectory, "styles.css"), "utf8");
  const regeln = leseRegeln(css);
  const karte = regeln.findLast((regel) =>
    regel.umgebung === null && regel.selektor === ".week-assignment");
  assert.ok(karte, "Die Einsatzkarte hat keine eigene Regel");
  assert.equal(karte.eigenschaften.get("display"), "grid");
  assert.equal(
    karte.eigenschaften.has("grid-template-columns"),
    false,
    "Die Einsatzkarte darf Text und Schaltflaechen nicht in eine Zeile zwingen"
  );

  // Die Schaltflaechen bleiben gross genug zum Antippen - das ist der Grund,
  // warum sie eine eigene Zeile brauchen, und darf nicht als Ausweg schrumpfen.
  const knopf = regeln.findLast((regel) =>
    regel.umgebung === null && regel.selektor === ".week-assignment button");
  assert.ok(knopf, "Die Schaltflaechen der Einsatzkarte haben keine eigene Regel");
  assert.ok(Number.parseFloat(knopf.eigenschaften.get("min-width")) >= 44);
  assert.ok(Number.parseFloat(knopf.eigenschaften.get("min-height")) >= 44);
});

test("Die Tagesspalten der Plantafel rasten neben der Mitarbeiterspalte ein", async () => {
  // Ohne Einrasten blieb auf dem Handy fast immer eine Tagesspalte halb unter
  // der klebenden Mitarbeiterspalte stehen; die Karte darunter war zur Haelfte
  // verdeckt. Einrasten wirkt aber nur, wenn eine Spalte neben die klebende
  // Spalte passt - ist sie breiter als der Platz daneben, laesst der Browser
  // es fallen. Deshalb setzt app.js die beiden Breiten auf schmalen Geraeten.
  const css = await readFile(resolve(frontendDirectory, "styles.css"), "utf8");
  const app = await readFile(resolve(frontendDirectory, "app.js"), "utf8");
  const regeln = leseRegeln(css);

  const brett = regeln.findLast((regel) =>
    regel.umgebung === null && regel.selektor.includes("planning-week-board")
    && regel.eigenschaften.has("scroll-padding-left"));
  assert.ok(brett, "Die Plantafel haelt keinen Abstand fuer die klebende Spalte frei");
  assert.match(brett.eigenschaften.get("scroll-padding-left"), /--plan-employee/);

  const scroller = regeln.find((regel) =>
    regel.umgebung === null && regel.selektor.includes("planning-week-board")
    && regel.eigenschaften.has("scroll-snap-type"));
  assert.ok(scroller, "Die Plantafel rastet nicht ein");
  assert.match(scroller.eigenschaften.get("scroll-snap-type"), /^x /);

  const zelle = regeln.findLast((regel) =>
    regel.umgebung === null && regel.selektor.includes("planning-board-cell")
    && regel.eigenschaften.has("scroll-snap-align"));
  assert.ok(zelle, "Die Tagesspalten sind keine Rastpunkte");

  assert.match(app, /function applyPlanningBoardWidths\(\)/);
  assert.match(app, /--plan-employee/);
  assert.match(app, /--plan-day/);

  // Die Kopfzeile muss dieselbe klebende Spalte haben wie die Zeilen darunter.
  // Sonst rutscht beim Schieben der Tag der vorherigen Spalte ueber die
  // Mitarbeiterspalte, und ueber ihr steht ein anderes Datum als daneben.
  const kopf = regeln.findLast((regel) =>
    regel.umgebung === null
    && regel.selektor === ".planning-board-row--header > *:first-child");
  assert.ok(kopf, "Die Kopfzeile der Plantafel klebt nicht mit");
  assert.equal(kopf.eigenschaften.get("position"), "sticky");
});

test("Bedienelemente sind gross genug zum Antippen", async () => {
  const css = await readFile(resolve(frontendDirectory, "styles.css"), "utf8");
  const regeln = leseRegeln(css);
  const hoehe = (selektor, name = "min-height") => {
    const regel = regeln.findLast((eintrag) => eintrag.selektor === selektor);
    assert.ok(regel, `Regel ${selektor} fehlt`);
    const wert = regel.eigenschaften.get(name);
    assert.ok(wert, `${selektor} legt ${name} nicht fest`);
    return Number.parseFloat(wert);
  };
  // Die Felder des Stundenexports hatten keine eigene Gestaltung und waren in
  // der Vorgabe des Browsers nur rund 22 Pixel hoch.
  assert.ok(hoehe(".timesheet-export-form input, .timesheet-export-form select") >= 40);
  // Der Wochenwechsel war 30 Pixel gross, waehrend dieselbe Bedienung auf der
  // Plantafel 44 Pixel misst.
  assert.ok(hoehe(".week-navigation .week-button", "height") >= 40);
  assert.ok(hoehe(".week-navigation__today") >= 40);
  assert.ok(hoehe(".platform-announcement__dismiss") >= 40);
});

// Der Fehler, den dieser Test verhindert, ist nicht "jemand baut absichtlich
// ein winziges Knoepfchen". Er ist: eine Regel wird fuer die Maus geschrieben -
// 34 Pixel sind am Rechner ruhig und richtig - und gilt am Telefon einfach mit.
// Genau so standen die Pfeile der Plantafel bei 34, der Wochenwechsel bei 40
// und die Jahresauswahl bei 36. Am Zeiger faellt das nicht auf, am Daumen
// schon, und im Stylesheet sieht man es nur, wenn man danach sucht.
test("Am Telefon bleibt kein Daumenziel unter 44 Pixeln", async () => {
  const daumenziele = [
    ".week-button",
    ".avatar-button",
    ".week-navigation__today",
    ".admin-year-select",
    ".quick-access__menu button",
    ".entity-toolbar > .button"
  ];
  const befunde = [];

  for (const datei of stylesheets) {
    const css = await readFile(resolve(frontendDirectory, datei), "utf8");
    for (const regel of leseRegeln(css)) {
      // Nur Regeln, die ausschliesslich am Telefon gelten. Was ohne
      // Medienabfrage dasteht, gilt auch am Rechner und darf klein sein,
      // solange eine spaetere Telefonregel es anhebt - genau das prueft der
      // Browserlauf, und der Test daneben faengt die Umkehrung ab.
      const nurSchmal = regel.umgebung?.startsWith("media")
        && regel.umgebung.includes("max-width");
      if (!nurSchmal) continue;
      if (!daumenziele.some((ziel) => regel.selektor.includes(ziel))) continue;

      for (const name of ["width", "height", "min-height", "min-width"]) {
        const wert = regel.eigenschaften.get(name);
        if (!wert || !wert.endsWith("px")) continue;
        if (Number.parseFloat(wert) >= 44) continue;
        befunde.push(`${datei}:${regel.zeile} "${regel.selektor} { ${name}: ${wert} }"`);
      }
    }
  }

  assert.deepEqual(befunde, [], `Zu kleine Tippziele:\n${befunde.join("\n")}`);
});
