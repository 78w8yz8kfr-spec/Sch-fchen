// Zeitänderungen des Büros: reine Auswerte-Logik ohne Oberfläche.
//
// Der Server liefert je Woche eine Liste von Vorgängen ("operations"), jeder
// mit einer Reihe von Einzeländerungen ("changes"). Jede Änderung trägt ein
// komplettes altes und neues Wertepaar - auch die Felder, die sich gar nicht
// geändert haben. Ohne den Vergleich hier würde die Anzeige zum Beispiel
// "Baustelle: Musterstraße → Musterstraße" zeigen, obwohl in Wirklichkeit nur
// die Uhrzeit geändert wurde. Dieses Modul entscheidet, welche Felder sich
// wirklich unterscheiden, und ordnet die Änderungen dem betroffenen Tag zu.
// Die eigentliche Formatierung von Uhrzeiten und Minuten bleibt bei den
// vorhandenen Hilfsmitteln der App (timeFormatter, formatMinutes) - hier wird
// nur entschieden, WAS angezeigt wird, nicht WIE.

// Wirksam oder nur beantragt?
//
// Das ist die wichtigste Unterscheidung der ganzen Anzeige: ein "pending"-
// Vorgang ist erst ein Antrag, die gebuchte Zeit des Monteurs steht noch wie
// zuvor. Erst "effective" (also "applied" oder "approved") hat die Zeit
// tatsächlich verändert. "rejected" bleibt sichtbar (Historie wird erhalten),
// ist aber ohne Wirkung geblieben. Der Status entscheidet zuerst - ein
// abgelehnter Vorgang ist nie "effective", selbst wenn das Feld aus welchem
// Grund auch immer falsch gesetzt wäre.
export function operationDisplayStatus(operation) {
  if (operation?.status === "rejected") return "rejected";
  return operation?.effective ? "effective" : "pending";
}

// Nicht anzeigbare Felder wie die interne workDayId werden hier gar nicht
// erst betrachtet: ohne verständliche Formulierung lieber weglassen als eine
// Kennung zeigen.
function fieldChanges(oldValue, newValue) {
  const before = oldValue || {};
  const after = newValue || {};
  const changes = [];
  if ((before.recordedAt ?? null) !== (after.recordedAt ?? null)) {
    changes.push({ field: "recordedAt", from: before.recordedAt ?? null, to: after.recordedAt ?? null });
  }
  if ((before.constructionSiteId ?? null) !== (after.constructionSiteId ?? null)) {
    changes.push({
      field: "constructionSite",
      from: before.constructionSiteId ?? null,
      to: after.constructionSiteId ?? null
    });
  }
  if ((before.travelMinutes ?? null) !== (after.travelMinutes ?? null)) {
    changes.push({ field: "travelMinutes", from: before.travelMinutes ?? null, to: after.travelMinutes ?? null });
  }
  // Eine fehlende Notiz und eine leere Zeichenkette sagen dasselbe: es gibt
  // keine. Sonst stünde hier eine "Änderung", wo sich inhaltlich nichts tat.
  if ((before.activityNote || "") !== (after.activityNote || "")) {
    changes.push({
      field: "activityNote",
      from: before.activityNote || null,
      to: after.activityNote || null
    });
  }
  return changes;
}

// Beschreibt eine einzelne Änderung so, wie die Anzeige sie braucht: welcher
// Tag, ob sie auf einen anderen Tag verschoben wurde, ob eine Buchung dabei
// entstanden oder verschwunden ist, und welche Felder sich unterscheiden.
export function describeChange(change) {
  const workDate = change?.workDate ?? null;
  const movedTo = change?.movedToWorkDate && change.movedToWorkDate !== workDate
    ? change.movedToWorkDate
    : null;
  const added = change?.oldValue == null && change?.newValue != null;
  const deleted = change?.newValue == null && change?.oldValue != null;
  return {
    workDate,
    movedTo,
    added,
    deleted,
    // Bei einer neuen oder entfernten Buchung gibt es kein "vorher/nachher"
    // je Feld zu vergleichen - nur dass sie entstanden bzw. verschwunden ist.
    fields: added || deleted ? [] : fieldChanges(change?.oldValue, change?.newValue)
  };
}

// Ordnet alle Änderungen der Woche dem jeweils betroffenen Arbeitstag zu.
//
// Eine Änderung ohne Tagesbezug kann die Tageskarte nicht anzeigen und wird
// übersprungen, statt unter einem falschen Schlüssel zu landen. Ein Vorgang
// kann mehrere Änderungen an verschiedenen Tagen enthalten (z. B. beim
// Verschieben) - jede landet bei ihrem eigenen Tag.
export function groupTimeChangesByWorkDate(operations) {
  const groups = new Map();
  (operations || []).forEach((operation) => {
    (operation?.changes || []).forEach((change) => {
      const described = describeChange(change);
      if (!described.workDate) return;
      if (!groups.has(described.workDate)) groups.set(described.workDate, []);
      groups.get(described.workDate).push({ operation, change: described });
    });
  });
  return groups;
}
