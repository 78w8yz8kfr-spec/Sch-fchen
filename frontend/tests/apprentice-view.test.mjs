import assert from "node:assert/strict";
import test from "node:test";

import { apprenticeTodayPrompt } from "../core/apprentice-view.js";

test("Eine freigegebene oder eingereichte Woche belegt die Startseite nicht", () => {
  for (const status of ["submitted", "approved"]) {
    assert.deepEqual(apprenticeTodayPrompt({
      apprentice: true,
      status,
      workdayStarted: true
    }), { visible: false });
  }
});

test("Vor Arbeitsbeginn bleibt die Startseite ruhig", () => {
  assert.deepEqual(apprenticeTodayPrompt({
    apprentice: true,
    status: "draft",
    workdayStarted: false
  }), { visible: false });
});

test("Nach Arbeitsbeginn fuehrt ein fehlender Tageseintrag direkt in die Eingabe", () => {
  assert.deepEqual(apprenticeTodayPrompt({
    apprentice: true,
    status: "draft",
    workdayStarted: true
  }), {
    visible: true,
    state: "Heute offen",
    summary: "Ergänze kurz deine Tätigkeiten, bevor der Tag abgeschlossen ist.",
    action: "today",
    actionLabel: "Heute eintragen"
  });
});

test("Ein vorhandener Tageseintrag braucht keine zweite Bestaetigungskarte", () => {
  assert.deepEqual(apprenticeTodayPrompt({
    apprentice: true,
    status: "draft",
    workdayStarted: true,
    activities: ["Unterverteilung verdrahtet"]
  }), { visible: false });
});

test("Eine Rueckgabe bleibt mit Kommentar sichtbar und oeffnet die Woche", () => {
  assert.deepEqual(apprenticeTodayPrompt({
    apprentice: true,
    status: "returned",
    activities: ["Kabelwege montiert"],
    returnComment: "Bitte die Messung ergänzen."
  }), {
    visible: true,
    state: "Überarbeiten",
    summary: "Bitte die Messung ergänzen.",
    action: "week",
    actionLabel: "Woche öffnen"
  });
});
