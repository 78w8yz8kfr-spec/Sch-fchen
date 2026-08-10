const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ENTRY_TYPES = new Set([
  "clock_in",
  "site_arrival",
  "site_departure",
  "next_site",
  "clock_out"
]);
const SITE_TYPES = new Set(["site_arrival", "site_departure", "next_site"]);
// Die Klassen des deutschen Fuehrerscheins. Dieselbe Liste steht in der
// Migration 078 als Pruefung am Bestand: hier faengt sie den Tippfehler
// freundlich ab, dort schuetzt sie die Daten auch vor jedem anderen Weg.
export const DRIVING_LICENCE_CLASSES = Object.freeze([
  "AM", "A1", "A2", "A",
  "B", "B96", "BE",
  "C1", "C1E", "C", "CE",
  "D1", "D1E", "D", "DE",
  "L", "T"
]);

function drivingLicenceClasses(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > DRIVING_LICENCE_CLASSES.length) {
    throw new InputError("Die Führerscheinklassen sind ungültig.");
  }
  const erlaubt = new Set(DRIVING_LICENCE_CLASSES);
  const klassen = new Set();
  for (const eintrag of value) {
    if (typeof eintrag !== "string") {
      throw new InputError("Die Führerscheinklassen sind ungültig.");
    }
    const klasse = eintrag.trim().toUpperCase();
    if (!klasse) continue;
    if (!erlaubt.has(klasse)) {
      throw new InputError(`Die Führerscheinklasse „${eintrag}" ist unbekannt.`);
    }
    klassen.add(klasse);
  }
  // Feste Reihenfolge, wie im Bestand: sonst haetten zwei gleiche Angaben
  // zwei verschiedene Zeilenversionen zur Folge.
  return [...klassen].sort();
}

const EMPLOYEE_ROLES = new Set([
  "installer",
  "apprentice",
  "foreman",
  "managing_director",
  "dispatch_office",
  "project_manager"
]);
const MANAGEABLE_SITE_STATUSES = new Set(["active", "completed", "archived"]);
const MANAGEABLE_CUSTOMER_STATUSES = new Set(["active", "archived"]);
const MANAGEABLE_PROJECT_STATUSES = new Set(["planned", "active", "on_hold", "completed", "archived"]);
const DOCUMENT_CATEGORIES = new Set([
  "general",
  "order",
  "plan",
  "report",
  "delivery_note",
  "invoice",
  "photo",
  "inspection"
]);
const DOCUMENT_MIME_TYPES = new Map([
  ["application/pdf", new Set(["pdf"])],
  ["image/jpeg", new Set(["jpg", "jpeg"])],
  ["image/png", new Set(["png"])],
  ["image/webp", new Set(["webp"])],
  ["text/plain", new Set(["txt"])],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", new Set(["xlsx"])],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", new Set(["docx"])]
]);
const MAXIMUM_DOCUMENT_BYTES = 5_000_000;
const DELIVERY_NOTE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const SITE_TASK_PRIORITIES = new Set(["low", "normal", "high"]);
const SITE_TASK_STATUSES = new Set(["open", "in_progress", "done", "archived"]);
const SITE_MATERIAL_STATUSES = new Set(["planned", "ordered", "available", "used", "archived"]);
const SITE_REPORT_TYPES = new Set(["montage", "daily"]);
const SITE_REPORT_SOURCES = new Set(["digital", "photo", "speech"]);
const VDE_SOURCE_MODES = new Set(["integrated", "legacy_v15"]);
const VDE_NETWORK_TYPES = new Set(["TN-S", "TN-C-S", "TN-C", "TT", "IT"]);
const VDE_CHECK_RESULTS = new Set(["ok", "not_ok", "not_checked"]);
const VDE_RESULTS = new Set(["ok", "operational_with_defects", "not_operational"]);
const VDE_PROTECTION_TYPES = new Set([
  "mcb",
  "rcbo",
  "fuse_nh",
  "fuse_diazed",
  "fuse_neozed",
  "other"
]);
const VDE_VISUAL_CHECK_KEYS = [
  "electric_shock_protection",
  "protective_conductor",
  "equipment_selection",
  "circuit_labelling",
  "rcd_test_button",
  "phase_sequence",
  "polarity",
  "disconnection_conditions"
];
const TIME_CORRECTION_DECISIONS = new Set(["approved", "rejected"]);
const WORK_DAY_DECISIONS = new Set(["approved", "locked"]);
const ABSENCE_TYPES = new Set([
  "vacation",
  "unpaid_vacation",
  "time_off",
  "leave",
  "special_leave",
  "sick",
  "training",
  "vocational_school",
  "other"
]);
const ABSENCE_DAY_PARTS = new Set(["full_day", "first_half", "second_half"]);
const ABSENCE_DECISIONS = new Set(["approve", "reject", "cancel"]);
const TIME_ACCOUNT_ADJUSTMENT_TYPES = new Set(["opening_balance", "correction", "payout"]);
const HOLIDAY_FEDERAL_STATES = new Set([
  "BW", "BY", "BE", "BB", "HB", "HH", "HE", "MV",
  "NI", "NW", "RP", "SL", "SN", "ST", "SH", "TH"
]);
const PNG_DATA_URL_PREFIX = "data:image/png;base64,";

export class InputError extends Error {
  constructor(message, status = 400, code = "invalid_request") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function readJson(request, maximumBytes = 32768) {
  const type = request.headers["content-type"]?.split(";", 1)[0].trim().toLowerCase();
  if (type !== "application/json") {
    throw new InputError("Content-Type application/json ist erforderlich.", 415, "unsupported_media_type");
  }

  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > maximumBytes) {
      throw new InputError("Die Anfrage ist zu groß.", 413, "payload_too_large");
    }
    chunks.push(chunk);
  }

  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw new InputError("Der JSON-Inhalt ist ungültig.");
  }
}

function text(value, label, minimum, maximum) {
  if (typeof value !== "string") throw new InputError(`${label} fehlt.`);
  const normalized = value.trim();
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new InputError(`${label} hat eine ungültige Länge.`);
  }
  return normalized;
}

function optionalText(value, label, maximum) {
  if (value === undefined || value === null || value === "") return null;
  return text(value, label, 1, maximum);
}

function uuid(value, label) {
  const normalized = text(value, label, 36, 36);
  if (!UUID.test(normalized)) throw new InputError(`${label} ist keine gültige UUID.`);
  return normalized;
}

function optionalUuid(value, label) {
  if (value === undefined || value === null || value === "") return null;
  return uuid(value, label);
}

function uniqueUuidList(value, label, minimum = 1, maximum = 100) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    throw new InputError(`${label} muss zwischen ${minimum} und ${maximum} Einträge enthalten.`);
  }
  const identifiers = value.map((entry, index) => uuid(entry, `${label} ${index + 1}`));
  if (new Set(identifiers).size !== identifiers.length) {
    throw new InputError(`${label} darf keine doppelten Einträge enthalten.`);
  }
  return identifiers;
}

function assertAssignmentFitsDay(plannedStartTime, plannedDurationMinutes) {
  if (!plannedStartTime || plannedDurationMinutes === null || plannedDurationMinutes === undefined) {
    return;
  }
  const [hours, minutes] = plannedStartTime.split(":").map(Number);
  if (hours * 60 + minutes + plannedDurationMinutes > 1440) {
    throw new InputError("Der Einsatz darf nicht über Mitternacht hinaus geplant werden.");
  }
}

function boolean(value, label, fallback = false) {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new InputError(`${label} ist ungültig.`);
  return value;
}

function password(value) {
  const normalized = text(value, "Passwort", 12, 256);
  if (!/[a-zäöü]/i.test(normalized) || !/\d/.test(normalized)) {
    throw new InputError("Das Passwort benötigt mindestens einen Buchstaben und eine Zahl.");
  }
  return normalized;
}

function rejectTenantFields(body) {
  for (const field of ["companyId", "company_id", "userId", "user_id", "workDayId", "work_day_id"]) {
    if (Object.hasOwn(body, field)) {
      throw new InputError(`${field} wird ausschließlich vom Server bestimmt.`);
    }
  }
}

export function validateLogin(body) {
  rejectTenantFields(body);
  return {
    companyNumber: text(body.companyNumber, "Firmennummer", 3, 20),
    personnelNumber: text(body.personnelNumber, "Personalnummer", 1, 30),
    password: text(body.password, "Passwort", 1, 256)
  };
}

export function validateInitialSetup(body) {
  rejectTenantFields(body);
  const initialPassword = password(body.password);
  return {
    setupToken: text(body.setupToken, "Einrichtungsschlüssel", 24, 512),
    personnelNumber: text(body.personnelNumber, "Personalnummer", 1, 30),
    firstName: text(body.firstName, "Vorname", 1, 100),
    lastName: text(body.lastName, "Nachname", 1, 100),
    password: initialPassword
  };
}

export function validateEmployee(body) {
  rejectTenantFields(body);
  const role = text(body.role, "Rolle", 2, 50).toLowerCase();
  if (!EMPLOYEE_ROLES.has(role)) throw new InputError("Die Mitarbeiterrolle ist ungültig.");
  return {
    personnelNumber: text(body.personnelNumber, "Personalnummer", 1, 30),
    firstName: text(body.firstName, "Vorname", 1, 100),
    lastName: text(body.lastName, "Nachname", 1, 100),
    email: optionalText(body.email, "E-Mail", 254),
    phone: optionalText(body.phone, "Telefon", 50),
    role,
    // Das Lager ist eine Aufgabe neben der Taetigkeit, keine statt ihrer: in
    // kleinen Betrieben fuehrt es der Monteur, der ohnehin am Regal steht.
    // Deshalb ein Schalter zusaetzlich zur Hauptrolle und kein weiterer
    // Eintrag in der Auswahlliste.
    warehouseManager: boolean(body.warehouseManager, "Lagerist"),
    drivingLicenceClasses: drivingLicenceClasses(body.drivingLicenceClasses),
    temporaryPassword: password(body.temporaryPassword)
  };
}

