import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, verifyPassword } from "../src/password.mjs";

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
