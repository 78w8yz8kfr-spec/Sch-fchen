import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { glob } from "node:fs/promises";

const frontendDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Jede ausgelieferte Javascript-Datei muss sich als Modul lesen lassen.
//
// `node --check datei.js` genuegt dafuer nicht: ohne package.json prueft Node
// die Datei nicht als Modul und uebersieht Fehler, an denen der Browser sofort
// scheitert. Genau so ist eine ueberzaehlige Klammer mitten in app.js durch die
// Pruefung gekommen - die App startete gar nicht mehr, die Anmeldung blieb bei
// den Vorgaben aus der HTML stehen, und alle Tests waren trotzdem gruen.
// Deshalb wird hier mit der Endung .mjs geprueft.
test("Alle Skripte der App sind gueltige Module", async () => {
  const dateien = [];
  for await (const treffer of glob("**/*.js", { cwd: frontendDirectory })) {
    if (treffer.startsWith("tests/")) continue;
    dateien.push(treffer);
  }
  dateien.sort();
  assert.ok(dateien.length >= 8, `Es wurden nur ${dateien.length} Skripte gefunden`);

  const arbeitsordner = await mkdtemp(join(tmpdir(), "schaefchen-syntax-"));
  try {
    for (const datei of dateien) {
      const kopie = join(arbeitsordner, `${datei.replace(/[\\/]/g, "_")}.mjs`);
      await copyFile(resolve(frontendDirectory, datei), kopie);
      const ergebnis = spawnSync(process.execPath, ["--check", kopie], { encoding: "utf8" });
      assert.equal(
        ergebnis.status,
        0,
        `${datei} ist kein gueltiges Modul:\n${ergebnis.stderr}`
      );
    }
  } finally {
    await rm(arbeitsordner, { recursive: true, force: true });
  }
});
