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
const EMPLOYEE_ROLES = new Set([
  "installer",
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
  "photo"
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
    installerShortText: optionalText(body.installerShortText, "Kurztext", 300)
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
    status,
    rowVersion
  };
}

export function validateConstructionSite(body) {
  rejectTenantFields(body);
  return {
    projectId: uuid(body.projectId, "Projekt"),
    name: text(body.name, "Baustellenname", 2, 200),
    installerShortText: optionalText(body.installerShortText, "Kurztext", 300),
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
  return {
    employeeId: uuid(body.employeeId, "Mitarbeiter"),
    constructionSiteId: uuid(body.constructionSiteId, "Baustelle"),
    workDate: validateWorkDate(body.workDate),
    plannedStartTime,
    comment: optionalText(body.comment, "Hinweis", 500),
    reportResponsible: boolean(body.reportResponsible, "Vorarbeiterzuweisung")
  };
}

export function validateAssignmentUpdate(body) {
  if (Object.hasOwn(body, "companyId") || Object.hasOwn(body, "company_id")) {
    throw new InputError("companyId wird ausschließlich vom Server bestimmt.");
  }
  const plannedStartTime = optionalText(body.plannedStartTime, "Startzeit", 5);
  if (plannedStartTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(plannedStartTime)) {
    throw new InputError("Die Startzeit muss dem Format HH:MM entsprechen.");
  }
  return {
    workDate: validateWorkDate(body.workDate),
    plannedStartTime,
    changeReason: text(body.changeReason, "Änderungsgrund", 3, 500),
    reportResponsible: Object.hasOwn(body, "reportResponsible")
      ? boolean(body.reportResponsible, "Vorarbeiterzuweisung")
      : null
  };
}

export function validateAssignmentCancellation(body) {
  if (Object.hasOwn(body, "companyId") || Object.hasOwn(body, "company_id")) {
    throw new InputError("companyId wird ausschließlich vom Server bestimmt.");
  }
  return { changeReason: text(body.changeReason, "Stornogrund", 3, 500) };
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

  return {
    title: text(body.title, "Dokumenttitel", 2, 200),
    category,
    fileName,
    mimeType,
    content,
    customerId,
    projectId,
    constructionSiteId
  };
}

export function validateDocumentStatusUpdate(body) {
  rejectTenantFields(body);
  const status = text(body.status, "Dokumentstatus", 2, 20).toLowerCase();
  if (!new Set(["active", "archived"]).has(status)) {
    throw new InputError("Der Dokumentstatus ist ungültig.");
  }
  const rowVersion = Number(body.rowVersion);
  if (!Number.isSafeInteger(rowVersion) || rowVersion < 1) {
    throw new InputError("Die Dokumentversion ist ungültig.");
  }
  return { status, rowVersion };
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
  return {
    constructionSiteId: uuid(body.constructionSiteId, "Baustelle"),
    reportType,
    workDate: validateWorkDate(body.workDate),
    sourceMode,
    summary: text(body.summary, "Berichtstitel", 2, 200),
    details: optionalText(body.details, "Berichtsinhalt", 5000),
    sourceDocumentId
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
