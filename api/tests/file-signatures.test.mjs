import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { fileSignatureMatches } from "../src/file-signatures.mjs";

test("Dateisignaturen unterscheiden Inhalt von Browserangaben", async () => {
  assert.equal(
    fileSignatureMatches(Buffer.from("%PDF-1.7\n", "ascii"), "application/pdf"),
    true
  );
  assert.equal(
    fileSignatureMatches(Buffer.from("MZ als PDF umbenannt", "ascii"), "application/pdf"),
    false
  );
  assert.equal(
    fileSignatureMatches(
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x01, 0xff, 0xd9]),
      "image/jpeg"
    ),
    true
  );
  assert.equal(fileSignatureMatches(Buffer.from("bin\0är"), "text/plain"), false);

  const fixture = await readFile(resolve(
    dirname(fileURLToPath(import.meta.url)),
    "fixtures/site-import.xlsx"
  ));
  assert.equal(fileSignatureMatches(
    fixture,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ), true);
  assert.equal(fileSignatureMatches(
    fixture,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ), false);
});
