import assert from "node:assert/strict";
import test from "node:test";
import { companyLogoUrl } from "../src/database.mjs";

test("Firmenlogo-Referenzen werden ausschließlich als lokale Asset-URL ausgegeben", () => {
  assert.equal(
    companyLogoUrl("company-logos/schaaf-elektro.png"),
    "./assets/company-logos/schaaf-elektro.png"
  );
  assert.equal(companyLogoUrl(null), null);
  assert.equal(companyLogoUrl("../fremd.png"), null);
  assert.equal(companyLogoUrl("https://example.invalid/logo.png"), null);
  assert.equal(companyLogoUrl("company logos/logo.png"), null);
});
