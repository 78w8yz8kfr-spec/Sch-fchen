import test from "node:test";
import assert from "node:assert/strict";

import { bildVerkleinern } from "../src/bild.mjs";

/**
 * Ein JPEG mit vorgegebener Kantenlaenge, gebaut ohne Bildbibliothek: die
 * Testdatei entsteht mit demselben Werkzeug, das auch die Verkleinerung macht.
 * Fehlt es, ueberspringt sich der Test - wie die uebrigen Tests, die aeussere
 * Programme brauchen.
 */
import { spawnSync } from "node:child_process";

function werkzeugDa() {
  for (const befehl of ["magick", "convert"]) {
    const lauf = spawnSync(befehl, ["-version"], { encoding: "utf8" });
    if (!lauf.error && lauf.status === 0) return befehl;
  }
  return null;
}

const befehl = werkzeugDa();
const mitWerkzeug = befehl ? test : test.skip;

function testbild(breite, hoehe) {
  const lauf = spawnSync(
    befehl,
    ["-size", `${breite}x${hoehe}`, "gradient:white-black", "-quality", "92", "jpeg:-"],
    { maxBuffer: 64 * 1024 * 1024 }
  );
  assert.equal(lauf.status, 0, "Das Testbild ließ sich nicht erzeugen");
  return lauf.stdout;
}

mitWerkzeug("ein großes Foto wird auf Arbeitsmaß gebracht", async () => {
  // Achtzehn Megapixel, wie sie ein Telefon liefert. Ungekürzt lief die
  // Erkennung im Betrieb in die Zeitgrenze.
  const gross = testbild(5000, 3750);
  const ergebnis = await bildVerkleinern(gross);

  assert.equal(ergebnis.verkleinert, true);
  assert.ok(ergebnis.bild.length < gross.length,
    `Verkleinert soll kleiner sein: ${ergebnis.bild.length} statt ${gross.length}`);
  assert.equal(ergebnis.grund, null);
});

mitWerkzeug("ein kleines Bild wird nicht aufgeblasen", async () => {
  // Ein Scan mit 1200 Bildpunkten ist schon klein genug. Neu kodiert käme er
  // womöglich größer zurück — dann ist das Original die bessere Wahl.
  const klein = testbild(1000, 750);
  const ergebnis = await bildVerkleinern(klein);

  assert.ok(ergebnis.bild.length <= klein.length);
  assert.equal(ergebnis.bild.equals(klein) || ergebnis.bild.length < klein.length, true);
});

test("ohne Bildwerkzeug kommt das Original zurück, nicht ein Fehler", async () => {
  // Ein großes Bild ist langsam, ein fehlendes ist nutzlos. Fällt das
  // Werkzeug aus, geht der Beleg unverkleinert weiter — und der Grund steht
  // dabei, damit eine spätere Zeitüberschreitung erklärbar bleibt.
  const bild = Buffer.from("kein echtes Bild, aber ein Puffer");
  const ergebnis = await bildVerkleinern(bild, { kante: 2000 });

  assert.ok(ergebnis.bild.equals(bild), "Das Original kommt unverändert zurück");
  assert.equal(ergebnis.verkleinert, false);
  assert.ok(ergebnis.grund, "Der Grund muss dabeistehen, sonst ist später nichts zu erklären");
});
