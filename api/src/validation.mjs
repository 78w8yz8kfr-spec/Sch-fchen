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
const EMPLOYEE_ROLES = new Set(["installer", "foreman", "office"]);

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
    role,
    temporaryPassword: password(body.temporaryPassword)
  };
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

export function validateAssignment(body) {
  if (Object.hasOwn(body, "companyId") || Object.hasOwn(body, "company_id")) {
    throw new InputError("companyId wird ausschließlich vom Server bestimmt.");
  }
  const plannedStartTime = optionalText(body.plannedStartTime, "Startzeit", 5);
  if (plannedStartTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(plannedStartTime)) {
    throw new InputError("Die Startzeit muss dem Format HH:MM entsprechen.");
  }
  return {
    employeeId: uuid(body.employeeId, "Mitarbeiter"),
    constructionSiteId: uuid(body.constructionSiteId, "Baustelle"),
    workDate: validateWorkDate(body.workDate),
    plannedStartTime,
    comment: optionalText(body.comment, "Hinweis", 500)
  };
}

export function validateInitialPasswordChange(body) {
  rejectTenantFields(body);
  return { newPassword: password(body.newPassword) };
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
    clock_out: []
  }[previousType ?? "empty"] ?? [];
}
