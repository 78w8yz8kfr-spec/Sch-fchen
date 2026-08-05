import assert from "node:assert/strict";
import test from "node:test";
import {
  FULL_PLANNING_ROLES,
  MODULE_ADMIN_ROLES,
  PLANNING_ROLES,
  canAdministerModules,
  canPlan,
  employeeRoleLabel,
  isForeman,
  isProjectScopedSession,
  plannableEmployees,
  sessionRoles
} from "../core/permissions.js";

const sitzung = (...rollen) => ({ user: { roles: rollen } });

test("Ohne Sitzung gilt keine Berechtigung", () => {
  assert.deepEqual(sessionRoles(undefined), []);
  assert.equal(canPlan(undefined), false);
  assert.equal(canPlan({}), false);
  assert.equal(canAdministerModules(undefined), false);
  assert.equal(isProjectScopedSession(undefined), false);
});

test("Alle Planungsrollen duerfen planen", () => {
  for (const rolle of PLANNING_ROLES) {
    assert.equal(canPlan(sitzung(rolle)), true, rolle);
  }
  assert.equal(canPlan(sitzung("installer")), false);
  assert.equal(canPlan(sitzung("foreman")), false);
});

test("Die Vorfuehrung zeigt keine Planung", () => {
  // Im Vorfuehrmodus liegen erfundene Daten vor. Die Planung wuerde dort
  // Handlungen anbieten, die es nicht gibt.
  assert.equal(canPlan(sitzung("admin"), { demoMode: true }), false);
  assert.equal(canAdministerModules(sitzung("admin"), { demoMode: true }), false);
});

test("Die Projektleitung allein ist auf ihre Projekte begrenzt", () => {
  assert.equal(isProjectScopedSession(sitzung("project_manager")), true);
  assert.equal(isProjectScopedSession(sitzung("project_manager", "installer")), true);
  // Kommt eine volle Planungsrolle hinzu, gilt die weitere Sicht.
  for (const rolle of FULL_PLANNING_ROLES) {
    assert.equal(isProjectScopedSession(sitzung("project_manager", rolle)), false, rolle);
  }
  assert.equal(isProjectScopedSession(sitzung("installer")), false);
});

test("Die beiden Rollenlisten koennen nicht auseinanderlaufen", () => {
  // PLANNING_ROLES leitet sich aus FULL_PLANNING_ROLES ab. Kommt spaeter eine
  // Rolle hinzu, wirkt sie in beiden Pruefungen; vorher standen die Listen
  // getrennt in app.js und mussten von Hand gleich gehalten werden.
  for (const rolle of FULL_PLANNING_ROLES) {
    assert.ok(PLANNING_ROLES.includes(rolle), `${rolle} fehlt in PLANNING_ROLES`);
  }
  assert.deepEqual(
    PLANNING_ROLES.filter((rolle) => !FULL_PLANNING_ROLES.includes(rolle)),
    ["project_manager"]
  );
});

test("Firmenweite Einstellungen aendert nur die Leitung", () => {
  for (const rolle of MODULE_ADMIN_ROLES) {
    assert.equal(canAdministerModules(sitzung(rolle)), true, rolle);
  }
  for (const rolle of ["dispatch_office", "planner", "project_manager", "foreman"]) {
    assert.equal(canAdministerModules(sitzung(rolle)), false, rolle);
  }
});

test("Jeder aktive Mitarbeiter kann eingeplant werden", () => {
  // Die Plantafel zeigte nur Monteure und Vorarbeiter. In kleinen Betrieben
  // arbeitet die Leitung mit; die Schnittstelle laesst sie zu, die Oberflaeche
  // bot sie aber gar nicht erst zur Auswahl an.
  const employees = [
    { id: "1", roles: ["installer"], status: "active" },
    { id: "2", roles: ["foreman"], status: "active" },
    { id: "3", roles: ["admin"], status: "active" },
    { id: "4", roles: ["project_manager"], status: "active" },
    { id: "5", roles: ["installer"], status: "archived" }
  ];
  assert.deepEqual(plannableEmployees(employees).map((e) => e.id), ["1", "2", "3", "4"]);
});

test("Ohne Angabe gilt ein Mitarbeiter als aktiv", () => {
  assert.deepEqual(plannableEmployees([{ id: "1", roles: [] }]).map((e) => e.id), ["1"]);
  assert.deepEqual(plannableEmployees(undefined), []);
});

test("Die Bezeichnung nennt den Vorarbeiter zuerst", () => {
  // Die Berichtsverantwortung haengt am Vorarbeiter, deshalb geht sie einer
  // zusaetzlichen Planungsrolle vor.
  assert.equal(employeeRoleLabel(["foreman"]), "Vorarbeiter");
  assert.equal(employeeRoleLabel(["foreman", "admin"]), "Vorarbeiter");
  assert.equal(employeeRoleLabel(["admin"]), "Planung");
  assert.equal(employeeRoleLabel(["planner"]), "Planung");
  assert.equal(employeeRoleLabel(["executive_assistant"]), "Planung");
  assert.equal(employeeRoleLabel(["installer"]), "Monteur");
  assert.equal(employeeRoleLabel([]), "Monteur");
  assert.equal(employeeRoleLabel(), "Monteur");
  // Ein Auszubildender ist kein Monteur. In seinem eigenen Konto stand bisher
  // genau das - und in der Planung ebenso.
  assert.equal(employeeRoleLabel(["apprentice"]), "Auszubildender");
  assert.equal(employeeRoleLabel(["apprentice", "installer"]), "Auszubildender");
});

test("Der Vorarbeiter wird an seiner Rolle erkannt", () => {
  assert.equal(isForeman(["foreman"]), true);
  assert.equal(isForeman(["installer"]), false);
  assert.equal(isForeman(undefined), false);
});
