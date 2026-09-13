import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ABSENCE_MANAGEMENT_STAGE_ROLE,
  ABSENCE_OFFICE_STAGE_ROLE,
  absenceStageStates,
  absenceStageStatusText,
  absenceStatusLabel,
  absenceWaitingLabel
} from "../core/absences.js";

const frontendDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readFrontendFile = (path) => readFile(resolve(frontendDirectory, path), "utf8");

// Der Betreiber befürchtete, ein "x-beliebiger Monteur" könne einen
// Abwesenheitsantrag selbst genehmigen. Das stimmt nicht (siehe
// api/src/app.mjs requireAbsenceOfficeReviewer/requireAbsenceManagementApprover
// und adminState.canReviewAbsenceOffice/canApproveAbsenceManagement) - das
// Problem war nur die Darstellung. Diese Tests sichern zweierlei: dass die
// zwei getrennten Stufen jetzt wirklich als solche zu erkennen sind, und
// dass die Steuerelemente weiterhin an genau diesen beiden Server-Flaggen
// hängen, nicht an irgendeiner clientseitig geratenen Rolle.

test("Zwei benannte Stufen - Büro/Disposition und Geschäftsführung, nicht irgendwer", () => {
  // Genau diese beiden Rollenbezeichnungen macht die Kette sichtbar, damit
  // niemand den Eindruck bekommt, es handle sich um eine beliebige Person.
  assert.equal(ABSENCE_OFFICE_STAGE_ROLE, "Büro/Disposition");
  assert.equal(ABSENCE_MANAGEMENT_STAGE_ROLE, "Geschäftsführung");
});

test("office_review: erste Stufe ist an der Reihe, zweite noch nicht erreicht", () => {
  const stages = absenceStageStates({ status: "office_review" });
  assert.equal(stages[0].state, "current");
  assert.equal(stages[0].roleLabel, ABSENCE_OFFICE_STAGE_ROLE);
  assert.equal(stages[1].state, "open");
  assert.equal(stages[1].roleLabel, ABSENCE_MANAGEMENT_STAGE_ROLE);
});

test("management_review: die Büroprüfung ist erledigt (mit Namen), die Geschäftsführung ist dran", () => {
  const stages = absenceStageStates({
    status: "management_review",
    officeReviewedByName: "Erika Büro"
  });
  assert.equal(stages[0].state, "done");
  assert.equal(stages[0].personName, "Erika Büro");
  assert.equal(stages[1].state, "current");
  assert.equal(stages[1].personName, null);
});

test("approved: beide Stufen erledigt, mit je eigenem Namen - zwei verschiedene Personen", () => {
  const stages = absenceStageStates({
    status: "approved",
    officeReviewedByName: "Erika Büro",
    managementReviewedByName: "Karl Geschäftsführer"
  });
  assert.deepEqual(stages.map((stage) => stage.state), ["done", "done"]);
  assert.notEqual(stages[0].personName, stages[1].personName);
});

test("office_rejected: nur die erste Stufe wird als abgelehnt markiert, die zweite bleibt unerreicht", () => {
  const stages = absenceStageStates({
    status: "office_rejected",
    officeReviewedByName: "Erika Büro"
  });
  assert.equal(stages[0].state, "rejected");
  assert.equal(stages[1].state, "open");
});

test("management_rejected: die Büroprüfung bleibt erledigt, die Freigabe wird abgelehnt", () => {
  const stages = absenceStageStates({
    status: "management_rejected",
    officeReviewedByName: "Erika Büro",
    managementReviewedByName: "Karl Geschäftsführer"
  });
  assert.equal(stages[0].state, "done");
  assert.equal(stages[1].state, "rejected");
});

test("cancelled zeigt den Stand vor dem Abbruch, aber nie 'current' - es geht nicht weiter", () => {
  const vorDerBueroprüfung = absenceStageStates({ status: "cancelled" });
  assert.deepEqual(vorDerBueroprüfung.map((stage) => stage.state), ["open", "open"]);

  const nachBueroprüfung = absenceStageStates({
    status: "cancelled",
    officeReviewedByName: "Erika Büro"
  });
  assert.deepEqual(nachBueroprüfung.map((stage) => stage.state), ["done", "open"]);

  const aufgehobeneFreigabe = absenceStageStates({
    status: "cancelled",
    officeReviewedByName: "Erika Büro",
    managementReviewedByName: "Karl Geschäftsführer"
  });
  assert.deepEqual(aufgehobeneFreigabe.map((stage) => stage.state), ["done", "done"]);
});

test("Der Stufentext ist immer echter Text, nicht nur eine Farbe", () => {
  assert.equal(
    absenceStageStatusText({ state: "done", personName: "Erika Büro" }),
    "Erledigt · Erika Büro"
  );
  assert.equal(absenceStageStatusText({ state: "done", personName: null }), "Erledigt");
  assert.equal(absenceStageStatusText({ state: "current" }), "Aktuell an der Reihe");
  assert.equal(
    absenceStageStatusText({ state: "rejected", personName: "Erika Büro" }),
    "Abgelehnt · Erika Büro"
  );
  assert.equal(absenceStageStatusText({ state: "open" }), "Noch nicht erreicht");
});