export function validateEmployeeUpdate(body) {
  rejectTenantFields(body);
  const role = text(body.role, "Rolle", 2, 50).toLowerCase();
  if (!EMPLOYEE_ROLES.has(role)) throw new InputError("Die Mitarbeiterrolle ist ungültig.");
  const rowVersion = Number(body.rowVersion);
  if (!Number.isSafeInteger(rowVersion) || rowVersion < 1) {
    throw new InputError("Die Mitarbeiterversion ist ungültig.");
  }
  return {
    personnelNumber: text(body.personnelNumber, "Personalnummer", 1, 30),
    firstName: text(body.firstName, "Vorname", 1, 100),
    lastName: text(body.lastName, "Nachname", 1, 100),
    email: optionalText(body.email, "E-Mail", 254),
    phone: optionalText(body.phone, "Telefon", 50),
    role,
    // Nur die neue Oberflaeche sendet diese ausdrueckliche Bestaetigung. Eine
    // alte, bereits geoeffnete Fassung kann einen Azubi dadurch nicht mehr
    // unbemerkt zur Monteurrolle zuruecksetzen.
    roleChangeConfirmed: boolean(body.roleChangeConfirmed, "Bestätigung der Rollenänderung"),
    // Siehe validateEmployee: der Lagerist kommt zur Hauptrolle hinzu.
    warehouseManager: boolean(body.warehouseManager, "Lagerist"),
    // Der Ausbilder gehoert an den Mitarbeiter, nicht in eine eigene
    // Verwaltung daneben. Ob jemand ein Berichtsheft fuehrt, sagt seine Rolle.
    trainerUserId: optionalUuid(body.trainerUserId, "Ausbilder"),
    drivingLicenceClasses: drivingLicenceClasses(body.drivingLicenceClasses),
    rowVersion
  };
}

// Fahrzeuge des Fuhrparks.
//
// Das Kennzeichen ist die Kennung, die im Betrieb benutzt wird. Es wird
// aufgeraeumt und nicht abgelehnt: wer " es-se 123 " tippt, meint ES-SE 123.
export const VEHICLE_TYPES = Object.freeze(["van", "truck", "car", "trailer", "machine"]);
export const VEHICLE_STATUSES = Object.freeze(["active", "workshop", "retired"]);
export const VEHICLE_LICENCE_CLASSES = Object.freeze([
  "B", "B96", "BE", "C1", "C1E", "C", "CE", "T", "L"
]);

function vehicleFields(body) {
  const licencePlate = text(body.licencePlate, "Kennzeichen", 2, 15)
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  const vehicleType = text(body.vehicleType ?? "van", "Fahrzeugart", 2, 20).toLowerCase();
  if (!VEHICLE_TYPES.includes(vehicleType)) {
    throw new InputError("Die Fahrzeugart ist ungültig.");
  }
  const status = text(body.status ?? "active", "Zustand", 2, 20).toLowerCase();
  if (!VEHICLE_STATUSES.includes(status)) {
    throw new InputError("Der Zustand des Fahrzeugs ist ungültig.");
  }
  const requiredLicenceClass = text(
    body.requiredLicenceClass ?? "B", "Führerscheinklasse", 1, 4
  ).toUpperCase();
  if (!VEHICLE_LICENCE_CLASSES.includes(requiredLicenceClass)) {
    throw new InputError("Für diese Führerscheinklasse fährt kein Fahrzeug.");
  }
  return {
    licencePlate,
    label: optionalText(body.label, "Bezeichnung", 120),
    vehicleType,
    requiredLicenceClass,
    assignedUserId: optionalUuid(body.assignedUserId, "Fahrer"),
    status,
    nextInspectionOn: optionalDate(body.nextInspectionOn, "Hauptuntersuchung"),
    nextServiceOn: optionalDate(body.nextServiceOn, "Nächster Service"),
    note: optionalText(body.note, "Notiz", 1000)
  };
}

function optionalDate(value, label) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new InputError(`${label}: Das Datum muss dem Format JJJJ-MM-TT entsprechen.`);
  }
  const datum = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(datum.valueOf())) {
    throw new InputError(`${label}: Das Datum gibt es nicht.`);
  }
  return value;
}

export function validateVehicle(body) {
  rejectTenantFields(body);
  return vehicleFields(body);
}

export function validateVehicleUpdate(body) {
  rejectTenantFields(body);
  const rowVersion = Number(body.rowVersion);
  if (!Number.isSafeInteger(rowVersion) || rowVersion < 1) {
    throw new InputError("Die Fahrzeugversion ist ungültig.");
  }
  return { ...vehicleFields(body), rowVersion };
}

export function validateSiteBundle(body) {
  rejectTenantFields(body);
  return {
    customerName: text(body.customerName, "Kundenname", 2, 200),
    projectName: optionalText(body.projectName, "Projektname", 200),
    siteName: text(body.siteName, "Baustellenname", 2, 200),
    installerShortText: optionalText(body.installerShortText, "Kurztext", 300),
    street: text(body.street, "Straße", 1, 150),
    houseNumber: text(body.houseNumber, "Hausnummer", 1, 20),
    postalCode: text(body.postalCode, "Postleitzahl", 1, 12),
    city: text(body.city, "Ort", 1, 100)
  };
}

export function validateCustomer(body) {
  rejectTenantFields(body);
  const customerType = text(body.customerType, "Kundenart", 3, 20).toLowerCase();
  if (!new Set(["company", "private"]).has(customerType)) {
    throw new InputError("Die Kundenart ist ungültig.");
  }
  const companyName = optionalText(body.companyName, "Firmenname", 200);
  const firstName = optionalText(body.firstName, "Vorname", 100);
  const lastName = optionalText(body.lastName, "Nachname", 100);
  if (customerType === "company" && !companyName) {
    throw new InputError("Firmenname fehlt.");
  }
  if (customerType === "private" && (!firstName || !lastName)) {
    throw new InputError("Vorname und Nachname fehlen.");
  }

  const street = optionalText(body.street, "Straße", 150);
  const houseNumber = optionalText(body.houseNumber, "Hausnummer", 20);
  const postalCode = optionalText(body.postalCode, "Postleitzahl", 12);
  const city = optionalText(body.city, "Ort", 100);
  const addressParts = [street, houseNumber, postalCode, city];
  if (addressParts.some(Boolean) && !addressParts.every(Boolean)) {
    throw new InputError("Die Rechnungsadresse ist unvollständig.");
  }

  return {
    customerType,
    companyName: customerType === "company" ? companyName : null,
    firstName: customerType === "private" ? firstName : null,
    lastName: customerType === "private" ? lastName : null,
    email: optionalText(body.email, "E-Mail", 254),
    phone: optionalText(body.phone, "Telefon", 50),
    street,
    houseNumber,
    postalCode,
    city
  };
}

export function validateCustomerUpdate(body) {
  const customer = validateCustomer(body);
  const status = text(body.status, "Kundenstatus", 2, 20).toLowerCase();
  if (!MANAGEABLE_CUSTOMER_STATUSES.has(status)) {
    throw new InputError("Der Kundenstatus ist ungültig.");
  }
  const rowVersion = Number(body.rowVersion);
  if (!Number.isSafeInteger(rowVersion) || rowVersion < 1) {
    throw new InputError("Die Kundenversion ist ungültig.");
  }
  return { ...customer, status, rowVersion };
}

export function validateProject(body) {
  rejectTenantFields(body);
  return {
    customerId: uuid(body.customerId, "Kunde"),
    name: text(body.name, "Projektname", 2, 200),
    installerShortText: optionalText(body.installerShortText, "Kurztext", 300),
    projectManagerId: optionalUuid(body.projectManagerId, "Projektleiter")
  };
}

export function validateProjectUpdate(body) {
  rejectTenantFields(body);
  const status = text(body.status, "Projektstatus", 2, 20).toLowerCase();
  if (!MANAGEABLE_PROJECT_STATUSES.has(status)) {
    throw new InputError("Der Projektstatus ist ungültig.");
  }
  const rowVersion = Number(body.rowVersion);
  if (!Number.isSafeInteger(rowVersion) || rowVersion < 1) {
    throw new InputError("Die Projektversion ist ungültig.");
  }
  return {
    name: text(body.name, "Projektname", 2, 200),
    installerShortText: optionalText(body.installerShortText, "Kurztext", 300),
    projectManagerId: body.projectManagerId === undefined
      ? undefined
      : optionalUuid(body.projectManagerId, "Projektleiter"),
    status,
    rowVersion
  };
}

export function validateConstructionSite(body) {
  rejectTenantFields(body);
  const projectId = optionalUuid(body.projectId, "Auftrag");
  const customerId = optionalUuid(body.customerId, "Kunde");
  const customerName = optionalText(body.customerName, "Neuer Kunde", 200);
  if (projectId && (customerId || customerName)) {
    throw new InputError("Bitte die Baustelle nur einem Kunden zuordnen.");
  }
  if (!projectId && !customerId && !customerName) {
    throw new InputError("Bitte einen vorhandenen oder neuen Kunden auswählen.");
  }
  if (customerId && customerName) {
    throw new InputError("Bitte entweder einen vorhandenen oder einen neuen Kunden verwenden.");
  }
  return {
    projectId,
    customerId,
    customerName,
    name: text(body.name, "Baustellenname", 2, 200),
    installerShortText: optionalText(body.installerShortText, "Kurztext", 300),
    projectManagerId: body.projectManagerId === undefined
      ? undefined
      : optionalUuid(body.projectManagerId, "Projektleiter"),
    street: text(body.street, "Straße", 1, 150),
    houseNumber: text(body.houseNumber, "Hausnummer", 1, 20),
    postalCode: text(body.postalCode, "Postleitzahl", 1, 12),
    city: text(body.city, "Ort", 1, 100)
  };
}

export function validateConstructionSiteUpdate(body) {
  rejectTenantFields(body);
  const status = text(body.status, "Baustellenstatus", 2, 20).toLowerCase();
  if (!MANAGEABLE_SITE_STATUSES.has(status)) {
    throw new InputError("Der Baustellenstatus ist ungültig.");
  }
  const rowVersion = Number(body.rowVersion);
  if (!Number.isSafeInteger(rowVersion) || rowVersion < 1) {
    throw new InputError("Die Baustellenversion ist ungültig.");
  }
  return {
    name: text(body.name, "Baustellenname", 2, 200),
    installerShortText: optionalText(body.installerShortText, "Kurztext", 300),
    projectManagerId: body.projectManagerId === undefined
      ? undefined
      : optionalUuid(body.projectManagerId, "Projektleiter"),
    street: text(body.street, "Straße", 1, 150),
    houseNumber: text(body.houseNumber, "Hausnummer", 1, 20),
    postalCode: text(body.postalCode, "Postleitzahl", 1, 12),
    city: text(body.city, "Ort", 1, 100),
    status,
    rowVersion
  };
}

