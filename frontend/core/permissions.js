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

// Rollen, Ausbilderstatus und Modulfreigaben entscheiden gemeinsam, welche
// Bereiche eine laufende Sitzung sehen darf. Die Signatur macht Änderungen
// unabhängig von der Reihenfolge der Serverantwort erkennbar. So kann die App
// beim Zurückkehren nicht nur neue Module, sondern auch eine reparierte oder
// bewusst geänderte Mitarbeiterrolle übernehmen.
export function sessionAccessSignature(session) {
  const roles = [...sessionRoles(session)].sort();
  const modules = Object.entries(session?.modules || {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, enabled]) => [key, Boolean(enabled)]);
  return JSON.stringify({
    roles,
    isTrainer: Boolean(session?.user?.isTrainer),
    modules
  });
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
  // Der Auszubildende steht zuerst: es ist die Angabe, die zaehlt - fuer die
  // Kammer, fuer den Ausbilder und fuer den Azubi selbst, der in seinem Konto
  // sonst "Monteur" las.
  if ((roles || []).includes("apprentice")) return "Auszubildender";
  if (isForeman(roles)) return "Vorarbeiter";
  if (hatEine(roles, PLANNING_ROLES)) return "Planung";
  return "Monteur";
}

// Das Bearbeitungsformular kann genau eine Hauptrolle speichern. Ein Azubi
// kann aus der historischen Umstellung zusaetzlich noch die Monteurrolle
// besitzen; trotzdem muss das Formular "Auszubildender" vorauswaehlen. Sonst
// macht bereits eine harmlose Aenderung an Name oder Telefon aus ihm einen
// Monteur und nimmt ihm das Berichtsheft weg.
const EDITABLE_EMPLOYEE_ROLES = new Set([
  "installer",
  "foreman",
  "managing_director",
  "dispatch_office",
  "project_manager"
]);

export function editableEmployeeRole(roles = []) {
  if ((roles || []).includes("apprentice")) return "apprentice";
  return (roles || []).find((role) => EDITABLE_EMPLOYEE_ROLES.has(role)) || "installer";
}
