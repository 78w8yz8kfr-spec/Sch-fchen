// Rollenlogik der Oberflaeche an einem Ort. Sie entscheidet, wer die Planung
// sieht, wer den Betrieb einstellt und wer eingeplant werden kann. Vorher stand
// dieselbe Rollenliste an mehreren Stellen in app.js und wich voneinander ab.

// Rollen mit voller Sicht auf den Betrieb.
export const FULL_PLANNING_ROLES = Object.freeze([
  "admin",
  "managing_director",
  "dispatch_office",
  "office",
  "planner",
  "executive_assistant"
]);

// Die Projektleitung plant ebenfalls, sieht aber nur ihre eigenen Projekte.
// Die Liste leitet sich bewusst aus der obigen ab, damit beide nicht
// auseinanderlaufen, wenn eine Rolle hinzukommt.
export const PLANNING_ROLES = Object.freeze([...FULL_PLANNING_ROLES, "project_manager"]);

// Module und firmenweite Einstellungen aendert nur die Leitung.
export const MODULE_ADMIN_ROLES = Object.freeze(["admin", "managing_director"]);

const hatEine = (rollen, erlaubte) => {
  const menge = new Set(erlaubte);
  return (rollen || []).some((rolle) => menge.has(rolle));
};

export function sessionRoles(session) {
  return session?.user?.roles || [];
}

export function canPlan(session, { demoMode = false } = {}) {
  return !demoMode && hatEine(sessionRoles(session), PLANNING_ROLES);
}

// Eine Sitzung ist auf Projekte begrenzt, wenn allein die Projektleitung sie
// traegt. Kommt eine der vollen Planungsrollen hinzu, gilt die weitere Sicht.
export function isProjectScopedSession(session) {
  const rollen = sessionRoles(session);
  return rollen.includes("project_manager") && !hatEine(rollen, FULL_PLANNING_ROLES);
}

export function canAdministerModules(session, { demoMode = false } = {}) {
  return !demoMode && hatEine(sessionRoles(session), MODULE_ADMIN_ROLES);
}

export function isForeman(roles) {
  return (roles || []).includes("foreman");
}

// Jeder aktive Mitarbeiter kann eingeplant werden. In kleinen Betrieben
// arbeiten Leitung und Projektleitung regelmaessig mit; die Schnittstelle
// laesst sie seit V0.42 zu, und die Oberflaeche bietet sie nun ebenso an.
// Vorher blieb die Plantafel auf Monteure und Vorarbeiter beschraenkt, sodass
// sich die uebrigen Rollen gar nicht erst auswaehlen liessen.
export function plannableEmployees(employees) {
  return (employees || []).filter((employee) => (employee.status || "active") === "active");
}

// Kurze Bezeichnung fuer die Listen der Planung. Die Berichtsverantwortung
// bleibt dem Vorarbeiter vorbehalten, deshalb steht sie zuerst.
export function employeeRoleLabel(roles = []) {
  if (isForeman(roles)) return "Vorarbeiter";
  if (hatEine(roles, PLANNING_ROLES)) return "Planung";
  return "Monteur";
}
