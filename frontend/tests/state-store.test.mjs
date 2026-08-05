import assert from "node:assert/strict";
import test from "node:test";
import {
  DEMO_STORAGE_KEY,
  ONLINE_STORAGE_KEY,
  STATE_VERSION,
  carriedOverMessage,
  initialState,
  normalizeCompanyNumber,
  rememberedCompany,
  restoreState,
  serializeState,
  storageKey
} from "../core/state-store.js";

const HEUTE = "2026-08-04";
const GESTERN = "2026-08-03";

const buchung = (id, offen) => ({
  clientEntryId: id, type: "start", recordedAt: `${GESTERN}T07:00:00.000Z`,
  pendingSync: offen, syncError: null
});
const bericht = (id, offen) => ({ clientReportId: id, summary: "Abnahme", pendingSync: offen });

test("Vorfuehrung und Betrieb nutzen getrennte Speicher", () => {
  assert.equal(storageKey(true), DEMO_STORAGE_KEY);
  assert.equal(storageKey(false), ONLINE_STORAGE_KEY);
  assert.notEqual(DEMO_STORAGE_KEY, ONLINE_STORAGE_KEY);
});

test("Die Firmennummer wird so gelesen, wie ein Mensch sie tippt", () => {
  assert.equal(normalizeCompanyNumber("F-000020"), "F-000020");
  assert.equal(normalizeCompanyNumber(" f-000020 "), "F-000020");
  assert.equal(normalizeCompanyNumber("F 000020"), "F-000020");
  assert.equal(normalizeCompanyNumber("f000020"), "F-000020");
  // Nur die Ziffern vom Willkommensschreiben genuegen ebenfalls.
  assert.equal(normalizeCompanyNumber("20"), "F-000020");
  assert.equal(normalizeCompanyNumber("1"), "F-000001");
  assert.equal(normalizeCompanyNumber(""), "");
  assert.equal(normalizeCompanyNumber(null), "");
  assert.equal(normalizeCompanyNumber(undefined), "");
});

test("Eine unbekannte Schreibweise wird nicht verbogen", () => {
  // Die Spalte laesst 20 Zeichen zu. Eine spaeter anders vergebene Nummer darf
  // nicht an einem zu strengen Muster der App scheitern.
  assert.equal(normalizeCompanyNumber("schaaf-elektro"), "SCHAAF-ELEKTRO");
  assert.equal(normalizeCompanyNumber("F-0000001"), "F-0000001");
});

test("Ohne gemerkte Firma gilt die Firma der Ersteinrichtung", () => {
  const setup = { companyNumber: "F-000001", displayName: "Schaaf Elektro GmbH", logoUrl: "/logo.webp" };
  assert.deepEqual(rememberedCompany(null, setup), {
    number: "F-000001", displayName: "Schaaf Elektro GmbH", logoUrl: "/logo.webp"
  });
  assert.deepEqual(rememberedCompany({ number: "" }, setup).number, "F-000001");
  // Dieselbe Firma, nur anders geschrieben: Name und Logo bleiben.
  assert.deepEqual(rememberedCompany({ number: "1", displayName: "Alt" }, setup), {
    number: "F-000001", displayName: "Schaaf Elektro GmbH", logoUrl: "/logo.webp"
  });
});

test("Auf dem Geraet einer anderen Firma gewinnt deren Nummer", () => {
  // Der Server nennt nur die Firma der Ersteinrichtung. Ohne diese Regel
  // stuende auf jedem verkauften Geraet die falsche Firma im Anmeldeformular.
  const setup = { companyNumber: "F-000001", displayName: "Schaaf Elektro GmbH", logoUrl: "/logo.webp" };
  assert.deepEqual(rememberedCompany({ number: "F-000020", displayName: "Neukunde GmbH" }, setup), {
    number: "F-000020", displayName: "Neukunde GmbH", logoUrl: null
  });
  // Ohne bekannten Namen nennt die Anmeldung ehrlich nur die Nummer, und das
  // fremde Logo wird nicht weitergereicht.
  assert.deepEqual(rememberedCompany({ number: "F-000020" }, setup), {
    number: "F-000020", displayName: "F-000020", logoUrl: null
  });
});

test("Ohne Angaben des Servers bleibt die gemerkte Firma bestehen", () => {
  // Beim Start ist die Antwort des Servers noch nicht da.
  assert.deepEqual(rememberedCompany({ number: "F-000020", displayName: "Neukunde GmbH" }, null), {
    number: "F-000020", displayName: "Neukunde GmbH", logoUrl: null
  });
  assert.deepEqual(rememberedCompany(null, null), { number: "", displayName: "", logoUrl: null });
});

test("Ohne gespeicherten Stand beginnt ein leerer Arbeitstag", () => {
  for (const nichts of [null, undefined, {}, { version: 99, events: [] }, { version: STATE_VERSION }]) {
    const ergebnis = restoreState(nichts, { today: HEUTE });
    assert.deepEqual(ergebnis.state, initialState(HEUTE));
    assert.equal(ergebnis.carriedOver, null);
  }
});

test("Der Stand desselben Tages wird vollstaendig wiederhergestellt", () => {
  const gespeichert = {
    version: STATE_VERSION, workDate: HEUTE, workDayStatus: "open",
    events: [buchung("e-1", false)], reports: [bericht("r-1", false)],
    reportDraft: { workDate: HEUTE, text: "Entwurf" }, siteWorkspace: { siteId: "b-1" },
    assignments: [{ id: "a-1" }], userId: "u-1"
  };
  const ergebnis = restoreState(gespeichert, { today: HEUTE });
  assert.equal(ergebnis.state.workDayStatus, "open");
  assert.equal(ergebnis.state.events.length, 1);
  assert.deepEqual(ergebnis.state.reportDraft, { workDate: HEUTE, text: "Entwurf" });
  assert.deepEqual(ergebnis.state.siteWorkspace, { siteId: "b-1" });
  assert.deepEqual(ergebnis.assignments, [{ id: "a-1" }]);
  assert.equal(ergebnis.userId, "u-1");
  assert.equal(ergebnis.carriedOver, null);
});

