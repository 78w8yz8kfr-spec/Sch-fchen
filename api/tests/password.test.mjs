import assert from "node:assert/strict";
import test from "node:test";
import { generateTemporaryPassword, hashPassword, verifyPassword } from "../src/password.mjs";
import { InputError, password } from "../src/validation.mjs";

test("scrypt-Hash verifiziert nur das richtige Passwort", async () => {
  const hash = await hashPassword("Sicheres-Testpasswort-2026!");
  assert.match(hash, /^scrypt\$16384\$8\$1\$/);
  assert.equal(await verifyPassword("Sicheres-Testpasswort-2026!", hash), true);
  assert.equal(await verifyPassword("Falsches Passwort", hash), false);
});

test("ungültige oder überteuerte Hashparameter werden sicher abgewiesen", async () => {
  assert.equal(await verifyPassword("egal", "kein-hash"), false);
  assert.equal(
    await verifyPassword("egal", "scrypt$1048576$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"),
    false
  );
});

test("zu kurze Passwörter werden nicht gehasht", async () => {
  await assert.rejects(() => hashPassword("zu-kurz"), /zwischen 12 und 256/);
});

test("generateTemporaryPassword erzeugt ein gültiges, telefontaugliches Startpasswort", () => {
  for (let i = 0; i < 200; i += 1) {
    const generated = generateTemporaryPassword();
    // Erfüllt dieselbe Regel wie jedes andere Passwort im System - nicht nur
    // ein eigenes, loses Muster.
    assert.equal(password(generated), generated);
    assert.match(generated, /^[a-z]{4}-[a-z]{4}-[0-9]{4}$/);
    // Keine am Telefon verwechselbaren Zeichen: 0/O, 1/l/I.
    assert.doesNotMatch(generated, /[01loiOIL]/);
  }
});

test("generateTemporaryPassword streut und wiederholt sich nicht trivial", () => {
  const generated = new Set(Array.from({ length: 50 }, () => generateTemporaryPassword()));
  assert.equal(generated.size, 50);
});

test("password() weist ein rein alphabetisches oder rein numerisches Passwort ab", () => {
  assert.throws(() => password("nurbuchstabenohnezahlen"), InputError);
  assert.throws(() => password("123456789012"), InputError);
});
