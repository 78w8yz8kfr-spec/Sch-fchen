import assert from "node:assert/strict";
import test from "node:test";
import {
  SYNC_ERROR_NETWORK,
  SYNC_ERROR_REJECTED,
  SYNC_ERROR_SERVER,
  SYNC_ERROR_SESSION,
  buildReportPayload,
  buildTimeEntryPayload,
  classifySyncError,
  selectPendingWork,
  syncErrorMessage,
  timeEntriesMayFollow
} from "../core/sync-queue.js";

test("Nur offene Datensaetze ohne vermerkten Fehler stehen in der Warteschlange", () => {
  const state = {
    reports: [
      { id: "a", pendingSync: true },
      { id: "b", pendingSync: true, syncError: "Bericht unvollständig" },
      { id: "c", pendingSync: false }
    ],
    events: [
      { id: "1", pendingSync: true },
      { id: "2", pendingSync: true, syncError: "Zeit liegt in der Zukunft" },
      { id: "3" }
    ]
  };
  const { reports, entries } = selectPendingWork(state);
  assert.deepEqual(reports.map((r) => r.id), ["a"]);
  assert.deepEqual(entries.map((e) => e.id), ["1"]);
});

test("Ein leerer Zustand liefert leere Listen statt eines Fehlers", () => {
  assert.deepEqual(selectPendingWork(undefined), { reports: [], entries: [] });
  assert.deepEqual(selectPendingWork({}), { reports: [], entries: [] });
});

test("Zeitbuchungen folgen erst, wenn kein Bericht mehr offen ist", () => {
  assert.equal(timeEntriesMayFollow([]), true);
  assert.equal(timeEntriesMayFollow(undefined), true);
  assert.equal(timeEntriesMayFollow([{ pendingSync: false }]), true);
  assert.equal(timeEntriesMayFollow([{ pendingSync: false }, { pendingSync: true }]), false);
});

test("Eine fehlende Verbindung haelt den Datensatz nicht dauerhaft an", () => {
  const error = Object.assign(new Error("Der Server ist momentan nicht erreichbar."), { network: true });
  assert.deepEqual(classifySyncError(error), {
    grund: SYNC_ERROR_NETWORK, vermerken: false, anmeldenNoetig: false
  });
});

test("Eine abgelaufene Sitzung verlangt Anmeldung und bleibt in der Warteschlange", () => {
  // Frueher wurde der Bericht bei 401 mit einem Fehler vermerkt. Damit fiel er
  // dauerhaft aus der Warteschlange: nach dem erneuten Anmelden versuchte ihn
  // niemand mehr zu uebertragen, und die Arbeit des Tages war verloren.
  const behandlung = classifySyncError(Object.assign(new Error("Nicht angemeldet."), { status: 401 }));
  assert.equal(behandlung.grund, SYNC_ERROR_SESSION);
  assert.equal(behandlung.vermerken, false);
  assert.equal(behandlung.anmeldenNoetig, true);
});

test("Ein Ausfall des Servers erlaubt einen neuen Versuch", () => {
  for (const status of [500, 502, 503]) {
    const behandlung = classifySyncError(Object.assign(new Error("Serverfehler"), { status }));
    assert.equal(behandlung.grund, SYNC_ERROR_SERVER, `Status ${status}`);
    assert.equal(behandlung.vermerken, false, `Status ${status}`);
  }
});

test("Eine inhaltliche Zurueckweisung wird vermerkt und braucht einen Menschen", () => {
  for (const status of [400, 409, 422]) {
    const behandlung = classifySyncError(Object.assign(new Error("Doppelte Buchung"), { status }));
    assert.equal(behandlung.grund, SYNC_ERROR_REJECTED, `Status ${status}`);
    assert.equal(behandlung.vermerken, true, `Status ${status}`);
    assert.equal(behandlung.anmeldenNoetig, false, `Status ${status}`);
  }
});

test("Ein unbekannter Fehler wird wie eine Zurueckweisung behandelt", () => {
  assert.equal(classifySyncError(new Error("kaputt")).vermerken, true);
  assert.equal(classifySyncError(undefined).vermerken, true);
});

test("Die Meldung sagt, ob gewartet wird oder jemand handeln muss", () => {
  assert.match(syncErrorMessage(SYNC_ERROR_NETWORK, "x"), /Verbindung/);
  assert.match(syncErrorMessage(SYNC_ERROR_SESSION, "x"), /anmelden/);
  assert.match(syncErrorMessage(SYNC_ERROR_SERVER, "x"), /automatisch/);
  // Bei einer Zurueckweisung zaehlt der Wortlaut des Servers, nicht ein
  // allgemeiner Ersatztext.
  assert.equal(syncErrorMessage(SYNC_ERROR_REJECTED, "Die Buchung liegt in der Zukunft."),
    "Die Buchung liegt in der Zukunft.");
});

test("Der Bericht wird vollstaendig und mit Rueckfallwerten uebergeben", () => {
  const payload = buildReportPayload({
    clientReportId: "r-1", constructionSiteId: "b-1", reportType: "daily",
    workDate: "2026-08-04", summary: "Kurzfassung", details: "Ausführlich",
    personnel: [{ userId: "u-1" }]
  });
  assert.equal(payload.sourceMode, "digital");
  // Ohne eigene Angabe tritt die Beschreibung an die Stelle der Leistung.
  assert.equal(payload.workPerformed, "Ausführlich");
  assert.equal(payload.obstructions, null);
  assert.equal(payload.weather, null);
  assert.deepEqual(payload.personnel, [{ userId: "u-1" }]);
});

test("Ohne Beschreibung traegt die Kurzfassung die Leistung", () => {
  const payload = buildReportPayload({ summary: "Nur kurz", details: "" });
  assert.equal(payload.workPerformed, "Nur kurz");
});

test("Die Baustelle wird nur uebergeben, wenn sie feststeht", () => {
  const ohne = buildTimeEntryPayload({
    clientEntryId: "e-1", type: "start", recordedAt: "2026-08-04T07:00:00.000Z",
    clientCreatedAt: "2026-08-04T07:00:00.000Z"
  });
  assert.equal("constructionSiteId" in ohne, false);
  assert.equal(ohne.entryType, "start");
  const mit = buildTimeEntryPayload({ type: "start", constructionSiteId: "b-1" });
  assert.equal(mit.constructionSiteId, "b-1");
});