export function validateAssignment(body) {
  if (Object.hasOwn(body, "companyId") || Object.hasOwn(body, "company_id")) {
    throw new InputError("companyId wird ausschließlich vom Server bestimmt.");
  }
  const plannedStartTime = optionalText(body.plannedStartTime, "Startzeit", 5);
  if (plannedStartTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(plannedStartTime)) {
    throw new InputError("Die Startzeit muss dem Format HH:MM entsprechen.");
  }
  const plannedDurationMinutes = body.plannedDurationMinutes === undefined
    || body.plannedDurationMinutes === null
    || body.plannedDurationMinutes === ""
    ? null
    : Number(body.plannedDurationMinutes);
  if (
    plannedDurationMinutes !== null
    && (
      !Number.isSafeInteger(plannedDurationMinutes)
      || plannedDurationMinutes < 15
      || plannedDurationMinutes > 1440
    )
  ) {
    throw new InputError("Die geplante Einsatzdauer muss zwischen 15 Minuten und 24 Stunden liegen.");
  }
  assertAssignmentFitsDay(plannedStartTime, plannedDurationMinutes);
  return {
    employeeId: uuid(body.employeeId, "Mitarbeiter"),
    constructionSiteId: uuid(body.constructionSiteId, "Baustelle"),
    workDate: validateWorkDate(body.workDate),
    plannedStartTime,
    plannedDurationMinutes,
    comment: optionalText(body.comment, "Arbeitsanweisung", 500),
    reportResponsible: boolean(body.reportResponsible, "Vorarbeiterzuweisung")
  };
}

export function validateAssignmentUpdate(body) {
  if (Object.hasOwn(body, "companyId") || Object.hasOwn(body, "company_id")) {
    throw new InputError("companyId wird ausschließlich vom Server bestimmt.");
  }
  const hasPlannedStart = body.plannedStartTime !== undefined;
  const plannedStartTime = hasPlannedStart
    ? optionalText(body.plannedStartTime, "Startzeit", 5)
    : undefined;
  if (plannedStartTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(plannedStartTime)) {
    throw new InputError("Die Startzeit muss dem Format HH:MM entsprechen.");
  }
  const hasPlannedDuration = body.plannedDurationMinutes !== undefined;
  const plannedDurationMinutes = !hasPlannedDuration
    ? undefined
    : body.plannedDurationMinutes === null || body.plannedDurationMinutes === ""
      ? null
      : Number(body.plannedDurationMinutes);
  if (
    plannedDurationMinutes !== undefined
    && plannedDurationMinutes !== null
    && (
      !Number.isSafeInteger(plannedDurationMinutes)
      || plannedDurationMinutes < 15
      || plannedDurationMinutes > 1440
    )
  ) {
    throw new InputError("Die geplante Einsatzdauer muss zwischen 15 Minuten und 24 Stunden liegen.");
  }
  if (hasPlannedStart && hasPlannedDuration) {
    assertAssignmentFitsDay(plannedStartTime, plannedDurationMinutes);
  }
  const rowVersion = Number(body.rowVersion);
  if (!Number.isSafeInteger(rowVersion) || rowVersion < 1) {
    throw new InputError("Die Einsatzversion ist ungültig.");
  }
  return {
    employeeId: optionalUuid(body.employeeId, "Mitarbeiter"),
    workDate: validateWorkDate(body.workDate),
    plannedStartTime,
    plannedDurationMinutes,
    comment: body.comment === undefined
      ? undefined
      : optionalText(body.comment, "Arbeitsanweisung", 500),
    changeReason: text(body.changeReason, "Änderungsgrund", 3, 500),
    reportResponsible: Object.hasOwn(body, "reportResponsible")
      ? boolean(body.reportResponsible, "Vorarbeiterzuweisung")
      : null,
    rowVersion
  };
}

export function validateAssignmentBatch(body) {
  if (Object.hasOwn(body, "companyId") || Object.hasOwn(body, "company_id")) {
    throw new InputError("companyId wird ausschließlich vom Server bestimmt.");
  }
  const employeeIds = uniqueUuidList(body.employeeIds, "Mitarbeiter", 1, 100);
  const planningTeamId = optionalUuid(body.planningTeamId, "Teamvorlage");
  const reportResponsibleEmployeeId = optionalUuid(
    body.reportResponsibleEmployeeId,
    "Berichtsverantwortlicher"
  );
  if (
    reportResponsibleEmployeeId
    && !employeeIds.includes(reportResponsibleEmployeeId)
  ) {
    throw new InputError(
      "Der Berichtsverantwortliche muss zu den ausgewählten Mitarbeitern gehören."
    );
  }
  const common = validateAssignment({
    ...body,
    employeeId: employeeIds[0],
    reportResponsible: false
  });
  return {
    employeeIds,
    planningTeamId,
    reportResponsibleEmployeeId,
    constructionSiteId: common.constructionSiteId,
    workDate: common.workDate,
    plannedStartTime: common.plannedStartTime,
    plannedDurationMinutes: common.plannedDurationMinutes,
    comment: common.comment
  };
}

export function validatePlanningTeam(body) {
  if (Object.hasOwn(body, "companyId") || Object.hasOwn(body, "company_id")) {
    throw new InputError("companyId wird ausschließlich vom Server bestimmt.");
  }
  return {
    name: text(body.name, "Teamname", 2, 100),
    memberIds: uniqueUuidList(body.memberIds, "Teammitglieder", 1, 100)
  };
}

export function validatePlanningTeamUpdate(body) {
  const team = validatePlanningTeam(body);
  const status = text(body.status, "Teamstatus", 6, 20);
  if (!["active", "archived"].includes(status)) {
    throw new InputError("Der Teamstatus ist ungültig.");
  }
  const rowVersion = Number(body.rowVersion);
  if (!Number.isSafeInteger(rowVersion) || rowVersion < 1) {
    throw new InputError("Die Teamversion ist ungültig.");
  }
  return {
    ...team,
    status,
    changeReason: text(body.changeReason, "Änderungsgrund", 3, 500),
    rowVersion
  };
}

export function validateAssignmentCancellation(body) {
  if (Object.hasOwn(body, "companyId") || Object.hasOwn(body, "company_id")) {
    throw new InputError("companyId wird ausschließlich vom Server bestimmt.");
  }
  return { changeReason: text(body.changeReason, "Stornogrund", 3, 500) };
}

export function validateAbsenceRequest(body) {
  rejectTenantFields(body);
  const absenceType = text(body.absenceType, "Abwesenheitsart", 3, 30).toLowerCase();
  if (!ABSENCE_TYPES.has(absenceType)) {
    throw new InputError("Die Abwesenheitsart ist ungültig.");
  }
  const startDate = validateWorkDate(body.startDate);
  const endDate = validateWorkDate(body.endDate);
  if (endDate < startDate) {
    throw new InputError("Das Enddatum darf nicht vor dem Startdatum liegen.");
  }
  const maximumEnd = new Date(`${startDate}T12:00:00Z`);
  maximumEnd.setUTCDate(maximumEnd.getUTCDate() + 366);
  if (endDate > maximumEnd.toISOString().slice(0, 10)) {
    throw new InputError("Ein Abwesenheitsantrag darf höchstens 367 Kalendertage umfassen.");
  }
  const dayPart = (body.dayPart === undefined || body.dayPart === null || body.dayPart === "")
    ? "full_day"
    : text(body.dayPart, "Tagesdauer", 3, 20).toLowerCase();
  if (!ABSENCE_DAY_PARTS.has(dayPart)) {
    throw new InputError("Die Tagesdauer ist ungültig.");
  }
  if (dayPart !== "full_day" && startDate !== endDate) {
    throw new InputError("Ein halber Tag kann nur für ein einzelnes Datum beantragt werden.");
  }
  const note = optionalText(body.note, "Hinweis", 500);
  if (absenceType === "other" && !note) {
    throw new InputError("Für Sonstiges ist ein kurzer Hinweis erforderlich.");
  }
  return { absenceType, startDate, endDate, dayPart, note };
}

export function validateAbsenceDecision(body) {
  rejectTenantFields(body);
  const action = text(body.action, "Entscheidung", 3, 20).toLowerCase();
  if (!ABSENCE_DECISIONS.has(action)) {
    throw new InputError("Die Abwesenheitsentscheidung ist ungültig.");
  }
  const comment = optionalText(body.comment, "Kommentar", 500);
  if (["reject", "cancel"].includes(action) && (!comment || comment.length < 3)) {
    throw new InputError("Ablehnung oder Stornierung benötigt eine kurze Begründung.");
  }
  const rowVersion = Number(body.rowVersion);
  if (!Number.isSafeInteger(rowVersion) || rowVersion < 1) {
    throw new InputError("Die Antragsversion ist ungültig.");
  }
  return { action, comment, rowVersion };
}

export function validateTimeAccountYear(value) {
  const year = Number(value);
  if (!Number.isSafeInteger(year) || year < 2000 || year > 2100) {
    throw new InputError("Das Stundenkonto-Jahr ist ungültig.");
  }
  return year;
}

export function validateHolidayCalendar(body) {
  rejectTenantFields(body);
  const countryCode = text(body.countryCode, "Land", 2, 2).toUpperCase();
  if (countryCode !== "DE") {
    throw new InputError("Der automatische Feiertagskalender unterstützt derzeit Deutschland.");
  }
  const federalStateCode = text(
    body.federalStateCode,
    "Bundesland",
    2,
    2
  ).toUpperCase();
  if (!HOLIDAY_FEDERAL_STATES.has(federalStateCode)) {
    throw new InputError("Das Bundesland des Feiertagskalenders ist ungültig.");
  }
  const rowVersion = Number(body.rowVersion);
  if (!Number.isSafeInteger(rowVersion) || rowVersion < 0) {
    throw new InputError("Die Feiertagskalender-Version ist ungültig.");
  }
  return {
    year: validateTimeAccountYear(body.year),
    countryCode,
    federalStateCode,
    rowVersion
  };
}