test("Im eigenen Antragsbestand liegt der Ball erkennbar bei einer zuständigen Stelle, nicht beim Monteur", () => {
  assert.equal(absenceWaitingLabel("office_review"), "wartet auf Büroprüfung");
  assert.equal(
    absenceWaitingLabel("management_review"),
    "wartet auf Freigabe durch die Geschäftsführung"
  );
  // Für abgeschlossene Zustände gibt es keine "wartet auf ..."-Formulierung -
  // die Anzeige fällt dann auf absenceStatusLabel() zurück.
  for (const status of ["approved", "office_rejected", "management_rejected", "cancelled"]) {
    assert.equal(absenceWaitingLabel(status), null);
  }
});

test("absenceStatusLabel kennt weiterhin jeden Endzustand", () => {
  assert.equal(absenceStatusLabel("approved"), "Freigegeben");
  assert.equal(absenceStatusLabel("office_rejected"), "Vom Büro abgelehnt");
  assert.equal(absenceStatusLabel("management_rejected"), "Von der Geschäftsführung abgelehnt");
  assert.equal(absenceStatusLabel("cancelled"), "Zurückgezogen");
});

test("Die Oberfläche baut die Kette über die gemeinsame Funktion, in beiden Ansichten", async () => {
  const app = await readFrontendFile("app.js");
  assert.match(
    app,
    /import \{\s*absenceStageStates,\s*absenceStageStatusText,\s*absenceStatusLabel,\s*absenceWaitingLabel\s*\} from "\.\/core\/absences\.js\?v=/,
    "app.js muss die Auswerte-Logik aus core/absences.js importieren, statt sie doppelt zu pflegen"
  );
  assert.match(app, /function renderAbsenceStageChain\(absence\)/);
  // Beide Listen - die eigene des Mitarbeiters und die Genehmigen-Ansicht des
  // Büros - müssen dieselbe Funktion aufrufen, sonst können sie über die Zeit
  // auseinanderlaufen (die eine zeigt zwei Stufen, die andere wieder nicht).
  const renderAbsencesBody = app.slice(
    app.indexOf("function renderAbsences()"),
    app.indexOf("function formatDayCount(days)")
  );
  assert.match(renderAbsencesBody, /renderAbsenceStageChain\(absence\)/);
  const renderAbsenceReviewsBody = app.slice(
    app.indexOf("function renderAbsenceReviews()"),
    app.indexOf("function renderEmployeeList()")
  );
  assert.match(renderAbsenceReviewsBody, /renderAbsenceStageChain\(absence\)/);
});

test("Das eigene Abzeichen zeigt bei laufenden Anträgen die ausführliche Wartemeldung, nicht nur ein Wort", () => {
  // Genau das nimmt dem Monteur den Eindruck, der Antrag läge bei ihm selbst.
  const badgeAssignment =
    'badge.textContent = absenceWaitingLabel(absence.status) || absenceStatusLabel(absence.status);';
  return readFrontendFile("app.js").then((app) => {
    assert.ok(
      app.includes(badgeAssignment),
      "Das Abzeichen in der eigenen Antragsliste muss absenceWaitingLabel() bevorzugen"
    );
  });
});

// Die eigentliche Sorge des Betreibers: die Genehmigen-Steuerelemente dürfen
// nur erscheinen, wenn der Server das für diese Person bestätigt hat
// (adminState.canReviewAbsenceOffice / adminState.canApproveAbsenceManagement).
// Diese Prüfung bricht absichtlich Gegenprobe-tauglich: wer die &&-Bedingung
// entfernt, lässt diesen Test sofort scheitern (geprüft per diff, siehe
// Bericht).
test("Genehmigen-Steuerelemente hängen an den Server-Flaggen, nicht an einer geratenen Rolle", async () => {
  const app = await readFrontendFile("app.js");
  const bodyStart = app.indexOf("function renderAbsenceReviews()");
  const bodyEnd = app.indexOf("function renderEmployeeList()");
  assert.ok(bodyStart > -1 && bodyEnd > bodyStart, "renderAbsenceReviews wurde nicht gefunden");
  const body = app.slice(bodyStart, bodyEnd);

  assert.match(
    body,
    /const canOfficeReview = absence\.status === "office_review"\s*&&\s*adminState\.canReviewAbsenceOffice;/,
    "canOfficeReview muss weiterhin an adminState.canReviewAbsenceOffice hängen"
  );
  assert.match(
    body,
    /const canManagementReview = absence\.status === "management_review"\s*&&\s*adminState\.canApproveAbsenceManagement;/,
    "canManagementReview muss weiterhin an adminState.canApproveAbsenceManagement hängen"
  );
  assert.match(
    body,
    /const canCancelApproval = absence\.status === "approved"\s*&&\s*adminState\.canApproveAbsenceManagement;/,
    "canCancelApproval muss weiterhin an adminState.canApproveAbsenceManagement hängen"
  );

  const guard = "if (canOfficeReview || canManagementReview || canCancelApproval) {";
  const guardIndex = body.indexOf(guard);
  assert.ok(guardIndex > -1, "Die drei Freigaben müssen gemeinsam vor den Steuerelementen stehen");

  // Vor dieser Wächter-Bedingung darf keine Genehmigen/Ablehnen-Schaltfläche
  // entstehen - sonst wäre die Bedingung nur Deko und die Knöpfe kämen aus
  // einem zweiten, ungeschützten Pfad.
  const beforeGuard = body.slice(0, guardIndex);
  assert.doesNotMatch(
    beforeGuard,
    /createElement\("button"\)/,
    "Vor der Berechtigungsprüfung darf keine Schaltfläche erzeugt werden"
  );
});
