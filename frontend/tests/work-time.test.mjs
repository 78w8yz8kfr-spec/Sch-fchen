import assert from "node:assert/strict";
import test from "node:test";
import {
  addIsoDays,
  addIsoMonths,
  assignmentDurationLabel,
  assignmentStartMinutes,
  calculateTimes,
  currentWeekStart,
  durationHoursToMinutes,
  durationMinutes,
  formatMinutes,
  formatSignedMinutes,
  localDateKey
} from "../core/work-time.js";

// Ereignisse eines Arbeitstags in Ortszeit, wie sie die App aufzeichnet.
function day(...steps) {
  return steps.map(([type, hour, minute]) => {
    const recordedAt = new Date(2026, 7, 4, hour, minute, 0, 0);
    return { type, recordedAt: recordedAt.toISOString() };
  });
}

function at(hour, minute) {
  return new Date(2026, 7, 4, hour, minute, 0, 0);
}

test("Datumsschlüssel und Wochenbeginn folgen der Ortszeit", () => {
  assert.equal(localDateKey(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
  assert.equal(localDateKey(new Date(2026, 11, 31, 0, 30)), "2026-12-31");

  // Montag bleibt Montag, der Sonntag gehört zur laufenden Woche davor.
  assert.equal(currentWeekStart(new Date(2026, 7, 3, 9, 0)), "2026-08-03");
  assert.equal(currentWeekStart(new Date(2026, 7, 4, 9, 0)), "2026-08-03");
  assert.equal(currentWeekStart(new Date(2026, 7, 8, 9, 0)), "2026-08-03");
  assert.equal(currentWeekStart(new Date(2026, 7, 2, 9, 0)), "2026-07-27");
});

test("Datumsrechnung überschreitet Monats-, Jahres- und Zeitumstellungsgrenzen", () => {
  assert.equal(addIsoDays("2026-08-04", 1), "2026-08-05");
  assert.equal(addIsoDays("2026-08-31", 1), "2026-09-01");
  assert.equal(addIsoDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addIsoDays("2026-01-01", -1), "2025-12-31");
  // Beginn und Ende der mitteleuropäischen Sommerzeit 2026.
  assert.equal(addIsoDays("2026-03-28", 1), "2026-03-29");
  assert.equal(addIsoDays("2026-10-24", 1), "2026-10-25");
  assert.equal(addIsoDays("2028-02-28", 1), "2028-02-29");

  assert.equal(addIsoMonths("2026-08-04", 1), "2026-09-01");
  assert.equal(addIsoMonths("2026-12-15", 1), "2027-01-01");
  assert.equal(addIsoMonths("2026-01-15", -1), "2025-12-01");
});

test("Minutenformate runden ab und zeigen Vorzeichen eindeutig", () => {
  assert.equal(durationMinutes(90_000), 1);
  assert.equal(durationMinutes(59_999), 0);
  assert.equal(durationMinutes(-60_000), 0, "Negative Spannen ergeben keine negative Zeit");

  assert.equal(formatMinutes(0), "00:00");
  assert.equal(formatMinutes(9), "00:09");
  assert.equal(formatMinutes(510), "08:30");
  assert.equal(formatMinutes(1500), "25:00");
  assert.equal(formatMinutes(-30), "00:00");

  assert.equal(formatSignedMinutes(0), "±00:00");
  assert.equal(formatSignedMinutes(90), "+01:30");
  assert.equal(formatSignedMinutes(-90), "−01:30");
  assert.equal(formatSignedMinutes(null), "±00:00");
  assert.equal(formatSignedMinutes("keine Zahl"), "±00:00");
});

test("Einsatzangaben werden nachsichtig, aber eindeutig gelesen", () => {
  assert.equal(assignmentDurationLabel(0), "");
  assert.equal(assignmentDurationLabel(-30), "");
  assert.equal(assignmentDurationLabel("keine Zahl"), "");
  assert.equal(assignmentDurationLabel(45), "45 Min.");
  assert.equal(assignmentDurationLabel(120), "2 Std.");
  assert.equal(assignmentDurationLabel(150), "2 Std. 30 Min.");

  assert.equal(durationHoursToMinutes(""), null);
  assert.equal(durationHoursToMinutes(null), null);
  assert.equal(durationHoursToMinutes(undefined), null);
  assert.equal(durationHoursToMinutes("keine Zahl"), null);
  assert.equal(durationHoursToMinutes("7.5"), 450);
  assert.equal(durationHoursToMinutes(8), 480);

  assert.equal(assignmentStartMinutes(""), null);
  assert.equal(assignmentStartMinutes(null), null);
  assert.equal(assignmentStartMinutes("07:30"), 450);
  assert.equal(assignmentStartMinutes("07:30:00"), 450);
  assert.equal(assignmentStartMinutes("00:00"), 0);
});

test("Ein vollständiger Arbeitstag ergibt Brutto-, Pausen-, Arbeits- und Fahrzeit", () => {
  // Derselbe Tag, der im Browser 09:30 / 01:00 / 08:30 / 01:00 anzeigt.
  const times = calculateTimes(
    day(["clock_in", 7, 0], ["site_arrival", 7, 30], ["site_departure", 16, 0], ["clock_out", 16, 30]),
    at(18, 0)
  );
  assert.deepEqual(times, { gross: 570, pause: 60, work: 510, travel: 60 });
});

test("Ohne Buchungen bleibt der Stundenzettel leer", () => {
  assert.deepEqual(calculateTimes([], at(12, 0)), { gross: 0, pause: 0, work: 0, travel: 0 });
});

test("Die Mindestpause greift ab dreieinhalb und ab sechs Stunden", () => {
  const grossFor = (hours, minutes) => calculateTimes(
    day(["clock_in", 6, 0], ["clock_out", 6 + hours, minutes]),
    at(20, 0)
  );

  assert.equal(grossFor(3, 29).pause, 0, "Unter 3,5 Stunden gilt keine Mindestpause");
  assert.equal(grossFor(3, 30).pause, 30);
  assert.equal(grossFor(5, 59).pause, 30);
  assert.equal(grossFor(6, 0).pause, 60);
  assert.equal(grossFor(6, 0).work, 300);
});

test("Eine tatsächlich längere Pause verdrängt die Mindestpause", () => {
  const times = calculateTimes(
    day(["clock_in", 8, 0], ["clock_out", 12, 0], ["clock_in", 13, 30], ["clock_out", 17, 0]),
    at(20, 0)
  );
  assert.equal(times.gross, 540);
  assert.equal(times.pause, 90, "Die tatsächlichen 90 Minuten zählen, nicht die 60 Minuten Mindestpause");
  assert.equal(times.work, 450);
});

test("Der laufende Arbeitstag rechnet bis zum aktuellen Zeitpunkt weiter", () => {
  const running = day(["clock_in", 7, 0], ["site_arrival", 7, 30]);
  const atNine = calculateTimes(running, at(9, 0));
  const atTen = calculateTimes(running, at(10, 0));

  assert.equal(atNine.gross, 120);
  assert.equal(atTen.gross, 180, "Ohne Feierabend wächst die Bruttozeit mit der Uhr");
  assert.equal(atNine.travel, 30);
});

test("Die Fahrzeit übersteigt nie die Arbeitszeit", () => {
  // Ein Tag, der fast nur aus Fahrt besteht: die Fahrzeit wird auf die
  // Arbeitszeit gedeckelt, damit der Stundenzettel nicht mehr Fahrt als
  // Arbeit ausweist.
  const times = calculateTimes(
    day(["clock_in", 6, 0], ["site_arrival", 12, 0], ["site_departure", 12, 10], ["clock_out", 12, 30]),
    at(20, 0)
  );
  assert.equal(times.travel, times.work);
  assert.ok(times.travel <= times.work);
});