export function validateHolidayClosure(body) {
  rejectTenantFields(body);
  const holidayDate = validateWorkDate(body.holidayDate);
  const holidayYear = Number(holidayDate.slice(0, 4));
  if (holidayYear < 2000 || holidayYear > 2100) {
    throw new InputError("Das Jahr des freien Tages muss zwischen 2000 und 2100 liegen.");
  }
  return {
    clientClosureId: uuid(body.clientClosureId, "Freier-Tag-ID"),
    holidayDate,
    name: text(body.name, "Bezeichnung des freien Tages", 2, 120),
    note: text(body.note, "Grund des freien Tages", 3, 500)
  };
}

export function validateHolidayClosureCancellation(body) {
  rejectTenantFields(body);
  const rowVersion = Number(body.rowVersion);
  if (!Number.isSafeInteger(rowVersion) || rowVersion < 1) {
    throw new InputError("Die Version des freien Tages ist ungültig.");
  }
  return {
    rowVersion,
    cancellationNote: text(body.cancellationNote, "Aufhebungsgrund", 3, 500)
  };
}

export function validateTimeAccountProfile(body) {
  rejectTenantFields(body);
  if (typeof body.enabled !== "boolean") {
    throw new InputError("Der Status des Stundenkontos ist ungültig.");
  }
  const annualVacationDays = Number(body.annualVacationDays);
  if (
    !Number.isFinite(annualVacationDays)
    || annualVacationDays < 0
    || annualVacationDays > 60
    || !Number.isInteger(annualVacationDays * 2)
  ) {
    throw new InputError("Der Jahresurlaub muss zwischen 0 und 60 Tagen in halben Tagen liegen.");
  }
  const profileRowVersion = Number(body.profileRowVersion);
  if (!Number.isSafeInteger(profileRowVersion) || profileRowVersion < 0) {
    throw new InputError("Die Stundenkonto-Version ist ungültig.");
  }
  const vacationRowVersion = Number(body.vacationRowVersion);
  if (!Number.isSafeInteger(vacationRowVersion) || vacationRowVersion < 0) {
    throw new InputError("Die Urlaubsanspruch-Version ist ungültig.");
  }
  return {
    year: validateTimeAccountYear(body.year),
    enabled: body.enabled,
    accountStartDate: validateWorkDate(body.accountStartDate),
    annualVacationDays,
    profileRowVersion,
    vacationRowVersion
  };
}

export function validateTimeAccountAdjustment(body) {
  rejectTenantFields(body);
  const adjustmentMinutes = Number(body.adjustmentMinutes);
  if (
    !Number.isSafeInteger(adjustmentMinutes)
    || adjustmentMinutes === 0
    || Math.abs(adjustmentMinutes) > 600000
  ) {
    throw new InputError(
      "Die Stundenkonto-Korrektur muss eine ganze, von null verschiedene Minutenzahl sein."
    );
  }
  const adjustmentType = text(
    body.adjustmentType,
    "Korrekturart",
    3,
    30
  ).toLowerCase();
  if (!TIME_ACCOUNT_ADJUSTMENT_TYPES.has(adjustmentType)) {
    throw new InputError("Die Korrekturart ist ungültig.");
  }
  return {
    employeeId: uuid(body.employeeId, "Mitarbeiter"),
    clientAdjustmentId: uuid(body.clientAdjustmentId, "Buchungs-ID"),
    adjustmentDate: validateWorkDate(body.adjustmentDate),
    adjustmentMinutes,
    adjustmentType,
    note: text(body.note, "Korrekturgrund", 3, 500)
  };
}

export function validateId(value, label = "ID") {
  return uuid(value, label);
}

export function validateInitialPasswordChange(body) {
  rejectTenantFields(body);
  return { newPassword: password(body.newPassword) };
}

export function validateDocumentUpload(body) {
  rejectTenantFields(body);
  const category = text(body.category, "Dokumentart", 2, 30).toLowerCase();
  if (!DOCUMENT_CATEGORIES.has(category)) {
    throw new InputError("Die Dokumentart ist ungültig.");
  }

  const fileName = text(body.fileName, "Dateiname", 1, 255);
  if (/[\\/\u0000-\u001f\u007f]/.test(fileName)) {
    throw new InputError("Der Dateiname enthält unzulässige Zeichen.");
  }
  const extension = fileName.includes(".") ? fileName.split(".").at(-1).toLowerCase() : "";
  const mimeType = text(body.mimeType, "Dateityp", 3, 120).toLowerCase();
  const allowedExtensions = DOCUMENT_MIME_TYPES.get(mimeType);
  if (!allowedExtensions || !allowedExtensions.has(extension)) {
    throw new InputError("Dieser Dateityp wird nicht unterstützt.", 415, "unsupported_document_type");
  }
  if (category === "delivery_note" && !DELIVERY_NOTE_MIME_TYPES.has(mimeType)) {
    throw new InputError(
      "Lieferscheine werden ausschließlich als Foto gespeichert.",
      415,
      "delivery_note_photo_required"
    );
  }

  if (typeof body.contentBase64 !== "string") {
    throw new InputError("Der Dateiinhalt fehlt.");
  }
  const contentBase64 = body.contentBase64.trim();
  if (
    contentBase64.length === 0
    || contentBase64.length % 4 !== 0
    || !/^[A-Za-z0-9+/]+={0,2}$/.test(contentBase64)
  ) {
    throw new InputError("Der Dateiinhalt ist ungültig.");
  }
  const content = Buffer.from(contentBase64, "base64");
  if (content.toString("base64") !== contentBase64) {
    throw new InputError("Der Dateiinhalt ist ungültig.");
  }
  if (content.length < 1 || content.length > MAXIMUM_DOCUMENT_BYTES) {
    throw new InputError(
      "Dokumente dürfen höchstens 5 MB groß sein.",
      413,
      "document_too_large"
    );
  }

  const customerId = optionalUuid(body.customerId, "Kunde");
  const projectId = optionalUuid(body.projectId, "Projekt");
  const constructionSiteId = optionalUuid(body.constructionSiteId, "Baustelle");
  if (!customerId && !projectId && !constructionSiteId) {
    throw new InputError("Bitte das Dokument mindestens einem Kunden, Projekt oder einer Baustelle zuordnen.");
  }

  const mobileVisible = body.mobileVisible === undefined
    ? true
    : boolean(body.mobileVisible, "Mobile Dokumentfreigabe");
  const offlinePriority = body.offlinePriority === undefined
    ? false
    : boolean(body.offlinePriority, "Offline-Markierung");
  if (offlinePriority && !mobileVisible) {
    throw new InputError(
      "Nur mobil freigegebene Dokumente können für die Offline-Ansicht vorgemerkt werden."
    );
  }
  return {
    title: text(body.title, "Dokumenttitel", 2, 200),
    category,
    fileName,
    mimeType,
    content,
    customerId,
    projectId,
    constructionSiteId,
    mobileVisible,
    offlinePriority
  };
}

export function validateDocumentStatusUpdate(body) {
  rejectTenantFields(body);
  const status = body.status === undefined
    ? null
    : text(body.status, "Dokumentstatus", 2, 20).toLowerCase();
  if (status && !new Set(["active", "archived"]).has(status)) {
    throw new InputError("Der Dokumentstatus ist ungültig.");
  }
  const mobileVisible = body.mobileVisible === undefined
    ? null
    : boolean(body.mobileVisible, "Mobile Dokumentfreigabe");
  const offlinePriority = body.offlinePriority === undefined
    ? null
    : boolean(body.offlinePriority, "Offline-Markierung");
  if (status === null && mobileVisible === null && offlinePriority === null) {
    throw new InputError("Es wurde keine Dokumentänderung angegeben.");
  }
  const rowVersion = Number(body.rowVersion);
  if (!Number.isSafeInteger(rowVersion) || rowVersion < 1) {
    throw new InputError("Die Dokumentversion ist ungültig.");
  }
  return { status, mobileVisible, offlinePriority, rowVersion };
}

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InputError(`${label} ist ungültig.`);
  }
  return value;
}

function allowedObjectKeys(value, allowedKeys, label) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new InputError(`${label} enthält das unbekannte Feld ${key}.`);
    }
  }
}

function optionalVdeText(value, label, maximum) {
  if (value === undefined || value === null || value === "") return null;
  if (!["string", "number"].includes(typeof value)) {
    throw new InputError(`${label} ist ungültig.`);
  }
  return text(String(value), label, 1, maximum);
}

function vdeDecimal(value, label, maximum = 1_000_000) {
  if (value === undefined || value === null || value === "") return null;
  const normalized = String(value).trim().replace(",", ".");
  if (!/^\d{1,7}(?:\.\d{1,6})?$/.test(normalized)) {
    throw new InputError(`${label} ist keine gültige positive Messzahl.`);
  }
  const numberValue = Number(normalized);
  if (!Number.isFinite(numberValue) || numberValue > maximum) {
    throw new InputError(`${label} ist außerhalb des zulässigen Bereichs.`);
  }
  return normalized;
}

function vdePositiveDecimal(value, label, maximum = 1_000_000) {
  const normalized = vdeDecimal(value, label, maximum);
  if (normalized !== null && Number(normalized) <= 0) {
    throw new InputError(`${label} muss größer als null sein.`);
  }
  return normalized;
}

function vdeClientId(value, label) {
  if (value === undefined || value === null || value === "") {
    throw new InputError(`${label} fehlt.`);
  }
  if (typeof value !== "string") {
    throw new InputError(`${label} ist ungültig.`);
  }
  return text(value, label, 1, 100);
}

function vdeProtectionDevice(value, label) {
  const device = object(value || {}, label);
  allowedObjectKeys(
    device,
    new Set([
      "type",
      "characteristic",
      "ratedCurrent",
      "designation",
      "rcdType",
      "rcdCharacteristic",
      "ratedResidualCurrent",
      "testButton"
    ]),
    label
  );
  const typeValue = optionalVdeText(device.type, `${label} Typ`, 30) || "mcb";
  if (!VDE_PROTECTION_TYPES.has(typeValue)) {
    throw new InputError(`${label} Typ ist ungültig.`);
  }
  const isBreaker = ["mcb", "rcbo"].includes(typeValue);
  const isRcbo = typeValue === "rcbo";
  return {
    type: typeValue,
    characteristic: isBreaker
      ? optionalVdeText(device.characteristic, `${label} Charakteristik`, 20)
      : null,
    ratedCurrent: vdePositiveDecimal(
      device.ratedCurrent,
      `${label} Nennstrom`,
      10_000
    ),
    designation: optionalVdeText(device.designation, `${label} Bezeichnung`, 120),
    rcdType: isRcbo
      ? optionalVdeText(device.rcdType, `${label} FI-Typ`, 20)
      : null,
    rcdCharacteristic: isRcbo
      ? optionalVdeText(
        device.rcdCharacteristic,
        `${label} FI-Charakteristik`,
        50
      )
      : null,
    ratedResidualCurrent: isRcbo
      ? vdePositiveDecimal(
        device.ratedResidualCurrent,
        `${label} Bemessungsdifferenzstrom`,
        10_000
      )
      : null,
    testButton: isRcbo
      ? boolean(device.testButton, `${label} Prüftaste`)
      : false
  };
}

