// Entscheidungen der Offline-Warteschlange, getrennt von Netz, Anzeige und
// Speicher. Auf der Baustelle entstehen Buchungen und Berichte ohne Verbindung;
// welcher Fehler einen Datensatz endgueltig anhaelt und welcher nur zum
// spaeteren Versuch fuehrt, entscheidet darueber, ob Arbeit verloren geht.

// Ein Datensatz wartet, solange er nicht uebertragen ist und kein Mensch ihn
// ansehen muss. Ein vermerkter Fehler nimmt ihn dauerhaft aus der Schlange.
export function selectPendingWork(state) {
  const reports = (state?.reports || []).filter(
    (report) => report.pendingSync && !report.syncError
  );
  const entries = (state?.events || []).filter(
    (entry) => entry.pendingSync && !entry.syncError
  );
  return { reports, entries };
}

// Zeitbuchungen folgen erst, wenn alle Berichte durch sind. Ein Bericht bezieht
// sich auf einen Arbeitstag; kaeme die Buchung zuerst an, stuende im Buero eine
// Zeit ohne den zugehoerigen Bericht.
export function timeEntriesMayFollow(reports) {
  return !(reports || []).some((report) => report.pendingSync);
}

export const SYNC_ERROR_NETWORK = "netz";
export const SYNC_ERROR_SESSION = "sitzung";
export const SYNC_ERROR_SERVER = "server";
export const SYNC_ERROR_REJECTED = "abgelehnt";

// Ordnet einen Fehler einer Behandlung zu.
//
// `vermerken` ist die folgenreichste Angabe: ein vermerkter Fehler nimmt den
// Datensatz dauerhaft aus der Warteschlange, weil ihn niemand mehr aufgreift.
// Das ist nur richtig, wenn der Server die Angaben inhaltlich zurueckweist.
// Eine abgelaufene Sitzung, ein Ausfall des Servers und eine fehlende
// Verbindung gehen dagegen vorueber und muessen einen neuen Versuch erlauben.
export function classifySyncError(error) {
  if (error?.network) {
    return { grund: SYNC_ERROR_NETWORK, vermerken: false, anmeldenNoetig: false };
  }
  if (error?.status === 401) {
    return { grund: SYNC_ERROR_SESSION, vermerken: false, anmeldenNoetig: true };
  }
  if (typeof error?.status === "number" && error.status >= 500) {
    return { grund: SYNC_ERROR_SERVER, vermerken: false, anmeldenNoetig: false };
  }
  return { grund: SYNC_ERROR_REJECTED, vermerken: true, anmeldenNoetig: false };
}

// Die Meldung erklaert, ob der Mitarbeiter etwas tun muss oder nur warten.
export function syncErrorMessage(grund, fallback) {
  if (grund === SYNC_ERROR_NETWORK) return "Wartet auf Verbindung.";
  if (grund === SYNC_ERROR_SESSION) return "Bitte erneut anmelden. Die Übertragung wird danach fortgesetzt.";
  if (grund === SYNC_ERROR_SERVER) return "Der Server antwortet gerade nicht. Neuer Versuch folgt automatisch.";
  return fallback;
}

export function buildReportPayload(report) {
  return {
    clientReportId: report.clientReportId,
    constructionSiteId: report.constructionSiteId,
    reportType: report.reportType,
    workDate: report.workDate,
    sourceMode: "digital",
    summary: report.summary,
    details: report.details,
    workPerformed: report.workPerformed || report.details || report.summary,
    obstructions: report.obstructions || null,
    openItems: report.openItems || null,
    weather: report.weather || null,
    materialsAndEquipment: report.materialsAndEquipment || null,
    agreements: report.agreements || null,
    incidents: report.incidents || null,
    personnel: report.personnel
  };
}

export function buildTimeEntryPayload(entry) {
  return {
    clientEntryId: entry.clientEntryId,
    entryType: entry.type,
    recordedAt: entry.recordedAt,
    clientCreatedAt: entry.clientCreatedAt,
    ...(entry.constructionSiteId ? { constructionSiteId: entry.constructionSiteId } : {})
  };
}
