// Abwesenheitsanträge: reine Auswerte-Logik ohne Oberfläche.
//
// Ein Antrag durchläuft zwei getrennte Instanzen (das ist Absicht, kein
// Zufall): zuerst die Büroprüfung (Rollen Büro/Disposition/Planung),
// anschließend die verbindliche Freigabe durch die Geschäftsführung - und
// zwar durch ein *anderes* Konto als die Büroprüfung (Vier-Augen-Prinzip,
// serverseitig erzwungen in api/src/app.mjs, siehe absence_two_person_rule).
// Dieses Modul entscheidet nur, WAS die Oberfläche über den Stand jeder
// Stufe zeigt, nicht WIE - das bleibt bei app.js/styles.css.

export const ABSENCE_OFFICE_STAGE_ROLE = "Büro/Disposition";
export const ABSENCE_MANAGEMENT_STAGE_ROLE = "Geschäftsführung";

// Wortlaut je Endzustand. Für die beiden laufenden Zustände liefert
// absenceWaitingLabel() unten die ausführlichere Formulierung - hier stehen
// nur die kurzen Wörter fürs Abzeichen.
const STATUS_LABELS = {
  office_review: "Büroprüfung",
  management_review: "Geschäftsführung prüft",
  approved: "Freigegeben",
  office_rejected: "Vom Büro abgelehnt",
  management_rejected: "Von der Geschäftsführung abgelehnt",
  cancelled: "Zurückgezogen"
};

export function absenceStatusLabel(status) {
  return STATUS_LABELS[status] || status;
}

// Im eigenen Antragsbestand des Mitarbeiters reicht das Wort "Büroprüfung"
// nicht - es liest sich wie eine Aufgabe des Mitarbeiters selbst. Erst
// "wartet auf ..." macht klar: der Ball liegt bei einer zuständigen Stelle,
// nicht beim Monteur. Nur für die beiden laufenden Zustände gedacht; für
// alles andere (freigegeben, abgelehnt, zurückgezogen) liefert es null und
// die Anzeige fällt auf absenceStatusLabel() zurück.
export function absenceWaitingLabel(status) {
  return {
    office_review: "wartet auf Büroprüfung",
    management_review: "wartet auf Freigabe durch die Geschäftsführung"
  }[status] || null;
}

// Der Stand jeder der beiden Stufen für die sichtbare Kette:
// "done" (erledigt, mit Namen sofern bekannt), "current" (aktuell an der
// Reihe), "rejected" (dort abgelehnt) oder "open" (noch nicht erreicht).
//
// Ein zurückgezogener oder nachträglich aufgehobener Antrag ("cancelled")
// zeigt den Stand *vor* dem Abbruch - aber ohne "current", denn es geht ja
// nicht mehr weiter. Ob die Büroprüfung überhaupt stattfand, ist dabei nicht
// am Status ablesbar (der ist bei jedem Abbruch "cancelled"), sondern nur
// daran, ob officeReviewedByName gesetzt ist.
export function absenceStageStates(absence) {
  const status = absence?.status;
  const officeDone = Boolean(absence?.officeReviewedByName);
  const managementDone = Boolean(absence?.managementReviewedByName);
  let officeState = "open";
  let managementState = "open";
  if (status === "office_review") {
    officeState = "current";
  } else if (status === "office_rejected") {
    officeState = "rejected";
  } else if (status === "management_review") {
    officeState = "done";
    managementState = "current";
  } else if (status === "management_rejected") {
    officeState = "done";
    managementState = "rejected";
  } else if (status === "approved") {
    officeState = "done";
    managementState = "done";
  } else if (status === "cancelled") {
    officeState = officeDone ? "done" : "open";
    managementState = officeDone && managementDone ? "done" : "open";
  }
  return [
    {
      key: "office",
      roleLabel: ABSENCE_OFFICE_STAGE_ROLE,
      state: officeState,
      personName: absence?.officeReviewedByName || null
    },
    {
      key: "management",
      roleLabel: ABSENCE_MANAGEMENT_STAGE_ROLE,
      state: managementState,
      personName: absence?.managementReviewedByName || null
    }
  ];
}

// Der Text unter dem Rollennamen einer Stufe. Bewusst immer echter Text
// (nicht nur eine Farbe) - Barrierefreiheit und ein Ausdruck ohne CSS
// müssen den Stand genauso erkennen können.
export function absenceStageStatusText(stage) {
  switch (stage?.state) {
    case "done":
      return stage.personName ? `Erledigt · ${stage.personName}` : "Erledigt";
    case "current":
      return "Aktuell an der Reihe";
    case "rejected":
      return stage.personName ? `Abgelehnt · ${stage.personName}` : "Abgelehnt";
    default:
      return "Noch nicht erreicht";
  }
}