function vdeMeasurements(value, label, detailedInsulationMeasurement) {
  const measurements = object(value || {}, label);
  allowedObjectKeys(
    measurements,
    new Set([
      "rpe",
      "riso",
      "zi",
      "zs",
      "ik",
      "rcdTripTime",
      "rcdTripCurrent",
      "risoL1Pe",
      "risoL2Pe",
      "risoL3Pe",
      "risoNPe"
    ]),
    label
  );
  return {
    rpe: vdeDecimal(measurements.rpe, `${label} RPE`),
    riso: vdeDecimal(measurements.riso, `${label} RISO`),
    zi: vdeDecimal(measurements.zi, `${label} Zi`),
    zs: vdeDecimal(measurements.zs, `${label} Zs`),
    ik: vdeDecimal(measurements.ik, `${label} Ik`),
    rcdTripTime: vdeDecimal(
      measurements.rcdTripTime,
      `${label} RCD-Auslösezeit`,
      100_000
    ),
    rcdTripCurrent: vdeDecimal(
      measurements.rcdTripCurrent,
      `${label} RCD-Auslösestrom`,
      100_000
    ),
    risoL1Pe: detailedInsulationMeasurement
      ? vdeDecimal(measurements.risoL1Pe, `${label} RISO L1-PE`)
      : null,
    risoL2Pe: detailedInsulationMeasurement
      ? vdeDecimal(measurements.risoL2Pe, `${label} RISO L2-PE`)
      : null,
    risoL3Pe: detailedInsulationMeasurement
      ? vdeDecimal(measurements.risoL3Pe, `${label} RISO L3-PE`)
      : null,
    risoNPe: detailedInsulationMeasurement
      ? vdeDecimal(measurements.risoNPe, `${label} RISO N-PE`)
      : null
  };
}

function vdeCircuit(value, label, detailedInsulationMeasurement) {
  const circuit = object(value, label);
  allowedObjectKeys(
    circuit,
    new Set([
      "clientId",
      "name",
      "cableType",
      "cores",
      "crossSection",
      "protectiveDevice",
      "measurements",
      "note"
    ]),
    label
  );
  return {
    clientId: vdeClientId(circuit.clientId, `${label} ID`),
    name: optionalVdeText(circuit.name, `${label} Name`, 200),
    cableType: optionalVdeText(circuit.cableType, `${label} Leitung`, 100),
    cores: optionalVdeText(circuit.cores, `${label} Adernzahl`, 20),
    crossSection: vdePositiveDecimal(
      circuit.crossSection,
      `${label} Querschnitt`,
      10_000
    ),
    protectiveDevice: vdeProtectionDevice(
      circuit.protectiveDevice,
      `${label} Schutzorgan`
    ),
    measurements: vdeMeasurements(
      circuit.measurements,
      `${label} Messwerte`,
      detailedInsulationMeasurement
    ),
    note: optionalVdeText(circuit.note, `${label} Bemerkung`, 500)
  };
}

function vdeCircuitList(value, label, detailedInsulationMeasurement) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 300) {
    throw new InputError(`${label} ist ungültig oder enthält zu viele Stromkreise.`);
  }
  return value.map((circuit, index) => (
    vdeCircuit(
      circuit,
      `${label} ${index + 1}`,
      detailedInsulationMeasurement
    )
  ));
}

function vdeRcd(value, label, detailedInsulationMeasurement) {
  const rcd = object(value, label);
  allowedObjectKeys(
    rcd,
    new Set([
      "clientId",
      "name",
      "type",
      "characteristic",
      "ratedCurrent",
      "ratedResidualCurrent",
      "testButton",
      "circuits"
    ]),
    label
  );
  return {
    clientId: vdeClientId(rcd.clientId, `${label} ID`),
    name: optionalVdeText(rcd.name, `${label} Name`, 120),
    type: optionalVdeText(rcd.type, `${label} Typ`, 20),
    characteristic: optionalVdeText(
      rcd.characteristic,
      `${label} Charakteristik`,
      50
    ),
    ratedCurrent: vdePositiveDecimal(
      rcd.ratedCurrent,
      `${label} Nennstrom`,
      10_000
    ),
    ratedResidualCurrent: vdePositiveDecimal(
      rcd.ratedResidualCurrent,
      `${label} Bemessungsdifferenzstrom`,
      10_000
    ),
    testButton: boolean(rcd.testButton, `${label} Prüftaste`),
    circuits: vdeCircuitList(
      rcd.circuits,
      `${label} Stromkreis`,
      detailedInsulationMeasurement
    )
  };
}

function vdeDistribution(value, label, detailedInsulationMeasurement) {
  const distribution = object(value, label);
  allowedObjectKeys(
    distribution,
    new Set([
      "clientId",
      "name",
      "source",
      "feedCableType",
      "feedCores",
      "feedCrossSection",
      "feedProtection",
      "location",
      "rcds",
      "directCircuits"
    ]),
    label
  );
  const rcds = distribution.rcds === undefined ? [] : distribution.rcds;
  if (!Array.isArray(rcds) || rcds.length > 50) {
    throw new InputError(`${label} enthält zu viele FI/RCD-Gruppen.`);
  }
  return {
    clientId: vdeClientId(distribution.clientId, `${label} ID`),
    name: optionalVdeText(distribution.name, `${label} Name`, 120),
    source: optionalVdeText(distribution.source, `${label} Quelle`, 120),
    feedCableType: optionalVdeText(
      distribution.feedCableType,
      `${label} Zuleitung`,
      100
    ),
    feedCores: optionalVdeText(
      distribution.feedCores,
      `${label} Adernzahl`,
      20
    ),
    feedCrossSection: vdePositiveDecimal(
      distribution.feedCrossSection,
      `${label} Zuleitungsquerschnitt`,
      10_000
    ),
    feedProtection: optionalVdeText(
      distribution.feedProtection,
      `${label} Vorsicherung`,
      120
    ),
    location: optionalVdeText(distribution.location, `${label} Ort`, 120),
    rcds: rcds.map((rcd, index) => (
      vdeRcd(
        rcd,
        `${label} FI/RCD ${index + 1}`,
        detailedInsulationMeasurement
      )
    )),
    directCircuits: vdeCircuitList(
      distribution.directCircuits,
      `${label} direkter Stromkreis`,
      detailedInsulationMeasurement
    )
  };
}

function vdeSmallObject(value, allowedKeys, label) {
  const normalized = object(value || {}, label);
  allowedObjectKeys(normalized, new Set(allowedKeys), label);
  return normalized;
}

