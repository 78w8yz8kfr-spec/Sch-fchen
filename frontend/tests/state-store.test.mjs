import assert from "node:assert/strict";
import test from "node:test";
import {
  DEMO_STORAGE_KEY,
  ONLINE_STORAGE_KEY,
  STATE_VERSION,
  carriedOverMessage,
  initialState,
  istSpeicherVollFehler,
  normalizeCompanyNumber,
  persistState,
  rememberedCompany,
  restoreState,
  serializeState,
  storageKey,
  withoutReplaceableCache
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

// Ein voller Speicher (QuotaExceededError) ist kein blockierter Speicher: der
// eine loest sich, sobald Platz frei ist, der andere gar nicht. Der Fehlschlag
// wird ausschliesslich am geworfenen Fehler erkannt - deshalb hier je Browser
// nachgestellt, statt nur den heute gebraeuchlichen Namen zu pruefen.
const quotaFehlerFaelle = [
  ["aktuelles Chrome/Firefox", () => Object.assign(new Error("voll"), { name: "QuotaExceededError" })],
  ["aelteres Firefox", () => Object.assign(new Error("voll"), { name: "NS_ERROR_DOM_QUOTA_REACHED" })],
  ["generischer DOMException-Code", () => Object.assign(new Error("voll"), { name: "Error", code: 22 })],
  ["Firefox-Nachfolgecode", () => Object.assign(new Error("voll"), { name: "Error", code: 1014 })]
];

for (const [beschreibung, erzeugeFehler] of quotaFehlerFaelle) {
  test(`Speicher voll wird erkannt: ${beschreibung}`, () => {
    assert.equal(istSpeicherVollFehler(erzeugeFehler()), true);
  });
}

test("Ein blockierter Speicher gilt nicht als voll", () => {
  // Privatmodus oder eine vom Browser gesperrte Herkunft werfen typischerweise
  // einen SecurityError oder einen Fehler ganz ohne die Quote-Merkmale.
  assert.equal(istSpeicherVollFehler(Object.assign(new Error("gesperrt"), { name: "SecurityError" })), false);
  assert.equal(istSpeicherVollFehler(new Error("irgendein Fehler")), false);
  assert.equal(istSpeicherVollFehler(null), false);
  assert.equal(istSpeicherVollFehler(undefined), false);
});

// Ein Speicher-Doppel: verhaelt sich wie window.localStorage, wirft aber genau
// den Fehler, den der Test vorgibt - so laesst sich ein voller oder
// blockierter Speicher nachstellen, ohne einen echten Browser zu brauchen.
const speicherDerWirft = (fehler) => ({
  setItem() { throw fehler; }
});
const speicherDerSpeichert = () => {
  const daten = new Map();
  return { setItem: (schluessel, wert) => daten.set(schluessel, wert), gespeichert: daten };
};

test("Ein erfolgreicher Schreibvorgang meldet sich als ok", () => {
  const speicher = speicherDerSpeichert();
  const ergebnis = persistState(speicher, "schluessel", { events: [] });
  assert.deepEqual(ergebnis, { ok: true });
  assert.equal(speicher.gespeichert.get("schluessel"), JSON.stringify({ events: [] }));
});

test("Voller Speicher und blockierter Speicher werden unterschiedlich gemeldet", () => {
  // Das ist der eigentliche Fehler aus Aufgabe 1: beide Faelle sahen bisher
  // gleich aus, dabei loest sich nur der eine von selbst, sobald Platz frei
  // ist - und nur beim vollen Speicher lohnt sich ein zweiter Versuch mit
  // weniger Inhalt.
  const voll = persistState(
    speicherDerWirft(Object.assign(new Error("voll"), { name: "QuotaExceededError" })),
    "schluessel",
    { events: [] }
  );
  assert.deepEqual(voll, { ok: false, quota: true });

  const blockiert = persistState(
    speicherDerWirft(Object.assign(new Error("gesperrt"), { name: "SecurityError" })),
    "schluessel",
    { events: [] }
  );
  assert.deepEqual(blockiert, { ok: false, quota: false });
});

test("Die Baustellenakte ist ersetzbar, Buchungen und Berichte nicht", () => {
  const stand = {
    events: [buchung("e-1", true)],
    reports: [bericht("r-1", true)],
    reportDraft: { text: "Entwurf" },
    siteWorkspace: { site: { id: "b-1" }, team: [{ id: "u-1" }] }
  };
  const verkleinert = withoutReplaceableCache(stand);
  assert.equal(verkleinert.siteWorkspace, null);
  assert.deepEqual(verkleinert.events, stand.events);
  assert.deepEqual(verkleinert.reports, stand.reports);
  assert.deepEqual(verkleinert.reportDraft, stand.reportDraft);
});

test("Ohne Baustellenakte gibt es nichts zu verkleinern", () => {
  const stand = { events: [buchung("e-1", true)], siteWorkspace: null };
  assert.equal(withoutReplaceableCache(stand), stand);
});