test("In der Vorfuehrung bleiben Einsatzplan und Kennung aussen vor", () => {
  const ergebnis = restoreState(
    { version: STATE_VERSION, workDate: HEUTE, events: [], assignments: [{ id: "a" }], userId: "u-1" },
    { today: HEUTE, demoMode: true }
  );
  assert.equal(ergebnis.assignments, null);
  assert.equal(ergebnis.userId, null);
});

test("Nicht uebertragene Arbeit ueberlebt den Tageswechsel", () => {
  // Der eigentliche Fehler: wer abends ohne Verbindung buchte und die App am
  // naechsten Morgen oeffnete, verlor Buchungen und Berichte des Vortags. Sie
  // wurden verworfen und beim naechsten Speichern endgueltig ueberschrieben.
  const gespeichert = {
    version: STATE_VERSION, workDate: GESTERN, workDayStatus: "open",
    events: [buchung("e-1", true), buchung("e-2", false), buchung("e-3", true)],
    reports: [bericht("r-1", true), bericht("r-2", false)],
    userId: "u-1"
  };
  const ergebnis = restoreState(gespeichert, { today: HEUTE });
  assert.deepEqual(ergebnis.state.events.map((e) => e.clientEntryId), ["e-1", "e-3"]);
  assert.deepEqual(ergebnis.state.reports.map((r) => r.clientReportId), ["r-1"]);
  // Der Arbeitstag selbst beginnt neu.
  assert.equal(ergebnis.state.workDate, HEUTE);
  assert.equal(ergebnis.state.workDayStatus, null);
  assert.deepEqual(ergebnis.carriedOver, { workDate: GESTERN, events: 2, reports: 1 });
});

test("Die Kennung des Mitarbeiters kommt zwingend mit", () => {
  // Ohne sie erkennt die App bei der naechsten Anmeldung nicht, dass die
  // uebernommene Arbeit einem anderen Menschen gehoert, und wuerde sie unter
  // dessen Konto uebertragen.
  const ergebnis = restoreState(
    { version: STATE_VERSION, workDate: GESTERN, events: [buchung("e-1", true)], userId: "u-1" },
    { today: HEUTE }
  );
  assert.equal(ergebnis.userId, "u-1");
});

test("Der Einsatzplan des Vortags wird nicht als heutiger ausgegeben", () => {
  const ergebnis = restoreState(
    {
      version: STATE_VERSION, workDate: GESTERN, events: [buchung("e-1", true)],
      assignments: [{ id: "a-gestern" }], userId: "u-1"
    },
    { today: HEUTE }
  );
  assert.equal(ergebnis.assignments, null);
});

test("Ein abgeschlossener Vortag hinterlaesst nichts", () => {
  const ergebnis = restoreState(
    {
      version: STATE_VERSION, workDate: GESTERN, workDayStatus: "closed",
      events: [buchung("e-1", false)], reports: [bericht("r-1", false)], userId: "u-1"
    },
    { today: HEUTE }
  );
  assert.deepEqual(ergebnis.state, initialState(HEUTE));
  assert.equal(ergebnis.carriedOver, null);
  assert.equal(ergebnis.userId, null);
});

test("Ein Eintrag mit vermerktem Fehler geht ebenfalls nicht verloren", () => {
  // Er wartet nicht mehr in der Warteschlange, muss aber sichtbar bleiben,
  // damit jemand ihn aufgreifen kann.
  const fehlerhaft = { ...buchung("e-1", true), syncError: "Doppelte Buchung" };
  const ergebnis = restoreState(
    { version: STATE_VERSION, workDate: GESTERN, events: [fehlerhaft], userId: "u-1" },
    { today: HEUTE }
  );
  assert.equal(ergebnis.state.events.length, 1);
  assert.equal(ergebnis.state.events[0].syncError, "Doppelte Buchung");
});

test("Der Hinweis nennt Anzahl und Tag", () => {
  assert.equal(
    carriedOverMessage({ workDate: GESTERN, events: 2, reports: 1 }),
    "Noch nicht übertragen: 2 Buchungen und ein Bericht vom 03.08.2026."
  );
  assert.equal(
    carriedOverMessage({ workDate: GESTERN, events: 1, reports: 0 }),
    "Noch nicht übertragen: eine Buchung vom 03.08.2026."
  );
  assert.equal(carriedOverMessage(null), null);
});

test("Beim Speichern bleibt die Vorfuehrung ohne Einsatzplan und Kennung", () => {
  const state = initialState(HEUTE);
  const betrieb = serializeState(state, { assignments: [{ id: "a" }], userId: "u-1" });
  assert.deepEqual(betrieb.assignments, [{ id: "a" }]);
  assert.equal(betrieb.userId, "u-1");
  const vorfuehrung = serializeState(state, { assignments: [{ id: "a" }], userId: "u-1", demoMode: true });
  assert.equal(vorfuehrung.assignments, undefined);
  assert.equal(vorfuehrung.userId, undefined);
});

test("Gespeicherter und wiederhergestellter Stand passen zusammen", () => {
  const state = { ...initialState(HEUTE), workDayStatus: "open", events: [buchung("e-1", true)] };
  const gespeichert = JSON.parse(JSON.stringify(serializeState(state, { assignments: [], userId: "u-1" })));
  const zurueck = restoreState(gespeichert, { today: HEUTE });
  assert.deepEqual(zurueck.state, state);
});