export function validateVdeProtocolData(value) {
  const protocol = object(value, "VDE-Prüfdaten");
  allowedObjectKeys(
    protocol,
    new Set([
      "schemaVersion",
      "networkType",
      "nominalVoltage",
      "inspectionKinds",
      "visualChecks",
      "incomingSupply",
      "circuitDirectoryIncluded",
      "detailedInsulationMeasurement",
      "distributions",
      "testEquipment",
      "defects",
      "result",
      "nextInspectionDate"
    ]),
    "VDE-Prüfdaten"
  );
  if (Number(protocol.schemaVersion) !== 1) {
    throw new InputError("Die VDE-Prüfdatenversion wird nicht unterstützt.");
  }
  const networkType = optionalVdeText(
    protocol.networkType,
    "Netzform",
    20
  ) || "TN-S";
  if (!VDE_NETWORK_TYPES.has(networkType)) {
    throw new InputError("Die Netzform ist ungültig.");
  }
  const inspectionKinds = vdeSmallObject(
    protocol.inspectionKinds,
    ["initial", "recurring", "alteration"],
    "Prüfarten"
  );
  const visualChecks = vdeSmallObject(
    protocol.visualChecks,
    VDE_VISUAL_CHECK_KEYS,
    "Besichtigen und Erproben"
  );
  const incomingSupply = vdeSmallObject(
    protocol.incomingSupply,
    [
      "designation",
      "location",
      "upstreamProtection",
      "source",
      "cableType",
      "cores",
      "crossSection"
    ],
    "Hausanschluss und Einspeisung"
  );
  const testEquipment = vdeSmallObject(
    protocol.testEquipment,
    ["manufacturer", "type", "serialNumber", "calibrationValidUntil"],
    "Prüfgerät"
  );
  const detailedInsulationMeasurement = boolean(
    protocol.detailedInsulationMeasurement,
    "Detaillierte Isolationsmessung"
  );
  const distributions = protocol.distributions === undefined
    ? []
    : protocol.distributions;
  if (!Array.isArray(distributions) || distributions.length > 50) {
    throw new InputError("Die Verteilungsliste ist ungültig oder zu groß.");
  }

  const normalized = {
    schemaVersion: 1,
    networkType,
    nominalVoltage: optionalVdeText(
      protocol.nominalVoltage,
      "Nennspannung",
      50
    ) || "230/400 V",
    inspectionKinds: {
      initial: boolean(inspectionKinds.initial, "Erstprüfung"),
      recurring: boolean(inspectionKinds.recurring, "Wiederholungsprüfung"),
      alteration: boolean(inspectionKinds.alteration, "Änderung oder Erweiterung")
    },
    visualChecks: Object.fromEntries(VDE_VISUAL_CHECK_KEYS.map((key) => {
      const checkResult = visualChecks[key] || "not_checked";
      if (!VDE_CHECK_RESULTS.has(checkResult)) {
        throw new InputError(`Der Prüfstatus ${key} ist ungültig.`);
      }
      return [key, checkResult];
    })),
    incomingSupply: {
      designation: optionalVdeText(
        incomingSupply.designation,
        "Einspeisungsbezeichnung",
        120
      ),
      location: optionalVdeText(
        incomingSupply.location,
        "Einspeisungsort",
        120
      ),
      upstreamProtection: optionalVdeText(
        incomingSupply.upstreamProtection,
        "Vorsicherung",
        120
      ),
      source: optionalVdeText(
        incomingSupply.source,
        "Einspeisungsquelle",
        120
      ),
      cableType: optionalVdeText(
        incomingSupply.cableType,
        "Einspeisungsleitung",
        100
      ),
      cores: optionalVdeText(incomingSupply.cores, "Einspeisungsadern", 20),
      crossSection: vdePositiveDecimal(
        incomingSupply.crossSection,
        "Einspeisungsquerschnitt",
        10_000
      )
    },
    circuitDirectoryIncluded: boolean(
      protocol.circuitDirectoryIncluded,
      "Stromkreisverzeichnis"
    ),
    detailedInsulationMeasurement,
    distributions: distributions.map((distribution, index) => (
      vdeDistribution(
        distribution,
        `Verteilung ${index + 1}`,
        detailedInsulationMeasurement
      )
    )),
    testEquipment: {
      manufacturer: optionalVdeText(
        testEquipment.manufacturer,
        "Prüfgerätehersteller",
        120
      ),
      type: optionalVdeText(testEquipment.type, "Prüfgerätetyp", 120),
      serialNumber: optionalVdeText(
        testEquipment.serialNumber,
        "Prüfgeräteseriennummer",
        120
      ),
      calibrationValidUntil: testEquipment.calibrationValidUntil
        ? validateWorkDate(testEquipment.calibrationValidUntil)
        : null
    },
    defects: optionalVdeText(protocol.defects, "Mängel und Hinweise", 10_000),
    result: protocol.result || "ok",
    nextInspectionDate: protocol.nextInspectionDate
      ? validateWorkDate(protocol.nextInspectionDate)
      : null
  };
  if (!VDE_RESULTS.has(normalized.result)) {
    throw new InputError("Das VDE-Prüfergebnis ist ungültig.");
  }
  const clientIds = new Set();
  const registerClientId = (clientId) => {
    if (clientIds.has(clientId)) {
      throw new InputError(
        "Verteilungen, FI/RCD-Gruppen und Stromkreise benötigen eindeutige IDs."
      );
    }
    clientIds.add(clientId);
  };
  normalized.distributions.forEach((distribution) => {
    registerClientId(distribution.clientId);
    distribution.rcds.forEach((rcd) => {
      registerClientId(rcd.clientId);
      rcd.circuits.forEach((circuit) => registerClientId(circuit.clientId));
    });
    distribution.directCircuits.forEach((circuit) => (
      registerClientId(circuit.clientId)
    ));
  });
  const totalCircuits = normalized.distributions.reduce(
    (sum, distribution) => (
      sum
      + distribution.directCircuits.length
      + distribution.rcds.reduce(
        (rcdSum, rcd) => rcdSum + rcd.circuits.length,
        0
      )
    ),
    0
  );
  if (totalCircuits > 1_000) {
    throw new InputError("Eine VDE-Prüfung darf höchstens 1.000 Stromkreise enthalten.");
  }
  if (Buffer.byteLength(JSON.stringify(normalized), "utf8") > 500_000) {
    throw new InputError(
      "Die VDE-Prüfdaten sind zu groß.",
      413,
      "vde_protocol_too_large"
    );
  }
  return normalized;
}

function vdeInspectionCommon(body) {
  rejectTenantFields(body);
  return {
    inspectionName: text(body.inspectionName, "Prüfungsname", 2, 200),
    inspectionDate: validateWorkDate(body.inspectionDate),
    protocolData: validateVdeProtocolData(body.protocolData)
  };
}

export function validateVdeInspectionCreate(body) {
  const common = vdeInspectionCommon(body);
  const sourceMode = body.sourceMode
    ? text(body.sourceMode, "VDE-Quelle", 3, 20).toLowerCase()
    : "integrated";
  if (!VDE_SOURCE_MODES.has(sourceMode)) {
    throw new InputError("Die VDE-Quelle ist ungültig.");
  }
  const sourceName = sourceMode === "legacy_v15"
    ? text(body.sourceName, "Name der V15-Quelldatei", 1, 255)
    : null;
  return {
    ...common,
    constructionSiteId: uuid(body.constructionSiteId, "Baustelle"),
    clientInspectionId: uuid(body.clientInspectionId, "Offline-Prüfungs-ID"),
    inspectorUserId: optionalUuid(body.inspectorUserId, "Prüfer"),
    sourceMode,
    sourceName
  };
}

export function validateVdeInspectionUpdate(body) {
  const common = vdeInspectionCommon(body);
  const rowVersion = Number(body.rowVersion);
  if (!Number.isSafeInteger(rowVersion) || rowVersion < 1) {
    throw new InputError("Die VDE-Prüfungsversion ist ungültig.");
  }
  return { ...common, rowVersion };
}

function assertVdeProtocolCanComplete(protocol) {
  if (!Object.values(protocol.inspectionKinds).some(Boolean)) {
    throw new InputError(
      "Vor dem Abschluss muss mindestens eine Prüfungsart gewählt werden."
    );
  }
  if (protocol.distributions.length === 0) {
    throw new InputError(
      "Vor dem Abschluss muss mindestens eine Verteilung erfasst werden."
    );
  }
  let circuitCount = 0;
  for (const distribution of protocol.distributions) {
    if (!distribution.name) {
      throw new InputError(
        "Vor dem Abschluss benötigt jede Verteilung eine Bezeichnung."
      );
    }
    const circuits = [
      ...distribution.directCircuits,
      ...distribution.rcds.flatMap((rcd) => rcd.circuits)
    ];
    circuitCount += circuits.length;
    if (circuits.some((circuit) => !circuit.name)) {
      throw new InputError(
        "Vor dem Abschluss benötigt jeder Stromkreis eine Bezeichnung."
      );
    }
  }
  if (circuitCount === 0) {
    throw new InputError(
      "Vor dem Abschluss muss mindestens ein Stromkreis erfasst werden."
    );
  }
}

export function validateVdeInspectionCompletion(body) {
  const update = validateVdeInspectionUpdate(body);
  assertVdeProtocolCanComplete(update.protocolData);
  return {
    ...update,
    inspectorSignatureData: signaturePng(
      body.inspectorSignatureData,
      "Prüferunterschrift"
    )
  };
}

function legacyOriginalPdf(value) {
  if (value === undefined || value === null) return null;
  const original = object(value, "VDE-Original-PDF");
  allowedObjectKeys(
    original,
    new Set(["fileName", "contentBase64"]),
    "VDE-Original-PDF"
  );
  const fileName = text(original.fileName, "Name der Original-PDF", 1, 255);
  if (!/\.pdf$/i.test(fileName) || /[\\/\u0000-\u001f\u007f]/.test(fileName)) {
    throw new InputError("Der Name der VDE-Original-PDF ist ungültig.");
  }
  if (typeof original.contentBase64 !== "string") {
    throw new InputError("Der Inhalt der VDE-Original-PDF fehlt.");
  }
  const contentBase64 = original.contentBase64.trim();
  if (
    contentBase64.length === 0
    || contentBase64.length % 4 !== 0
    || !/^[A-Za-z0-9+/]+={0,2}$/.test(contentBase64)
  ) {
    throw new InputError("Der Inhalt der VDE-Original-PDF ist ungültig.");
  }
  const content = Buffer.from(contentBase64, "base64");
  if (
    content.toString("base64") !== contentBase64
    || content.length < 5
    || content.length > MAXIMUM_DOCUMENT_BYTES
    || content.subarray(0, 5).toString("ascii") !== "%PDF-"
  ) {
    throw new InputError(
      "Die VDE-Original-PDF ist ungültig oder größer als 5 MB.",
      413,
      "vde_original_pdf_invalid"
    );
  }
  return { fileName, content };
}

export function validateVdeInspectionImport(body) {
  const input = validateVdeInspectionCreate({
    ...body,
    sourceMode: "legacy_v15"
  });
  return {
    ...input,
    originalPdf: legacyOriginalPdf(body.originalPdf)
  };
}

export function validateSiteTask(body) {
  rejectTenantFields(body);
  const priority = text(body.priority, "Priorität", 3, 20).toLowerCase();
  if (!SITE_TASK_PRIORITIES.has(priority)) throw new InputError("Die Aufgabenpriorität ist ungültig.");
  return {
    constructionSiteId: uuid(body.constructionSiteId, "Baustelle"),
    title: text(body.title, "Aufgabentitel", 2, 180),
    details: optionalText(body.details, "Aufgabenbeschreibung", 2000),
    priority,
    assignedUserId: optionalUuid(body.assignedUserId, "Mitarbeiter"),
    dueDate: body.dueDate ? validateWorkDate(body.dueDate) : null
  };
}

export function validateSiteTaskUpdate(body) {
  rejectTenantFields(body);
  const status = text(body.status, "Aufgabenstatus", 2, 20).toLowerCase();
  if (!SITE_TASK_STATUSES.has(status)) throw new InputError("Der Aufgabenstatus ist ungültig.");
  const rowVersion = Number(body.rowVersion);
  if (!Number.isSafeInteger(rowVersion) || rowVersion < 1) throw new InputError("Die Aufgabenversion ist ungültig.");
  return { status, rowVersion };
}

export function validateSiteMaterial(body) {
  rejectTenantFields(body);
  const quantity = Number(body.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 999999999) {
    throw new InputError("Die Materialmenge ist ungültig.");
  }
  const status = text(body.status || "planned", "Materialstatus", 2, 20).toLowerCase();
  if (!SITE_MATERIAL_STATUSES.has(status)) throw new InputError("Der Materialstatus ist ungültig.");
  return {
    constructionSiteId: uuid(body.constructionSiteId, "Baustelle"),
    itemName: text(body.itemName, "Materialbezeichnung", 2, 180),
    quantity,
    unit: text(body.unit, "Einheit", 1, 20),
    status,
    note: optionalText(body.note, "Materialhinweis", 1000)
  };
}

