// Zustandsspeicher der App: was ueberlebt einen Neustart und was nicht.
//
// Auf der Baustelle entsteht Arbeit ohne Verbindung. Sie liegt bis zur
// Uebertragung ausschliesslich hier. Deshalb entscheidet dieses Modul
// darueber, ob ein Arbeitstag verloren geht.

export const DEMO_STORAGE_KEY = "schaefchen.sprint2.demo.v1";
export const ONLINE_STORAGE_KEY = "schaefchen.online.cache.v1";
export const COMPANY_STORAGE_KEY = "schaefchen.company.v1";
export const STATE_VERSION = 1;

export function storageKey(demoMode) {
  return demoMode ? DEMO_STORAGE_KEY : ONLINE_STORAGE_KEY;
}

// Die Firmennummer entscheidet, bei welcher Firma die Anmeldung landet. Jede
// Firma arbeitet vollstaendig getrennt, dieselbe Personalnummer kann es also
// mehrfach geben. Getippt wird die Nummer selten, deshalb nimmt die App die
// Schreibweisen entgegen, die Menschen naheliegen: klein geschrieben, ohne
// Bindestrich, mit Leerzeichen oder nur die Ziffern vom Blatt Papier.
export function normalizeCompanyNumber(value) {
  const roh = String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");
  const treffer = /^F?-?(\d{1,6})$/.exec(roh);
  return treffer ? `F-${treffer[1].padStart(6, "0")}` : roh;
}

// Welche Firma steht beim Oeffnen der Anmeldung im Feld?
//
// Der Server nennt nur die Firma der Ersteinrichtung. Auf dem Geraet eines
// Kunden waere das die falsche: er hat sich zuletzt bei seiner eigenen Firma
// angemeldet. Deshalb gewinnt die gemerkte Nummer. Ihr Name stammt aus der
// letzten erfolgreichen Anmeldung; ein Logo zeigt die App nur fuer die vom
// Server benannte Firma, denn nur dafuer kennt sie eine Adresse.
export function rememberedCompany(saved, setup) {
  const vorgabe = {
    number: normalizeCompanyNumber(setup?.companyNumber),
    displayName: setup?.displayName || "",
    logoUrl: setup?.logoUrl || null
  };
  const nummer = normalizeCompanyNumber(saved?.number);
  if (!nummer || nummer === vorgabe.number) return vorgabe;
  return { number: nummer, displayName: saved?.displayName || nummer, logoUrl: null };
}

export function initialState(today) {
  return {
    version: STATE_VERSION,
    workDate: today,
    workDayStatus: null,
    events: [],
    reports: [],
    reportDraft: null,
    siteWorkspace: null
  };
}

const istOffen = (eintrag) => Boolean(eintrag?.pendingSync);

// Stellt den gespeicherten Stand wieder her.
//
// Frueher galt: stammt der Stand von einem frueheren Tag, wird er vollstaendig
// verworfen. Wer abends ohne Verbindung buchte und die App am naechsten Morgen
// oeffnete, verlor die Buchungen und Berichte des Vortags stillschweigend; der
// naechste Speichervorgang ueberschrieb sie endgueltig.
//
// Der Tageswechsel setzt den Arbeitstag jetzt zurueck, nimmt aber alles mit,
// was noch nicht beim Server ist. Uebertragene Eintraege bleiben zurueck, sie
// liegen dort bereits. Die Kennung des Mitarbeiters wird zwingend mitgenommen:
// ohne sie erkennt die App bei der naechsten Anmeldung nicht, dass die
// uebernommene Arbeit einem anderen Menschen gehoert.
export function restoreState(saved, { today, demoMode = false } = {}) {
  const leer = { state: initialState(today), assignments: null, userId: null, carriedOver: null };
  if (!saved || saved.version !== STATE_VERSION || !Array.isArray(saved.events)) return leer;

  const kennung = typeof saved.userId === "string" ? saved.userId : null;
  const einsaetze = Array.isArray(saved.assignments) ? saved.assignments : null;

  if (saved.workDate === today) {
    return {
      state: {
        version: STATE_VERSION,
        workDate: saved.workDate,
        workDayStatus: saved.workDayStatus || null,
        events: saved.events,
        reports: Array.isArray(saved.reports) ? saved.reports : [],
        reportDraft: saved.reportDraft && typeof saved.reportDraft === "object"
          ? saved.reportDraft
          : null,
        siteWorkspace: saved.siteWorkspace || null
      },
      assignments: demoMode ? null : einsaetze,
      userId: demoMode ? null : kennung,
      carriedOver: null
    };
  }

  const offeneEintraege = saved.events.filter(istOffen);
  const offeneBerichte = (Array.isArray(saved.reports) ? saved.reports : []).filter(istOffen);
  if (offeneEintraege.length === 0 && offeneBerichte.length === 0) return leer;

  return {
    state: {
      ...initialState(today),
      events: offeneEintraege,
      reports: offeneBerichte
    },
    // Der Einsatzplan gehoert zum alten Tag und wird neu geladen.
    assignments: null,
    userId: demoMode ? null : kennung,
    carriedOver: {
      workDate: saved.workDate,
      events: offeneEintraege.length,
      reports: offeneBerichte.length
    }
  };
}

export function serializeState(state, { assignments = [], userId = null, demoMode = false } = {}) {
  return {
    ...state,
    assignments: demoMode ? undefined : assignments,
    userId: demoMode ? undefined : userId
  };
}

// Meldung fuer den Mitarbeiter, wenn Arbeit aus einem frueheren Tag mitkam.
// Ohne Hinweis wuerde er nicht verstehen, warum die Uebertragung noch laeuft.
export function carriedOverMessage(carriedOver) {
  if (!carriedOver) return null;
  const teile = [];
  if (carriedOver.events > 0) {
    teile.push(carriedOver.events === 1 ? "eine Buchung" : `${carriedOver.events} Buchungen`);
  }
  if (carriedOver.reports > 0) {
    teile.push(carriedOver.reports === 1 ? "ein Bericht" : `${carriedOver.reports} Berichte`);
  }
  return `Noch nicht übertragen: ${teile.join(" und ")} vom ${formatDate(carriedOver.workDate)}.`;
}

function formatDate(isoDate) {
  const treffer = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate || "");
  return treffer ? `${treffer[3]}.${treffer[2]}.${treffer[1]}` : isoDate;
}
