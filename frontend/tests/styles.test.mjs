import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const frontendDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stylesheets = ["styles.css", "vde/styles.css", "platform-admin.css"];

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