export function validateSiteMaterialUpdate(body) {
  rejectTenantFields(body);
  const status = text(body.status, "Materialstatus", 2, 20).toLowerCase();
  if (!SITE_MATERIAL_STATUSES.has(status)) throw new InputError("Der Materialstatus ist ungültig.");
  const rowVersion = Number(body.rowVersion);
  if (!Number.isSafeInteger(rowVersion) || rowVersion < 1) throw new InputError("Die Materialversion ist ungültig.");
  return { status, rowVersion };
}

export function validateSiteNote(body) {
  rejectTenantFields(body);
  return {
    constructionSiteId: uuid(body.constructionSiteId, "Baustelle"),
    clientNoteId: uuid(body.clientNoteId, "Notiz-ID"),
    content: text(body.content, "Notiz", 2, 2000),
    isImportant: boolean(body.isImportant, "Wichtige Notiz")
  };
}

function validateReportPersonnel(value) {
  if (value === undefined) return { provided: false, entries: [] };
  if (!Array.isArray(value) || value.length > 100) {
    throw new InputError("Die Mitarbeiterstunden sind ungültig.");
  }
  const seen = new Set();
  const entries = value.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new InputError("Ein Mitarbeiterstundeneintrag ist ungültig.");
    }
    const userId = uuid(entry.userId, "Mitarbeiter");
    if (seen.has(userId)) {
      throw new InputError("Ein Mitarbeiter darf im Bericht nur einmal vorkommen.");
    }
    seen.add(userId);
    const minutes = Number(entry.minutes);
    if (!Number.isSafeInteger(minutes) || minutes < 1 || minutes > 1440) {
      throw new InputError("Die Mitarbeiterstunden müssen zwischen einer Minute und 24 Stunden liegen.");
    }
    return { userId, minutes };
  });
  return { provided: true, entries };
}

function validateReportPhotos(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 20) {
    throw new InputError("Die Berichtsfotos sind ungültig.");
  }
  const seen = new Set();
  return value.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new InputError("Ein Berichtsfoto ist ungültig.");
    }
    const documentId = uuid(entry.documentId, "Berichtsfoto");
    if (seen.has(documentId)) {
      throw new InputError("Ein Foto darf im Bericht nur einmal vorkommen.");
    }
    seen.add(documentId);
    return {
      documentId,
      caption: optionalText(entry.caption, "Bildunterschrift", 300)
    };
  });
}

export function validateSiteReport(body) {
  rejectTenantFields(body);
  const reportType = text(body.reportType, "Berichtsart", 2, 20).toLowerCase();
  const sourceMode = text(body.sourceMode, "Erfassungsart", 2, 20).toLowerCase();
  if (!SITE_REPORT_TYPES.has(reportType)) throw new InputError("Die Berichtsart ist ungültig.");
  if (!SITE_REPORT_SOURCES.has(sourceMode)) throw new InputError("Die Erfassungsart ist ungültig.");
  const sourceDocumentId = optionalUuid(body.sourceDocumentId, "Originaldokument");
  if (sourceMode === "photo" && !sourceDocumentId) {
    throw new InputError("Ein fotografierter Papierbericht benötigt das Originalfoto.");
  }
  if (sourceMode !== "photo" && sourceDocumentId) {
    throw new InputError("Ein Originalfoto darf nur einem fotografierten Papierbericht zugeordnet werden.");
  }
  const summary = text(body.summary, "Berichtstitel", 2, 200);
  const details = optionalText(body.details, "Berichtsinhalt", 5000);
  const personnel = validateReportPersonnel(body.personnel);
  return {
    constructionSiteId: uuid(body.constructionSiteId, "Baustelle"),
    reportType,
    workDate: validateWorkDate(body.workDate),
    sourceMode,
    summary,
    details,
    sourceDocumentId,
    workPerformed: optionalText(body.workPerformed, "Ausgeführte Leistungen", 5000) || details || summary,
    obstructions: optionalText(body.obstructions, "Behinderungen", 3000),
    openItems: optionalText(body.openItems, "Offene Punkte", 3000),
    weather: optionalText(body.weather, "Witterung", 200),
    materialsAndEquipment: optionalText(body.materialsAndEquipment, "Material und Geräte", 3000),
    agreements: optionalText(body.agreements, "Absprachen und Anweisungen", 3000),
    incidents: optionalText(body.incidents, "Mängel, Schäden oder Sicherheit", 3000),
    personnel: personnel.entries,
    personnelProvided: personnel.provided,
    photos: validateReportPhotos(body.photos)
  };
}

export function validateMobileSiteReport(body) {
  const report = validateSiteReport(body);
  if (report.sourceMode !== "digital" || report.sourceDocumentId) {
    throw new InputError("Mobile Berichte werden direkt digital erfasst.");
  }
  return {
    ...report,
    clientReportId: uuid(body.clientReportId, "Offline-Berichts-ID")
  };
}

function signaturePng(value, label) {
  if (typeof value !== "string" || !value.startsWith(PNG_DATA_URL_PREFIX)) {
    throw new InputError(`${label} fehlt oder ist ungültig.`);
  }
  const contentBase64 = value.slice(PNG_DATA_URL_PREFIX.length);
  if (
    contentBase64.length === 0
    || contentBase64.length % 4 !== 0
    || !/^[A-Za-z0-9+/]+={0,2}$/.test(contentBase64)
  ) {
    throw new InputError(`${label} ist ungültig.`);
  }
  const content = Buffer.from(contentBase64, "base64");
  if (
    content.toString("base64") !== contentBase64
    || content.length < 50
    || content.length > 500000
    || !content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    throw new InputError(`${label} ist ungültig oder zu groß.`);
  }
  return content;
}

export function validateSiteReportFinalization(body) {
  rejectTenantFields(body);
  const rowVersion = Number(body.rowVersion);
  if (!Number.isSafeInteger(rowVersion) || rowVersion < 1) {
    throw new InputError("Die Berichtsversion ist ungültig.");
  }
  return {
    rowVersion,
    employeeSignatureName: text(body.employeeSignatureName, "Name des Mitarbeiters", 2, 200),
    employeeSignatureData: signaturePng(body.employeeSignatureData, "Mitarbeiterunterschrift"),
    customerSignatureName: text(body.customerSignatureName, "Name des Auftraggebers", 2, 200),
    customerSignatureData: signaturePng(body.customerSignatureData, "Auftraggeberunterschrift")
  };
}

export function validateSiteReportReturn(body) {
  rejectTenantFields(body);
  const rowVersion = Number(body.rowVersion);
  if (!Number.isSafeInteger(rowVersion) || rowVersion < 1) {
    throw new InputError("Die Berichtsversion ist ungültig.");
  }
  return {
    rowVersion,
    comment: text(body.comment, "Rückgabegrund", 2, 1000)
  };
}

export function validateMobileSiteReportRevision(body) {
  const report = validateSiteReport(body);
  if (report.sourceMode !== "digital" || report.sourceDocumentId) {
    throw new InputError("Mobile Berichte werden direkt digital überarbeitet.");
  }
  const rowVersion = Number(body.rowVersion);
  if (!Number.isSafeInteger(rowVersion) || rowVersion < 1) {
    throw new InputError("Die Berichtsversion ist ungültig.");
  }
  return { ...report, rowVersion };
}

export function validateWorkDate(value) {
  if (typeof value !== "string" || !DATE.test(value)) {
    throw new InputError("Das Datum muss dem Format JJJJ-MM-TT entsprechen.");
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new InputError("Das Datum ist ungültig.");
  }
  return value;
}

export function validateTimeEntry(body) {
  rejectTenantFields(body);
  const clientEntryId = text(body.clientEntryId, "clientEntryId", 36, 36);
  if (!UUID.test(clientEntryId)) throw new InputError("clientEntryId ist keine gültige UUID.");

  const entryType = text(body.entryType, "entryType", 1, 30);
  if (!ENTRY_TYPES.has(entryType)) throw new InputError("entryType ist ungültig.");

  const recordedAt = text(body.recordedAt, "recordedAt", 20, 35);
  const recordedDate = new Date(recordedAt);
  if (Number.isNaN(recordedDate.valueOf()) || !/[zZ]|[+-]\d{2}:\d{2}$/.test(recordedAt)) {
    throw new InputError("recordedAt benötigt einen ISO-Zeitpunkt mit Zeitzone.");
  }

  const clientCreatedAt = body.clientCreatedAt === undefined
    ? recordedAt
    : text(body.clientCreatedAt, "clientCreatedAt", 20, 35);
  const clientCreatedDate = new Date(clientCreatedAt);
  if (Number.isNaN(clientCreatedDate.valueOf()) || !/[zZ]|[+-]\d{2}:\d{2}$/.test(clientCreatedAt)) {
    throw new InputError("clientCreatedAt benötigt einen ISO-Zeitpunkt mit Zeitzone.");
  }

  let constructionSiteId = null;
  if (SITE_TYPES.has(entryType)) {
    constructionSiteId = text(body.constructionSiteId, "constructionSiteId", 36, 36);
    if (!UUID.test(constructionSiteId)) {
      throw new InputError("constructionSiteId ist keine gültige UUID.");
    }
  } else if (body.constructionSiteId !== undefined && body.constructionSiteId !== null) {
    throw new InputError("Diese Buchungsart darf keine Baustelle enthalten.");
  }

  return { clientEntryId, entryType, recordedAt, clientCreatedAt, constructionSiteId };
}

export function validateTimeEntryCorrection(body) {
  rejectTenantFields(body);
  const originalEntryId = uuid(body.originalEntryId, "Zeitbuchungs-ID");
  const requestedRecordedAt = text(body.requestedRecordedAt, "Gewünschter Zeitpunkt", 20, 35);
  const requestedDate = new Date(requestedRecordedAt);
  if (Number.isNaN(requestedDate.valueOf()) || !/[zZ]|[+-]\d{2}:\d{2}$/.test(requestedRecordedAt)) {
    throw new InputError("Der gewünschte Zeitpunkt benötigt Datum, Uhrzeit und Zeitzone.");
  }
  return {
    originalEntryId,
    requestedRecordedAt,
    reason: text(body.reason, "Korrekturgrund", 5, 500)
  };
}

