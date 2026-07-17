import assert from "node:assert/strict";
import test from "node:test";
import {
  expectedNextTypes,
  localDate,
  validateLogin,
  validateTimeEntry,
  validateWorkDate
} from "../src/validation.mjs";

test("Login übernimmt keine Mandanten-ID aus dem Client", () => {
  assert.throws(
    () => validateLogin({
      companyNumber: "F-000001",
      personnelNumber: "M-1",
      password: "geheim",
      companyId: "00000000-0000-4000-8000-000000000000"
    }),
    /ausschließlich vom Server/
  );
});

test("Zeitbuchung validiert UUID, Zeitstempel und Baustellenpflicht", () => {
  const value = validateTimeEntry({
    clientEntryId: "11111111-1111-4111-8111-111111111111",
    entryType: "site_arrival",
    recordedAt: "2026-07-17T08:00:00+02:00",
    clientCreatedAt: "2026-07-17T08:00:01+02:00",
    constructionSiteId: "22222222-2222-4222-8222-222222222222"
  });
  assert.equal(value.entryType, "site_arrival");

  assert.throws(
    () => validateTimeEntry({
      clientEntryId: "11111111-1111-4111-8111-111111111111",
      entryType: "site_departure",
      recordedAt: "2026-07-17T08:00:00+02:00"
    }),
    /constructionSiteId fehlt/
  );
});

test("lokales Arbeitsdatum und Schrittfolge sind eindeutig", () => {
  assert.equal(localDate("2026-01-01T00:30:00Z", "Europe/Berlin"), "2026-01-01");
  assert.deepEqual(expectedNextTypes(null), ["clock_in"]);
  assert.deepEqual(expectedNextTypes("site_departure"), ["next_site", "clock_out"]);
  assert.deepEqual(expectedNextTypes("clock_out"), []);
  assert.equal(validateWorkDate("2026-07-17"), "2026-07-17");
  assert.throws(() => validateWorkDate("2026-02-30"), /ungültig/);
});
