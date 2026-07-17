import assert from "node:assert/strict";
import test from "node:test";
import {
  expectedNextTypes,
  localDate,
  validateAssignment,
  validateAssignmentCancellation,
  validateAssignmentUpdate,
  validateEmployee,
  validateInitialPasswordChange,
  validateInitialSetup,
  validateLogin,
  validateSiteBundle,
  validateTimeEntry,
  validateWorkDate
} from "../src/validation.mjs";

test("Ersteinrichtung verlangt lange Schlüssel und starke Passwörter", () => {
  const setup = validateInitialSetup({
    setupToken: "CI-SETUP-TOKEN-2026-ONLY-TEST",
    personnelNumber: "ADMIN-1",
    firstName: "Schaaf",
    lastName: "Admin",
    password: "Schaefchen-Online-2026!"
  });
  assert.equal(setup.personnelNumber, "ADMIN-1");
  assert.throws(
    () => validateInitialSetup({
      setupToken: "zu-kurz",
      personnelNumber: "ADMIN-1",
      firstName: "Schaaf",
      lastName: "Admin",
      password: "Schaefchen-Online-2026!"
    }),
    /Einrichtungsschlüssel/
  );
  assert.throws(
    () => validateInitialSetup({
      setupToken: "CI-SETUP-TOKEN-2026-ONLY-TEST",
      personnelNumber: "ADMIN-1",
      firstName: "Schaaf",
      lastName: "Admin",
      password: "nur-buchstaben"
    }),
    /Buchstaben und eine Zahl/
  );
});

test("Verwaltung validiert Mitarbeiter, Baustelle und Einsatz vollständig", () => {
  const employee = validateEmployee({
    personnelNumber: "M-17",
    firstName: "Mara",
    lastName: "Montage",
    role: "installer",
    temporaryPassword: "Startpasswort-2026"
  });
  assert.equal(employee.role, "installer");
  for (const role of ["planner", "project_manager", "executive_assistant"]) {
    assert.equal(
      validateEmployee({ ...employee, role, temporaryPassword: "Startpasswort-2026" }).role,
      role
    );
  }
  assert.throws(
    () => validateEmployee({ ...employee, role: "admin", temporaryPassword: "Startpasswort-2026" }),
    /Mitarbeiterrolle/
  );

  const site = validateSiteBundle({
    customerName: "Musterkunde GmbH",
    projectName: "Verteilung",
    siteName: "Musterstraße 12",
    installerShortText: "Verteilung erneuern",
    street: "Musterstraße",
    houseNumber: "12",
    postalCode: "12345",
    city: "Musterstadt"
  });
  assert.equal(site.city, "Musterstadt");

  const assignment = validateAssignment({
    employeeId: "11111111-1111-4111-8111-111111111111",
    constructionSiteId: "22222222-2222-4222-8222-222222222222",
    workDate: "2026-07-20",
    plannedStartTime: "07:30"
  });
  assert.equal(assignment.plannedStartTime, "07:30");
  assert.throws(
    () => validateAssignment({ ...assignment, plannedStartTime: "25:30" }),
    /Startzeit/
  );

  const update = validateAssignmentUpdate({
    workDate: "2026-07-21",
    plannedStartTime: "08:15",
    changeReason: "Kunde öffnet später"
  });
  assert.equal(update.workDate, "2026-07-21");
  assert.equal(
    validateAssignmentCancellation({ changeReason: "Termin abgesagt" }).changeReason,
    "Termin abgesagt"
  );
  assert.throws(
    () => validateAssignmentUpdate({ ...update, changeReason: "x" }),
    /Änderungsgrund/
  );
});

test("Startpasswortwechsel nutzt dieselben Passwortregeln", () => {
  assert.equal(
    validateInitialPasswordChange({ newPassword: "Eigenes-Passwort-2026" }).newPassword,
    "Eigenes-Passwort-2026"
  );
  assert.throws(
    () => validateInitialPasswordChange({ newPassword: "keine-zahl-hier" }),
    /Buchstaben und eine Zahl/
  );
});

test("Login übernimmt keine Mandanten-ID aus dem Client", () => {
  assert.throws(
    () => validateLogin({
      companyNumber: "F-000001",
      personnelNumber: "M-1",
      password: "geheim",
      companyId: "00000000-0000-4000-8000-000000000000"
    }),
    /ausschließlich vom Server/
  );
});

test("Zeitbuchung validiert UUID, Zeitstempel und Baustellenpflicht", () => {
  const value = validateTimeEntry({
    clientEntryId: "11111111-1111-4111-8111-111111111111",
    entryType: "site_arrival",
    recordedAt: "2026-07-17T08:00:00+02:00",
    clientCreatedAt: "2026-07-17T08:00:01+02:00",
    constructionSiteId: "22222222-2222-4222-8222-222222222222"
  });
  assert.equal(value.entryType, "site_arrival");

  assert.throws(
    () => validateTimeEntry({
      clientEntryId: "11111111-1111-4111-8111-111111111111",
      entryType: "site_departure",
      recordedAt: "2026-07-17T08:00:00+02:00"
    }),
    /constructionSiteId fehlt/
  );
});

test("lokales Arbeitsdatum und Schrittfolge sind eindeutig", () => {
  assert.equal(localDate("2026-01-01T00:30:00Z", "Europe/Berlin"), "2026-01-01");
  assert.deepEqual(expectedNextTypes(null), ["clock_in"]);
  assert.deepEqual(expectedNextTypes("site_departure"), ["next_site", "clock_out"]);
  assert.deepEqual(expectedNextTypes("clock_out"), []);
  assert.equal(validateWorkDate("2026-07-17"), "2026-07-17");
  assert.throws(() => validateWorkDate("2026-02-30"), /ungültig/);
});