export function validateTimeEntryAddition(body) {
  rejectTenantFields(body);
  const workDate = validateWorkDate(body.workDate);
  const entryType = text(body.entryType, "Buchungsart", 1, 30);
  if (!ENTRY_TYPES.has(entryType)) throw new InputError("Die Buchungsart ist ungültig.");
  const recordedAt = text(body.recordedAt, "Zeitpunkt", 20, 35);
  const recordedDate = new Date(recordedAt);
  if (Number.isNaN(recordedDate.valueOf()) || !/[zZ]|[+-]\d{2}:\d{2}$/.test(recordedAt)) {
    throw new InputError("Der Zeitpunkt benötigt Datum, Uhrzeit und Zeitzone.");
  }
  const constructionSiteId = SITE_TYPES.has(entryType)
    ? uuid(body.constructionSiteId, "Baustelle")
    : null;
  if (
    !SITE_TYPES.has(entryType)
    && body.constructionSiteId !== undefined
    && body.constructionSiteId !== null
    && body.constructionSiteId !== ""
  ) {
    throw new InputError("Diese Buchungsart darf keine Baustelle enthalten.");
  }
  return {
    workDate,
    entryType,
    recordedAt,
    constructionSiteId,
    reason: text(body.reason, "Ergänzungsgrund", 5, 500)
  };
}

export function validateTimeEntryInvalidation(body) {
  rejectTenantFields(body);
  return {
    originalEntryId: uuid(body.originalEntryId, "Zeitbuchungs-ID"),
    reason: text(body.reason, "Ungültigkeitsgrund", 5, 500)
  };
}

function timeChangeMinutes(value, label) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const minutes = Number(value);
  if (!Number.isSafeInteger(minutes) || minutes < 0 || minutes > 1440) {
    throw new InputError(`${label} muss zwischen 0 und 1440 Minuten liegen.`);
  }
  return minutes;
}

function zonedInstant(value, label) {
  const instant = text(value, label, 20, 35);
  if (Number.isNaN(new Date(instant).valueOf()) || !/[zZ]|[+-]\d{2}:\d{2}$/.test(instant)) {
    throw new InputError(`${label} benötigt Datum, Uhrzeit und Zeitzone.`);
  }
  return instant;
}

export function validateTimeEntryEdit(body) {
  rejectTenantFields(body);
  return {
    clientChangeId: uuid(body.clientChangeId, "Änderungs-ID"),
    expectedRecordedAt: zonedInstant(body.expectedRecordedAt, "Bisheriger Zeitpunkt"),
    recordedAt: zonedInstant(body.recordedAt, "Neuer Zeitpunkt"),
    workDate: validateWorkDate(body.workDate),
    constructionSiteId: optionalUuid(body.constructionSiteId, "Baustelle"),
    activityNote: optionalText(body.activityNote, "Tätigkeit", 500),
    travelMinutes: timeChangeMinutes(body.travelMinutes, "Fahrzeit"),
    breakMinutes: timeChangeMinutes(body.breakMinutes, "Pausenzeit"),
    reason: text(body.reason, "Änderungsgrund", 3, 500)
  };
}

export function validateTimeEntryDelete(body) {
  rejectTenantFields(body);
  return {
    clientChangeId: uuid(body.clientChangeId, "Änderungs-ID"),
    expectedRecordedAt: zonedInstant(body.expectedRecordedAt, "Bisheriger Zeitpunkt"),
    reason: text(body.reason, "Löschgrund", 3, 500)
  };
}

export function validateSpontaneousSiteSelection(body) {
  rejectTenantFields(body);
  if (body.newOccurrence !== undefined && typeof body.newOccurrence !== "boolean") {
    throw new InputError("Die Angabe zur erneuten Baustellenfahrt ist ungültig.");
  }
  return {
    workDate: validateWorkDate(body.workDate),
    constructionSiteId: uuid(body.constructionSiteId, "Baustelle"),
    newOccurrence: body.newOccurrence === true
  };
}

export function validateFieldConstructionSite(body) {
  rejectTenantFields(body);
  const projectId = optionalUuid(body.projectId, "Projekt");
  const customerId = optionalUuid(body.customerId, "Kunde");
  const customerName = optionalText(body.customerName, "Neuer Kunde", 200);
  const projectName = optionalText(body.projectName, "Neues Projekt", 200);
  if (projectId && (customerId || customerName || projectName)) {
    throw new InputError("Ein vorhandenes Projekt darf nicht mit neuen Stammdaten kombiniert werden.");
  }
  if (!projectId && !customerId && !customerName) {
    throw new InputError("Bitte einen vorhandenen oder neuen Kunden auswählen.");
  }
  if (customerId && customerName) {
    throw new InputError("Bitte entweder einen vorhandenen oder einen neuen Kunden verwenden.");
  }
  return {
    workDate: validateWorkDate(body.workDate),
    projectId,
    customerId,
    customerName,
    projectName,
    name: text(body.name, "Baustellenname", 2, 200),
    installerShortText: optionalText(body.installerShortText, "Aufgabe für den Monteur", 300),
    street: text(body.street, "Straße", 2, 150),
    houseNumber: text(body.houseNumber, "Hausnummer", 1, 20),
    postalCode: text(body.postalCode, "Postleitzahl", 3, 12),
    city: text(body.city, "Ort", 2, 100)
  };
}

export function validateTimeEntryCorrectionDecision(body) {
  rejectTenantFields(body);
  const decision = text(body.decision, "Entscheidung", 7, 8).toLowerCase();
  if (!TIME_CORRECTION_DECISIONS.has(decision)) {
    throw new InputError("Die Korrekturentscheidung ist ungültig.");
  }
  return { decision };
}

export function validateWorkDayDecision(body) {
  rejectTenantFields(body);
  const decision = text(body.decision, "Entscheidung", 6, 8).toLowerCase();
  if (!WORK_DAY_DECISIONS.has(decision)) {
    throw new InputError("Die Stundenzettelentscheidung ist ungültig.");
  }
  return { decision };
}

export function localDate(instant, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(instant));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function expectedNextTypes(previousType) {
  return {
    empty: ["clock_in"],
    clock_in: ["site_arrival", "clock_out"],
    site_arrival: ["site_departure"],
    site_departure: ["next_site", "clock_out"],
    next_site: ["site_arrival"],
    clock_out: ["clock_in"]
  }[previousType ?? "empty"] ?? [];
}

const TIME_CORRECTION_POLICIES = new Set(["review_required", "same_day", "immediate"]);

export function validateTimeCorrectionPolicy(body) {
  rejectTenantFields(body);
  const policy = text(body.policy, "Korrekturregel", 8, 20).toLowerCase();
  if (!TIME_CORRECTION_POLICIES.has(policy)) {
    throw new InputError("Die Korrekturregel ist ungültig.");
  }
  return { policy, reason: text(body.reason, "Begründung", 3, 500) };
}

// Ein Wochenbericht des Berichtshefts. Die Woche beginnt am Montag: die
// Zeiterfassung rechnet ebenso, und zwei verschiedene Wochenschnitte in einer
// App waeren fuer niemanden nachvollziehbar.
export function validateApprenticeWeek(value) {
  const weekStart = validateWorkDate(value);
  const tag = new Date(`${weekStart}T12:00:00Z`).getUTCDay();
  if (tag !== 1) {
    throw new InputError("Ein Wochenbericht beginnt am Montag.");
  }
  return weekStart;
}

// Ein Wochenbericht besteht aus Tageszeilen: was an diesem Tag getan wurde.
// Die Arbeitszeit und die Abwesenheiten stehen nicht darin - sie kommen aus
// der Zeiterfassung und den genehmigten Abwesenheiten. Wer sie abschreiben
// muesste, schriebe sie irgendwann falsch ab.
export function validateApprenticeReport(body, weekStart) {
  rejectTenantFields(body);
  const entries = Array.isArray(body.dailyEntries) ? body.dailyEntries : [];
  if (entries.length > 7) {
    throw new InputError("Eine Woche hat höchstens sieben Tage.");
  }
  const wochenende = new Date(`${weekStart}T00:00:00Z`);
  wochenende.setUTCDate(wochenende.getUTCDate() + 6);
  const letzterTag = wochenende.toISOString().slice(0, 10);

  const gesehen = new Set();
  const dailyEntries = [];
  for (const eintrag of entries) {
    if (!eintrag || typeof eintrag !== "object") {
      throw new InputError("Eine Tageszeile ist ungültig.");
    }
    const workDate = validateWorkDate(eintrag.workDate);
    if (workDate < weekStart || workDate > letzterTag) {
      throw new InputError("Eine Tageszeile liegt außerhalb der Woche.");
    }
    if (gesehen.has(workDate)) {
      throw new InputError("Für einen Tag gibt es nur eine Zeile.");
    }
    gesehen.add(workDate);
    const roh = Array.isArray(eintrag.activities)
      ? eintrag.activities
      : String(eintrag.activities ?? "").split("\n");
    const activities = roh
      .map((zeile) => String(zeile ?? "").trim())
      .filter(Boolean)
      .slice(0, 12);
    for (const zeile of activities) {
      if (zeile.length > 300) {
        throw new InputError("Eine Tätigkeit ist zu lang.");
      }
    }
    if (activities.length === 0) continue;
    dailyEntries.push({ workDate, activities });
  }
  dailyEntries.sort((links, rechts) => links.workDate.localeCompare(rechts.workDate));
  return {
    dailyEntries,
    weekRemark: optionalText(body.weekRemark, "Bemerkungen zur Woche", 1000)
  };
}

// Freigabe oder Rueckgabe, einzeln oder als Sammelfreigabe. Eine Rueckgabe
// ohne Begruendung waere fuer den Auszubildenden wertlos: er wuesste nicht,
// was er nachbessern soll.
export function validateApprenticeReview(body) {
  rejectTenantFields(body);
  const decision = text(body.decision, "Entscheidung", 6, 10).toLowerCase();
  if (!["approved", "returned"].includes(decision)) {
    throw new InputError("Die Entscheidung ist ungültig.");
  }
  const reportIds = Array.isArray(body.reportIds) ? body.reportIds : [];
  if (reportIds.length < 1 || reportIds.length > 100) {
    throw new InputError("Es müssen zwischen einem und hundert Berichten entschieden werden.");
  }
  for (const id of reportIds) {
    if (typeof id !== "string" || !UUID.test(id)) {
      throw new InputError("Eine Berichtskennung ist ungültig.");
    }
  }
  const comment = optionalText(body.comment, "Bemerkung", 1000);
  if (decision === "returned" && !comment) {
    throw new InputError("Eine Rückgabe braucht eine Bemerkung.");
  }
  return { decision, reportIds: [...new Set(reportIds)], comment };
}
