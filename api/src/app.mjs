import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { toString as qrToString } from "qrcode";
import {
  companyLogoUrl,
  sessionView,
  withApiTransaction,
  withPlatformTransaction,
  withSessionTransaction,
  withTenantTransaction
} from "./database.mjs";
import { hashPassword, verifyPassword } from "./password.mjs";
import {
  createSessionToken,
  hashSessionToken,
  LoginRateLimiter,
  parseCookies,
  secretsEqual,
  SESSION_COOKIE,
  sessionCookie
} from "./security.mjs";
import { securityHeaders, serveStatic } from "./static.mjs";
import {
  buildAssignmentImportPreview,
  normalizeImportText,
  parseAssignmentWorkbook,
  validateAssignmentImportPayload
} from "./assignment-import.mjs";
import { buildSiteImportPreview, parseSiteWorkbook } from "./site-import.mjs";
import { buildFinalReportPdf } from "./report-pdf.mjs";
import { buildTimesheetWorkbook } from "./timesheet-export.mjs";
import { buildTimesheetPdf } from "./timesheet-pdf.mjs";
import { buildVdeInspectionPdf } from "./vde-pdf.mjs";
import { loadCompanyModules } from "./company-modules.mjs";
import {
  buildApprenticeReportBookPdf,
  buildApprenticeReportPdf,
  trainingYear
} from "./apprentice-pdf.mjs";
import {
  APPRENTICE_MODULE_KEY,
  apprenticeReportDto,
  listApprenticeGaps,
  listApprenticeReportsForPrint,
  PRINTABLE_STATUS,
  listApprenticeReviews,
  listMissingApprenticeWeeks,
  listOwnApprenticeReports,
  loadApprenticeProfile,
  reviewApprenticeReports,
  saveOwnApprenticeReport,
  submitOwnApprenticeReport,
  withdrawOwnApprenticeReport
} from "./apprentice-reports.mjs";
import { createPlatformHandler } from "./platform-admin.mjs";
import { handleDeviceRequest } from "./devices.mjs";
import { handlePowerRequest } from "./power.mjs";
import {
  expectedNextTypes,
  InputError,
  localDate,
  readJson,
  validateAbsenceDecision,
  validateAbsenceRequest,
  validateApprenticeReport,
  validateApprenticeReview,
  validateApprenticeWeek,
  validateAssignment,
  validateAssignmentBatch,
  validateAssignmentCancellation,
  validateAssignmentUpdate,
  validateConstructionSite,
  validateConstructionSiteUpdate,
  validateCustomer,
  validateCustomerUpdate,
  validateDocumentStatusUpdate,
  validateDocumentUpload,
  validateEmployee,
  validateEmployeeUpdate,
  validateId,
  validateInitialPasswordChange,
  validateInitialSetup,
  validateHolidayCalendar,
  validateHolidayClosure,
  validateHolidayClosureCancellation,
  validateLogin,
  validateProject,
  validateProjectUpdate,
  validatePlanningTeam,
  validatePlanningTeamUpdate,
  validateSiteMaterial,
  validateSiteMaterialUpdate,
  validateSiteNote,
  validateMobileSiteReport,
  validateMobileSiteReportRevision,
  validateSiteReport,
  validateSiteReportFinalization,
  validateSiteReportReturn,
  validateSiteTask,
  validateSiteTaskUpdate,
  validateSiteBundle,
  validateVehicle,
  validateVehicleUpdate,
  validateTimeEntry,
  validateTimeEntryAddition,
  validateTimeCorrectionPolicy,
  validateTimeEntryCorrection,
  validateTimeEntryCorrectionDecision,
  validateTimeEntryDelete,
  validateTimeEntryEdit,
  validateTimeEntryInvalidation,
  validateTimeAccountAdjustment,
  validateTimeAccountProfile,
  validateTimeAccountYear,
  validateVdeInspectionCompletion,
  validateVdeInspectionCreate,
  validateVdeInspectionImport,
  validateVdeInspectionUpdate,
  validateSpontaneousSiteSelection,
  validateFieldConstructionSite,
  validateWorkDayDecision,
  validateWorkDate
} from "./validation.mjs";

const DUMMY_HASH = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$zJbDCEum4Q2YZolIS8tIPfMbbOMR2eM8lXJj1i9Cq2Q";
const PLANNER_ROLES = new Set([
  "admin",
  "managing_director",
  "dispatch_office",
  "office",
  "planner",
  "project_manager",
  "executive_assistant"
]);
const FULL_PLANNER_ROLES = new Set([
  "admin",
  "managing_director",
  "dispatch_office",
  "office",
  "planner",
  "executive_assistant"
]);
const MANAGEMENT_ROLES = new Set(["managing_director", "dispatch_office", "project_manager"]);
const MANAGEMENT_ASSIGNER_ROLES = new Set(["admin", "managing_director"]);
const VDE_COMPLETION_ROLES = new Set([
  "admin",
  "managing_director",
  "project_manager",
  "foreman"
]);
const ABSENCE_OFFICE_REVIEW_ROLES = new Set([
  "admin",
  "dispatch_office",
  "office",
  "planner",
  "project_manager",
  "executive_assistant"
]);
const ABSENCE_MANAGEMENT_APPROVAL_ROLES = new Set(["managing_director"]);
const FEDERAL_STATE_NAMES = new Map([
  ["BW", "Baden-Württemberg"],
  ["BY", "Bayern"],
  ["BE", "Berlin"],
  ["BB", "Brandenburg"],
  ["HB", "Bremen"],
  ["HH", "Hamburg"],
  ["HE", "Hessen"],
  ["MV", "Mecklenburg-Vorpommern"],
  ["NI", "Niedersachsen"],
  ["NW", "Nordrhein-Westfalen"],
  ["RP", "Rheinland-Pfalz"],
  ["SL", "Saarland"],
  ["SN", "Sachsen"],
  ["ST", "Sachsen-Anhalt"],
  ["SH", "Schleswig-Holstein"],
  ["TH", "Thüringen"]
]);

function json(response, status, body, headers = {}) {
  const encoded = JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(encoded),
    "Cache-Control": "no-store",
    // Jede Antwort nennt die Fassung dieses Servers. Die App vergleicht sie mit
    // ihrer eigenen und bietet das Neuladen an, wenn sie hinterherhaengt.
    //
    // Vorher konnte ein Telefon tagelang eine alte Oberflaeche zeigen: der
    // Dienst-Worker taeuscht bei einer eingerichteten App eine funktionierende
    // Welt vor, und niemand erfuhr, dass es eine neuere gibt.
    "X-Schaefchen-Server-Version": APPLICATION_VERSION,
    ...securityHeaders(),
    ...headers
  });
  response.end(encoded);
}

// Fassung dieses Servers. Sie stand frueher als Zeichenkette mitten in der
// Fehleraufzeichnung und wurde beim Ausliefern regelmaessig vergessen; ein
// Fehlerbericht nannte dann eine Fassung, die es laengst nicht mehr gab.
// Kennungsform, wie sie die Datenbank vergibt.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const APPLICATION_VERSION = "0.44.36";

export function compareApplicationVersions(left, right) {
  const parse = (value) => String(value || "")
    .replace(/^v/i, "")
    .split(/[.+-]/)
    .slice(0, 3)
    .map((part) => (/^\d+$/.test(part) ? Number(part) : -1));
  const leftParts = parse(left);
  const rightParts = parse(right);
  if (leftParts.includes(-1) || rightParts.includes(-1)) return null;
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

async function readPlatformRuntimeState(pool) {
  return withPlatformTransaction(pool, async (client) => {
    const result = await client.query(
      `SELECT
         COALESCE((SELECT value FROM platform_settings
                   WHERE setting_key = 'maintenance.enabled'), 'false'::JSONB) AS maintenance_enabled,
         production.version AS production_version,
         COALESCE(production.mandatory_update, FALSE) AS mandatory_update
       FROM (SELECT 1) AS singleton
       LEFT JOIN LATERAL (
         SELECT version, mandatory_update
         FROM application_versions
         WHERE release_status = 'production'
         ORDER BY released_at DESC NULLS LAST, created_at DESC
         LIMIT 1
       ) AS production ON TRUE`
    );
    const row = result.rows[0] || {};
    return {
      maintenanceEnabled: row.maintenance_enabled === true,
      productionVersion: row.production_version || null,
      mandatoryUpdate: Boolean(row.mandatory_update)
    };
  });
}

function attachment(response, document) {
  const fallbackName = document.fileName
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "dokument";
  const encodedName = encodeURIComponent(document.fileName).replace(/[!'()*]/g, (character) => (
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  ));
  response.writeHead(200, {
    "Content-Type": document.mimeType,
    "Content-Length": document.content.length,
    "Content-Disposition": `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`,
    "Cache-Control": "no-store",
    ...securityHeaders()
  });
  response.end(document.content);
}

function inlineDocument(response, document) {
  response.writeHead(200, {
    "Content-Type": document.mimeType,
    "Content-Length": document.content.length,
    "Content-Disposition": `inline; filename="${document.fileName}"`,
    "Cache-Control": "private, max-age=300",
    ...securityHeaders()
  });
  response.end(document.content);
}

// disposition = "inline": das Blatt wird im Browser angezeigt statt geladen.
// Nur fuer die Vorschau gedacht - was jemand aufbewahren soll, kommt weiter
// als Anhang, damit es im Downloadordner landet und nicht nur im Fenster.
function binaryAttachment(response, { content, fileName, mimeType, disposition = "attachment" }) {
  const fallbackName = fileName
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "export.xlsx";
  const encodedName = encodeURIComponent(fileName).replace(/[!'()*]/g, (character) => (
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  ));
  response.writeHead(200, {
    "Content-Type": mimeType,
    "Content-Length": content.length,
    "Content-Disposition": `${disposition}; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`,
    "Cache-Control": "no-store",
    // Nur die eingebettete Vorschau darf in einem Rahmen stehen - und auch
    // die nur in einem Rahmen derselben Herkunft.
    ...securityHeaders({ sameOriginFrame: disposition === "inline" })
  });
  response.end(content);
}

async function setupStatus(pool, companyNumber) {
  return withApiTransaction(pool, async (client) => {
    const result = await client.query(
      `SELECT company_number, display_name, logo_object_key, setup_required
       FROM api_get_initial_setup_status_v2($1::VARCHAR)`,
      [companyNumber]
    );
    if (result.rowCount !== 1) {
      throw new InputError("Die Firma für die Ersteinrichtung wurde nicht gefunden.", 404, "company_not_found");
    }
    const row = result.rows[0];
    return {
      companyNumber: row.company_number,
      displayName: row.display_name,
      logoUrl: companyLogoUrl(row.logo_object_key),
      setupRequired: row.setup_required
    };
  });
}

async function createInitialAdmin(pool, config, limiter, request, body) {
  if (!config.initialSetupToken) {
    throw new InputError("Die Ersteinrichtung ist serverseitig nicht freigeschaltet.", 503, "setup_unavailable");
  }
  const input = validateInitialSetup(body);
  const key = limiter.key(clientIp(request), "setup", config.initialCompanyNumber);
  if (limiter.isBlocked(key)) {
    throw new InputError("Zu viele Einrichtungsversuche. Bitte später erneut versuchen.", 429, "rate_limited");
  }
  if (!secretsEqual(input.setupToken, config.initialSetupToken)) {
    limiter.fail(key);
    throw new InputError("Der Einrichtungsschlüssel ist falsch.", 401, "invalid_setup_token");
  }

  const status = await setupStatus(pool, config.initialCompanyNumber);
  if (!status.setupRequired) {
    throw new InputError("Die Ersteinrichtung ist bereits abgeschlossen.", 409, "setup_completed");
  }

  const passwordHash = await hashPassword(input.password);
  await withApiTransaction(pool, async (client) => {
    await client.query(
      `SELECT api_create_initial_admin(
         $1::VARCHAR, $2::VARCHAR, $3::VARCHAR, $4::VARCHAR, $5::TEXT
       )`,
      [
        config.initialCompanyNumber,
        input.personnelNumber,
        input.firstName,
        input.lastName,
        passwordHash
      ]
    );
  });
  limiter.clear(key);
  return {
    companyNumber: config.initialCompanyNumber,
    personnelNumber: input.personnelNumber
  };
}

function clientIp(request) {
  return request.socket.remoteAddress || "unknown";
}

function clientAppVersion(request) {
  const value = request.headers["x-schaefchen-version"];
  return typeof value === "string" && /^[0-9A-Za-z.+_-]{1,40}$/.test(value)
    ? value
    : null;
}

function timeEntryDto(row, idempotent = false) {
  return {
    id: row.id,
    workDayId: row.work_day_id,
    clientEntryId: row.client_entry_id,
    entryType: row.entry_type,
    recordedAt: new Date(row.recorded_at).toISOString(),
    clientCreatedAt: new Date(row.client_created_at).toISOString(),
    constructionSiteId: row.construction_site_id,
    constructionSiteName: row.construction_site_name || null,
    activityNote: row.activity_note || null,
    travelMinutes: row.travel_minutes_override === null
      || row.travel_minutes_override === undefined
      ? null
      : Number(row.travel_minutes_override),
    pendingCorrection: row.pending_correction_id ? {
      id: row.pending_correction_id,
      requestedRecordedAt: new Date(row.pending_requested_recorded_at).toISOString(),
      reason: row.pending_correction_reason,
      requestedAt: new Date(row.pending_requested_at).toISOString()
    } : null,
    idempotent
  };
}

function timeEntryCorrectionDto(row) {
  return {
    id: row.id,
    employeeId: row.user_id,
    employeeName: row.employee_name,
    workDayId: row.work_day_id,
    workDate: databaseDate(row.work_date),
    originalEntryId: row.original_entry_id,
    correctionKind: row.correction_kind || "replacement",
    entryType: row.entry_type,
    originalRecordedAt: row.original_recorded_at
      ? new Date(row.original_recorded_at).toISOString()
      : null,
    requestedRecordedAt: new Date(row.requested_recorded_at).toISOString(),
    reason: row.correction_reason,
    requestedAt: new Date(row.requested_at).toISOString(),
    status: row.correction_status || "pending",
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null,
    operationId: row.edit_operation_id || null,
    operationAction: row.operation_action || null
  };
}

function workDayWorkflowStatus(day, entries = null) {
  if (day.status === "locked") return "billed";
  if (["submitted", "approved"].includes(day.status)) return "completed";
  const lastType = entries?.at(-1)?.entry_type
    || entries?.at(-1)?.entryType
    || day.last_entry_type;
  return lastType === "clock_out" ? "completed" : "in_progress";
}

function workDayWarnings(day, entries = null) {
  const warnings = [];
  const entryCount = entries ? entries.length : Number(day.entry_count || 0);
  const lastType = entries?.at(-1)?.entry_type
    || entries?.at(-1)?.entryType
    || day.last_entry_type;
  const siteVisitCount = entries
    ? entries.filter((entry) => (
      (entry.entry_type || entry.entryType) === "site_arrival"
    )).length
    : Number(day.site_visit_count || 0);
  const hasPendingCorrection = Boolean(day.has_pending_correction) || (
    entries
      ? entries.some((entry) => Boolean(entry.pending_correction_id || entry.pendingCorrection))
      : false
  );

  if (entryCount > 0 && lastType !== "clock_out") {
    warnings.push({
      code: "day_not_finished",
      message: "Arbeitsblock noch nicht mit Feierabend beendet"
    });
  }
  if (Number(day.gross_minutes || 0) > 16 * 60) {
    warnings.push({
      code: "long_day_span",
      message: "Zeitspanne zwischen erstem Start und letztem Ende über 16 Stunden"
    });
  }
  if (Number(day.work_minutes || 0) > 12 * 60) {
    warnings.push({
      code: "long_work_time",
      message: "Netto-Arbeitszeit über 12 Stunden"
    });
  }
  if (Number(day.work_minutes || 0) >= 120 && siteVisitCount === 0) {
    warnings.push({
      code: "no_site_visit",
      message: "Keine Baustellenankunft erfasst"
    });
  }
  if (hasPendingCorrection) {
    warnings.push({
      code: "correction_pending",
      message: "Offene Zeitkorrektur"
    });
  }
  return warnings;
}

function workDayDto(day, entries) {
  return {
    id: day.id,
    workDate: day.work_date instanceof Date
      ? day.work_date.toISOString().slice(0, 10)
      : String(day.work_date).slice(0, 10),
    status: day.status,
    targetWorkMinutes: day.target_work_minutes,
    firstClockInAt: day.first_clock_in_at ? new Date(day.first_clock_in_at).toISOString() : null,
    lastClockOutAt: day.last_clock_out_at ? new Date(day.last_clock_out_at).toISOString() : null,
    grossMinutes: day.gross_minutes,
    breakMinutes: day.break_minutes,
    breakMinutesOverride: day.break_minutes_override === null
      || day.break_minutes_override === undefined
      ? null
      : Number(day.break_minutes_override),
    workMinutes: day.work_minutes,
    travelMinutes: day.travel_minutes,
    overtimeMinutes: day.overtime_minutes,
    submittedAt: day.submitted_at ? new Date(day.submitted_at).toISOString() : null,
    approvedAt: day.approved_at ? new Date(day.approved_at).toISOString() : null,
    lockedAt: day.locked_at ? new Date(day.locked_at).toISOString() : null,
    hasPendingCorrection: Boolean(day.has_pending_correction)
      || entries.some((entry) => Boolean(entry.pending_correction_id)),
    workflowStatus: workDayWorkflowStatus(day, entries),
    warnings: workDayWarnings(day, entries),
    rowVersion: Number(day.row_version),
    entries: entries.map((entry) => timeEntryDto(entry))
  };
}

function adminWorkDayDto(day) {
  return {
    id: day.id,
    employeeId: day.user_id,
    employeeName: day.employee_name,
    workDate: databaseDate(day.work_date),
    status: day.status,
    targetWorkMinutes: day.target_work_minutes,
    grossMinutes: day.gross_minutes,
    breakMinutes: day.break_minutes,
    workMinutes: day.work_minutes,
    travelMinutes: day.travel_minutes,
    overtimeMinutes: day.overtime_minutes,
    submittedAt: day.submitted_at ? new Date(day.submitted_at).toISOString() : null,
    approvedAt: day.approved_at ? new Date(day.approved_at).toISOString() : null,
    lockedAt: day.locked_at ? new Date(day.locked_at).toISOString() : null,
    workflowStatus: workDayWorkflowStatus(day),
    reviewable: (
      ["open", "submitted"].includes(day.status)
      && day.last_entry_type === "clock_out"
      && !day.has_pending_correction
    ),
    warnings: workDayWarnings(day),
    rowVersion: Number(day.row_version)
  };
}

async function createLogin(pool, config, limiter, request, body) {
  const input = validateLogin(body);
  const key = limiter.key(clientIp(request), input.companyNumber, input.personnelNumber);
  if (limiter.isBlocked(key)) {
    throw new InputError("Zu viele Anmeldeversuche. Bitte später erneut versuchen.", 429, "rate_limited");
  }

  const account = await withApiTransaction(pool, async (client) => {
    const lookup = await client.query(
      "SELECT company_id, user_id, password_hash, must_change_password FROM api_lookup_login_user($1::VARCHAR, $2::VARCHAR)",
      [input.companyNumber, input.personnelNumber]
    );
    return lookup.rows[0] ?? null;
  });

  const valid = await verifyPassword(input.password, account?.password_hash || DUMMY_HASH);
  if (!account || !valid) {
    if (account) {
      await withApiTransaction(
        pool,
        (client) => client.query(
          "SELECT api_record_login_failure($1,$2)",
          [account.company_id, account.user_id]
        )
      );
    }
    limiter.fail(key);
    throw new InputError("Firmennummer, Personalnummer oder Passwort ist falsch.", 401, "invalid_credentials");
  }

  limiter.clear(key);
  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + config.sessionTtlSeconds * 1000);
  const context = {
    companyId: account.company_id,
    userId: account.user_id,
    expiresAt
  };

  const view = await withTenantTransaction(pool, context, async (client) => {
    const inserted = await client.query(
      `INSERT INTO user_sessions (company_id, user_id, token_hash, expires_at, app_version)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [context.companyId, context.userId, tokenHash, expiresAt, clientAppVersion(request)]
    );
    context.sessionId = inserted.rows[0].id;
    await client.query("SELECT api_record_login_success($1,$2)", [context.companyId, context.userId]);
    return sessionView(client, context);
  });

  return { token, view };
}

async function getWorkDay(client, context, date) {
  const dayResult = await client.query(
    `SELECT day.*,
            EXISTS (
              SELECT 1
              FROM time_entries AS correction
              WHERE correction.company_id = day.company_id
                AND correction.user_id = day.user_id
                AND correction.work_day_id = day.id
                AND correction.correction_status = 'pending'
            ) AS has_pending_correction
     FROM work_days AS day
     WHERE day.company_id = $1 AND day.user_id = $2 AND day.work_date = $3`,
    [context.companyId, context.userId, date]
  );
  if (dayResult.rowCount === 0) return null;

  const day = dayResult.rows[0];
  const entries = await client.query(
    `SELECT entry.id, entry.work_day_id, entry.client_entry_id, entry.entry_type,
            entry.recorded_at, entry.client_created_at, entry.construction_site_id,
            entry.activity_note, entry.travel_minutes_override,
            site.name AS construction_site_name,
            pending.id AS pending_correction_id,
            pending.recorded_at AS pending_requested_recorded_at,
            pending.correction_reason AS pending_correction_reason,
            pending.created_at AS pending_requested_at
     FROM time_entries AS entry
     LEFT JOIN construction_sites AS site
       ON site.company_id = entry.company_id AND site.id = entry.construction_site_id
     LEFT JOIN LATERAL (
       SELECT correction.id, correction.recorded_at,
              correction.correction_reason, correction.created_at
       FROM time_entries AS correction
       WHERE correction.company_id = entry.company_id
         AND correction.user_id = entry.user_id
         AND correction.original_entry_id = entry.id
         AND correction.correction_status = 'pending'
       ORDER BY correction.created_at DESC, correction.id DESC
       LIMIT 1
     ) AS pending ON TRUE
     WHERE entry.company_id = $1 AND entry.user_id = $2 AND entry.work_day_id = $3
       AND entry.invalidated_at IS NULL
       AND entry.correction_kind IS DISTINCT FROM 'invalidation'
       AND (
         (entry.original_entry_id IS NULL AND entry.correction_status IS NULL)
         OR entry.correction_status = 'approved'
       )
     ORDER BY entry.recorded_at, entry.created_at, entry.id`,
    [context.companyId, context.userId, day.id]
  );
  return workDayDto(day, entries.rows);
}

async function getWorkWeek(client, context, weekStart) {
  const days = [];
  const start = new Date(`${weekStart}T00:00:00Z`);
  if (start.getUTCDay() !== 1) {
    throw new InputError("Der Wochenbeginn muss ein Montag sein.", 400, "invalid_week_start");
  }
  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + offset);
    const workDate = date.toISOString().slice(0, 10);
    days.push({
      workDate,
      workDay: await getWorkDay(client, context, workDate)
    });
  }
  return {
    weekStart,
    weekEnd: days.at(-1).workDate,
    days,
    totals: days.reduce((totals, item) => {
      if (!item.workDay) return totals;
      totals.grossMinutes += item.workDay.grossMinutes || 0;
      totals.breakMinutes += item.workDay.breakMinutes || 0;
      totals.workMinutes += item.workDay.workMinutes || 0;
      totals.travelMinutes += item.workDay.travelMinutes || 0;
      totals.overtimeMinutes += item.workDay.overtimeMinutes || 0;
      return totals;
    }, {
      grossMinutes: 0,
      breakMinutes: 0,
      workMinutes: 0,
      travelMinutes: 0,
      overtimeMinutes: 0
    })
  };
}

async function getAdminWorkDayEntries(client, context, workDayId) {
  await requireFullPlanner(client, context);
  const dayResult = await client.query(
    `SELECT day.*, account.first_name || ' ' || account.last_name AS employee_name,
            EXISTS (
              SELECT 1 FROM time_entries AS correction
              WHERE correction.company_id = day.company_id
                AND correction.user_id = day.user_id
                AND correction.work_day_id = day.id
                AND correction.correction_status = 'pending'
            ) AS has_pending_correction
     FROM work_days AS day
     JOIN users AS account
       ON account.company_id = day.company_id AND account.id = day.user_id
     WHERE day.company_id = $1 AND day.id = $2`,
    [context.companyId, workDayId]
  );
  if (dayResult.rowCount !== 1) {
    throw new InputError("Der Arbeitstag wurde nicht gefunden.", 404, "work_day_not_found");
  }
  const day = dayResult.rows[0];
  const entries = await client.query(
    `SELECT entry.id, entry.work_day_id, entry.client_entry_id, entry.entry_type,
            entry.recorded_at, entry.client_created_at, entry.construction_site_id,
            entry.activity_note, entry.travel_minutes_override,
            site.name AS construction_site_name,
            pending.id AS pending_correction_id,
            pending.recorded_at AS pending_requested_recorded_at,
            pending.correction_reason AS pending_correction_reason,
            pending.created_at AS pending_requested_at
     FROM time_entries AS entry
     LEFT JOIN construction_sites AS site
       ON site.company_id = entry.company_id AND site.id = entry.construction_site_id
     LEFT JOIN LATERAL (
       SELECT correction.id, correction.recorded_at,
              correction.correction_reason, correction.created_at
       FROM time_entries AS correction
       WHERE correction.company_id = entry.company_id
         AND correction.user_id = entry.user_id
         AND correction.original_entry_id = entry.id
         AND correction.correction_status = 'pending'
       ORDER BY correction.created_at DESC, correction.id DESC LIMIT 1
     ) AS pending ON TRUE
     WHERE entry.company_id = $1 AND entry.user_id = $2 AND entry.work_day_id = $3
       AND entry.invalidated_at IS NULL
       AND entry.correction_kind IS DISTINCT FROM 'invalidation'
       AND ((entry.original_entry_id IS NULL AND entry.correction_status IS NULL)
            OR entry.correction_status = 'approved')
     ORDER BY entry.recorded_at, entry.created_at, entry.id`,
    [context.companyId, day.user_id, day.id]
  );
  return {
    ...workDayDto(day, entries.rows),
    employeeId: day.user_id,
    employeeName: day.employee_name
  };
}

async function getAdminWorkDay(client, context, workDayId) {
  const result = await client.query(
    `SELECT day.*, account.first_name || ' ' || account.last_name AS employee_name
     FROM work_days AS day
     JOIN users AS account
       ON account.company_id = day.company_id AND account.id = day.user_id
     WHERE day.company_id = $1 AND day.id = $2`,
    [context.companyId, workDayId]
  );
  if (result.rowCount !== 1) {
    throw new InputError(
      "Der Stundenzettel wurde nicht gefunden.",
      404,
      "work_day_not_found"
    );
  }
  return adminWorkDayDto(result.rows[0]);
}

async function reviewWorkDay(client, context, workDayId, input) {
  await requireFullPlanner(client, context);
  const current = await client.query(
    `SELECT id, user_id, status
     FROM work_days
     WHERE company_id = $1 AND id = $2
     FOR UPDATE`,
    [context.companyId, workDayId]
  );
  if (current.rowCount !== 1) {
    throw new InputError(
      "Der Stundenzettel wurde nicht gefunden.",
      404,
      "work_day_not_found"
    );
  }
  const validStatus = input.decision === "approved"
    ? ["open", "submitted"].includes(current.rows[0].status)
    : current.rows[0].status === "approved";
  if (!validStatus) {
    throw new InputError(
      input.decision === "approved"
        ? "Nur ein vollständig beendeter Stundenzettel kann freigegeben werden."
        : "Nur ein freigegebener Stundenzettel kann abgerechnet werden.",
      409,
      "work_day_status_conflict"
    );
  }
  const pending = await client.query(
    `SELECT 1
     FROM time_entries
     WHERE company_id = $1
       AND user_id = $2
       AND work_day_id = $3
       AND correction_status = 'pending'
     LIMIT 1`,
    [context.companyId, current.rows[0].user_id, workDayId]
  );
  if (pending.rowCount !== 0) {
    throw new InputError(
      "Der Stundenzettel besitzt noch eine offene Zeitkorrektur.",
      409,
      "work_day_correction_pending"
    );
  }

  if (input.decision === "approved") {
    const lastEntry = await client.query(
      `SELECT entry_type
       FROM time_entries
       WHERE company_id = $1 AND user_id = $2 AND work_day_id = $3
         AND invalidated_at IS NULL
         AND correction_kind IS DISTINCT FROM 'invalidation'
         AND (
           (original_entry_id IS NULL AND correction_status IS NULL)
           OR correction_status = 'approved'
         )
       ORDER BY recorded_at DESC, created_at DESC, id DESC
       LIMIT 1`,
      [context.companyId, current.rows[0].user_id, workDayId]
    );
    if (lastEntry.rowCount !== 1 || lastEntry.rows[0].entry_type !== "clock_out") {
      throw new InputError(
        "Der aktuelle Arbeitsblock ist noch nicht mit Feierabend beendet.",
        409,
        "work_day_not_finished"
      );
    }
    await client.query(
      `UPDATE work_days
       SET status = 'approved', approved_by_user_id = $3
       WHERE company_id = $1 AND id = $2`,
      [context.companyId, workDayId, context.userId]
    );
  } else {
    await client.query(
      "SELECT set_config('app.controlled_time_correction','on',TRUE)"
    );
    await client.query(
      `UPDATE work_days
       SET status = 'locked', locked_by_user_id = $3
       WHERE company_id = $1 AND id = $2`,
      [context.companyId, workDayId, context.userId]
    );
  }
  return getAdminWorkDay(client, context, workDayId);
}

async function getAssignments(client, context, date) {
  const result = await client.query(
    `SELECT
       assignment.id,
       assignment.sequence_number,
       assignment.planned_start_time::TEXT,
       assignment.planned_duration_minutes,
       assignment.status,
       assignment.comment,
       assignment.report_responsible,
       assignment.report_responsibility_source,
       -- Die Berichtsverantwortung gehoert dem Menschen fuer diese Baustelle an
       -- diesem Tag, nicht einem einzelnen Einsatzeintrag. Wer nach der Mittags-
       -- pause zurueckkehrt, bekommt einen zweiten Eintrag; ohne diese
       -- Zusammenfassung verlor er dabei den Zugang zum Bericht.
       BOOL_OR(assignment.report_responsible) OVER (
         PARTITION BY assignment.construction_site_id
       ) AS responsible_for_site,
       report.id AS mobile_report_id,
       report.report_number AS mobile_report_number,
       report.status AS mobile_report_status,
       report.row_version AS mobile_report_row_version,
       report.return_comment AS mobile_report_return_comment,
       site.id AS construction_site_id,
       site.site_number,
       site.name,
       site.area_label,
       site.installer_short_text,
       site.qr_code
     FROM site_assignments AS assignment
     JOIN construction_sites AS site
      ON site.company_id = assignment.company_id
      AND site.id = assignment.construction_site_id
     LEFT JOIN LATERAL (
       SELECT candidate.id, candidate.report_number, candidate.status,
              candidate.row_version, candidate.return_comment
       FROM site_reports AS candidate
       WHERE candidate.company_id = assignment.company_id
         AND candidate.construction_site_id = assignment.construction_site_id
         AND candidate.work_date = assignment.work_date
         AND candidate.status IN ('submitted', 'approved', 'returned')
       ORDER BY (candidate.site_assignment_id = assignment.id) DESC NULLS LAST, candidate.created_at DESC
       LIMIT 1
     ) AS report ON TRUE
     WHERE assignment.company_id = $1
       AND assignment.user_id = $2
       AND assignment.work_date = $3
       AND assignment.status IN ('released', 'completed')
     ORDER BY assignment.sequence_number`,
    [context.companyId, context.userId, date]
  );
  return result.rows.map((row) => ({
    id: row.id,
    sequenceNumber: row.sequence_number,
    plannedStartTime: row.planned_start_time,
    plannedDurationMinutes: row.planned_duration_minutes,
    status: row.status,
    comment: row.comment,
    reportResponsible: row.responsible_for_site,
    reportResponsibilitySource: row.report_responsibility_source,
    mobileReport: row.mobile_report_id ? {
      id: row.mobile_report_id,
      number: row.mobile_report_number,
      status: row.mobile_report_status,
      rowVersion: Number(row.mobile_report_row_version),
      returnComment: row.mobile_report_return_comment || null
    } : null,
    constructionSite: {
      id: row.construction_site_id,
      number: row.site_number,
      name: row.name,
      area: row.area_label,
      shortText: row.installer_short_text,
      qrCode: row.qr_code || null
    }
  }));
}

async function getTimeTrackingSiteOptions(client, context, date) {
  const roles = await activeRoleKeys(client, context);
  const projectScopeRestricted = hasProjectScopedAccess(roles);
  const projectScope = projectScopeRestricted
    ? await assignedProjectIds(client, context)
    : null;
  const suggested = await getAssignments(client, context, date);
  const suggestedSiteIds = suggested.map((assignment) => assignment.constructionSite.id);
  const [sites, projects, customers] = await Promise.all([
    client.query(
      `SELECT site.id, site.project_id, project.customer_id, site.site_number,
              site.name, site.installer_short_text, site.status, site.row_version,
              site.qr_code,
              site.updated_at, site.creation_source, site.field_review_status,
              project.name AS project_name,
              COALESCE(customer.company_name, customer.first_name || ' ' || customer.last_name) AS customer_name,
              location.street, location.house_number, location.postal_code, location.city
       FROM construction_sites AS site
       JOIN projects AS project
         ON project.company_id = site.company_id AND project.id = site.project_id
       JOIN customers AS customer
         ON customer.company_id = project.company_id AND customer.id = project.customer_id
       LEFT JOIN customer_locations AS location
         ON location.company_id = site.company_id AND location.id = site.customer_location_id
       WHERE site.company_id = $1
         AND (
           site.status IN ('planned', 'active', 'on_hold', 'delayed')
           OR site.id = ANY($2::UUID[])
         )
       ORDER BY
         CASE WHEN site.id = ANY($2::UUID[]) THEN 0 ELSE 1 END,
         LOWER(site.name), site.site_number`,
      [context.companyId, suggestedSiteIds]
    ),
    client.query(
      `SELECT project.id, project.customer_id, project.project_number,
              project.name, project.installer_short_text, project.status,
              project.row_version, project.updated_at,
              COALESCE(customer.company_name, customer.first_name || ' ' || customer.last_name) AS customer_name,
              0::INTEGER AS site_count
       FROM projects AS project
       JOIN customers AS customer
         ON customer.company_id = project.company_id AND customer.id = project.customer_id
       WHERE project.company_id = $1
         AND project.status IN ('planned', 'active', 'on_hold')
         AND customer.status = 'active'
      ORDER BY LOWER(COALESCE(customer.company_name, customer.last_name)), LOWER(project.name)`,
      [context.companyId]
    ),
    client.query(
      `SELECT id, customer_number,
              COALESCE(company_name, first_name || ' ' || last_name) AS display_name
       FROM customers
       WHERE company_id = $1 AND status = 'active'
       ORDER BY LOWER(COALESCE(company_name, last_name)), customer_number`,
      [context.companyId]
    )
  ]);
  const visibleProjects = projects.rows
    .map(projectDto)
    .filter((project) => !projectScopeRestricted || projectScope.has(project.id));
  const visibleProjectIds = new Set(visibleProjects.map((project) => project.id));
  const visibleSites = sites.rows
    .map(siteDto)
    .filter((site) => !projectScopeRestricted || visibleProjectIds.has(site.projectId));
  const visibleCustomerIds = new Set(visibleProjects.map((project) => project.customerId));
  return {
    workDate: date,
    suggestedAssignments: projectScopeRestricted
      ? suggested.filter((assignment) => visibleSites.some((site) => (
        site.id === assignment.constructionSite.id
      )))
      : suggested,
    sites: visibleSites,
    projects: visibleProjects,
    customers: customers.rows.filter((customer) => (
      !projectScopeRestricted || visibleCustomerIds.has(customer.id)
    )).map((customer) => ({
      id: customer.id,
      number: customer.customer_number,
      displayName: customer.display_name
    }))
  };
}

// Stellt sicher, dass der eigene Einsatz auf einer Baustelle besteht, und legt
// ihn sonst als Auswahl des Mitarbeiters an.
//
// Ein Monteur landet regelmäßig auf einer Baustelle, für die ihn niemand
// eingeplant hat: kurzfristige Umleitung, Notdienst, Aushilfe auf einer
// fremden Baustelle. Live konnte er die Baustelle deshalb schon immer selbst
// wählen. Beim Nachtragen und beim Berichtigen fehlte diese Möglichkeit, und
// die Buchung wurde abgewiesen, obwohl derselbe Vorgang live erlaubt ist.
// Der Einsatz wird daher überall gleich behandelt und bei Bedarf angelegt.
//
// Die Prüfungen bleiben: Die Baustelle muss zur Firma gehören, aktiv sein und
// für projektgebundene Rollen zugänglich sein.
async function ensureOwnSiteAssignment(client, context, workDate, constructionSiteId, comment) {
  const existing = await client.query(
    `SELECT id, report_responsible FROM site_assignments
     WHERE company_id = $1 AND user_id = $2 AND construction_site_id = $3
       AND work_date = $4 AND status IN ('released', 'completed')
     ORDER BY report_responsible DESC, sequence_number`,
    [context.companyId, context.userId, constructionSiteId, workDate]
  );
  if (existing.rowCount > 0) return existing.rows[0];

  const roles = await activeRoleKeys(client, context);
  if (hasProjectScopedAccess(roles)) {
    await requireConstructionSiteAccess(client, context, constructionSiteId, roles);
  }
  const site = await client.query(
    `SELECT id, name FROM construction_sites
     WHERE company_id = $1 AND id = $2
       AND status IN ('planned', 'active', 'on_hold', 'delayed')`,
    [context.companyId, constructionSiteId]
  );
  if (site.rowCount !== 1) {
    throw new InputError(
      "Die Baustelle wurde nicht gefunden oder ist nicht mehr offen.",
      404,
      "site_not_found"
    );
  }
  await createEmployeeSelectedAssignment(
    client,
    context,
    workDate,
    constructionSiteId,
    `${comment} · ${site.rows[0].name}`
  );
  const created = await client.query(
    `SELECT id, report_responsible FROM site_assignments
     WHERE company_id = $1 AND user_id = $2 AND construction_site_id = $3
       AND work_date = $4 AND status IN ('released', 'completed')
     ORDER BY report_responsible DESC, sequence_number`,
    [context.companyId, context.userId, constructionSiteId, workDate]
  );
  return created.rows[0];
}

function requireToday(workDate, timeZone) {
  const today = localDate(new Date().toISOString(), timeZone);
  if (workDate !== today) {
    throw new InputError(
      "Eine spontane Baustelle kann nur für den heutigen Arbeitstag gewählt werden.",
      409,
      "site_selection_not_today"
    );
  }
}

async function createEmployeeSelectedAssignment(
  client,
  context,
  workDate,
  constructionSiteId,
  comment,
  forceNewOccurrence = false
) {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    [`assignment:${context.companyId}:${context.userId}:${workDate}`]
  );
  const existing = await client.query(
    `SELECT id
     FROM site_assignments
     WHERE company_id = $1 AND user_id = $2 AND construction_site_id = $3
       AND work_date = $4 AND status IN ('released', 'completed')
     ORDER BY sequence_number
     LIMIT 1`,
    [context.companyId, context.userId, constructionSiteId, workDate]
  );
  if (existing.rowCount === 0 || forceNewOccurrence) {
    const sequence = await client.query(
      `SELECT COALESCE(MAX(sequence_number), 0) + 1 AS next_sequence
       FROM site_assignments
       WHERE company_id = $1 AND user_id = $2 AND work_date = $3
         AND status <> 'cancelled'`,
      [context.companyId, context.userId, workDate]
    );
    await client.query(
      `INSERT INTO site_assignments (
         company_id, user_id, construction_site_id, work_date,
         sequence_number, status, comment, published_at,
         created_by_user_id, changed_by_user_id, last_change_reason
       ) VALUES (
         $1, $2, $3, $4, $5, 'released', $6, CURRENT_TIMESTAMP,
         $2, $2, 'Spontane Auswahl durch den Mitarbeiter'
       )`,
      [
        context.companyId,
        context.userId,
        constructionSiteId,
        workDate,
        sequence.rows[0].next_sequence,
        comment
      ]
    );
  }
  await reconcileAutomaticSiteForeman(client, context, constructionSiteId, workDate);
  return getAssignments(client, context, workDate);
}

async function selectSpontaneousSite(client, context, input, timeZone) {
  requireToday(input.workDate, timeZone);
  const roles = await activeRoleKeys(client, context);
  if (hasProjectScopedAccess(roles)) {
    await requireConstructionSiteAccess(
      client,
      context,
      input.constructionSiteId,
      roles
    );
  }
  // Der Baustellenlink und der QR-Code tragen die QR-Kennung, nicht die
  // Baustellen-ID. Wer vor Ort den Aufkleber scannt, soll damit dieselbe
  // Baustelle waehlen koennen wie aus der Liste.
  const site = await client.query(
    `SELECT id, name
     FROM construction_sites
     WHERE company_id = $1 AND (id = $2 OR qr_code = $2::TEXT)
       AND status IN ('planned', 'active', 'on_hold', 'delayed')`,
    [context.companyId, input.constructionSiteId]
  );
  if (site.rowCount !== 1) {
    throw new InputError("Die Baustelle wurde nicht gefunden.", 404, "site_not_found");
  }
  const constructionSiteId = site.rows[0].id;
  const assignments = await createEmployeeSelectedAssignment(
    client,
    context,
    input.workDate,
    constructionSiteId,
    `Spontan gewählt · ${site.rows[0].name}`,
    input.newOccurrence
  );
  return { assignments, selectedSiteId: constructionSiteId };
}

async function resolveConstructionSiteParent(client, context, input) {
  if (input.projectId) {
    const project = await client.query(
      `SELECT project.id, project.name, project.customer_id,
              customer.customer_type, customer.company_name,
              customer.first_name, customer.last_name
       FROM projects AS project
       JOIN customers AS customer
         ON customer.company_id = project.company_id AND customer.id = project.customer_id
       WHERE project.company_id = $1 AND project.id = $2
         AND project.status IN ('planned', 'active', 'on_hold')
         AND customer.status = 'active'`,
      [context.companyId, input.projectId]
    );
    if (project.rowCount !== 1) {
      throw new InputError("Die Baustelle kann nicht mehr diesem Auftrag zugeordnet werden.", 404, "project_not_found");
    }
    return project.rows[0];
  }

  let customerRow;
  if (input.customerId) {
    const customer = await client.query(
      `SELECT id, customer_type, company_name, first_name, last_name
       FROM customers
       WHERE company_id = $1 AND id = $2 AND status = 'active'`,
      [context.companyId, input.customerId]
    );
    if (customer.rowCount !== 1) {
      throw new InputError("Der Kunde wurde nicht gefunden.", 404, "customer_not_found");
    }
    customerRow = customer.rows[0];
  } else {
    const activeCustomers = await client.query(
      `SELECT id, COALESCE(company_name, first_name || ' ' || last_name) AS display_name
       FROM customers
       WHERE company_id = $1 AND status = 'active'`,
      [context.companyId]
    );
    if (
      activeCustomers.rows.some(
        (customer) => normalizeImportText(customer.display_name) === normalizeImportText(input.customerName)
      )
    ) {
      throw new InputError(
        "Dieser Kunde ist bereits vorhanden. Bitte den vorhandenen Kunden auswählen.",
        409,
        "customer_name_exists"
      );
    }
    const customer = await client.query(
      `INSERT INTO customers (
         company_id, customer_type, company_name,
         billing_street, billing_house_number, billing_postal_code, billing_city
       ) VALUES ($1, 'company', $2, $3, $4, $5, $6)
       RETURNING id, customer_type, company_name, first_name, last_name`,
      [
        context.companyId,
        input.customerName,
        input.street,
        input.houseNumber,
        input.postalCode,
        input.city
      ]
    );
    customerRow = customer.rows[0];
  }

  let project = await client.query(
    `SELECT id, name, customer_id
     FROM projects
     WHERE company_id = $1 AND customer_id = $2
       AND status IN ('planned', 'active', 'on_hold')
       AND LOWER(name) = LOWER('Baustellen')
     ORDER BY created_at
     LIMIT 1`,
    [context.companyId, customerRow.id]
  );
  if (project.rowCount === 0) {
    project = await client.query(
      `INSERT INTO projects (company_id, customer_id, name, status)
       VALUES ($1, $2, 'Baustellen', 'active')
       RETURNING id, name, customer_id`,
      [context.companyId, customerRow.id]
    );
  }
  return {
    ...project.rows[0],
    customer_type: customerRow.customer_type,
    company_name: customerRow.company_name,
    first_name: customerRow.first_name,
    last_name: customerRow.last_name
  };
}

async function createFieldConstructionSite(client, context, input, timeZone) {
  requireToday(input.workDate, timeZone);
  const roles = await activeRoleKeys(client, context);
  if (hasProjectScopedAccess(roles)) {
    throw new InputError(
      "Projektleiter können neue Baustellen nur in der Verwaltung innerhalb eines zugeordneten Projekts anlegen.",
      403,
      "field_site_project_access_forbidden"
    );
  }
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    [`sites:${context.companyId}`]
  );
  const duplicate = await client.query(
    `SELECT id, name
     FROM construction_sites
     WHERE company_id = $1
       AND status IN ('planned', 'active', 'on_hold', 'delayed')`,
    [context.companyId]
  );
  if (duplicate.rows.some((row) => normalizeImportText(row.name) === normalizeImportText(input.name))) {
    throw new InputError(
      "Eine aktive Baustelle mit diesem Namen existiert bereits. Bitte diese auswählen.",
      409,
      "site_name_exists"
    );
  }

  const projectRow = await resolveConstructionSiteParent(client, context, input);

  const location = await client.query(
    `INSERT INTO customer_locations (
       company_id, customer_id, name, location_type,
       street, house_number, postal_code, city, is_billing_location
     ) VALUES ($1, $2, $3, 'construction', $4, $5, $6, $7, FALSE)
     RETURNING id`,
    [
      context.companyId,
      projectRow.customer_id,
      input.name,
      input.street,
      input.houseNumber,
      input.postalCode,
      input.city
    ]
  );
  await client.query(
    `INSERT INTO project_locations (company_id, project_id, customer_location_id)
     VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [context.companyId, projectRow.id, location.rows[0].id]
  );
  const inserted = await client.query(
    `INSERT INTO construction_sites (
       company_id, project_id, customer_location_id, name,
       installer_short_text, status, creation_source,
       field_created_by_user_id, field_review_status
     ) VALUES (
       $1, $2, $3, $4, $5, 'active', 'field', $6, 'pending'
     )
     RETURNING id, project_id, site_number, name, installer_short_text, qr_code,
               status, row_version, updated_at, creation_source, field_review_status`,
    [
      context.companyId,
      projectRow.id,
      location.rows[0].id,
      input.name,
      input.installerShortText,
      context.userId
    ]
  );
  const site = siteDto({
    ...inserted.rows[0],
    customer_id: projectRow.customer_id,
    customer_name: projectRow.customer_type === "company"
      ? projectRow.company_name
      : `${projectRow.first_name} ${projectRow.last_name}`,
    project_name: projectRow.name,
    street: input.street,
    house_number: input.houseNumber,
    postal_code: input.postalCode,
    city: input.city
  });
  const assignments = await createEmployeeSelectedAssignment(
    client,
    context,
    input.workDate,
    site.id,
    "Neue Baustelle vom Mitarbeiter angelegt",
    false
  );
  return { site, assignments, selectedSiteId: site.id };
}

async function confirmFieldConstructionSite(client, context, siteId) {
  const roles = await requirePlanner(client, context);
  await requireConstructionSiteAccess(client, context, siteId, roles);
  const updated = await client.query(
    `UPDATE construction_sites
     SET field_review_status = 'confirmed',
         field_reviewed_at = CURRENT_TIMESTAMP,
         field_reviewed_by_user_id = $3
     WHERE company_id = $1 AND id = $2
       AND creation_source = 'field' AND field_review_status = 'pending'
     RETURNING id`,
    [context.companyId, siteId, context.userId]
  );
  if (updated.rowCount !== 1) {
    throw new InputError(
      "Der Baustellenvorschlag wurde nicht gefunden oder bereits bestätigt.",
      409,
      "field_site_not_pending"
    );
  }
  return { id: siteId, fieldReviewStatus: "confirmed" };
}

async function activeRoleKeys(client, context) {
  const result = await client.query(
    `SELECT role.role_key
     FROM user_roles AS assignment
     JOIN roles AS role
       ON role.company_id = assignment.company_id
      AND role.id = assignment.role_id
     WHERE assignment.company_id = $1
       AND assignment.user_id = $2
       AND assignment.revoked_at IS NULL
       AND role.status = 'active'`,
    [context.companyId, context.userId]
  );
  return new Set(result.rows.map((row) => row.role_key));
}

async function requirePlanner(client, context) {
  const roles = await activeRoleKeys(client, context);
  if (![...roles].some((role) => PLANNER_ROLES.has(role))) {
    throw new InputError("Diese Funktion ist nur für die Planung und Verwaltung freigeschaltet.", 403, "forbidden");
  }
  return roles;
}

function hasFullPlannerAccess(roles) {
  return [...roles].some((role) => FULL_PLANNER_ROLES.has(role));
}

function hasProjectScopedAccess(roles) {
  return roles.has("project_manager") && !hasFullPlannerAccess(roles);
}

async function requireFullPlanner(client, context) {
  const roles = await requirePlanner(client, context);
  if (!hasFullPlannerAccess(roles)) {
    throw new InputError(
      "Diese firmenweite Funktion ist nur für Administration, Geschäftsführung oder Büro/Disposition freigeschaltet.",
      403,
      "global_planning_forbidden"
    );
  }
  return roles;
}

async function assignedProjectIds(client, context) {
  const result = await client.query(
    `SELECT project_id
     FROM project_responsibles
     WHERE company_id = $1
       AND user_id = $2
       AND responsibility = 'project_management'
       AND removed_at IS NULL`,
    [context.companyId, context.userId]
  );
  return new Set(result.rows.map((row) => row.project_id));
}

async function hasAssignedProjectForSite(client, context, constructionSiteId) {
  const result = await client.query(
    `SELECT 1
     FROM construction_sites AS site
     JOIN project_responsibles AS responsible
       ON responsible.company_id = site.company_id
      AND responsible.project_id = site.project_id
      AND responsible.user_id = $3
      AND responsible.responsibility = 'project_management'
      AND responsible.removed_at IS NULL
     WHERE site.company_id = $1 AND site.id = $2`,
    [context.companyId, constructionSiteId, context.userId]
  );
  return result.rowCount === 1;
}

async function requireProjectAccess(client, context, projectId, roles = null) {
  const effectiveRoles = roles || await requirePlanner(client, context);
  if (!hasProjectScopedAccess(effectiveRoles)) return effectiveRoles;
  const result = await client.query(
    `SELECT 1
     FROM project_responsibles
     WHERE company_id = $1
       AND project_id = $2
       AND user_id = $3
       AND responsibility = 'project_management'
       AND removed_at IS NULL`,
    [context.companyId, projectId, context.userId]
  );
  if (result.rowCount !== 1) {
    throw new InputError(
      "Dieses Projekt ist dir nicht zugeordnet.",
      403,
      "project_access_forbidden"
    );
  }
  return effectiveRoles;
}

async function requireConstructionSiteAccess(
  client,
  context,
  constructionSiteId,
  roles = null
) {
  const effectiveRoles = roles || await requirePlanner(client, context);
  if (!hasProjectScopedAccess(effectiveRoles)) return effectiveRoles;
  if (!await hasAssignedProjectForSite(client, context, constructionSiteId)) {
    throw new InputError(
      "Diese Baustelle gehört nicht zu einem dir zugeordneten Projekt.",
      403,
      "site_project_access_forbidden"
    );
  }
  return effectiveRoles;
}

async function requireCustomerAccess(client, context, customerId, roles = null) {
  const effectiveRoles = roles || await requirePlanner(client, context);
  if (!hasProjectScopedAccess(effectiveRoles)) return effectiveRoles;
  const result = await client.query(
    `SELECT 1
     FROM projects AS project
     JOIN project_responsibles AS responsible
       ON responsible.company_id = project.company_id
      AND responsible.project_id = project.id
      AND responsible.user_id = $3
      AND responsible.responsibility = 'project_management'
      AND responsible.removed_at IS NULL
     WHERE project.company_id = $1 AND project.customer_id = $2
     LIMIT 1`,
    [context.companyId, customerId, context.userId]
  );
  if (result.rowCount !== 1) {
    throw new InputError(
      "Dieser Kunde gehört nicht zu einem dir zugeordneten Projekt.",
      403,
      "customer_project_access_forbidden"
    );
  }
  return effectiveRoles;
}

async function requireLinkedDocumentAccess(client, context, documentId, roles = null) {
  const effectiveRoles = roles || await requirePlanner(client, context);
  if (!hasProjectScopedAccess(effectiveRoles)) return effectiveRoles;
  const result = await client.query(
    `SELECT 1
     FROM document_links AS link
     LEFT JOIN construction_sites AS site
       ON site.company_id = link.company_id
      AND site.id = link.construction_site_id
     LEFT JOIN projects AS direct_project
       ON direct_project.company_id = link.company_id
      AND direct_project.id = link.project_id
     LEFT JOIN projects AS customer_project
       ON customer_project.company_id = link.company_id
      AND customer_project.customer_id = link.customer_id
     JOIN project_responsibles AS responsible
       ON responsible.company_id = link.company_id
      AND responsible.project_id = COALESCE(
        site.project_id,
        direct_project.id,
        customer_project.id
      )
      AND responsible.user_id = $3
      AND responsible.responsibility = 'project_management'
      AND responsible.removed_at IS NULL
     WHERE link.company_id = $1 AND link.document_id = $2
     LIMIT 1`,
    [context.companyId, documentId, context.userId]
  );
  if (result.rowCount !== 1) {
    throw new InputError(
      "Dieses Dokument gehört nicht zu einem dir zugeordneten Projekt.",
      403,
      "document_project_access_forbidden"
    );
  }
  return effectiveRoles;
}

async function requireDocumentTargetAccess(client, context, input, roles = null) {
  const effectiveRoles = roles || await requirePlanner(client, context);
  if (!hasProjectScopedAccess(effectiveRoles)) return effectiveRoles;
  if (input.constructionSiteId) {
    return requireConstructionSiteAccess(
      client,
      context,
      input.constructionSiteId,
      effectiveRoles
    );
  }
  if (input.projectId) {
    return requireProjectAccess(client, context, input.projectId, effectiveRoles);
  }
  if (input.customerId) {
    return requireCustomerAccess(client, context, input.customerId, effectiveRoles);
  }
  throw new InputError(
    "Projektleiter müssen Dokumente einem zugeordneten Kunden, Projekt oder einer Baustelle zuordnen.",
    403,
    "document_target_access_forbidden"
  );
}

async function requireScopedEntitySiteAccess(
  client,
  context,
  tableName,
  entityId,
  roles = null
) {
  const allowedTables = new Set([
    "site_tasks",
    "site_material_entries",
    "site_notes",
    "site_reports",
    "site_assignments"
  ]);
  if (!allowedTables.has(tableName)) throw new Error("Ungültige Baustellenentität.");
  const effectiveRoles = roles || await requirePlanner(client, context);
  if (!hasProjectScopedAccess(effectiveRoles)) return effectiveRoles;
  const result = await client.query(
    `SELECT construction_site_id FROM ${tableName}
     WHERE company_id = $1 AND id = $2`,
    [context.companyId, entityId]
  );
  if (result.rowCount !== 1) {
    throw new InputError("Der Datensatz wurde nicht gefunden.", 404, "site_entity_not_found");
  }
  return requireConstructionSiteAccess(
    client,
    context,
    result.rows[0].construction_site_id,
    effectiveRoles
  );
}

async function requireAbsenceOfficeReviewer(client, context) {
  const roles = await activeRoleKeys(client, context);
  if (
    hasProjectScopedAccess(roles)
    || ![...roles].some((role) => ABSENCE_OFFICE_REVIEW_ROLES.has(role))
  ) {
    throw new InputError(
      "Die erste Abwesenheitsprüfung ist nur für Büro und Planung freigeschaltet.",
      403,
      "absence_office_review_forbidden"
    );
  }
  return roles;
}

async function requireAbsenceManagementApprover(client, context) {
  const roles = await activeRoleKeys(client, context);
  if (![...roles].some((role) => ABSENCE_MANAGEMENT_APPROVAL_ROLES.has(role))) {
    throw new InputError(
      "Die verbindliche Abwesenheitsfreigabe ist nur für die Geschäftsführung freigeschaltet.",
      403,
      "absence_management_approval_forbidden"
    );
  }
  return roles;
}

// Regel der Firma für eigene Zeitkorrekturen vor der Freigabe des Arbeitstags.
// Die Bearbeitung fremder Zeiten durch das Büro bleibt davon unberührt.
async function companyTimeCorrectionPolicy(client, context) {
  const result = await client.query(
    "SELECT time_correction_policy FROM companies WHERE id = $1",
    [context.companyId]
  );
  return result.rows[0]?.time_correction_policy || "review_required";
}

function ownCorrectionNeedsReview(policy, workDate, timeZone) {
  if (policy === "immediate") return false;
  if (policy === "same_day") {
    return workDate !== localDate(new Date().toISOString(), timeZone);
  }
  return true;
}

async function getTimeCorrectionPolicy(client, context) {
  await requirePlanner(client, context);
  return {
    policy: await companyTimeCorrectionPolicy(client, context),
    options: ["review_required", "same_day", "immediate"]
  };
}

async function updateTimeCorrectionPolicy(client, context, input) {
  await requireTimeAccountAdministrator(client, context);
  const before = await companyTimeCorrectionPolicy(client, context);
  const updated = await client.query(
    `UPDATE companies SET time_correction_policy = $2
     WHERE id = $1
     RETURNING time_correction_policy`,
    [context.companyId, input.policy]
  );
  if (updated.rowCount !== 1) {
    throw new InputError("Die Firma wurde nicht gefunden.", 404, "company_not_found");
  }
  return {
    policy: updated.rows[0].time_correction_policy,
    previousPolicy: before,
    options: ["review_required", "same_day", "immediate"]
  };
}

async function requireTimeAccountAdministrator(client, context) {
  const roles = await activeRoleKeys(client, context);
  if (![...roles].some((role) => MANAGEMENT_ASSIGNER_ROLES.has(role))) {
    throw new InputError(
      "Stundenkonten dürfen nur durch Administration oder Geschäftsführung geändert werden.",
      403,
      "time_account_administration_forbidden"
    );
  }
  return roles;
}

async function requirePasswordReady(client, context) {
  const result = await client.query(
    "SELECT must_change_password FROM users WHERE company_id = $1 AND id = $2 AND status = 'active'",
    [context.companyId, context.userId]
  );
  if (result.rowCount !== 1) {
    throw new InputError("Das Benutzerkonto ist nicht mehr aktiv.", 401, "unauthorized");
  }
  if (result.rows[0].must_change_password) {
    throw new InputError("Bitte zuerst das Startpasswort ändern.", 403, "password_change_required");
  }
}

async function withReadySession(pool, tokenHash, callback) {
  return withSessionTransaction(pool, tokenHash, async (client, context) => {
    await requirePasswordReady(client, context);
    return callback(client, context);
  });
}

function employeeDto(row) {
  return {
    id: row.id,
    personnelNumber: row.personnel_number,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email || null,
    phone: row.phone || null,
    roles: row.roles,
    mustChangePassword: row.must_change_password,
    status: row.status || "active",
    archivedAt: row.archived_at ? new Date(row.archived_at).toISOString() : null,
    archivedReason: row.archived_reason || null,
    trainerUserId: row.trainer_user_id || null,
    // Die Einsatzplanung warnt, wenn auf einer Baustelle niemand mit
    // Fuehrerschein steht - dafuer muss sie die Klassen kennen.
    drivingLicenceClasses: row.driving_licence_classes || [],
    rowVersion: Number(row.row_version || 1)
  };
}

const ABSENCE_REQUEST_SELECT = `
  SELECT request.id, request.user_id, request.absence_type,
         request.start_date, request.end_date, request.day_part,
         request.note, request.status, request.row_version,
         request.created_at, request.updated_at,
         request.office_reviewed_at, request.office_comment,
         request.management_reviewed_at, request.management_comment,
         request.cancelled_at, request.cancellation_reason,
         employee.first_name || ' ' || employee.last_name AS employee_name,
         employee.personnel_number,
         office.first_name || ' ' || office.last_name AS office_reviewed_by_name,
         management.first_name || ' ' || management.last_name AS management_reviewed_by_name,
         canceller.first_name || ' ' || canceller.last_name AS cancelled_by_name,
         (
           SELECT COUNT(*)::INTEGER
           FROM site_assignments AS assignment
           WHERE assignment.company_id = request.company_id
             AND assignment.user_id = request.user_id
             AND assignment.work_date BETWEEN request.start_date AND request.end_date
             AND assignment.status IN ('draft', 'released')
         ) AS assignment_conflict_count,
         COALESCE(
           (
             SELECT jsonb_agg(
               jsonb_build_object(
                 'action', event.action,
                 'status', event.status,
                 'actorName', actor.first_name || ' ' || actor.last_name,
                 'comment', event.comment,
                 'rowVersion', event.request_row_version,
                 'createdAt', event.created_at
               )
               ORDER BY event.request_row_version, event.created_at, event.id
             )
             FROM absence_request_events AS event
             JOIN users AS actor
               ON actor.company_id = event.company_id
              AND actor.id = event.actor_user_id
             WHERE event.company_id = request.company_id
               AND event.absence_request_id = request.id
           ),
           '[]'::jsonb
         ) AS history
  FROM absence_requests AS request
  JOIN users AS employee
    ON employee.company_id = request.company_id
   AND employee.id = request.user_id
  LEFT JOIN users AS office
    ON office.company_id = request.company_id
   AND office.id = request.office_reviewed_by_user_id
  LEFT JOIN users AS management
    ON management.company_id = request.company_id
   AND management.id = request.management_reviewed_by_user_id
  LEFT JOIN users AS canceller
    ON canceller.company_id = request.company_id
   AND canceller.id = request.cancelled_by_user_id
`;

function absenceRequestDto(row) {
  return {
    id: row.id,
    employeeId: row.user_id,
    employeeName: row.employee_name,
    personnelNumber: row.personnel_number,
    absenceType: row.absence_type,
    startDate: databaseDate(row.start_date),
    endDate: databaseDate(row.end_date),
    dayPart: row.day_part,
    note: row.note,
    status: row.status,
    officeReviewedByName: row.office_reviewed_by_name || null,
    officeReviewedAt: row.office_reviewed_at
      ? new Date(row.office_reviewed_at).toISOString()
      : null,
    officeComment: row.office_comment || null,
    managementReviewedByName: row.management_reviewed_by_name || null,
    managementReviewedAt: row.management_reviewed_at
      ? new Date(row.management_reviewed_at).toISOString()
      : null,
    managementComment: row.management_comment || null,
    cancelledByName: row.cancelled_by_name || null,
    cancelledAt: row.cancelled_at ? new Date(row.cancelled_at).toISOString() : null,
    cancellationReason: row.cancellation_reason || null,
    assignmentConflictCount: Number(row.assignment_conflict_count || 0),
    rowVersion: Number(row.row_version),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    history: Array.isArray(row.history) ? row.history : []
  };
}

// Montage- und Tagesberichte stehen im Katalog als eigene Bereiche. Ein Betrieb
// kann den einen fuehren und den anderen abschalten.
function siteReportModuleKey(reportType) {
  return reportType === "daily" ? "site_daily_reports" : "assembly_reports";
}

// Ein abgeschalteter Bereich wird nicht nur ausgeblendet, sondern gesperrt.
// Sonst bliebe er ueber die Schnittstelle weiter bedienbar und der Schalter
// waere eine reine Anzeige.
async function requireEnabledModule(client, context, moduleKey) {
  const modules = await loadCompanyModules(client, context);
  const module = modules.find((entry) => entry.key === moduleKey);
  if (module?.enabled) return module;
  throw new InputError(
    `Der Bereich „${module?.name || moduleKey}" ist für diese Firma abgeschaltet.`,
    409,
    "module_disabled"
  );
}

// Berichtsheft
//
// Wer darf sehen und unterschreiben? Nur der eingetragene Ausbilder. Ein
// Berichtsheft ist persoenlich - es geht weder das Buero noch die
// Geschaeftsfuehrung etwas an, solange sie nicht selbst ausbilden.
async function requireApprenticeTrainer(client, context) {
  const betreut = await client.query(
    "SELECT 1 FROM users WHERE company_id = $1 AND trainer_user_id = $2 AND status = 'active' LIMIT 1",
    [context.companyId, context.userId]
  );
  if (betreut.rowCount === 0) {
    throw new InputError(
      "Ausbildungsnachweise sieht nur der eingetragene Ausbilder.",
      403,
      "apprentice_review_forbidden"
    );
  }
}

async function requireApprentice(client, context) {
  await requireEnabledModule(client, context, APPRENTICE_MODULE_KEY);
  const profile = await loadApprenticeProfile(client, context);
  if (!profile?.isApprentice) {
    throw new InputError(
      "Für dich ist kein Berichtsheft hinterlegt.",
      403,
      "not_an_apprentice"
    );
  }
  return profile;
}

async function getOwnApprenticeReports(client, context, range) {
  const profile = await requireApprentice(client, context);
  const [reports, missingWeeks] = await Promise.all([
    listOwnApprenticeReports(client, context, range),
    // Die Luecken haengen nicht am angezeigten Zeitraum: wer in den Januar
    // blaettert, soll trotzdem sehen, dass der Maerz fehlt.
    listMissingApprenticeWeeks(client, context, context.userId, profile.startedOn)
  ]);
  return { profile, reports, missingWeeks };
}

async function putOwnApprenticeReport(client, context, weekStart, input) {
  await requireApprentice(client, context);
  return saveOwnApprenticeReport(client, context, weekStart, input, { InputError });
}

async function submitApprenticeReport(client, context, weekStart) {
  const profile = await requireApprentice(client, context);
  return submitOwnApprenticeReport(client, context, weekStart, profile, { InputError });
}

async function withdrawApprenticeReport(client, context, weekStart) {
  await requireApprentice(client, context);
  return withdrawOwnApprenticeReport(client, context, weekStart, { InputError });
}

// Der gedruckte Nachweis. Der Auszubildende darf seinen eigenen holen, sein
// Ausbilder ebenfalls - sonst niemand.
async function resolveApprenticeForPrint(client, context, apprenticeUserId) {
  await requireEnabledModule(client, context, APPRENTICE_MODULE_KEY);
  const eigener = !apprenticeUserId || apprenticeUserId === context.userId;
  const profile = await loadApprenticeProfile(client, context, apprenticeUserId || context.userId);
  if (!profile) {
    throw new InputError("Der Auszubildende wurde nicht gefunden.", 404, "employee_not_found");
  }
  if (eigener) {
    if (!profile.isApprentice) {
      throw new InputError("Für dich ist kein Berichtsheft hinterlegt.", 403, "not_an_apprentice");
    }
  } else if (profile.trainerUserId !== context.userId) {
    throw new InputError(
      "Ausbildungsnachweise sieht nur der eingetragene Ausbilder.",
      403,
      "apprentice_review_forbidden"
    );
  }
  return profile;
}

async function apprenticePrintContext(client, context, profile, staticDirectory) {
  const company = await client.query(
    "SELECT legal_name, display_name, logo_object_key FROM companies WHERE id = $1",
    [context.companyId]
  );
  const row = company.rows[0];
  return {
    apprentice: {
      name: profile.name,
      occupation: profile.occupation,
      startedOn: profile.startedOn
    },
    company: { legalName: row.legal_name, displayName: row.display_name },
    companyLogo: await readCompanyLogo(staticDirectory, row.logo_object_key)
  };
}

const apprenticeFileName = (name, teil) =>
  `Berichtsheft-${teil}-${name.replace(/[^A-Za-zÄÖÜäöüß-]+/g, "-")}.pdf`;

async function buildApprenticePdf(
  client, context, weekStart, apprenticeUserId, staticDirectory, preview = false
) {
  const profile = await resolveApprenticeForPrint(client, context, apprenticeUserId);

  const result = await client.query(
    `SELECT *, TO_CHAR(week_start, 'YYYY-MM-DD') AS week_start_text
     FROM apprentice_reports
     WHERE company_id = $1 AND apprentice_user_id = $2 AND week_start = $3::DATE`,
    [context.companyId, profile.userId, weekStart]
  );
  if (result.rowCount !== 1) {
    throw new InputError(
      "Für diese Woche gibt es noch keinen Bericht.",
      404,
      "apprentice_report_not_found"
    );
  }
  const report = apprenticeReportDto(result.rows[0]);
  // Ein Entwurf wird nicht gedruckt. Ein halb ausgefuellter Nachweis auf
  // Papier sieht fertig aus und ist es nicht - im Ordner der Kammer faellt
  // das erst am Ende der Ausbildung auf.
  //
  // Die Vorschau ist etwas anderes als ein Ausdruck: sie zeigt beim Schreiben,
  // wie das Blatt wird, traegt quer darueber "VORSCHAU" und wird im Browser
  // angezeigt statt in den Downloadordner gelegt.
  if (!preview && !PRINTABLE_STATUS.includes(report.status)) {
    throw new InputError(
      "Erst einreichen, dann drucken: ein Entwurf ist noch kein Nachweis.",
      409,
      "apprentice_report_not_submitted"
    );
  }
  const druck = await apprenticePrintContext(client, context, profile, staticDirectory);
  const pdf = await buildApprenticeReportPdf({
    ...druck,
    report,
    apprentice: {
      ...druck.apprentice,
      trainingYear: trainingYear(profile.startedOn, report.weekStart)
    },
    preview
  });
  return {
    content: pdf,
    fileName: apprenticeFileName(
      profile.name, preview ? `${report.weekStart}-Vorschau` : report.weekStart
    ),
    disposition: preview ? "inline" : "attachment"
  };
}

// Ein ganzer Zeitraum in einer Datei, eine Seite je Woche. Woche fuer Woche
// einzeln zu laden und von Hand zu heften ist genau die Arbeit, die diese App
// abnehmen soll - am Ende der Ausbildung sind das gut hundertfuenfzig Blaetter.
async function buildApprenticeBookPdf(client, context, range, apprenticeUserId, staticDirectory) {
  const profile = await resolveApprenticeForPrint(client, context, apprenticeUserId);
  const reports = await listApprenticeReportsForPrint(client, context, profile.userId, range);
  if (reports.length === 0) {
    throw new InputError(
      "In diesem Zeitraum ist kein Wochenbericht eingereicht.",
      404,
      "apprentice_report_not_found"
    );
  }
  const druck = await apprenticePrintContext(client, context, profile, staticDirectory);
  const pdf = await buildApprenticeReportBookPdf({ ...druck, reports });
  return {
    content: pdf,
    fileName: apprenticeFileName(profile.name, `${range.from}-bis-${range.to}`)
  };
}

async function getApprenticeReviews(client, context) {
  await requireEnabledModule(client, context, APPRENTICE_MODULE_KEY);
  await requireApprenticeTrainer(client, context);
  const [reports, gaps] = await Promise.all([
    listApprenticeReviews(client, context),
    listApprenticeGaps(client, context)
  ]);
  return { reports, gaps };
}

async function decideApprenticeReports(client, context, input) {
  await requireEnabledModule(client, context, APPRENTICE_MODULE_KEY);
  await requireApprenticeTrainer(client, context);
  const reviewer = await loadApprenticeProfile(client, context);
  return reviewApprenticeReports(client, context, input, reviewer, { InputError });
}

async function getPlatformAnnouncements(client, context) {
  const result = await client.query(
    `SELECT announcement.id, announcement.title, announcement.message,
            announcement.announcement_type, announcement.publish_at,
            announcement.expires_at, announcement.created_at,
            read_state.read_at
     FROM platform_announcements AS announcement
     LEFT JOIN platform_announcement_reads AS read_state
       ON read_state.announcement_id = announcement.id
      AND read_state.company_id = $1
      AND read_state.user_id = $2
     ORDER BY COALESCE(announcement.publish_at, announcement.created_at) DESC
     LIMIT 20`,
    [context.companyId, context.userId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    message: row.message,
    type: row.announcement_type,
    publishedAt: new Date(row.publish_at || row.created_at).toISOString(),
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    readAt: row.read_at ? new Date(row.read_at).toISOString() : null
  }));
}

async function markPlatformAnnouncementRead(client, context, announcementId) {
  const visible = await client.query(
    "SELECT id FROM platform_announcements WHERE id = $1",
    [announcementId]
  );
  if (visible.rowCount !== 1) {
    throw new InputError("Die Mitteilung wurde nicht gefunden.", 404, "announcement_not_found");
  }
  await client.query(
    `INSERT INTO platform_announcement_reads (announcement_id,company_id,user_id)
     VALUES ($1,$2,$3)
     ON CONFLICT (announcement_id,company_id,user_id) DO NOTHING`,
    [announcementId, context.companyId, context.userId]
  );
  return { id: announcementId, read: true };
}

function vdeInspectionDto(row, includeProtocol = false) {
  return {
    id: row.id,
    clientInspectionId: row.client_inspection_id,
    constructionSiteId: row.construction_site_id,
    number: row.inspection_number,
    name: row.inspection_name,
    inspectionDate: databaseDate(row.inspection_date),
    sourceMode: row.source_mode,
    sourceName: row.source_name || null,
    status: row.status,
    inspectorUserId: row.inspector_user_id,
    inspectorName: row.inspector_name,
    createdByName: row.created_by_name,
    updatedByName: row.updated_by_name,
    originalDocumentId: row.original_document_id || null,
    finalDocumentId: row.final_document_id || null,
    completedByName: row.completed_by_name || null,
    completedAt: row.completed_at
      ? new Date(row.completed_at).toISOString()
      : null,
    rowVersion: Number(row.row_version),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    ...(includeProtocol ? { protocolData: row.protocol_data } : {})
  };
}

const VDE_INSPECTION_SELECT = `
  SELECT inspection.id, inspection.client_inspection_id,
         inspection.construction_site_id, inspection.inspection_number,
         inspection.inspection_name, inspection.inspection_date,
         inspection.source_mode, inspection.source_name,
         inspection.protocol_data, inspection.status,
         inspection.inspector_user_id, inspection.original_document_id,
         inspection.final_document_id, inspection.completed_at,
         inspection.row_version, inspection.created_at, inspection.updated_at,
         inspector.first_name || ' ' || inspector.last_name AS inspector_name,
         creator.first_name || ' ' || creator.last_name AS created_by_name,
         updater.first_name || ' ' || updater.last_name AS updated_by_name,
         CASE WHEN completer.id IS NULL THEN NULL
              ELSE completer.first_name || ' ' || completer.last_name
         END AS completed_by_name
  FROM vde_inspections AS inspection
  JOIN users AS inspector
    ON inspector.company_id = inspection.company_id
   AND inspector.id = inspection.inspector_user_id
  JOIN users AS creator
    ON creator.company_id = inspection.company_id
   AND creator.id = inspection.created_by_user_id
  JOIN users AS updater
    ON updater.company_id = inspection.company_id
   AND updater.id = inspection.updated_by_user_id
  LEFT JOIN users AS completer
    ON completer.company_id = inspection.company_id
   AND completer.id = inspection.completed_by_user_id
`;

async function requireVdeModuleEnabled(client, context) {
  // Die Plattform gibt das Modul frei, die Firma kann es zusaetzlich
  // abschalten. Beides fuehrt zur selben Antwort, damit sich der bisherige
  // Vertrag der Schnittstelle nicht aendert.
  const modules = await loadCompanyModules(client, context);
  const vde = modules.find((module) => module.key === "vde");
  if (!vde?.enabled) {
    throw new InputError(
      "Das VDE-Modul ist für diese Firma nicht aktiviert.",
      404,
      "vde_module_disabled"
    );
  }
}

// ---------------------------------------------------------------------------
// Fuhrpark
// ---------------------------------------------------------------------------

async function requireFleetModuleEnabled(client, context) {
  const modules = await loadCompanyModules(client, context);
  const fleet = modules.find((module) => module.key === "fleet");
  if (!fleet?.enabled) {
    throw new InputError(
      "Der Fuhrpark ist für diese Firma nicht aktiviert.",
      404,
      "fleet_module_disabled"
    );
  }
}

function vehicleDto(row) {
  return {
    id: row.id,
    licencePlate: row.licence_plate,
    label: row.label || null,
    vehicleType: row.vehicle_type,
    requiredLicenceClass: row.required_licence_class,
    assignedUserId: row.assigned_user_id || null,
    assignedUserName: row.assigned_user_name || null,
    status: row.status,
    nextInspectionOn: databaseDate(row.next_inspection_on),
    nextServiceOn: databaseDate(row.next_service_on),
    note: row.note || null,
    rowVersion: Number(row.row_version),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

const VEHICLE_SELECT = `
  SELECT vehicle.*,
         CASE WHEN fahrer.id IS NULL THEN NULL
              ELSE fahrer.first_name || ' ' || fahrer.last_name
         END AS assigned_user_name
  FROM vehicles AS vehicle
  LEFT JOIN users AS fahrer
    ON fahrer.company_id = vehicle.company_id
   AND fahrer.id = vehicle.assigned_user_id
`;

async function listVehicles(client, context) {
  await requirePlanner(client, context);
  await requireFleetModuleEnabled(client, context);
  const result = await client.query(
    `${VEHICLE_SELECT}
     WHERE vehicle.company_id = $1
     ORDER BY vehicle.status, vehicle.licence_plate`,
    [context.companyId]
  );
  return result.rows.map(vehicleDto);
}

async function createVehicle(client, context, input) {
  await requireFullPlanner(client, context);
  await requireFleetModuleEnabled(client, context);
  let inserted;
  try {
    inserted = await client.query(
      `INSERT INTO vehicles (
         company_id, licence_plate, label, vehicle_type, required_licence_class,
         assigned_user_id, status, next_inspection_on, next_service_on, note
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        context.companyId,
        input.licencePlate,
        input.label,
        input.vehicleType,
        input.requiredLicenceClass,
        input.assignedUserId,
        input.status,
        input.nextInspectionOn,
        input.nextServiceOn,
        input.note
      ]
    );
  } catch (error) {
    // Ein doppeltes Kennzeichen ist ein Tippfehler, kein Serverfehler.
    if (error.code === "23505") {
      throw new InputError(
        "Ein Fahrzeug mit diesem Kennzeichen ist bereits eingetragen.",
        409,
        "vehicle_plate_taken"
      );
    }
    if (error.code === "23503") {
      throw new InputError("Der gewählte Fahrer wurde nicht gefunden.", 404, "employee_not_found");
    }
    throw error;
  }
  return getVehicleRecord(client, context, inserted.rows[0].id);
}

async function getVehicleRecord(client, context, vehicleId) {
  const result = await client.query(
    `${VEHICLE_SELECT} WHERE vehicle.company_id = $1 AND vehicle.id = $2`,
    [context.companyId, vehicleId]
  );
  if (result.rowCount !== 1) {
    throw new InputError("Das Fahrzeug wurde nicht gefunden.", 404, "vehicle_not_found");
  }
  return vehicleDto(result.rows[0]);
}

async function updateVehicle(client, context, vehicleId, input) {
  await requireFullPlanner(client, context);
  await requireFleetModuleEnabled(client, context);
  let updated;
  try {
    updated = await client.query(
      `UPDATE vehicles
       SET licence_plate = $3, label = $4, vehicle_type = $5,
           required_licence_class = $6, assigned_user_id = $7, status = $8,
           next_inspection_on = $9, next_service_on = $10, note = $11
       WHERE company_id = $1 AND id = $2 AND row_version = $12
       RETURNING id`,
      [
        context.companyId,
        vehicleId,
        input.licencePlate,
        input.label,
        input.vehicleType,
        input.requiredLicenceClass,
        input.assignedUserId,
        input.status,
        input.nextInspectionOn,
        input.nextServiceOn,
        input.note,
        input.rowVersion
      ]
    );
  } catch (error) {
    if (error.code === "23505") {
      throw new InputError(
        "Ein Fahrzeug mit diesem Kennzeichen ist bereits eingetragen.",
        409,
        "vehicle_plate_taken"
      );
    }
    if (error.code === "23503") {
      throw new InputError("Der gewählte Fahrer wurde nicht gefunden.", 404, "employee_not_found");
    }
    throw error;
  }
  if (updated.rowCount !== 1) {
    // Entweder gibt es das Fahrzeug nicht, oder jemand war schneller. Beides
    // getrennt zu melden hilft dem Buero, das eine vom anderen zu
    // unterscheiden.
    const vorhanden = await client.query(
      "SELECT 1 FROM vehicles WHERE company_id = $1 AND id = $2",
      [context.companyId, vehicleId]
    );
    if (vorhanden.rowCount !== 1) {
      throw new InputError("Das Fahrzeug wurde nicht gefunden.", 404, "vehicle_not_found");
    }
    throw new InputError(
      "Das Fahrzeug wurde zwischenzeitlich geändert. Bitte die Liste aktualisieren.",
      409,
      "row_version_conflict"
    );
  }
  return getVehicleRecord(client, context, vehicleId);
}

function vdePermissions(roles, assigned, planner = hasFullPlannerAccess(roles)) {
  const fieldRole = roles.has("foreman") || roles.has("installer");
  return {
    read: planner || assigned,
    create: planner || (assigned && fieldRole),
    edit: planner || (assigned && fieldRole),
    complete: [...roles].some((role) => VDE_COMPLETION_ROLES.has(role))
      && (planner || assigned),
    importLegacy: planner
  };
}

async function vdeSiteAccess(
  client,
  context,
  constructionSiteId,
  accessDate
) {
  await requireVdeModuleEnabled(client, context);
  const roles = await activeRoleKeys(client, context);
  const planner = hasFullPlannerAccess(roles)
    || (
      hasProjectScopedAccess(roles)
      && await hasAssignedProjectForSite(client, context, constructionSiteId)
    );
  let assigned = false;
  if (!planner) {
    const assignment = await client.query(
      `SELECT 1
       FROM site_assignments
       WHERE company_id = $1
         AND user_id = $2
         AND construction_site_id = $3
         AND work_date = $4
         AND status IN ('released', 'completed')
       LIMIT 1`,
      [
        context.companyId,
        context.userId,
        constructionSiteId,
        accessDate
      ]
    );
    assigned = assignment.rowCount === 1;
  }
  const permissions = vdePermissions(roles, assigned, planner);
  if (!permissions.read) {
    throw new InputError(
      "Diese Baustelle ist dir für das VDE-Modul nicht zugewiesen.",
      403,
      "vde_site_access_forbidden"
    );
  }
  return { roles, planner, assigned, permissions };
}

async function getVdeSiteContext(
  client,
  context,
  constructionSiteId,
  accessDate
) {
  const access = await vdeSiteAccess(
    client,
    context,
    constructionSiteId,
    accessDate
  );
  const siteResult = await client.query(
    `SELECT site.id, site.site_number, site.name AS site_name,
            project.id AS project_id, project.project_number,
            project.name AS project_name,
            customer.id AS customer_id,
            COALESCE(
              customer.company_name,
              customer.first_name || ' ' || customer.last_name
            ) AS customer_name,
            location.street AS site_street,
            location.house_number AS site_house_number,
            location.postal_code AS site_postal_code,
            location.city AS site_city,
            company.legal_name, company.display_name,
            company.street AS company_street,
            company.house_number AS company_house_number,
            company.postal_code AS company_postal_code,
            company.city AS company_city,
            company.phone AS company_phone,
            company.email AS company_email,
            company.website AS company_website,
            company.logo_object_key,
            viewer.first_name || ' ' || viewer.last_name AS viewer_name
     FROM construction_sites AS site
     JOIN projects AS project
       ON project.company_id = site.company_id
      AND project.id = site.project_id
     JOIN customers AS customer
       ON customer.company_id = project.company_id
      AND customer.id = project.customer_id
     LEFT JOIN customer_locations AS location
       ON location.company_id = site.company_id
      AND location.id = site.customer_location_id
     JOIN companies AS company ON company.id = site.company_id
     JOIN users AS viewer
       ON viewer.company_id = site.company_id
      AND viewer.id = $3
     WHERE site.company_id = $1
       AND site.id = $2
       AND site.status <> 'cancelled'
       AND project.status <> 'cancelled'
       AND customer.status <> 'merged'`,
    [context.companyId, constructionSiteId, context.userId]
  );
  if (siteResult.rowCount !== 1) {
    throw new InputError(
      "Die Baustelle wurde nicht gefunden.",
      404,
      "site_not_found"
    );
  }
  const row = siteResult.rows[0];
  const inspectorResult = access.planner
    ? await client.query(
      `SELECT id, personnel_number, first_name, last_name
       FROM users
       WHERE company_id = $1 AND status = 'active'
       ORDER BY LOWER(last_name), LOWER(first_name), personnel_number`,
      [context.companyId]
    )
    : await client.query(
      `SELECT id, personnel_number, first_name, last_name
       FROM users
       WHERE company_id = $1 AND id = $2 AND status = 'active'`,
      [context.companyId, context.userId]
    );
  const inspections = await client.query(
    `${VDE_INSPECTION_SELECT}
     WHERE inspection.company_id = $1
       AND inspection.construction_site_id = $2
     ORDER BY inspection.inspection_date DESC,
              inspection.created_at DESC,
              inspection.id`,
    [context.companyId, constructionSiteId]
  );
  const siteAddress = [
    [row.site_street, row.site_house_number].filter(Boolean).join(" "),
    [row.site_postal_code, row.site_city].filter(Boolean).join(" ")
  ].filter(Boolean).join(", ");
  return {
    accessDate,
    permissions: access.permissions,
    company: {
      displayName: row.display_name,
      legalName: row.legal_name,
      logoUrl: companyLogoUrl(row.logo_object_key)
    },
    customer: {
      id: row.customer_id,
      name: row.customer_name
    },
    project: {
      id: row.project_id,
      number: row.project_number,
      name: row.project_name
    },
    site: {
      id: row.id,
      number: row.site_number,
      name: row.site_name,
      address: siteAddress
    },
    viewer: {
      id: context.userId,
      name: row.viewer_name
    },
    inspectors: inspectorResult.rows.map((inspector) => ({
      id: inspector.id,
      personnelNumber: inspector.personnel_number,
      name: `${inspector.first_name} ${inspector.last_name}`
    })),
    inspections: inspections.rows.map((inspection) => (
      vdeInspectionDto(inspection)
    )),
    companySnapshot: {
      legalName: row.legal_name,
      displayName: row.display_name,
      street: row.company_street,
      houseNumber: row.company_house_number,
      postalCode: row.company_postal_code,
      city: row.company_city,
      phone: row.company_phone,
      email: row.company_email,
      website: row.company_website,
      logoObjectKey: row.logo_object_key
    }
  };
}

function publicVdeSiteContext(siteContext) {
  return {
    accessDate: siteContext.accessDate,
    permissions: siteContext.permissions,
    company: siteContext.company,
    customer: siteContext.customer,
    project: siteContext.project,
    site: siteContext.site,
    viewer: siteContext.viewer,
    inspectors: siteContext.inspectors,
    inspections: siteContext.inspections
  };
}

async function getVdeInspectionRecord(client, context, inspectionId) {
  const result = await client.query(
    `${VDE_INSPECTION_SELECT}
     WHERE inspection.company_id = $1 AND inspection.id = $2`,
    [context.companyId, inspectionId]
  );
  if (result.rowCount !== 1) {
    throw new InputError(
      "Die VDE-Prüfung wurde nicht gefunden.",
      404,
      "vde_inspection_not_found"
    );
  }
  return result.rows[0];
}

function requireVdePermission(permissions, action) {
  if (!permissions[action]) {
    const labels = {
      create: "erstellt",
      edit: "bearbeitet",
      complete: "abgeschlossen",
      importLegacy: "importiert"
    };
    throw new InputError(
      `Die VDE-Prüfung darf mit deiner Rolle nicht ${labels[action] || "verarbeitet"} werden.`,
      403,
      "vde_action_forbidden"
    );
  }
}

async function resolveVdeInspector(client, context, access, inspectorUserId) {
  const selectedId = inspectorUserId || context.userId;
  if (!access.planner && selectedId !== context.userId) {
    throw new InputError(
      "Auf der Baustelle darfst du nur dich selbst als Prüfer auswählen.",
      403,
      "vde_inspector_forbidden"
    );
  }
  const result = await client.query(
    `SELECT id
     FROM users
     WHERE company_id = $1 AND id = $2 AND status = 'active'`,
    [context.companyId, selectedId]
  );
  if (result.rowCount !== 1) {
    throw new InputError(
      "Der ausgewählte Prüfer wurde nicht gefunden.",
      404,
      "vde_inspector_not_found"
    );
  }
  return selectedId;
}

async function createVdeInspection(
  client,
  context,
  input,
  accessDate,
  originalPdf = null
) {
  const siteContext = await getVdeSiteContext(
    client,
    context,
    input.constructionSiteId,
    accessDate
  );
  requireVdePermission(
    siteContext.permissions,
    input.sourceMode === "legacy_v15" ? "importLegacy" : "create"
  );
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    [`vde-inspection:${context.companyId}:${input.clientInspectionId}`]
  );
  const existing = await client.query(
    `SELECT id
     FROM vde_inspections
     WHERE company_id = $1 AND client_inspection_id = $2`,
    [context.companyId, input.clientInspectionId]
  );
  if (existing.rowCount === 1) {
    return {
      inspection: vdeInspectionDto(
        await getVdeInspectionRecord(client, context, existing.rows[0].id),
        true
      ),
      idempotent: true
    };
  }

  const inspectorUserId = await resolveVdeInspector(
    client,
    context,
    { planner: siteContext.permissions.importLegacy },
    input.inspectorUserId
  );
  let originalDocumentId = null;
  if (originalPdf) {
    const stored = await storeDocument(client, context, {
      title: `VDE-Original · ${input.inspectionName}`,
      category: "inspection",
      fileName: originalPdf.fileName,
      mimeType: "application/pdf",
      content: originalPdf.content,
      customerId: null,
      projectId: null,
      constructionSiteId: input.constructionSiteId
    });
    originalDocumentId = stored.document.id;
  }

  const inserted = await client.query(
    `INSERT INTO vde_inspections (
       company_id, construction_site_id, client_inspection_id,
       inspection_number, inspection_name, inspection_date,
       source_mode, source_name, protocol_data, status,
       inspector_user_id, created_by_user_id, updated_by_user_id,
       original_document_id
     ) VALUES (
       $1, $2, $3,
       NULL, $4, $5,
       $6, $7, $8::JSONB, 'draft',
       $9, $10, $10,
       $11
     )
     RETURNING id`,
    [
      context.companyId,
      input.constructionSiteId,
      input.clientInspectionId,
      input.inspectionName,
      input.inspectionDate,
      input.sourceMode,
      input.sourceName,
      JSON.stringify(input.protocolData),
      inspectorUserId,
      context.userId,
      originalDocumentId
    ]
  );
  return {
    inspection: vdeInspectionDto(
      await getVdeInspectionRecord(client, context, inserted.rows[0].id),
      true
    ),
    idempotent: false
  };
}

async function updateVdeInspection(
  client,
  context,
  inspectionId,
  input,
  accessDate
) {
  const current = await getVdeInspectionRecord(client, context, inspectionId);
  const siteContext = await getVdeSiteContext(
    client,
    context,
    current.construction_site_id,
    accessDate
  );
  requireVdePermission(siteContext.permissions, "edit");
  if (current.status !== "draft") {
    throw new InputError(
      "Eine abgeschlossene VDE-Prüfung kann nicht mehr geändert werden.",
      409,
      "vde_inspection_completed"
    );
  }
  const updated = await client.query(
    `UPDATE vde_inspections
     SET inspection_name = $3,
         inspection_date = $4,
         protocol_data = $5::JSONB,
         updated_by_user_id = $6
     WHERE company_id = $1
       AND id = $2
       AND status = 'draft'
       AND row_version = $7
     RETURNING id`,
    [
      context.companyId,
      inspectionId,
      input.inspectionName,
      input.inspectionDate,
      JSON.stringify(input.protocolData),
      context.userId,
      input.rowVersion
    ]
  );
  if (updated.rowCount !== 1) {
    throw new InputError(
      "Die VDE-Prüfung wurde bereits geändert. Bitte neu laden.",
      409,
      "row_version_conflict"
    );
  }
  return vdeInspectionDto(
    await getVdeInspectionRecord(client, context, inspectionId),
    true
  );
}

async function completeVdeInspection(
  client,
  context,
  inspectionId,
  input,
  accessDate,
  staticDirectory
) {
  const current = await getVdeInspectionRecord(client, context, inspectionId);
  const siteContext = await getVdeSiteContext(
    client,
    context,
    current.construction_site_id,
    accessDate
  );
  requireVdePermission(siteContext.permissions, "complete");
  if (current.inspector_user_id !== context.userId) {
    throw new InputError(
      "Die VDE-Prüfung muss vom eingetragenen Prüfer selbst unterschrieben und abgeschlossen werden.",
      403,
      "vde_inspector_signature_forbidden"
    );
  }
  if (current.status !== "draft") {
    throw new InputError(
      "Nur ein VDE-Entwurf kann abgeschlossen werden.",
      409,
      "vde_inspection_state_conflict"
    );
  }
  if (Number(current.row_version) !== input.rowVersion) {
    throw new InputError(
      "Die VDE-Prüfung wurde bereits geändert. Bitte neu laden.",
      409,
      "row_version_conflict"
    );
  }

  const completedAt = new Date().toISOString();
  const company = siteContext.companySnapshot;
  const pdf = await buildVdeInspectionPdf({
    inspection: {
      id: current.id,
      number: current.inspection_number,
      name: input.inspectionName,
      date: input.inspectionDate
    },
    protocol: input.protocolData,
    company,
    context: {
      customerName: siteContext.customer.name,
      projectNumber: siteContext.project.number,
      projectName: siteContext.project.name,
      siteNumber: siteContext.site.number,
      siteName: siteContext.site.name,
      siteAddress: siteContext.site.address,
      inspectorName: current.inspector_name
    },
    inspectorSignature: input.inspectorSignatureData,
    completedAt,
    companyLogo: await readCompanyLogo(
      staticDirectory,
      company.logoObjectKey
    )
  });
  const finalDocument = await storeDocument(client, context, {
    title: `VDE-Prüfprotokoll ${current.inspection_number}`,
    category: "inspection",
    fileName: `${current.inspection_number}-${input.inspectionDate}.pdf`,
    mimeType: "application/pdf",
    content: pdf,
    customerId: null,
    projectId: null,
    constructionSiteId: current.construction_site_id
  });
  const updated = await client.query(
    `UPDATE vde_inspections
     SET inspection_name = $3,
         inspection_date = $4,
         protocol_data = $5::JSONB,
         status = 'completed',
         completed_by_user_id = $6,
         completed_at = $7,
         inspector_signature_data = $8,
         inspector_signed_at = $7,
         final_document_id = $9,
         updated_by_user_id = $6
     WHERE company_id = $1
       AND id = $2
       AND status = 'draft'
       AND row_version = $10
     RETURNING id`,
    [
      context.companyId,
      inspectionId,
      input.inspectionName,
      input.inspectionDate,
      JSON.stringify(input.protocolData),
      context.userId,
      completedAt,
      input.inspectorSignatureData,
      finalDocument.document.id,
      input.rowVersion
    ]
  );
  if (updated.rowCount !== 1) {
    throw new InputError(
      "Die VDE-Prüfung wurde bereits geändert. Bitte neu laden.",
      409,
      "row_version_conflict"
    );
  }
  return vdeInspectionDto(
    await getVdeInspectionRecord(client, context, inspectionId),
    true
  );
}

async function getVdeInspectionPdf(
  client,
  context,
  inspectionId,
  accessDate
) {
  const inspection = await getVdeInspectionRecord(client, context, inspectionId);
  await vdeSiteAccess(
    client,
    context,
    inspection.construction_site_id,
    accessDate
  );
  if (!inspection.final_document_id) {
    throw new InputError(
      "Für diesen VDE-Entwurf gibt es noch keine Abschluss-PDF.",
      409,
      "vde_pdf_not_ready"
    );
  }
  const result = await client.query(
    `SELECT document.original_file_name, document.mime_type, content.content
     FROM documents AS document
     JOIN document_contents AS content
       ON content.company_id = document.company_id
      AND content.document_id = document.id
     WHERE document.company_id = $1
       AND document.id = $2
       AND document.status = 'active'`,
    [context.companyId, inspection.final_document_id]
  );
  if (result.rowCount !== 1) {
    throw new InputError(
      "Die VDE-Abschluss-PDF wurde nicht gefunden.",
      404,
      "vde_pdf_not_found"
    );
  }
  return {
    fileName: result.rows[0].original_file_name,
    mimeType: result.rows[0].mime_type,
    content: result.rows[0].content
  };
}

function siteDto(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    customerId: row.customer_id,
    number: row.site_number,
    name: row.name,
    shortText: row.installer_short_text,
    status: row.status || "active",
    creationSource: row.creation_source || "office",
    fieldReviewStatus: row.field_review_status || "not_required",
    fieldCreatedByName: row.field_created_by_name || null,
    qrCode: row.qr_code || null,
    rowVersion: Number(row.row_version || 1),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    customerName: row.customer_name,
    projectName: row.project_name,
    projectManagerIds: Array.isArray(row.project_manager_ids)
      ? row.project_manager_ids
      : [],
    address: {
      street: row.street,
      houseNumber: row.house_number,
      postalCode: row.postal_code,
      city: row.city
    }
  };
}

function customerDto(row) {
  return {
    id: row.id,
    number: row.customer_number,
    type: row.customer_type,
    displayName: row.customer_type === "company"
      ? row.company_name
      : `${row.first_name} ${row.last_name}`,
    companyName: row.company_name,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    status: row.status || "active",
    rowVersion: Number(row.row_version || 1),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    projectCount: Number(row.project_count || 0),
    address: {
      street: row.billing_street,
      houseNumber: row.billing_house_number,
      postalCode: row.billing_postal_code,
      city: row.billing_city
    }
  };
}

function projectDto(row) {
  return {
    id: row.id,
    customerId: row.customer_id,
    number: row.project_number,
    name: row.name,
    shortText: row.installer_short_text,
    customerName: row.customer_name,
    status: row.status,
    rowVersion: Number(row.row_version || 1),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    siteCount: Number(row.site_count || 0),
    projectManagerId: row.project_manager_id || null,
    projectManagerName: row.project_manager_name || null
  };
}

function documentDto(row) {
  return {
    id: row.id,
    number: row.document_number,
    title: row.title,
    category: row.category,
    fileName: row.original_file_name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    sha256: row.sha256_hex,
    status: row.status,
    mobileVisible: row.mobile_visible !== false,
    offlinePriority: Boolean(row.offline_priority),
    rowVersion: Number(row.row_version),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    uploadedByName: row.uploaded_by_name,
    links: Array.isArray(row.links) ? row.links : []
  };
}

function siteTaskDto(row) {
  return {
    id: row.id,
    constructionSiteId: row.construction_site_id,
    title: row.title,
    details: row.details,
    priority: row.priority,
    status: row.status,
    assignedUserId: row.assigned_user_id,
    assignedUserName: row.assigned_user_name,
    dueDate: row.due_date ? databaseDate(row.due_date) : null,
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    rowVersion: Number(row.row_version),
    createdAt: new Date(row.created_at).toISOString()
  };
}

function siteMaterialDto(row) {
  return {
    id: row.id,
    constructionSiteId: row.construction_site_id,
    itemName: row.item_name,
    quantity: Number(row.quantity),
    unit: row.unit,
    status: row.status,
    note: row.note,
    rowVersion: Number(row.row_version),
    createdAt: new Date(row.created_at).toISOString()
  };
}

function siteNoteDto(row) {
  return {
    id: row.id,
    constructionSiteId: row.construction_site_id,
    clientNoteId: row.client_note_id,
    content: row.content,
    isImportant: row.is_important,
    status: row.status,
    authorUserId: row.author_user_id,
    authorName: row.author_name,
    rowVersion: Number(row.row_version),
    createdAt: new Date(row.created_at).toISOString()
  };
}

function siteReportDto(row) {
  return {
    id: row.id,
    constructionSiteId: row.construction_site_id,
    number: row.report_number,
    reportType: row.report_type,
    workDate: databaseDate(row.work_date),
    sourceMode: row.source_mode,
    summary: row.summary,
    details: row.details,
    structuredData: row.structured_data || {
      workPerformed: row.details || row.summary,
      obstructions: null,
      openItems: null,
      personnel: []
    },
    sourceDocumentId: row.source_document_id,
    siteAssignmentId: row.site_assignment_id || null,
    clientReportId: row.client_report_id || null,
    sourceDocumentFileName: row.source_document_file_name,
    status: row.status,
    authorName: row.author_name,
    approvedByName: row.approved_by_name,
    approvedAt: row.approved_at ? new Date(row.approved_at).toISOString() : null,
    employeeSignatureName: row.employee_signature_name,
    customerSignatureName: row.customer_signature_name,
    finalDocumentId: row.final_document_id,
    finalDocumentFileName: row.final_document_file_name,
    returnComment: row.return_comment || null,
    returnedAt: row.returned_at ? new Date(row.returned_at).toISOString() : null,
    returnedByName: row.returned_by_name || null,
    returnCount: Number(row.return_count || 0),
    rowVersion: Number(row.row_version),
    createdAt: new Date(row.created_at).toISOString()
  };
}

function siteWorkspaceDocumentDto(row) {
  return {
    id: row.id,
    number: row.document_number,
    title: row.title,
    category: row.category,
    fileName: row.original_file_name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    offlinePriority: Boolean(row.offline_priority),
    createdAt: new Date(row.created_at).toISOString(),
    uploadedByName: row.uploaded_by_name
  };
}

function mondayFor(date) {
  const value = new Date(`${date}T00:00:00Z`);
  const weekday = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() - weekday + 1);
  return value.toISOString().slice(0, 10);
}

function addUtcDays(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function monthBounds(date) {
  const [year, month] = date.split("-").map(Number);
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { start, end };
}

function databaseDate(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function timesheetExportRange(url) {
  const from = validateWorkDate(url.searchParams.get("from"));
  const to = validateWorkDate(url.searchParams.get("to"));
  if (to < from) {
    throw new InputError("Das Enddatum darf nicht vor dem Startdatum liegen.");
  }
  const dayCount = Math.floor(
    (new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86_400_000
  ) + 1;
  if (dayCount > 1096) {
    throw new InputError("Ein Excel-Export darf höchstens drei Jahre umfassen.");
  }
  return { from, to };
}

function timesheetExportParameters(url) {
  const range = timesheetExportRange(url);
  const employeeValue = url.searchParams.get("employeeId");
  const employeeId = employeeValue ? validateId(employeeValue, "Mitarbeiter-ID") : null;
  const status = url.searchParams.get("status") || null;
  if (status && !["in_progress", "completed", "billed"].includes(status)) {
    throw new InputError("Der Exportstatus ist ungültig.");
  }
  return { ...range, employeeId, status };
}

function employeeTimesheetExportParameters(url) {
  if (url.searchParams.has("employeeId") || url.searchParams.has("status")) {
    throw new InputError("Der persönliche Export enthält ausschließlich eigene freigegebene Zeiten.");
  }
  return timesheetExportRange(url);
}

async function exportTimesheets(
  client,
  context,
  parameters,
  timeZone,
  { ownApprovedOnly = false, format = "xlsx" } = {}
) {
  if (!ownApprovedOnly) await requireFullPlanner(client, context);
  const employeeId = ownApprovedOnly ? context.userId : parameters.employeeId;
  const [company, dayResult] = await Promise.all([
    client.query(
      "SELECT display_name FROM companies WHERE id = $1",
      [context.companyId]
    ),
    client.query(
      `SELECT day.*, account.personnel_number,
              account.first_name || ' ' || account.last_name AS employee_name,
              (
                SELECT entry.entry_type
                FROM time_entries AS entry
                WHERE entry.company_id = day.company_id
                  AND entry.user_id = day.user_id
                  AND entry.work_day_id = day.id
                  AND entry.invalidated_at IS NULL
                  AND entry.correction_kind IS DISTINCT FROM 'invalidation'
                  AND (
                    (entry.original_entry_id IS NULL AND entry.correction_status IS NULL)
                    OR entry.correction_status = 'approved'
                  )
                ORDER BY entry.recorded_at DESC, entry.created_at DESC, entry.id DESC
                LIMIT 1
              ) AS last_entry_type,
              (
                SELECT COUNT(*)::INTEGER
                FROM time_entries AS entry
                WHERE entry.company_id = day.company_id
                  AND entry.user_id = day.user_id
                  AND entry.work_day_id = day.id
                  AND entry.invalidated_at IS NULL
                  AND entry.correction_kind IS DISTINCT FROM 'invalidation'
                  AND (
                    (entry.original_entry_id IS NULL AND entry.correction_status IS NULL)
                    OR entry.correction_status = 'approved'
                  )
              ) AS entry_count,
              (
                SELECT COUNT(*)::INTEGER
                FROM time_entries AS entry
                WHERE entry.company_id = day.company_id
                  AND entry.user_id = day.user_id
                  AND entry.work_day_id = day.id
                  AND entry.entry_type = 'site_arrival'
                  AND entry.invalidated_at IS NULL
                  AND entry.correction_kind IS DISTINCT FROM 'invalidation'
                  AND (
                    (entry.original_entry_id IS NULL AND entry.correction_status IS NULL)
                    OR entry.correction_status = 'approved'
                  )
              ) AS site_visit_count,
              EXISTS (
                SELECT 1 FROM time_entries AS correction
                WHERE correction.company_id = day.company_id
                  AND correction.user_id = day.user_id
                  AND correction.work_day_id = day.id
                  AND correction.correction_status = 'pending'
              ) AS has_pending_correction,
              COALESCE((
                SELECT ARRAY_AGG(DISTINCT site.name ORDER BY site.name)
                FROM time_entries AS entry
                JOIN construction_sites AS site
                  ON site.company_id = entry.company_id
                 AND site.id = entry.construction_site_id
                WHERE entry.company_id = day.company_id
                  AND entry.user_id = day.user_id
                  AND entry.work_day_id = day.id
                  AND entry.invalidated_at IS NULL
                  AND entry.correction_kind IS DISTINCT FROM 'invalidation'
                  AND (
                    (entry.original_entry_id IS NULL AND entry.correction_status IS NULL)
                    OR entry.correction_status = 'approved'
                  )
              ), ARRAY[]::TEXT[]) AS site_names
       FROM work_days AS day
       JOIN users AS account
         ON account.company_id = day.company_id AND account.id = day.user_id
       WHERE day.company_id = $1
         AND day.work_date BETWEEN $2 AND $3
         AND ($4::UUID IS NULL OR day.user_id = $4)
         AND ($5::BOOLEAN = FALSE OR day.status IN ('approved', 'locked'))
       ORDER BY day.work_date, LOWER(account.last_name), LOWER(account.first_name), day.id`,
      [context.companyId, parameters.from, parameters.to, employeeId, ownApprovedOnly]
    )
  ]);
  let workDays = dayResult.rows.map((day) => ({
    id: day.id,
    personnelNumber: day.personnel_number,
    employeeName: day.employee_name,
    workDate: databaseDate(day.work_date),
    approvalStatus: day.status,
    workflowStatus: workDayWorkflowStatus(day),
    firstClockInAt: day.first_clock_in_at,
    lastClockOutAt: day.last_clock_out_at,
    targetWorkMinutes: day.target_work_minutes,
    grossMinutes: day.gross_minutes,
    breakMinutes: day.break_minutes,
    workMinutes: day.work_minutes,
    travelMinutes: day.travel_minutes,
    overtimeMinutes: day.overtime_minutes,
    siteNames: day.site_names || [],
    warnings: workDayWarnings(day)
  }));
  if (!ownApprovedOnly && parameters.status) {
    workDays = workDays.filter((day) => day.workflowStatus === parameters.status);
  }
  if (ownApprovedOnly && workDays.length === 0) {
    throw new InputError(
      "Im gewählten Zeitraum ist noch kein freigegebener Stundenzettel vorhanden.",
      404,
      "approved_timesheet_not_found"
    );
  }

  const workDayIds = workDays.map((day) => day.id);
  const entries = workDayIds.length === 0
    ? []
    : (await client.query(
      `SELECT entry.id, day.work_date, account.personnel_number,
              account.first_name || ' ' || account.last_name AS employee_name,
              entry.entry_type, entry.recorded_at, entry.source,
              entry.original_entry_id, entry.correction_kind,
              entry.correction_status, entry.correction_reason,
              entry.reviewed_at, entry.invalidated_at,
              CASE WHEN reviewer.id IS NULL THEN NULL
                   ELSE reviewer.first_name || ' ' || reviewer.last_name
              END AS reviewed_by_name,
              site.name AS site_name
       FROM time_entries AS entry
       JOIN work_days AS day
         ON day.company_id = entry.company_id
        AND day.user_id = entry.user_id
        AND day.id = entry.work_day_id
       JOIN users AS account
         ON account.company_id = entry.company_id AND account.id = entry.user_id
       LEFT JOIN construction_sites AS site
         ON site.company_id = entry.company_id AND site.id = entry.construction_site_id
       LEFT JOIN users AS reviewer
         ON reviewer.company_id = entry.company_id
        AND reviewer.id = entry.reviewed_by_user_id
       WHERE entry.company_id = $1 AND entry.work_day_id = ANY($2::UUID[])
       ORDER BY day.work_date, LOWER(account.last_name), LOWER(account.first_name),
                entry.recorded_at, entry.created_at, entry.id`,
      [context.companyId, workDayIds]
    )).rows.map((entry) => ({
      personnelNumber: entry.personnel_number,
      employeeName: entry.employee_name,
      workDate: databaseDate(entry.work_date),
      recordedAt: entry.recorded_at,
      entryType: entry.entry_type,
      siteName: entry.site_name,
      source: entry.source,
      id: entry.id,
      originalEntryId: entry.original_entry_id,
      reason: entry.correction_reason,
      reviewedByName: entry.reviewed_by_name,
      reviewedAt: entry.reviewed_at,
      historyStatus: entry.invalidated_at
        ? "Historisch entwertet"
        : entry.correction_status === "pending"
          ? "Prüfung offen"
          : entry.correction_status === "rejected"
            ? "Abgelehnt"
            : entry.correction_kind === "addition"
              ? "Genehmigte Ergänzung"
              : entry.correction_kind === "replacement"
                ? "Genehmigte Korrektur"
                : entry.correction_kind === "invalidation"
                  ? "Ungültig-Markierung"
                  : "Wirksam"
    }));

  const companyName = company.rows[0]?.display_name || "Schäfchen";
  const ownPrefix = ownApprovedOnly ? "Mein_Stundenzettel" : "Stundenzettel";
  if (format === "pdf") {
    return {
      content: await buildTimesheetPdf({
        companyName,
        from: parameters.from,
        to: parameters.to,
        workDays,
        timeZone
      }),
      fileName: `${ownPrefix}_${parameters.from}_${parameters.to}.pdf`,
      mimeType: "application/pdf"
    };
  }
  return {
    content: await buildTimesheetWorkbook({
      companyName,
      from: parameters.from,
      to: parameters.to,
      workDays,
      entries,
      timeZone
    }),
    fileName: `${ownPrefix}_${parameters.from}_${parameters.to}.xlsx`,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  };
}

async function loadAbsenceRequest(client, context, requestId) {
  const result = await client.query(
    `${ABSENCE_REQUEST_SELECT}
     WHERE request.company_id = $1 AND request.id = $2`,
    [context.companyId, requestId]
  );
  if (result.rowCount !== 1) {
    throw new InputError(
      "Der Abwesenheitsantrag wurde nicht gefunden.",
      404,
      "absence_request_not_found"
    );
  }
  return absenceRequestDto(result.rows[0]);
}

async function listOwnAbsenceRequests(client, context, { from, to }) {
  const result = await client.query(
    `${ABSENCE_REQUEST_SELECT}
     WHERE request.company_id = $1
       AND request.user_id = $2
       AND request.start_date <= $4
       AND request.end_date >= $3
     ORDER BY request.start_date DESC, request.created_at DESC, request.id`,
    [context.companyId, context.userId, from, to]
  );
  return result.rows.map(absenceRequestDto);
}

async function createAbsenceRequest(client, context, input) {
  await requireEnabledModule(client, context, "absences");
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    [`absence:${context.companyId}:${context.userId}`]
  );
  const overlap = await client.query(
    `SELECT 1
     FROM absence_requests
     WHERE company_id = $1
       AND user_id = $2
       AND status IN ('office_review', 'management_review', 'approved')
       AND start_date <= $4
       AND end_date >= $3
     LIMIT 1`,
    [context.companyId, context.userId, input.startDate, input.endDate]
  );
  if (overlap.rowCount) {
    throw new InputError(
      "Für diesen Zeitraum besteht bereits ein offener oder freigegebener Abwesenheitsantrag.",
      409,
      "absence_request_overlap"
    );
  }

  const inserted = await client.query(
    `INSERT INTO absence_requests (
       company_id,
       user_id,
       absence_type,
       start_date,
       end_date,
       day_part,
       note,
       requested_by_user_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $2)
     RETURNING id`,
    [
      context.companyId,
      context.userId,
      input.absenceType,
      input.startDate,
      input.endDate,
      input.dayPart,
      input.note
    ]
  );
  return loadAbsenceRequest(client, context, inserted.rows[0].id);
}

async function cancelOwnAbsenceRequest(client, context, requestId, input) {
  if (input.action !== "cancel") {
    throw new InputError("Für diesen Zugriff ist nur Zurückziehen zulässig.");
  }
  const current = await client.query(
    `SELECT id, user_id, status, row_version
     FROM absence_requests
     WHERE company_id = $1 AND id = $2 AND user_id = $3
     FOR UPDATE`,
    [context.companyId, requestId, context.userId]
  );
  if (current.rowCount !== 1) {
    throw new InputError(
      "Der eigene Abwesenheitsantrag wurde nicht gefunden.",
      404,
      "absence_request_not_found"
    );
  }
  const request = current.rows[0];
  if (!["office_review", "management_review"].includes(request.status)) {
    throw new InputError(
      "Nur ein noch nicht verbindlich freigegebener Antrag kann selbst zurückgezogen werden.",
      409,
      "absence_request_locked"
    );
  }
  if (Number(request.row_version) !== input.rowVersion) {
    throw new InputError(
      "Der Abwesenheitsantrag wurde zwischenzeitlich geändert. Bitte neu laden.",
      409,
      "absence_request_version_conflict"
    );
  }
  await client.query(
    `UPDATE absence_requests
     SET status = 'cancelled',
         cancelled_by_user_id = $3,
         cancelled_at = CURRENT_TIMESTAMP,
         cancellation_reason = $4
     WHERE company_id = $1 AND id = $2 AND row_version = $5`,
    [context.companyId, requestId, context.userId, input.comment, input.rowVersion]
  );
  return loadAbsenceRequest(client, context, requestId);
}

async function reviewAbsenceRequest(client, context, requestId, input) {
  const current = await client.query(
    `SELECT id, user_id, start_date, end_date, day_part,
            status, row_version, office_reviewed_by_user_id
     FROM absence_requests
     WHERE company_id = $1 AND id = $2
     FOR UPDATE`,
    [context.companyId, requestId]
  );
  if (current.rowCount !== 1) {
    throw new InputError(
      "Der Abwesenheitsantrag wurde nicht gefunden.",
      404,
      "absence_request_not_found"
    );
  }
  const request = current.rows[0];
  if (Number(request.row_version) !== input.rowVersion) {
    throw new InputError(
      "Der Abwesenheitsantrag wurde zwischenzeitlich geändert. Bitte neu laden.",
      409,
      "absence_request_version_conflict"
    );
  }

  if (request.status === "office_review") {
    await requireAbsenceOfficeReviewer(client, context);
    if (input.action === "cancel") {
      throw new InputError("Offene eigene Anträge werden vom Mitarbeiter zurückgezogen.");
    }
    const status = input.action === "approve" ? "management_review" : "office_rejected";
    await client.query(
      `UPDATE absence_requests
       SET status = $3,
           office_reviewed_by_user_id = $4,
           office_reviewed_at = CURRENT_TIMESTAMP,
           office_comment = $5
       WHERE company_id = $1 AND id = $2 AND row_version = $6`,
      [context.companyId, requestId, status, context.userId, input.comment, input.rowVersion]
    );
    return loadAbsenceRequest(client, context, requestId);
  }

  if (request.status === "management_review") {
    await requireAbsenceManagementApprover(client, context);
    if (request.office_reviewed_by_user_id === context.userId) {
      throw new InputError(
        "Büroprüfung und verbindliche Freigabe müssen von zwei verschiedenen Konten erfolgen.",
        403,
        "absence_two_person_rule"
      );
    }
    if (input.action === "cancel") {
      throw new InputError("Ein Antrag in Geschäftsführungsprüfung wird genehmigt oder abgelehnt.");
    }
    if (input.action === "approve" && request.day_part === "full_day") {
      await lockAssignmentAvailability(
        client,
        context,
        request.user_id,
        databaseDate(request.start_date),
        databaseDate(request.end_date)
      );
      const conflicts = await client.query(
        `SELECT COUNT(*)::INTEGER AS count
         FROM site_assignments
         WHERE company_id = $1
           AND user_id = $2
           AND work_date BETWEEN $3 AND $4
           AND status IN ('draft', 'released')`,
        [
          context.companyId,
          request.user_id,
          databaseDate(request.start_date),
          databaseDate(request.end_date)
        ]
      );
      if (conflicts.rows[0].count > 0) {
        throw new InputError(
          `Vor der verbindlichen Freigabe müssen ${conflicts.rows[0].count} vorhandene Einsätze verschoben oder storniert werden.`,
          409,
          "absence_assignment_conflict"
        );
      }
    }
    const status = input.action === "approve" ? "approved" : "management_rejected";
    await client.query(
      `UPDATE absence_requests
       SET status = $3,
           management_reviewed_by_user_id = $4,
           management_reviewed_at = CURRENT_TIMESTAMP,
           management_comment = $5
       WHERE company_id = $1 AND id = $2 AND row_version = $6`,
      [context.companyId, requestId, status, context.userId, input.comment, input.rowVersion]
    );
    return loadAbsenceRequest(client, context, requestId);
  }

  if (request.status === "approved" && input.action === "cancel") {
    await requireAbsenceManagementApprover(client, context);
    await client.query(
      `UPDATE absence_requests
       SET status = 'cancelled',
           cancelled_by_user_id = $3,
           cancelled_at = CURRENT_TIMESTAMP,
           cancellation_reason = $4
       WHERE company_id = $1 AND id = $2 AND row_version = $5`,
      [context.companyId, requestId, context.userId, input.comment, input.rowVersion]
    );
    return loadAbsenceRequest(client, context, requestId);
  }

  throw new InputError(
    "Dieser Abwesenheitsantrag ist bereits abschließend bearbeitet.",
    409,
    "absence_request_locked"
  );
}

async function lockAssignmentAvailability(
  client,
  context,
  employeeId,
  startDate,
  endDate = startDate
) {
  await client.query(
    `SELECT pg_advisory_xact_lock(
       hashtextextended(
         'assignment:' || $1::UUID::TEXT || ':' || $2::UUID::TEXT || ':'
           || TO_CHAR(day.work_date, 'YYYY-MM-DD'),
         0
       )
     )
     FROM generate_series($3::DATE, $4::DATE, INTERVAL '1 day') AS day(work_date)
     ORDER BY day.work_date`,
    [context.companyId, employeeId, startDate, endDate]
  );
}

async function lockAssignmentTargets(client, context, targets) {
  const uniqueTargets = new Map();
  targets.forEach(({ employeeId, workDate }) => {
    uniqueTargets.set(`${employeeId}:${workDate}`, { employeeId, workDate });
  });
  for (const target of [...uniqueTargets.values()].sort((left, right) => (
    left.employeeId.localeCompare(right.employeeId)
      || left.workDate.localeCompare(right.workDate)
  ))) {
    await lockAssignmentAvailability(
      client,
      context,
      target.employeeId,
      target.workDate
    );
  }
}

async function assertNoApprovedFullDayAbsence(client, context, employeeId, workDate) {
  const result = await client.query(
    `SELECT absence_type
     FROM absence_requests
     WHERE company_id = $1
       AND user_id = $2
       AND status = 'approved'
       AND day_part = 'full_day'
       AND $3::DATE BETWEEN start_date AND end_date
     LIMIT 1`,
    [context.companyId, employeeId, workDate]
  );
  if (result.rowCount) {
    throw new InputError(
      "Der Mitarbeiter ist an diesem Tag verbindlich abwesend und kann nicht eingeplant werden.",
      409,
      "employee_absent"
    );
  }
}

function holidayClosureDto(row) {
  return {
    id: row.id,
    clientClosureId: row.client_closure_id,
    holidayDate: databaseDate(row.holiday_date),
    name: row.name,
    note: row.note,
    status: row.status,
    createdByName: row.created_by_name,
    createdAt: new Date(row.created_at).toISOString(),
    cancelledByName: row.cancelled_by_name || null,
    cancelledAt: row.cancelled_at ? new Date(row.cancelled_at).toISOString() : null,
    cancellationNote: row.cancellation_note || null,
    rowVersion: Number(row.row_version)
  };
}

async function getHolidayCalendar(client, context, year, includeClosureHistory = false) {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const settingResult = await client.query(
    `SELECT company.country_code AS company_country_code,
            calendar.country_code, calendar.federal_state_code,
            calendar.configured_at, calendar.updated_at, calendar.row_version,
            updater.first_name || ' ' || updater.last_name AS updated_by_name
     FROM companies AS company
     LEFT JOIN company_holiday_calendars AS calendar
       ON calendar.company_id = company.id
     LEFT JOIN users AS updater
       ON updater.company_id = calendar.company_id
      AND updater.id = calendar.updated_by_user_id
     WHERE company.id = $1`,
    [context.companyId]
  );
  if (settingResult.rowCount !== 1) {
    throw new InputError("Die Firma wurde nicht gefunden.", 404, "company_not_found");
  }
  const setting = settingResult.rows[0];
  const countryCode = setting.country_code || setting.company_country_code;
  const federalStateCode = setting.federal_state_code?.trim() || null;
  const holidayResult = await client.query(
    `SELECT holiday_date, holiday_name, holiday_source
     FROM company_holiday_dates($1, $2, $3)
     ORDER BY holiday_date, holiday_name`,
    [context.companyId, yearStart, yearEnd]
  );
  let closures = [];
  if (includeClosureHistory) {
    const closureResult = await client.query(
      `SELECT closure.id, closure.client_closure_id, closure.holiday_date,
              closure.name, closure.note, closure.status, closure.created_at,
              closure.cancelled_at, closure.cancellation_note, closure.row_version,
              creator.first_name || ' ' || creator.last_name AS created_by_name,
              canceller.first_name || ' ' || canceller.last_name AS cancelled_by_name
       FROM company_holiday_closures AS closure
       JOIN users AS creator
         ON creator.company_id = closure.company_id
        AND creator.id = closure.created_by_user_id
       LEFT JOIN users AS canceller
         ON canceller.company_id = closure.company_id
        AND canceller.id = closure.cancelled_by_user_id
       WHERE closure.company_id = $1
         AND closure.holiday_date BETWEEN $2 AND $3
       ORDER BY closure.holiday_date, closure.created_at, closure.id`,
      [context.companyId, yearStart, yearEnd]
    );
    closures = closureResult.rows.map(holidayClosureDto);
  }
  return {
    year,
    configured: Boolean(federalStateCode),
    countryCode,
    federalStateCode,
    federalStateName: FEDERAL_STATE_NAMES.get(federalStateCode) || null,
    configuredAt: setting.configured_at
      ? new Date(setting.configured_at).toISOString()
      : null,
    updatedAt: setting.updated_at
      ? new Date(setting.updated_at).toISOString()
      : null,
    updatedByName: setting.updated_by_name || null,
    rowVersion: Number(setting.row_version || 0),
    holidays: holidayResult.rows.map((holiday) => ({
      date: databaseDate(holiday.holiday_date),
      name: holiday.holiday_name,
      source: holiday.holiday_source
    })),
    closures
  };
}

async function updateHolidayCalendar(client, context, input) {
  await requireTimeAccountAdministrator(client, context);
  const existing = await client.query(
    `SELECT country_code, federal_state_code, row_version
     FROM company_holiday_calendars
     WHERE company_id = $1
     FOR UPDATE`,
    [context.companyId]
  );
  if (existing.rowCount === 0) {
    if (input.rowVersion !== 0) {
      throw new InputError(
        "Der Feiertagskalender wurde zwischenzeitlich angelegt. Bitte neu laden.",
        409,
        "row_version_conflict"
      );
    }
    const inserted = await client.query(
      `INSERT INTO company_holiday_calendars (
         company_id, country_code, federal_state_code, updated_by_user_id
       ) VALUES ($1, $2, $3, $4)
       ON CONFLICT (company_id) DO NOTHING
       RETURNING company_id`,
      [
        context.companyId,
        input.countryCode,
        input.federalStateCode,
        context.userId
      ]
    );
    if (inserted.rowCount !== 1) {
      throw new InputError(
        "Der Feiertagskalender wurde gleichzeitig angelegt. Bitte neu laden.",
        409,
        "row_version_conflict"
      );
    }
  } else {
    const current = existing.rows[0];
    if (Number(current.row_version) !== input.rowVersion) {
      throw new InputError(
        "Der Feiertagskalender wurde zwischenzeitlich geändert. Bitte neu laden.",
        409,
        "row_version_conflict"
      );
    }
    if (
      current.country_code.trim() !== input.countryCode
      || current.federal_state_code?.trim() !== input.federalStateCode
    ) {
      await client.query(
        `UPDATE company_holiday_calendars
         SET country_code = $2,
             federal_state_code = $3,
             updated_by_user_id = $4
         WHERE company_id = $1`,
        [
          context.companyId,
          input.countryCode,
          input.federalStateCode,
          context.userId
        ]
      );
    }
  }
  return getHolidayCalendar(client, context, input.year, true);
}

async function createHolidayClosure(client, context, input) {
  await requireTimeAccountAdministrator(client, context);
  const inserted = await client.query(
    `INSERT INTO company_holiday_closures (
       company_id, client_closure_id, holiday_date,
       name, note, created_by_user_id
     ) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [
      context.companyId,
      input.clientClosureId,
      input.holidayDate,
      input.name,
      input.note,
      context.userId
    ]
  );
  const result = await client.query(
    `SELECT closure.id, closure.client_closure_id, closure.holiday_date,
            closure.name, closure.note, closure.status, closure.created_at,
            closure.cancelled_at, closure.cancellation_note, closure.row_version,
            creator.first_name || ' ' || creator.last_name AS created_by_name,
            canceller.first_name || ' ' || canceller.last_name AS cancelled_by_name
     FROM company_holiday_closures AS closure
     JOIN users AS creator
       ON creator.company_id = closure.company_id
      AND creator.id = closure.created_by_user_id
     LEFT JOIN users AS canceller
       ON canceller.company_id = closure.company_id
      AND canceller.id = closure.cancelled_by_user_id
     WHERE closure.company_id = $1
       AND (
         closure.client_closure_id = $2
         OR (closure.holiday_date = $3 AND closure.status = 'active')
       )
     ORDER BY (closure.client_closure_id = $2) DESC
     LIMIT 1`,
    [context.companyId, input.clientClosureId, input.holidayDate]
  );
  const closure = result.rowCount ? holidayClosureDto(result.rows[0]) : null;
  if (!closure) {
    throw new InputError(
      "Der betriebliche freie Tag konnte nicht angelegt werden.",
      409,
      "holiday_closure_conflict"
    );
  }
  if (closure.clientClosureId !== input.clientClosureId) {
    throw new InputError(
      "Für dieses Datum besteht bereits ein betrieblicher freier Tag.",
      409,
      "holiday_closure_date_conflict"
    );
  }
  if (
    closure.holidayDate !== input.holidayDate
    || closure.name !== input.name
    || (closure.note || null) !== (input.note || null)
  ) {
    throw new InputError(
      "Diese ID für einen freien Tag wurde bereits für andere Angaben verwendet.",
      409,
      "holiday_closure_id_conflict"
    );
  }
  return { closure, idempotent: inserted.rowCount === 0 };
}

async function cancelHolidayClosure(client, context, closureId, input) {
  await requireTimeAccountAdministrator(client, context);
  const currentResult = await client.query(
    `SELECT status, row_version
     FROM company_holiday_closures
     WHERE company_id = $1 AND id = $2
     FOR UPDATE`,
    [context.companyId, closureId]
  );
  if (currentResult.rowCount !== 1) {
    throw new InputError(
      "Der betriebliche freie Tag wurde nicht gefunden.",
      404,
      "holiday_closure_not_found"
    );
  }
  const current = currentResult.rows[0];
  if (Number(current.row_version) !== input.rowVersion) {
    throw new InputError(
      "Der betriebliche freie Tag wurde zwischenzeitlich geändert. Bitte neu laden.",
      409,
      "row_version_conflict"
    );
  }
  if (current.status === "cancelled") {
    throw new InputError(
      "Der betriebliche freie Tag wurde bereits aufgehoben.",
      409,
      "holiday_closure_cancelled"
    );
  }
  await client.query(
    `UPDATE company_holiday_closures
     SET status = 'cancelled',
         cancelled_by_user_id = $3,
         cancellation_note = $4
     WHERE company_id = $1 AND id = $2`,
    [context.companyId, closureId, context.userId, input.cancellationNote]
  );
  const result = await client.query(
    `SELECT closure.id, closure.client_closure_id, closure.holiday_date,
            closure.name, closure.note, closure.status, closure.created_at,
            closure.cancelled_at, closure.cancellation_note, closure.row_version,
            creator.first_name || ' ' || creator.last_name AS created_by_name,
            canceller.first_name || ' ' || canceller.last_name AS cancelled_by_name
     FROM company_holiday_closures AS closure
     JOIN users AS creator
       ON creator.company_id = closure.company_id
      AND creator.id = closure.created_by_user_id
     LEFT JOIN users AS canceller
       ON canceller.company_id = closure.company_id
      AND canceller.id = closure.cancelled_by_user_id
     WHERE closure.company_id = $1 AND closure.id = $2`,
    [context.companyId, closureId]
  );
  return holidayClosureDto(result.rows[0]);
}

function timeAccountAdjustmentDto(row) {
  return {
    id: row.id,
    clientAdjustmentId: row.client_adjustment_id,
    employeeId: row.user_id,
    adjustmentDate: databaseDate(row.adjustment_date),
    adjustmentMinutes: Number(row.adjustment_minutes),
    adjustmentType: row.adjustment_type,
    note: row.note,
    createdByName: row.created_by_name,
    createdAt: new Date(row.created_at).toISOString()
  };
}

async function getTimeAccountEmployee(client, context, employeeId, year) {
  const result = await client.query(
    `SELECT account.id, account.first_name, account.last_name,
            account.personnel_number, account.weekly_target_minutes,
            account.created_at,
            COALESCE(profile.enabled, TRUE) AS time_account_enabled,
            COALESCE(profile.account_start_date, account.created_at::DATE) AS account_start_date,
            COALESCE(entitlement.vacation_days, 30.0) AS annual_vacation_days,
            COALESCE(profile.row_version, 0) AS profile_row_version,
            COALESCE(entitlement.row_version, 0) AS vacation_row_version
     FROM users AS account
     LEFT JOIN time_account_profiles AS profile
       ON profile.company_id = account.company_id
      AND profile.user_id = account.id
     LEFT JOIN time_account_vacation_entitlements AS entitlement
       ON entitlement.company_id = account.company_id
      AND entitlement.user_id = account.id
      AND entitlement.calendar_year = $3
     WHERE account.company_id = $1
       AND account.id = $2
       AND account.status = 'active'`,
    [context.companyId, employeeId, year]
  );
  if (result.rowCount !== 1) {
    throw new InputError("Der Mitarbeiter wurde nicht gefunden.", 404, "employee_not_found");
  }
  return result.rows[0];
}

async function getTimeAccount(client, context, employeeId, year, asOfDate) {
  const employee = await getTimeAccountEmployee(client, context, employeeId, year);
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const lastCompletedDate = addUtcDays(asOfDate, -1);
  const yearBalanceEnd = lastCompletedDate < yearEnd ? lastCompletedDate : yearEnd;
  const yearAdjustmentEnd = asOfDate < yearEnd ? asOfDate : yearEnd;
  const openingEnd = addUtcDays(yearStart, -1);
  const openingBalanceEnd = lastCompletedDate < openingEnd ? lastCompletedDate : openingEnd;
  const openingAdjustmentEnd = asOfDate < openingEnd ? asOfDate : openingEnd;
  const enabled = Boolean(employee.time_account_enabled);
  const accountStartDate = databaseDate(employee.account_start_date);

  let openingDailyMinutes = 0;
  let monthlyRows = [];
  if (enabled) {
    if (accountStartDate <= openingBalanceEnd) {
      const openingDaily = await client.query(
        `SELECT COALESCE(SUM(balance_minutes), 0)::BIGINT AS balance_minutes
         FROM time_account_daily_balances($1, $2, $3, $4)`,
        [context.companyId, employeeId, accountStartDate, openingBalanceEnd]
      );
      openingDailyMinutes = Number(openingDaily.rows[0].balance_minutes);
    }
    if (yearStart <= yearBalanceEnd) {
      const monthly = await client.query(
        `SELECT
           EXTRACT(MONTH FROM work_date)::INTEGER AS month,
           COALESCE(SUM(target_minutes), 0)::BIGINT AS target_minutes,
           COALESCE(SUM(worked_minutes), 0)::BIGINT AS worked_minutes,
           COALESCE(SUM(absence_credit_minutes), 0)::BIGINT AS absence_credit_minutes,
           COALESCE(SUM(balance_minutes), 0)::BIGINT AS balance_minutes
         FROM time_account_daily_balances($1, $2, $3, $4)
         GROUP BY EXTRACT(MONTH FROM work_date)
         ORDER BY month`,
        [context.companyId, employeeId, yearStart, yearBalanceEnd]
      );
      monthlyRows = monthly.rows;
    }
  }

  let openingAdjustmentMinutes = 0;
  if (enabled && accountStartDate <= openingAdjustmentEnd) {
    const openingAdjustments = await client.query(
      `SELECT COALESCE(SUM(adjustment_minutes), 0)::BIGINT AS adjustment_minutes
       FROM time_account_adjustments
       WHERE company_id = $1
         AND user_id = $2
         AND adjustment_date BETWEEN $3 AND $4`,
      [context.companyId, employeeId, accountStartDate, openingAdjustmentEnd]
    );
    openingAdjustmentMinutes = Number(openingAdjustments.rows[0].adjustment_minutes);
  }

  const adjustmentResult = await client.query(
    `SELECT adjustment.id, adjustment.client_adjustment_id,
            adjustment.user_id, adjustment.adjustment_date,
            adjustment.adjustment_minutes, adjustment.adjustment_type,
            adjustment.note, adjustment.created_at,
            creator.first_name || ' ' || creator.last_name AS created_by_name
     FROM time_account_adjustments AS adjustment
     JOIN users AS creator
       ON creator.company_id = adjustment.company_id
      AND creator.id = adjustment.created_by_user_id
     WHERE adjustment.company_id = $1
       AND adjustment.user_id = $2
       AND adjustment.adjustment_date BETWEEN $3 AND $4
     ORDER BY adjustment.adjustment_date DESC, adjustment.created_at DESC`,
    [context.companyId, employeeId, yearStart, yearEnd]
  );
  const adjustments = adjustmentResult.rows.map(timeAccountAdjustmentDto);
  const adjustmentByMonth = new Map();
  if (enabled) {
    adjustments
      .filter((adjustment) => adjustment.adjustmentDate <= yearAdjustmentEnd)
      .forEach((adjustment) => {
        const month = Number(adjustment.adjustmentDate.slice(5, 7));
        adjustmentByMonth.set(
          month,
          (adjustmentByMonth.get(month) || 0) + adjustment.adjustmentMinutes
        );
      });
  }

  const absenceResult = await client.query(
    `WITH absence_days AS (
       SELECT
         request.absence_type,
         request.status,
         CASE request.day_part WHEN 'full_day' THEN 1.0 ELSE 0.5 END AS day_value,
         day.work_date::DATE AS work_date,
         (
           account.weekly_target_minutes
           ->> EXTRACT(ISODOW FROM day.work_date)::INTEGER::TEXT
         )::INTEGER AS target_minutes
       FROM absence_requests AS request
       JOIN users AS account
         ON account.company_id = request.company_id
        AND account.id = request.user_id
       CROSS JOIN LATERAL generate_series(
         GREATEST(request.start_date, $3::DATE, $5::DATE),
         LEAST(request.end_date, $4::DATE),
         INTERVAL '1 day'
       ) AS day(work_date)
       WHERE request.company_id = $1
         AND request.user_id = $2
         AND request.status IN ('office_review', 'management_review', 'approved')
         AND request.end_date >= $3
         AND request.start_date <= $4
     )
     SELECT
       COALESCE(SUM(day_value) FILTER (
         WHERE absence_type = 'vacation'
           AND status = 'approved'
           AND target_minutes > 0
       ), 0) AS vacation_approved_days,
       COALESCE(SUM(day_value) FILTER (
         WHERE absence_type = 'vacation'
           AND status IN ('office_review', 'management_review')
           AND target_minutes > 0
       ), 0) AS vacation_pending_days,
       COALESCE(SUM(day_value) FILTER (
         WHERE absence_type = 'time_off'
           AND status = 'approved'
           AND target_minutes > 0
       ), 0) AS time_off_approved_days
     FROM absence_days`,
    [context.companyId, employeeId, yearStart, yearEnd, accountStartDate]
  );

  const monthlyByNumber = new Map(
    monthlyRows.map((row) => [Number(row.month), row])
  );
  const openingBalanceMinutes = enabled
    ? openingDailyMinutes + openingAdjustmentMinutes
    : 0;
  let closingBalanceMinutes = openingBalanceMinutes;
  const months = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const row = monthlyByNumber.get(month);
    const adjustmentMinutes = adjustmentByMonth.get(month) || 0;
    const targetMinutes = Number(row?.target_minutes || 0);
    const workedMinutes = Number(row?.worked_minutes || 0);
    const absenceCreditMinutes = Number(row?.absence_credit_minutes || 0);
    const changeMinutes = Number(row?.balance_minutes || 0) + adjustmentMinutes;
    closingBalanceMinutes += changeMinutes;
    return {
      month,
      targetMinutes,
      workedMinutes,
      absenceCreditMinutes,
      adjustmentMinutes,
      changeMinutes,
      closingBalanceMinutes
    };
  });
  const vacationApprovedDays = Number(absenceResult.rows[0].vacation_approved_days);
  const vacationPendingDays = Number(absenceResult.rows[0].vacation_pending_days);
  const annualVacationDays = Number(employee.annual_vacation_days);

  return {
    employeeId,
    employeeName: `${employee.first_name} ${employee.last_name}`,
    personnelNumber: employee.personnel_number,
    year,
    asOfDate,
    enabled,
    accountStartDate,
    annualVacationDays,
    profileRowVersion: Number(employee.profile_row_version),
    vacationRowVersion: Number(employee.vacation_row_version),
    openingBalanceMinutes,
    totals: {
      targetMinutes: months.reduce((sum, month) => sum + month.targetMinutes, 0),
      workedMinutes: months.reduce((sum, month) => sum + month.workedMinutes, 0),
      absenceCreditMinutes: months.reduce(
        (sum, month) => sum + month.absenceCreditMinutes,
        0
      ),
      adjustmentMinutes: months.reduce(
        (sum, month) => sum + month.adjustmentMinutes,
        0
      ),
      yearBalanceChangeMinutes: months.reduce(
        (sum, month) => sum + month.changeMinutes,
        0
      ),
      balanceMinutes: closingBalanceMinutes
    },
    vacation: {
      entitlementDays: annualVacationDays,
      approvedDays: vacationApprovedDays,
      pendingDays: vacationPendingDays,
      remainingDays: annualVacationDays - vacationApprovedDays
    },
    timeOff: {
      approvedDays: Number(absenceResult.rows[0].time_off_approved_days)
    },
    months,
    adjustments
  };
}

async function getOwnTimeAccount(client, context, year, asOfDate) {
  const account = await getTimeAccount(client, context, context.userId, year, asOfDate);
  const holidayCalendar = await getHolidayCalendar(client, context, year);
  return { ...account, holidayCalendar };
}

async function getAdminTimeAccounts(client, context, year, asOfDate) {
  await requireFullPlanner(client, context);
  const employees = await client.query(
    `SELECT id
     FROM users
     WHERE company_id = $1 AND status = 'active'
     ORDER BY LOWER(last_name), LOWER(first_name), personnel_number`,
    [context.companyId]
  );
  const accounts = [];
  for (const employee of employees.rows) {
    const account = await getTimeAccount(client, context, employee.id, year, asOfDate);
    const { adjustments: _adjustments, ...overviewAccount } = account;
    accounts.push(overviewAccount);
  }
  const holidayCalendar = await getHolidayCalendar(client, context, year, true);
  return { year, asOfDate, holidayCalendar, accounts };
}

async function updateTimeAccountProfile(client, context, employeeId, input) {
  await requireTimeAccountAdministrator(client, context);
  await getTimeAccountEmployee(client, context, employeeId, input.year);
  const existingProfile = await client.query(
    `SELECT enabled, account_start_date, row_version
     FROM time_account_profiles
     WHERE company_id = $1 AND user_id = $2
     FOR UPDATE`,
    [context.companyId, employeeId]
  );
  if (existingProfile.rowCount === 0) {
    if (input.profileRowVersion !== 0) {
      throw new InputError(
        "Das Stundenkonto wurde zwischenzeitlich angelegt. Bitte neu laden.",
        409,
        "row_version_conflict"
      );
    }
    const inserted = await client.query(
      `INSERT INTO time_account_profiles (
         company_id, user_id, enabled, account_start_date,
         updated_by_user_id
       ) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (company_id, user_id) DO NOTHING
       RETURNING user_id`,
      [
        context.companyId,
        employeeId,
        input.enabled,
        input.accountStartDate,
        context.userId
      ]
    );
    if (inserted.rowCount !== 1) {
      throw new InputError(
        "Das Stundenkonto wurde gleichzeitig angelegt. Bitte neu laden.",
        409,
        "row_version_conflict"
      );
    }
  } else {
    const current = existingProfile.rows[0];
    if (Number(current.row_version) !== input.profileRowVersion) {
      throw new InputError(
        "Das Stundenkonto wurde zwischenzeitlich geändert. Bitte neu laden.",
        409,
        "row_version_conflict"
      );
    }
    const unchanged = current.enabled === input.enabled
      && databaseDate(current.account_start_date) === input.accountStartDate;
    if (!unchanged) {
      await client.query(
        `UPDATE time_account_profiles
         SET enabled = $3,
             account_start_date = $4,
             updated_by_user_id = $5
         WHERE company_id = $1 AND user_id = $2`,
        [
          context.companyId,
          employeeId,
          input.enabled,
          input.accountStartDate,
          context.userId
        ]
      );
    }
  }

  const existingEntitlement = await client.query(
    `SELECT vacation_days, row_version
     FROM time_account_vacation_entitlements
     WHERE company_id = $1 AND user_id = $2 AND calendar_year = $3
     FOR UPDATE`,
    [context.companyId, employeeId, input.year]
  );
  if (existingEntitlement.rowCount === 0) {
    if (input.vacationRowVersion !== 0) {
      throw new InputError(
        "Der Urlaubsanspruch wurde zwischenzeitlich angelegt. Bitte neu laden.",
        409,
        "row_version_conflict"
      );
    }
    const inserted = await client.query(
      `INSERT INTO time_account_vacation_entitlements (
         company_id, user_id, calendar_year, vacation_days, updated_by_user_id
       ) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (company_id, user_id, calendar_year) DO NOTHING
       RETURNING user_id`,
      [
        context.companyId,
        employeeId,
        input.year,
        input.annualVacationDays,
        context.userId
      ]
    );
    if (inserted.rowCount !== 1) {
      throw new InputError(
        "Der Urlaubsanspruch wurde gleichzeitig angelegt. Bitte neu laden.",
        409,
        "row_version_conflict"
      );
    }
  } else {
    const current = existingEntitlement.rows[0];
    if (Number(current.row_version) !== input.vacationRowVersion) {
      throw new InputError(
        "Der Urlaubsanspruch wurde zwischenzeitlich geändert. Bitte neu laden.",
        409,
        "row_version_conflict"
      );
    }
    if (Number(current.vacation_days) !== input.annualVacationDays) {
      await client.query(
        `UPDATE time_account_vacation_entitlements
         SET vacation_days = $4, updated_by_user_id = $5
         WHERE company_id = $1 AND user_id = $2 AND calendar_year = $3`,
        [
          context.companyId,
          employeeId,
          input.year,
          input.annualVacationDays,
          context.userId
        ]
      );
    }
  }

  const updated = await getTimeAccountEmployee(
    client,
    context,
    employeeId,
    input.year
  );
  return {
    employeeId,
    year: input.year,
    enabled: Boolean(updated.time_account_enabled),
    accountStartDate: databaseDate(updated.account_start_date),
    annualVacationDays: Number(updated.annual_vacation_days),
    profileRowVersion: Number(updated.profile_row_version),
    vacationRowVersion: Number(updated.vacation_row_version)
  };
}

async function createTimeAccountAdjustment(client, context, input, asOfDate) {
  await requireTimeAccountAdministrator(client, context);
  await getTimeAccountEmployee(
    client,
    context,
    input.employeeId,
    Number(input.adjustmentDate.slice(0, 4))
  );
  if (input.adjustmentDate > asOfDate) {
    throw new InputError(
      "Eine Stundenkonto-Korrektur darf nicht in der Zukunft liegen.",
      400,
      "future_time_account_adjustment"
    );
  }
  const inserted = await client.query(
    `INSERT INTO time_account_adjustments (
       company_id, user_id, client_adjustment_id, adjustment_date,
       adjustment_minutes, adjustment_type, note, created_by_user_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (company_id, client_adjustment_id) DO NOTHING
     RETURNING id`,
    [
      context.companyId,
      input.employeeId,
      input.clientAdjustmentId,
      input.adjustmentDate,
      input.adjustmentMinutes,
      input.adjustmentType,
      input.note,
      context.userId
    ]
  );
  const result = await client.query(
    `SELECT adjustment.id, adjustment.client_adjustment_id,
            adjustment.user_id, adjustment.adjustment_date,
            adjustment.adjustment_minutes, adjustment.adjustment_type,
            adjustment.note, adjustment.created_at,
            creator.first_name || ' ' || creator.last_name AS created_by_name
     FROM time_account_adjustments AS adjustment
     JOIN users AS creator
       ON creator.company_id = adjustment.company_id
      AND creator.id = adjustment.created_by_user_id
     WHERE adjustment.company_id = $1
       AND adjustment.client_adjustment_id = $2`,
    [context.companyId, input.clientAdjustmentId]
  );
  const adjustment = timeAccountAdjustmentDto(result.rows[0]);
  if (
    adjustment.employeeId !== input.employeeId
    || adjustment.adjustmentDate !== input.adjustmentDate
    || adjustment.adjustmentMinutes !== input.adjustmentMinutes
    || adjustment.adjustmentType !== input.adjustmentType
    || adjustment.note !== input.note
  ) {
    throw new InputError(
      "Diese Buchungs-ID wurde bereits für eine andere Korrektur verwendet.",
      409,
      "time_account_adjustment_id_conflict"
    );
  }
  return { adjustment, idempotent: inserted.rowCount === 0 };
}

async function adminOverview(client, context, date) {
  const roles = await requirePlanner(client, context);
  const projectScopeRestricted = hasProjectScopedAccess(roles);
  const projectScope = projectScopeRestricted
    ? await assignedProjectIds(client, context)
    : null;
  const weekStart = mondayFor(date);
  const weekEnd = addUtcDays(weekStart, 4);
  const reviewWeekEnd = addUtcDays(weekStart, 6);
  const month = monthBounds(date);
  const planningStart = month.start < weekStart ? month.start : weekStart;
  const planningEnd = month.end > reviewWeekEnd ? month.end : reviewWeekEnd;
  const [
    employeeResult,
    customerResult,
    projectResult,
    siteResult,
    assignmentResult,
    documentResult,
    taskResult,
    materialResult,
    noteResult,
    reportResult,
    workDayResult,
    correctionResult,
    absenceResult,
    planningTeamResult,
    projectManagerResult
  ] = await Promise.all([
    client.query(
      `SELECT account.id, account.personnel_number, account.first_name, account.last_name,
              account.email, account.phone,
              account.must_change_password, account.status, account.archived_at,
              account.archived_reason, account.row_version,
              account.trainer_user_id,
              account.driving_licence_classes,
              COALESCE(
                jsonb_agg(role.role_key ORDER BY role.role_key)
                  FILTER (WHERE role.id IS NOT NULL),
                '[]'::jsonb
              ) AS roles
       FROM users AS account
       LEFT JOIN user_roles AS role_assignment
         ON role_assignment.company_id = account.company_id
        AND role_assignment.user_id = account.id
        AND role_assignment.revoked_at IS NULL
       LEFT JOIN roles AS role
         ON role.company_id = role_assignment.company_id
        AND role.id = role_assignment.role_id
        AND role.status = 'active'
       WHERE account.company_id = $1 AND account.status IN ('active', 'archived')
       GROUP BY account.id
       ORDER BY LOWER(account.last_name), LOWER(account.first_name), account.personnel_number`,
      [context.companyId]
    ),
    client.query(
      `SELECT customer.id, customer.customer_number, customer.customer_type,
              customer.company_name, customer.first_name, customer.last_name,
              customer.email, customer.phone, customer.billing_street,
              customer.billing_house_number, customer.billing_postal_code, customer.billing_city,
              customer.status, customer.row_version, customer.updated_at,
              COUNT(project.id) FILTER (WHERE project.status <> 'cancelled') AS project_count
       FROM customers AS customer
       LEFT JOIN projects AS project
         ON project.company_id = customer.company_id AND project.customer_id = customer.id
       WHERE customer.company_id = $1 AND customer.status <> 'merged'
       GROUP BY customer.id
       ORDER BY CASE customer.status WHEN 'active' THEN 1 ELSE 2 END,
                LOWER(COALESCE(customer.company_name, customer.last_name)),
                LOWER(COALESCE(customer.first_name, '')), customer.customer_number`,
      [context.companyId]
    ),
    client.query(
      `SELECT project.id, project.customer_id, project.project_number, project.name,
              project.installer_short_text, project.status, project.row_version, project.updated_at,
              COALESCE(customer.company_name, customer.first_name || ' ' || customer.last_name) AS customer_name,
              COUNT(site.id) FILTER (WHERE site.status <> 'cancelled') AS site_count
       FROM projects AS project
       JOIN customers AS customer
         ON customer.company_id = project.company_id AND customer.id = project.customer_id
       LEFT JOIN construction_sites AS site
         ON site.company_id = project.company_id AND site.project_id = project.id
       WHERE project.company_id = $1
         AND project.status <> 'cancelled'
       GROUP BY project.id, customer.id
       ORDER BY CASE project.status
                  WHEN 'active' THEN 1 WHEN 'planned' THEN 1 WHEN 'on_hold' THEN 1
                  WHEN 'completed' THEN 2 WHEN 'archived' THEN 3 ELSE 4
                END,
                LOWER(COALESCE(customer.company_name, customer.last_name)),
                LOWER(project.name), project.project_number`,
      [context.companyId]
    ),
    client.query(
      `SELECT site.id, site.project_id, project.customer_id, site.site_number, site.name, site.installer_short_text,
              site.qr_code,
              site.status, site.row_version, site.updated_at,
              site.creation_source, site.field_review_status,
              project.name AS project_name,
              COALESCE(customer.company_name, customer.first_name || ' ' || customer.last_name) AS customer_name,
              COALESCE(
                (
                  SELECT jsonb_agg(
                    responsible.user_id
                    ORDER BY responsible.is_primary DESC,
                             responsible.assigned_at,
                             responsible.id
                  )
                  FROM project_responsibles AS responsible
                  WHERE responsible.company_id = site.company_id
                    AND responsible.project_id = site.project_id
                    AND responsible.responsibility = 'project_management'
                    AND responsible.removed_at IS NULL
                ),
                '[]'::jsonb
              ) AS project_manager_ids,
              CASE WHEN field_creator.id IS NULL THEN NULL
                   ELSE field_creator.first_name || ' ' || field_creator.last_name
              END AS field_created_by_name,
              location.street, location.house_number, location.postal_code, location.city
       FROM construction_sites AS site
       JOIN projects AS project
         ON project.company_id = site.company_id AND project.id = site.project_id
       JOIN customers AS customer
         ON customer.company_id = project.company_id AND customer.id = project.customer_id
       LEFT JOIN customer_locations AS location
         ON location.company_id = site.company_id AND location.id = site.customer_location_id
       LEFT JOIN users AS field_creator
         ON field_creator.company_id = site.company_id
        AND field_creator.id = site.field_created_by_user_id
       WHERE site.company_id = $1
         AND site.status <> 'cancelled'
       ORDER BY
         CASE site.status
           WHEN 'active' THEN 1 WHEN 'planned' THEN 1 WHEN 'on_hold' THEN 1 WHEN 'delayed' THEN 1
           WHEN 'completed' THEN 2 WHEN 'archived' THEN 3 ELSE 4
         END,
         LOWER(site.name), site.site_number`,
      [context.companyId]
    ),
    client.query(
      `SELECT assignment.id, assignment.user_id, assignment.construction_site_id,
              assignment.work_date,
              assignment.sequence_number, assignment.planned_start_time::TEXT,
              assignment.planned_duration_minutes, assignment.comment,
              assignment.status, assignment.planning_template_key,
              assignment.report_responsible, assignment.report_responsibility_source,
              assignment.row_version,
              account.first_name, account.last_name, site.name AS site_name
       FROM site_assignments AS assignment
       JOIN users AS account
         ON account.company_id = assignment.company_id AND account.id = assignment.user_id
       JOIN construction_sites AS site
         ON site.company_id = assignment.company_id AND site.id = assignment.construction_site_id
       WHERE assignment.company_id = $1
         AND assignment.work_date BETWEEN $2 AND $3
         AND assignment.status IN ('draft', 'released')
       ORDER BY assignment.work_date, LOWER(account.last_name), LOWER(account.first_name), assignment.sequence_number`,
      [context.companyId, planningStart, planningEnd]
    ),
    client.query(
      `SELECT document.id, document.document_number, document.title, document.category,
              document.original_file_name, document.mime_type, document.size_bytes,
              document.sha256_hex, document.status, document.mobile_visible,
              document.offline_priority, document.row_version,
              document.created_at, document.updated_at,
              uploader.first_name || ' ' || uploader.last_name AS uploaded_by_name,
              COALESCE(
                jsonb_agg(
                  jsonb_build_object(
                    'entityType', link.entity_type,
                    'customerId', link.customer_id,
                    'projectId', link.project_id,
                    'constructionSiteId', link.construction_site_id,
                    'targetName', CASE link.entity_type
                      WHEN 'customer' THEN COALESCE(customer.company_name, customer.first_name || ' ' || customer.last_name)
                      WHEN 'project' THEN project.name
                      WHEN 'construction_site' THEN site.name
                    END
                  ) ORDER BY link.created_at, link.id
                ) FILTER (WHERE link.id IS NOT NULL),
                '[]'::jsonb
              ) AS links
       FROM documents AS document
       JOIN users AS uploader
         ON uploader.company_id = document.company_id AND uploader.id = document.uploaded_by_user_id
       LEFT JOIN document_links AS link
         ON link.company_id = document.company_id AND link.document_id = document.id
       LEFT JOIN customers AS customer
         ON customer.company_id = link.company_id AND customer.id = link.customer_id
       LEFT JOIN projects AS project
         ON project.company_id = link.company_id AND project.id = link.project_id
       LEFT JOIN construction_sites AS site
         ON site.company_id = link.company_id AND site.id = link.construction_site_id
       WHERE document.company_id = $1
       GROUP BY document.id, uploader.id
       ORDER BY CASE document.status WHEN 'active' THEN 1 ELSE 2 END,
                document.created_at DESC, document.document_number DESC`,
      [context.companyId]
    ),
    client.query(
      `SELECT task.id, task.construction_site_id, task.title, task.details,
              task.priority, task.status, task.assigned_user_id, task.due_date,
              task.completed_at, task.row_version, task.created_at,
              CASE WHEN assignee.id IS NULL THEN NULL ELSE assignee.first_name || ' ' || assignee.last_name END AS assigned_user_name
       FROM site_tasks AS task
       LEFT JOIN users AS assignee
         ON assignee.company_id = task.company_id AND assignee.id = task.assigned_user_id
       WHERE task.company_id = $1
       ORDER BY CASE task.status WHEN 'open' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'done' THEN 3 ELSE 4 END,
                task.due_date NULLS LAST, task.created_at DESC`,
      [context.companyId]
    ),
    client.query(
      `SELECT eintrag.id, eintrag.construction_site_id, eintrag.item_name,
              eintrag.quantity, eintrag.unit, eintrag.status, eintrag.note,
              eintrag.row_version, eintrag.created_at
       FROM site_material_entries AS eintrag
       WHERE eintrag.company_id = $1
       ORDER BY CASE eintrag.status WHEN 'planned' THEN 1 WHEN 'ordered' THEN 2 WHEN 'available' THEN 3 WHEN 'used' THEN 4 ELSE 5 END,
                eintrag.created_at DESC`,
      [context.companyId]
    ),
    client.query(
      `SELECT note.id, note.construction_site_id, note.author_user_id,
              note.client_note_id, note.content, note.is_important,
              note.status, note.row_version, note.created_at,
              author.first_name || ' ' || author.last_name AS author_name
       FROM site_notes AS note
       JOIN users AS author
         ON author.company_id = note.company_id AND author.id = note.author_user_id
       WHERE note.company_id = $1
       ORDER BY CASE note.status WHEN 'active' THEN 1 ELSE 2 END,
                note.is_important DESC, note.created_at DESC`,
      [context.companyId]
    ),
    client.query(
      `SELECT report.id, report.construction_site_id, report.report_number,
              report.report_type, report.work_date, report.source_mode,
              report.summary, report.details, report.structured_data, report.source_document_id,
              report.site_assignment_id, report.client_report_id,
              report.status, report.approved_at, report.employee_signature_name,
              report.customer_signature_name, report.final_document_id,
              report.return_comment, report.returned_at, report.return_count,
              report.row_version, report.created_at,
              author.first_name || ' ' || author.last_name AS author_name,
              approver.first_name || ' ' || approver.last_name AS approved_by_name,
              returned_by.first_name || ' ' || returned_by.last_name AS returned_by_name,
              document.original_file_name AS source_document_file_name,
              final_document.original_file_name AS final_document_file_name
       FROM site_reports AS report
       JOIN users AS author
         ON author.company_id = report.company_id AND author.id = report.author_user_id
       LEFT JOIN documents AS document
         ON document.company_id = report.company_id AND document.id = report.source_document_id
       LEFT JOIN users AS approver
         ON approver.company_id = report.company_id AND approver.id = report.approved_by_user_id
       LEFT JOIN users AS returned_by
         ON returned_by.company_id = report.company_id
        AND returned_by.id = report.returned_by_user_id
       LEFT JOIN documents AS final_document
         ON final_document.company_id = report.company_id AND final_document.id = report.final_document_id
       WHERE report.company_id = $1
       ORDER BY report.work_date DESC, report.created_at DESC`,
      [context.companyId]
    ),
    client.query(
      `SELECT day.*, account.first_name || ' ' || account.last_name AS employee_name,
              (
                SELECT entry.entry_type
                FROM time_entries AS entry
                WHERE entry.company_id = day.company_id
                  AND entry.user_id = day.user_id
                  AND entry.work_day_id = day.id
                  AND entry.invalidated_at IS NULL
                  AND entry.correction_kind IS DISTINCT FROM 'invalidation'
                  AND (
                    (entry.original_entry_id IS NULL AND entry.correction_status IS NULL)
                    OR entry.correction_status = 'approved'
                  )
                ORDER BY entry.recorded_at DESC, entry.created_at DESC, entry.id DESC
                LIMIT 1
              ) AS last_entry_type,
              (
                SELECT COUNT(*)::INTEGER
                FROM time_entries AS entry
                WHERE entry.company_id = day.company_id
                  AND entry.user_id = day.user_id
                  AND entry.work_day_id = day.id
                  AND entry.invalidated_at IS NULL
                  AND entry.correction_kind IS DISTINCT FROM 'invalidation'
                  AND (
                    (entry.original_entry_id IS NULL AND entry.correction_status IS NULL)
                    OR entry.correction_status = 'approved'
                  )
              ) AS entry_count,
              (
                SELECT COUNT(*)::INTEGER
                FROM time_entries AS entry
                WHERE entry.company_id = day.company_id
                  AND entry.user_id = day.user_id
                  AND entry.work_day_id = day.id
                  AND entry.entry_type = 'site_arrival'
                  AND entry.invalidated_at IS NULL
                  AND entry.correction_kind IS DISTINCT FROM 'invalidation'
                  AND (
                    (entry.original_entry_id IS NULL AND entry.correction_status IS NULL)
                    OR entry.correction_status = 'approved'
                  )
              ) AS site_visit_count,
              EXISTS (
                SELECT 1 FROM time_entries AS correction
                WHERE correction.company_id = day.company_id
                  AND correction.user_id = day.user_id
                  AND correction.work_day_id = day.id
                  AND correction.correction_status = 'pending'
              ) AS has_pending_correction
       FROM work_days AS day
       JOIN users AS account
         ON account.company_id = day.company_id AND account.id = day.user_id
       WHERE day.company_id = $1
         AND day.work_date BETWEEN $2 AND $3
       ORDER BY day.work_date DESC,
                LOWER(account.last_name), LOWER(account.first_name), day.id`,
      [context.companyId, weekStart, reviewWeekEnd]
    ),
    client.query(
      `SELECT correction.id, correction.user_id, correction.work_day_id,
              correction.work_date, correction.original_entry_id,
              correction.correction_kind,
              correction.edit_operation_id,
              operation.action AS operation_action,
              correction.entry_type, correction.requested_recorded_at,
              correction.original_recorded_at, correction.correction_reason,
              correction.requested_at, 'pending'::TEXT AS correction_status,
              NULL::TIMESTAMPTZ AS reviewed_at,
              account.first_name || ' ' || account.last_name AS employee_name
       FROM pending_time_entry_corrections_v2 AS correction
       LEFT JOIN time_change_operations AS operation
         ON operation.company_id = correction.company_id
        AND operation.id = correction.edit_operation_id
       JOIN users AS account
         ON account.company_id = correction.company_id
        AND account.id = correction.user_id
       WHERE correction.company_id = $1
       ORDER BY correction.work_date DESC, correction.requested_at, correction.id`,
      [context.companyId]
    ),
    client.query(
      `${ABSENCE_REQUEST_SELECT}
       WHERE request.company_id = $1
         AND (
           request.status IN ('office_review', 'management_review')
           OR (
             request.start_date <= $3
             AND request.end_date >= $2
           )
         )
       ORDER BY
         CASE request.status
           WHEN 'office_review' THEN 1
           WHEN 'management_review' THEN 2
           WHEN 'approved' THEN 3
           ELSE 4
         END,
         request.start_date,
         LOWER(employee.last_name),
         LOWER(employee.first_name),
         request.created_at`,
      [context.companyId, planningStart, planningEnd]
    ),
    client.query(
      `SELECT team.id, team.name, team.status, team.row_version,
              team.created_at, team.updated_at,
              COALESCE(
                jsonb_agg(
                  jsonb_build_object(
                    'userId', member.user_id,
                    'employeeName', account.first_name || ' ' || account.last_name
                  )
                  ORDER BY LOWER(account.last_name), LOWER(account.first_name), member.user_id
                ) FILTER (WHERE member.user_id IS NOT NULL),
                '[]'::jsonb
              ) AS members
       FROM planning_teams AS team
       LEFT JOIN planning_team_members AS member
         ON member.company_id = team.company_id
        AND member.planning_team_id = team.id
        AND member.ended_at IS NULL
       LEFT JOIN users AS account
         ON account.company_id = member.company_id
        AND account.id = member.user_id
       WHERE team.company_id = $1
       GROUP BY team.id
       ORDER BY CASE team.status WHEN 'active' THEN 1 ELSE 2 END, LOWER(team.name), team.id`,
      [context.companyId]
    ),
    client.query(
      `SELECT responsible.project_id,
              responsible.user_id AS project_manager_id,
              account.first_name || ' ' || account.last_name AS project_manager_name
       FROM project_responsibles AS responsible
       JOIN users AS account
         ON account.company_id = responsible.company_id
        AND account.id = responsible.user_id
       WHERE responsible.company_id = $1
         AND responsible.responsibility = 'project_management'
         AND responsible.removed_at IS NULL
       ORDER BY responsible.project_id, responsible.is_primary DESC,
                responsible.assigned_at, responsible.id`,
      [context.companyId]
    )
  ]);

  const weekAssignments = assignmentResult.rows.map((row) => ({
    id: row.id,
    employeeId: row.user_id,
    constructionSiteId: row.construction_site_id,
    workDate: databaseDate(row.work_date),
    sequenceNumber: row.sequence_number,
    plannedStartTime: row.planned_start_time,
    plannedDurationMinutes: row.planned_duration_minutes === null
      ? null
      : Number(row.planned_duration_minutes),
    comment: row.comment,
    status: row.status,
    planningTeamId: row.planning_template_key || null,
    reportResponsible: row.report_responsible,
    reportResponsibilitySource: row.report_responsibility_source,
    rowVersion: Number(row.row_version),
    employeeName: `${row.first_name} ${row.last_name}`,
    siteName: row.site_name
  }));
  const modules = await loadCompanyModules(client, context);
  const vdeEnabled = modules.some((module) => (
    module.key === "vde" && module.enabled
  ));
  const vdeInspectionResult = vdeEnabled
    ? await client.query(
      `${VDE_INSPECTION_SELECT}
       WHERE inspection.company_id = $1
       ORDER BY inspection.inspection_date DESC,
                inspection.created_at DESC,
                inspection.id`,
      [context.companyId]
    )
    : { rows: [] };

  const managerByProject = new Map();
  projectManagerResult.rows.forEach((manager) => {
    if (!managerByProject.has(manager.project_id)) {
      managerByProject.set(manager.project_id, manager);
    }
  });
  const allProjects = projectResult.rows.map((project) => projectDto({
    ...project,
    ...(managerByProject.get(project.id) || {})
  }));
  const projects = projectScopeRestricted
    ? allProjects.filter((project) => projectScope.has(project.id))
    : allProjects;
  const visibleProjectIds = new Set(projects.map((project) => project.id));
  const allSites = siteResult.rows.map(siteDto);
  const sites = projectScopeRestricted
    ? allSites.filter((site) => visibleProjectIds.has(site.projectId))
    : allSites;
  const visibleSiteIds = new Set(sites.map((site) => site.id));
  const visibleCustomerIds = new Set(projects.map((project) => project.customerId));
  const customers = customerResult.rows
    .map(customerDto)
    .filter((customer) => !projectScopeRestricted || visibleCustomerIds.has(customer.id))
    .map((customer) => projectScopeRestricted ? {
      ...customer,
      projectCount: projects.filter((project) => project.customerId === customer.id).length
    } : customer);
  const documents = documentResult.rows
    .map(documentDto)
    .map((document) => projectScopeRestricted ? {
      ...document,
      links: document.links.filter((link) => (
        (link.entityType === "construction_site" && visibleSiteIds.has(link.constructionSiteId))
        || (link.entityType === "project" && visibleProjectIds.has(link.projectId))
        || (link.entityType === "customer" && visibleCustomerIds.has(link.customerId))
      ))
    } : document)
    .filter((document) => !projectScopeRestricted || document.links.length > 0);
  const visibleWeekAssignments = projectScopeRestricted
    ? weekAssignments.filter((assignment) => visibleSiteIds.has(assignment.constructionSiteId))
    : weekAssignments;
  const onlyVisibleSiteRecords = (rows, mapper) => rows
    .filter((row) => !projectScopeRestricted || visibleSiteIds.has(row.construction_site_id))
    .map(mapper);

  return {
    date,
    weekStart,
    planningStart,
    planningEnd,
    canCreateManagementRoles: [...roles].some((role) => MANAGEMENT_ASSIGNER_ROLES.has(role)),
    projectScopeRestricted,
    canReviewAbsenceOffice: !projectScopeRestricted
      && [...roles].some((role) => ABSENCE_OFFICE_REVIEW_ROLES.has(role)),
    canApproveAbsenceManagement: [...roles].some(
      (role) => ABSENCE_MANAGEMENT_APPROVAL_ROLES.has(role)
    ),
    employees: employeeResult.rows.filter((row) => row.status === "active").map(employeeDto),
    archivedEmployees: employeeResult.rows.filter((row) => row.status === "archived").map(employeeDto),
    customers,
    projects,
    sites,
    planningTeams: planningTeamResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      rowVersion: Number(row.row_version),
      members: row.members
    })),
    documents,
    siteTasks: onlyVisibleSiteRecords(taskResult.rows, siteTaskDto),
    siteMaterials: onlyVisibleSiteRecords(materialResult.rows, siteMaterialDto),
    siteNotes: onlyVisibleSiteRecords(noteResult.rows, siteNoteDto),
    siteReports: onlyVisibleSiteRecords(reportResult.rows, siteReportDto),
    // Der Modulstand steht in der Sitzung. Er stand zusaetzlich hier und war
    // damit eine zweite Quelle fuer dieselbe Angabe.
    vdeInspections: onlyVisibleSiteRecords(
      vdeInspectionResult.rows,
      (inspection) => vdeInspectionDto(inspection)
    ),
    workDays: projectScopeRestricted ? [] : workDayResult.rows.map(adminWorkDayDto),
    timeCorrections: projectScopeRestricted
      ? []
      : correctionResult.rows.map(timeEntryCorrectionDto),
    absences: projectScopeRestricted ? [] : absenceResult.rows.map(absenceRequestDto),
    assignments: visibleWeekAssignments.filter((assignment) => assignment.workDate === date),
    weekAssignments: visibleWeekAssignments.filter((assignment) => (
      assignment.workDate >= weekStart && assignment.workDate <= weekEnd
    )),
    planningAssignments: visibleWeekAssignments
  };
}

async function requireSiteWorkspaceAccess(client, context, constructionSiteId, date) {
  const roles = await activeRoleKeys(client, context);
  const canManage = hasFullPlannerAccess(roles)
    || (
      hasProjectScopedAccess(roles)
      && await hasAssignedProjectForSite(client, context, constructionSiteId)
    );
  const assignment = await client.query(
    `SELECT id, sequence_number, planned_start_time::TEXT,
            planned_duration_minutes, comment, report_responsible
     FROM site_assignments
     WHERE company_id = $1
       AND user_id = $2
       AND construction_site_id = $3
       AND work_date = $4
       AND status IN ('released', 'completed')
     ORDER BY report_responsible DESC, sequence_number
     LIMIT 1`,
    [context.companyId, context.userId, constructionSiteId, date]
  );
  const canLead = canManage
    || roles.has("foreman")
    || Boolean(assignment.rows[0]?.report_responsible);

  if (!canManage && assignment.rowCount !== 1) {
    throw new InputError(
      "Diese Baustelle ist dir für den gewählten Tag nicht zugewiesen.",
      403,
      "site_not_assigned"
    );
  }

  return {
    roles,
    canManage,
    canLead,
    assignmentId: assignment.rows[0]?.id || null,
    reportResponsible: Boolean(assignment.rows[0]?.report_responsible),
    assignment: assignment.rowCount === 1 ? {
      id: assignment.rows[0].id,
      sequenceNumber: assignment.rows[0].sequence_number,
      plannedStartTime: assignment.rows[0].planned_start_time,
      plannedDurationMinutes: assignment.rows[0].planned_duration_minutes === null
        ? null
        : Number(assignment.rows[0].planned_duration_minutes),
      comment: assignment.rows[0].comment
    } : null
  };
}

async function getSiteWorkspace(client, context, constructionSiteId, date) {
  const siteResult = await client.query(
    `SELECT site.id, site.project_id, project.customer_id, site.site_number,
            site.name, site.installer_short_text, site.status, site.row_version,
            site.qr_code,
            site.updated_at, project.name AS project_name,
            COALESCE(customer.company_name, customer.first_name || ' ' || customer.last_name) AS customer_name,
            location.street, location.house_number, location.postal_code, location.city
     FROM construction_sites AS site
     JOIN projects AS project
       ON project.company_id = site.company_id AND project.id = site.project_id
     JOIN customers AS customer
       ON customer.company_id = project.company_id AND customer.id = project.customer_id
     LEFT JOIN customer_locations AS location
       ON location.company_id = site.company_id AND location.id = site.customer_location_id
     WHERE site.company_id = $1
       AND site.id = $2
       AND site.status <> 'cancelled'`,
    [context.companyId, constructionSiteId]
  );
  if (siteResult.rowCount !== 1) {
    throw new InputError("Die Baustelle wurde nicht gefunden.", 404, "site_not_found");
  }

  const access = await requireSiteWorkspaceAccess(client, context, constructionSiteId, date);
  const [teamResult, documentResult, taskResult, materialResult, noteResult, reportResult] = await Promise.all([
    client.query(
      `SELECT account.id, account.first_name, account.last_name,
              account.email, account.phone,
              BOOL_OR(assignment.report_responsible) AS report_responsible,
              MAX(assignment.planned_duration_minutes) AS planned_duration_minutes,
              COALESCE(
                jsonb_agg(DISTINCT role.role_key)
                  FILTER (WHERE role.id IS NOT NULL),
                '[]'::jsonb
              ) AS roles
       FROM site_assignments AS assignment
       JOIN users AS account
         ON account.company_id = assignment.company_id AND account.id = assignment.user_id
       LEFT JOIN user_roles AS role_assignment
         ON role_assignment.company_id = account.company_id
        AND role_assignment.user_id = account.id
        AND role_assignment.revoked_at IS NULL
       LEFT JOIN roles AS role
         ON role.company_id = role_assignment.company_id
        AND role.id = role_assignment.role_id
        AND role.status = 'active'
       WHERE assignment.company_id = $1
         AND assignment.construction_site_id = $2
         AND assignment.work_date = $3
         AND assignment.status IN ('released', 'completed')
       GROUP BY account.id
       ORDER BY BOOL_OR(assignment.report_responsible) DESC,
                LOWER(account.last_name), LOWER(account.first_name)`,
      [context.companyId, constructionSiteId, date]
    ),
    client.query(
      `SELECT document.id, document.document_number, document.title, document.category,
              document.original_file_name, document.mime_type, document.size_bytes,
              document.offline_priority, document.created_at,
              uploader.first_name || ' ' || uploader.last_name AS uploaded_by_name
       FROM documents AS document
       JOIN users AS uploader
         ON uploader.company_id = document.company_id AND uploader.id = document.uploaded_by_user_id
       JOIN document_links AS link
         ON link.company_id = document.company_id
        AND link.document_id = document.id
        AND link.entity_type = 'construction_site'
        AND link.construction_site_id = $2
       WHERE document.company_id = $1
         AND document.status = 'active'
         AND document.mobile_visible
       ORDER BY document.created_at DESC, document.document_number DESC`,
      [context.companyId, constructionSiteId]
    ),
    client.query(
      `SELECT task.id, task.construction_site_id, task.title, task.details,
              task.priority, task.status, task.assigned_user_id, task.due_date,
              task.completed_at, task.row_version, task.created_at,
              CASE WHEN assignee.id IS NULL THEN NULL ELSE assignee.first_name || ' ' || assignee.last_name END AS assigned_user_name
       FROM site_tasks AS task
       LEFT JOIN users AS assignee
         ON assignee.company_id = task.company_id AND assignee.id = task.assigned_user_id
       WHERE task.company_id = $1
         AND task.construction_site_id = $2
         AND task.status <> 'archived'
         AND ($3::BOOLEAN OR task.assigned_user_id IS NULL OR task.assigned_user_id = $4)
       ORDER BY CASE task.status WHEN 'open' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'done' THEN 3 ELSE 4 END,
                CASE task.priority WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
                task.due_date NULLS LAST, task.created_at DESC`,
      [context.companyId, constructionSiteId, access.canLead, context.userId]
    ),
    client.query(
      `SELECT eintrag.id, eintrag.construction_site_id, eintrag.item_name,
              eintrag.quantity, eintrag.unit, eintrag.status, eintrag.note,
              eintrag.row_version, eintrag.created_at
       FROM site_material_entries AS eintrag
       WHERE eintrag.company_id = $1
         AND eintrag.construction_site_id = $2
         AND eintrag.status <> 'archived'
       ORDER BY CASE eintrag.status WHEN 'planned' THEN 1 WHEN 'ordered' THEN 2 WHEN 'available' THEN 3 WHEN 'used' THEN 4 ELSE 5 END,
                eintrag.created_at DESC`,
      [context.companyId, constructionSiteId]
    ),
    client.query(
      `SELECT note.id, note.construction_site_id, note.author_user_id,
              note.client_note_id, note.content, note.is_important,
              note.status, note.row_version, note.created_at,
              author.first_name || ' ' || author.last_name AS author_name
       FROM site_notes AS note
       JOIN users AS author
         ON author.company_id = note.company_id AND author.id = note.author_user_id
       WHERE note.company_id = $1
         AND note.construction_site_id = $2
         AND note.status = 'active'
       ORDER BY note.is_important DESC, note.created_at DESC`,
      [context.companyId, constructionSiteId]
    ),
    client.query(
      `SELECT report.id, report.construction_site_id, report.report_number,
              report.report_type, report.work_date, report.source_mode,
              report.summary, report.details, report.structured_data, report.source_document_id,
              report.site_assignment_id, report.client_report_id,
              report.status, report.approved_at, report.employee_signature_name,
              report.customer_signature_name, report.final_document_id,
              report.return_comment, report.returned_at, report.return_count,
              report.row_version, report.created_at,
              author.first_name || ' ' || author.last_name AS author_name,
              approver.first_name || ' ' || approver.last_name AS approved_by_name,
              returned_by.first_name || ' ' || returned_by.last_name AS returned_by_name,
              document.original_file_name AS source_document_file_name,
              final_document.original_file_name AS final_document_file_name
       FROM site_reports AS report
       JOIN users AS author
         ON author.company_id = report.company_id AND author.id = report.author_user_id
       LEFT JOIN documents AS document
         ON document.company_id = report.company_id AND document.id = report.source_document_id
       LEFT JOIN users AS approver
         ON approver.company_id = report.company_id AND approver.id = report.approved_by_user_id
       LEFT JOIN users AS returned_by
         ON returned_by.company_id = report.company_id
        AND returned_by.id = report.returned_by_user_id
       LEFT JOIN documents AS final_document
         ON final_document.company_id = report.company_id AND final_document.id = report.final_document_id
       WHERE report.company_id = $1
         AND report.construction_site_id = $2
         AND report.status <> 'archived'
         AND (
           $3::BOOLEAN
           OR report.status IN ('submitted', 'approved')
           OR (report.status = 'returned' AND report.author_user_id = $4)
         )
       ORDER BY report.work_date DESC, report.created_at DESC`,
      [context.companyId, constructionSiteId, access.canLead, context.userId]
    )
  ]);
  const modules = await loadCompanyModules(client, context);
  const vdeEnabled = modules.some((module) => (
    module.key === "vde" && module.enabled
  ));
  const vdeInspectionResult = vdeEnabled
    ? await client.query(
      `${VDE_INSPECTION_SELECT}
       WHERE inspection.company_id = $1
         AND inspection.construction_site_id = $2
       ORDER BY inspection.inspection_date DESC,
                inspection.created_at DESC,
                inspection.id`,
      [context.companyId, constructionSiteId]
    )
    : { rows: [] };

  return {
    date,
    site: siteDto(siteResult.rows[0]),
    viewer: {
      canManage: access.canManage,
      canLead: access.canLead,
      reportResponsible: access.reportResponsible
    },
    assignment: access.assignment,
    team: teamResult.rows.map((row) => ({
      id: row.id,
      name: `${row.first_name} ${row.last_name}`,
      email: row.email || null,
      phone: row.phone || null,
      roles: row.roles,
      reportResponsible: row.report_responsible,
      plannedDurationMinutes: row.planned_duration_minutes === null
        ? null
        : Number(row.planned_duration_minutes)
    })),
    documents: documentResult.rows.map(siteWorkspaceDocumentDto),
    tasks: taskResult.rows.map(siteTaskDto),
    materials: materialResult.rows.map(siteMaterialDto),
    notes: noteResult.rows.map(siteNoteDto),
    reports: reportResult.rows.map(siteReportDto),
    electricalModules: {
      vde: {
        enabled: vdeEnabled,
        permissions: vdeEnabled
          ? vdePermissions(access.roles, true, access.canManage)
          : {
            read: false,
            create: false,
            edit: false,
            complete: false,
            importLegacy: false
          },
        inspections: vdeInspectionResult.rows.map((inspection) => (
          vdeInspectionDto(inspection)
        ))
      }
    }
  };
}

async function getDocumentRecord(client, context, documentId) {
  const result = await client.query(
    `SELECT document.id, document.document_number, document.title, document.category,
            document.original_file_name, document.mime_type, document.size_bytes,
            document.sha256_hex, document.status, document.mobile_visible,
            document.offline_priority, document.row_version,
            document.created_at, document.updated_at,
            uploader.first_name || ' ' || uploader.last_name AS uploaded_by_name,
            COALESCE(
              jsonb_agg(
                jsonb_build_object(
                  'entityType', link.entity_type,
                  'customerId', link.customer_id,
                  'projectId', link.project_id,
                  'constructionSiteId', link.construction_site_id,
                  'targetName', CASE link.entity_type
                    WHEN 'customer' THEN COALESCE(customer.company_name, customer.first_name || ' ' || customer.last_name)
                    WHEN 'project' THEN project.name
                    WHEN 'construction_site' THEN site.name
                  END
                ) ORDER BY link.created_at, link.id
              ) FILTER (WHERE link.id IS NOT NULL),
              '[]'::jsonb
            ) AS links
     FROM documents AS document
     JOIN users AS uploader
       ON uploader.company_id = document.company_id AND uploader.id = document.uploaded_by_user_id
     LEFT JOIN document_links AS link
       ON link.company_id = document.company_id AND link.document_id = document.id
     LEFT JOIN customers AS customer
       ON customer.company_id = link.company_id AND customer.id = link.customer_id
     LEFT JOIN projects AS project
       ON project.company_id = link.company_id AND project.id = link.project_id
     LEFT JOIN construction_sites AS site
       ON site.company_id = link.company_id AND site.id = link.construction_site_id
     WHERE document.company_id = $1 AND document.id = $2
     GROUP BY document.id, uploader.id`,
    [context.companyId, documentId]
  );
  if (result.rowCount !== 1) {
    throw new InputError("Das Dokument wurde nicht gefunden.", 404, "document_not_found");
  }
  return documentDto(result.rows[0]);
}

async function resolveDocumentTargets(client, context, input) {
  if (input.constructionSiteId) {
    const result = await client.query(
      `SELECT site.id AS construction_site_id, project.id AS project_id, customer.id AS customer_id
       FROM construction_sites AS site
       JOIN projects AS project
         ON project.company_id = site.company_id AND project.id = site.project_id
       JOIN customers AS customer
         ON customer.company_id = project.company_id AND customer.id = project.customer_id
       WHERE site.company_id = $1 AND site.id = $2
         AND site.status <> 'cancelled' AND project.status <> 'cancelled' AND customer.status <> 'merged'`,
      [context.companyId, input.constructionSiteId]
    );
    if (result.rowCount !== 1) {
      throw new InputError("Die Baustelle wurde nicht gefunden.", 404, "site_not_found");
    }
    const target = result.rows[0];
    if (
      (input.projectId && input.projectId !== target.project_id)
      || (input.customerId && input.customerId !== target.customer_id)
    ) {
      throw new InputError(
        "Kunde, Projekt und Baustelle gehören nicht zusammen.",
        409,
        "document_target_conflict"
      );
    }
    return target;
  }

  if (input.projectId) {
    const result = await client.query(
      `SELECT project.id AS project_id, customer.id AS customer_id
       FROM projects AS project
       JOIN customers AS customer
         ON customer.company_id = project.company_id AND customer.id = project.customer_id
       WHERE project.company_id = $1 AND project.id = $2
         AND project.status <> 'cancelled' AND customer.status <> 'merged'`,
      [context.companyId, input.projectId]
    );
    if (result.rowCount !== 1) {
      throw new InputError("Das Projekt wurde nicht gefunden.", 404, "project_not_found");
    }
    const target = result.rows[0];
    if (input.customerId && input.customerId !== target.customer_id) {
      throw new InputError(
        "Kunde und Projekt gehören nicht zusammen.",
        409,
        "document_target_conflict"
      );
    }
    return { ...target, construction_site_id: null };
  }

  const result = await client.query(
    `SELECT id AS customer_id
     FROM customers
     WHERE company_id = $1 AND id = $2 AND status <> 'merged'`,
    [context.companyId, input.customerId]
  );
  if (result.rowCount !== 1) {
    throw new InputError("Der Kunde wurde nicht gefunden.", 404, "customer_not_found");
  }
  return { ...result.rows[0], project_id: null, construction_site_id: null };
}

async function insertDocumentLinks(client, context, documentId, targets) {
  const links = [
    ["customer", targets.customer_id, null, null],
    ["project", null, targets.project_id, null],
    ["construction_site", null, null, targets.construction_site_id]
  ].filter(([, customerId, projectId, siteId]) => customerId || projectId || siteId);

  for (const [entityType, customerId, projectId, constructionSiteId] of links) {
    await client.query(
      `INSERT INTO document_links (
         company_id, document_id, entity_type, customer_id, project_id,
         construction_site_id, created_by_user_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT DO NOTHING`,
      [
        context.companyId,
        documentId,
        entityType,
        customerId,
        projectId,
        constructionSiteId,
        context.userId
      ]
    );
  }
}

async function storeDocument(client, context, input) {
  const targets = await resolveDocumentTargets(client, context, input);
  const sha256 = createHash("sha256").update(input.content).digest("hex");
  const mobileVisible = input.mobileVisible ?? true;
  const offlinePriority = input.offlinePriority ?? false;
  const inserted = await client.query(
    `INSERT INTO documents (
       company_id, document_number, title, category, original_file_name,
       mime_type, size_bytes, sha256_hex, uploaded_by_user_id,
       mobile_visible, offline_priority
     ) VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (company_id, sha256_hex) DO NOTHING
     RETURNING id`,
    [
      context.companyId,
      input.title,
      input.category,
      input.fileName,
      input.mimeType,
      input.content.length,
      sha256,
      context.userId,
      mobileVisible,
      offlinePriority
    ]
  );

  const reused = inserted.rowCount === 0;
  let documentId = inserted.rows[0]?.id;
  if (reused) {
    const existing = await client.query(
      `SELECT id, status FROM documents
       WHERE company_id = $1 AND sha256_hex = $2
       FOR UPDATE`,
      [context.companyId, sha256]
    );
    if (existing.rowCount !== 1) {
      throw new InputError("Das Dokument konnte nicht eindeutig gespeichert werden.", 409, "document_conflict");
    }
    documentId = existing.rows[0].id;
    if (existing.rows[0].status === "archived") {
      await client.query(
        `UPDATE documents
         SET status = 'active'
         WHERE company_id = $1 AND id = $2`,
        [context.companyId, documentId]
      );
    }
  } else {
    await client.query(
      `INSERT INTO document_contents (company_id, document_id, content)
       VALUES ($1, $2, $3)`,
      [context.companyId, documentId, input.content]
    );
  }

  await insertDocumentLinks(client, context, documentId, targets);
  return { document: await getDocumentRecord(client, context, documentId), reused };
}

async function createDocument(client, context, input) {
  const roles = await requirePlanner(client, context);
  await requireDocumentTargetAccess(client, context, input, roles);
  return storeDocument(client, context, input);
}

async function createSitePhoto(client, context, constructionSiteId, date, input) {
  await requireSiteWorkspaceAccess(client, context, constructionSiteId, date);
  return storeDocument(client, context, input);
}

async function getDocumentContent(client, context, documentId) {
  const roles = await requirePlanner(client, context);
  await requireLinkedDocumentAccess(client, context, documentId, roles);
  const result = await client.query(
    `SELECT document.original_file_name, document.mime_type, content.content
     FROM documents AS document
     JOIN document_contents AS content
       ON content.company_id = document.company_id AND content.document_id = document.id
     WHERE document.company_id = $1 AND document.id = $2`,
    [context.companyId, documentId]
  );
  if (result.rowCount !== 1) {
    throw new InputError("Das Dokument wurde nicht gefunden.", 404, "document_not_found");
  }
  return {
    fileName: result.rows[0].original_file_name,
    mimeType: result.rows[0].mime_type,
    content: result.rows[0].content
  };
}

async function getSiteDocumentContent(client, context, constructionSiteId, documentId, date) {
  await requireSiteWorkspaceAccess(client, context, constructionSiteId, date);
  const result = await client.query(
    `SELECT document.original_file_name, document.mime_type, content.content
     FROM documents AS document
     JOIN document_contents AS content
       ON content.company_id = document.company_id AND content.document_id = document.id
     JOIN document_links AS link
       ON link.company_id = document.company_id
      AND link.document_id = document.id
      AND link.entity_type = 'construction_site'
      AND link.construction_site_id = $2
     WHERE document.company_id = $1
       AND document.id = $3
       AND document.status = 'active'
       AND document.mobile_visible`,
    [context.companyId, constructionSiteId, documentId]
  );
  if (result.rowCount !== 1) {
    throw new InputError("Das Baustellendokument wurde nicht gefunden.", 404, "document_not_found");
  }
  return {
    fileName: result.rows[0].original_file_name,
    mimeType: result.rows[0].mime_type,
    content: result.rows[0].content
  };
}

async function updateDocumentStatus(client, context, documentId, input) {
  const roles = await requirePlanner(client, context);
  await requireLinkedDocumentAccess(client, context, documentId, roles);
  const current = await client.query(
    `SELECT status, mobile_visible, offline_priority, row_version
     FROM documents
     WHERE company_id = $1 AND id = $2
     FOR UPDATE`,
    [context.companyId, documentId]
  );
  if (current.rowCount !== 1) {
    throw new InputError("Das Dokument wurde nicht gefunden.", 404, "document_not_found");
  }
  if (Number(current.rows[0].row_version) !== input.rowVersion) {
    throw new InputError(
      "Das Dokument wurde zwischenzeitlich geändert. Bitte die Verwaltung aktualisieren.",
      409,
      "row_version_conflict"
    );
  }
  const nextStatus = input.status ?? current.rows[0].status;
  const nextMobileVisible = input.mobileVisible ?? current.rows[0].mobile_visible;
  const nextOfflinePriority = nextMobileVisible
    ? input.offlinePriority ?? current.rows[0].offline_priority
    : false;
  if (
    current.rows[0].status !== nextStatus
    || current.rows[0].mobile_visible !== nextMobileVisible
    || current.rows[0].offline_priority !== nextOfflinePriority
  ) {
    const updated = await client.query(
      `UPDATE documents
       SET status = $3,
           mobile_visible = $4,
           offline_priority = $5
       WHERE company_id = $1 AND id = $2 AND row_version = $6`,
      [
        context.companyId,
        documentId,
        nextStatus,
        nextMobileVisible,
        nextOfflinePriority,
        input.rowVersion
      ]
    );
    if (updated.rowCount !== 1) {
      throw new InputError(
        "Das Dokument wurde zwischenzeitlich geändert. Bitte die Verwaltung aktualisieren.",
        409,
        "row_version_conflict"
      );
    }
  }
  return getDocumentRecord(client, context, documentId);
}

async function requireActiveSite(client, context, constructionSiteId) {
  const result = await client.query(
    `SELECT id FROM construction_sites
     WHERE company_id = $1 AND id = $2
       AND status IN ('planned', 'active', 'on_hold', 'delayed')`,
    [context.companyId, constructionSiteId]
  );
  if (result.rowCount !== 1) throw new InputError("Die aktive Baustelle wurde nicht gefunden.", 404, "site_not_found");
}

async function getSiteTaskRecord(client, context, taskId) {
  const result = await client.query(
    `SELECT task.id, task.construction_site_id, task.title, task.details,
            task.priority, task.status, task.assigned_user_id, task.due_date,
            task.completed_at, task.row_version, task.created_at,
            CASE WHEN assignee.id IS NULL THEN NULL ELSE assignee.first_name || ' ' || assignee.last_name END AS assigned_user_name
     FROM site_tasks AS task
     LEFT JOIN users AS assignee
       ON assignee.company_id = task.company_id AND assignee.id = task.assigned_user_id
     WHERE task.company_id = $1 AND task.id = $2`,
    [context.companyId, taskId]
  );
  if (result.rowCount !== 1) throw new InputError("Die Aufgabe wurde nicht gefunden.", 404, "site_task_not_found");
  return siteTaskDto(result.rows[0]);
}

async function createSiteTask(client, context, input) {
  await requireEnabledModule(client, context, "documents");
  const roles = await requirePlanner(client, context);
  await requireConstructionSiteAccess(
    client,
    context,
    input.constructionSiteId,
    roles
  );
  await requireActiveSite(client, context, input.constructionSiteId);
  if (input.assignedUserId) {
    const assignee = await client.query(
      "SELECT id FROM users WHERE company_id = $1 AND id = $2 AND status = 'active'",
      [context.companyId, input.assignedUserId]
    );
    if (assignee.rowCount !== 1) throw new InputError("Der Mitarbeiter wurde nicht gefunden.", 404, "employee_not_found");
  }
  const result = await client.query(
    `INSERT INTO site_tasks (
       company_id, construction_site_id, title, details, priority,
       assigned_user_id, due_date, created_by_user_id, changed_by_user_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
     RETURNING id`,
    [context.companyId, input.constructionSiteId, input.title, input.details, input.priority,
      input.assignedUserId, input.dueDate, context.userId]
  );
  return getSiteTaskRecord(client, context, result.rows[0].id);
}

async function updateSiteTask(client, context, taskId, input) {
  const roles = await requirePlanner(client, context);
  await requireScopedEntitySiteAccess(client, context, "site_tasks", taskId, roles);
  const result = await client.query(
    `UPDATE site_tasks
     SET status = $3, changed_by_user_id = $4
     WHERE company_id = $1 AND id = $2 AND row_version = $5
     RETURNING id`,
    [context.companyId, taskId, input.status, context.userId, input.rowVersion]
  );
  if (result.rowCount !== 1) throw new InputError("Die Aufgabe wurde geändert. Bitte neu laden.", 409, "row_version_conflict");
  return getSiteTaskRecord(client, context, taskId);
}

async function updateMobileSiteTask(
  client,
  context,
  constructionSiteId,
  taskId,
  date,
  input
) {
  const access = await requireSiteWorkspaceAccess(
    client,
    context,
    constructionSiteId,
    date
  );
  const current = await client.query(
    `SELECT construction_site_id, assigned_user_id, status, row_version
     FROM site_tasks
     WHERE company_id = $1
       AND id = $2
       AND construction_site_id = $3
       AND status <> 'archived'
     FOR UPDATE`,
    [context.companyId, taskId, constructionSiteId]
  );
  if (current.rowCount !== 1) {
    throw new InputError("Die Aufgabe wurde nicht gefunden.", 404, "site_task_not_found");
  }
  const task = current.rows[0];
  if (!access.canLead && task.assigned_user_id && task.assigned_user_id !== context.userId) {
    throw new InputError(
      "Diese Aufgabe ist einem anderen Mitarbeiter zugewiesen.",
      403,
      "site_task_not_assigned"
    );
  }
  if (input.status === "archived") {
    throw new InputError(
      "Aufgaben können nur im Büro archiviert werden.",
      403,
      "site_task_archive_forbidden"
    );
  }
  if (Number(task.row_version) !== input.rowVersion) {
    throw new InputError(
      "Die Aufgabe wurde zwischenzeitlich geändert. Bitte die Baustellenakte neu laden.",
      409,
      "row_version_conflict"
    );
  }
  const allowedTransitions = {
    open: new Set(["in_progress"]),
    in_progress: new Set(["done"]),
    done: new Set(["in_progress"])
  };
  if (!allowedTransitions[task.status]?.has(input.status)) {
    throw new InputError(
      "Dieser Aufgabenstatus kann mobil nicht gesetzt werden.",
      409,
      "site_task_transition_invalid"
    );
  }
  const updated = await client.query(
    `UPDATE site_tasks
     SET status = $4, changed_by_user_id = $5
     WHERE company_id = $1
       AND id = $2
       AND construction_site_id = $3
       AND row_version = $6
     RETURNING id`,
    [
      context.companyId,
      taskId,
      constructionSiteId,
      input.status,
      context.userId,
      input.rowVersion
    ]
  );
  if (updated.rowCount !== 1) {
    throw new InputError(
      "Die Aufgabe wurde zwischenzeitlich geändert. Bitte die Baustellenakte neu laden.",
      409,
      "row_version_conflict"
    );
  }
  return getSiteTaskRecord(client, context, taskId);
}

async function getSiteMaterialRecord(client, context, materialId) {
  const result = await client.query(
    `SELECT eintrag.id, eintrag.construction_site_id, eintrag.item_name,
            eintrag.quantity, eintrag.unit, eintrag.status, eintrag.note,
            eintrag.row_version, eintrag.created_at
       FROM site_material_entries AS eintrag
       WHERE eintrag.company_id = $1 AND eintrag.id = $2`,
    [context.companyId, materialId]
  );
  if (result.rowCount !== 1) throw new InputError("Der Materialeintrag wurde nicht gefunden.", 404, "site_material_not_found");
  return siteMaterialDto(result.rows[0]);
}

async function storeSiteMaterial(client, context, input) {
  const result = await client.query(
    `INSERT INTO site_material_entries (
       company_id, construction_site_id, item_name, quantity, unit, status,
       note, created_by_user_id, changed_by_user_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
     RETURNING id`,
    [context.companyId, input.constructionSiteId, input.itemName, input.quantity,
      input.unit, input.status, input.note, context.userId]
  );
  return getSiteMaterialRecord(client, context, result.rows[0].id);
}

async function storeSiteMaterialStatus(client, context, materialId, input) {
  const result = await client.query(
    `UPDATE site_material_entries
     SET status = $3, changed_by_user_id = $4
     WHERE company_id = $1 AND id = $2 AND row_version = $5
     RETURNING id`,
    [context.companyId, materialId, input.status, context.userId, input.rowVersion]
  );
  if (result.rowCount !== 1) throw new InputError("Der Materialeintrag wurde geändert. Bitte neu laden.", 409, "row_version_conflict");
  return getSiteMaterialRecord(client, context, materialId);
}

async function createSiteMaterial(client, context, input) {
  await requireEnabledModule(client, context, "materials");
  const roles = await requirePlanner(client, context);
  await requireConstructionSiteAccess(
    client,
    context,
    input.constructionSiteId,
    roles
  );
  await requireActiveSite(client, context, input.constructionSiteId);
  return storeSiteMaterial(client, context, input);
}

async function updateSiteMaterial(client, context, materialId, input) {
  await requireEnabledModule(client, context, "materials");
  const roles = await requirePlanner(client, context);
  await requireScopedEntitySiteAccess(
    client,
    context,
    "site_material_entries",
    materialId,
    roles
  );
  return storeSiteMaterialStatus(client, context, materialId, input);
}

// Material von der Baustelle aus.
//
// Bisher konnte nur das Buero Material eintragen. Wer es verbaut, sieht es
// aber zuerst: der Vorarbeiter weiss abends, was von der Rolle runter ist und
// was fehlt. Er konnte es nur ansehen und niemandem sagen - ausser per Notiz,
// wo es keine Menge und keinen Status hat.
//
// Der Zugang ist derselbe wie bei Notizen und Fotos: wer an diesem Tag auf der
// Baustelle eingeteilt ist. Material ist Sache des ganzen Trupps, nicht nur
// des Vorarbeiters - wer die Kabeltrommel holt, soll es eintragen duerfen.
async function createMobileSiteMaterial(client, context, input, date) {
  await requireEnabledModule(client, context, "materials");
  await requireSiteWorkspaceAccess(client, context, input.constructionSiteId, date);
  await requireActiveSite(client, context, input.constructionSiteId);
  return storeSiteMaterial(client, context, input);
}

async function updateMobileSiteMaterial(
  client,
  context,
  constructionSiteId,
  materialId,
  date,
  input
) {
  await requireEnabledModule(client, context, "materials");
  await requireSiteWorkspaceAccess(client, context, constructionSiteId, date);
  // Die Baustelle muss zum Eintrag passen. Ohne diese Pruefung koennte man mit
  // dem Zugang zu einer Baustelle den Eintrag einer anderen aendern.
  const vorhanden = await client.query(
    `SELECT 1 FROM site_material_entries
     WHERE company_id = $1 AND id = $2 AND construction_site_id = $3`,
    [context.companyId, materialId, constructionSiteId]
  );
  if (vorhanden.rowCount !== 1) {
    throw new InputError("Der Materialeintrag wurde nicht gefunden.", 404, "site_material_not_found");
  }
  return storeSiteMaterialStatus(client, context, materialId, input);
}

async function getSiteNoteRecord(client, context, noteId) {
  const result = await client.query(
    `SELECT note.id, note.construction_site_id, note.author_user_id,
            note.client_note_id, note.content, note.is_important,
            note.status, note.row_version, note.created_at,
            author.first_name || ' ' || author.last_name AS author_name
     FROM site_notes AS note
     JOIN users AS author
       ON author.company_id = note.company_id AND author.id = note.author_user_id
     WHERE note.company_id = $1 AND note.id = $2`,
    [context.companyId, noteId]
  );
  if (result.rowCount !== 1) {
    throw new InputError("Die Baustellennotiz wurde nicht gefunden.", 404, "site_note_not_found");
  }
  return siteNoteDto(result.rows[0]);
}

async function storeSiteNote(client, context, input) {
  const inserted = await client.query(
    `INSERT INTO site_notes (
       company_id, construction_site_id, author_user_id, client_note_id,
       content, is_important
     ) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (company_id, author_user_id, client_note_id) DO NOTHING
     RETURNING id`,
    [
      context.companyId,
      input.constructionSiteId,
      context.userId,
      input.clientNoteId,
      input.content,
      input.isImportant
    ]
  );
  if (inserted.rowCount === 0) {
    const duplicate = await client.query(
      `SELECT id, construction_site_id, content, is_important
       FROM site_notes
       WHERE company_id = $1 AND author_user_id = $2 AND client_note_id = $3`,
      [context.companyId, context.userId, input.clientNoteId]
    );
    const row = duplicate.rows[0];
    if (
      !row
      || row.construction_site_id !== input.constructionSiteId
      || row.content !== input.content
      || row.is_important !== input.isImportant
    ) {
      throw new InputError(
        "Die Notiz-ID wurde bereits für einen anderen Inhalt verwendet.",
        409,
        "idempotency_conflict"
      );
    }
    return { siteNote: await getSiteNoteRecord(client, context, row.id), idempotent: true };
  }
  return {
    siteNote: await getSiteNoteRecord(client, context, inserted.rows[0].id),
    idempotent: false
  };
}

async function createAdminSiteNote(client, context, input) {
  await requireEnabledModule(client, context, "documents");
  const roles = await requirePlanner(client, context);
  await requireConstructionSiteAccess(
    client,
    context,
    input.constructionSiteId,
    roles
  );
  await requireActiveSite(client, context, input.constructionSiteId);
  return storeSiteNote(client, context, input);
}

async function createMobileSiteNote(client, context, input, date) {
  await requireSiteWorkspaceAccess(client, context, input.constructionSiteId, date);
  await requireActiveSite(client, context, input.constructionSiteId);
  return storeSiteNote(client, context, input);
}

async function getSiteReportRecord(client, context, reportId) {
  const result = await client.query(
    `SELECT report.id, report.construction_site_id, report.report_number,
            report.report_type, report.work_date, report.source_mode,
            report.summary, report.details, report.structured_data, report.source_document_id,
            report.site_assignment_id, report.client_report_id,
            report.status, report.approved_at, report.employee_signature_name,
            report.customer_signature_name, report.final_document_id,
            report.return_comment, report.returned_at, report.return_count,
            report.row_version, report.created_at,
            author.first_name || ' ' || author.last_name AS author_name,
            approver.first_name || ' ' || approver.last_name AS approved_by_name,
            returned_by.first_name || ' ' || returned_by.last_name AS returned_by_name,
            document.original_file_name AS source_document_file_name,
            final_document.original_file_name AS final_document_file_name
     FROM site_reports AS report
     JOIN users AS author
       ON author.company_id = report.company_id AND author.id = report.author_user_id
     LEFT JOIN documents AS document
       ON document.company_id = report.company_id AND document.id = report.source_document_id
     LEFT JOIN users AS approver
       ON approver.company_id = report.company_id AND approver.id = report.approved_by_user_id
     LEFT JOIN users AS returned_by
       ON returned_by.company_id = report.company_id
      AND returned_by.id = report.returned_by_user_id
     LEFT JOIN documents AS final_document
       ON final_document.company_id = report.company_id AND final_document.id = report.final_document_id
     WHERE report.company_id = $1 AND report.id = $2`,
    [context.companyId, reportId]
  );
  if (result.rowCount !== 1) throw new InputError("Der Bericht wurde nicht gefunden.", 404, "site_report_not_found");
  return siteReportDto(result.rows[0]);
}

async function resolveReportPersonnel(client, context, constructionSiteId, workDate, personnel) {
  if (personnel.length === 0) return [];
  const requestedIds = personnel.map((entry) => entry.userId);
  const result = await client.query(
    `SELECT account.id, account.first_name, account.last_name
     FROM site_assignments AS assignment
     JOIN users AS account
       ON account.company_id = assignment.company_id
      AND account.id = assignment.user_id
     WHERE assignment.company_id = $1
       AND assignment.construction_site_id = $2
       AND assignment.work_date = $3
       AND assignment.status IN ('released', 'completed')
       AND account.status = 'active'
       AND account.id = ANY($4::UUID[])
     GROUP BY account.id`,
    [context.companyId, constructionSiteId, workDate, requestedIds]
  );
  const employees = new Map(result.rows.map((row) => [row.id, row]));
  if (employees.size !== requestedIds.length) {
    throw new InputError(
      "Mindestens ein Mitarbeiter ist an diesem Tag nicht für die Baustelle eingeplant.",
      409,
      "report_personnel_conflict"
    );
  }
  return personnel.map((entry) => {
    const employee = employees.get(entry.userId);
    return {
      userId: entry.userId,
      name: `${employee.first_name} ${employee.last_name}`,
      minutes: entry.minutes
    };
  });
}

async function resolveReportPhotos(client, context, constructionSiteId, photos) {
  if (photos.length === 0) return [];
  const requestedIds = photos.map((photo) => photo.documentId);
  const result = await client.query(
    `SELECT document.id, document.title, document.mime_type
     FROM documents AS document
     JOIN document_links AS link
       ON link.company_id = document.company_id
      AND link.document_id = document.id
      AND link.entity_type = 'construction_site'
      AND link.construction_site_id = $2
     WHERE document.company_id = $1
       AND document.id = ANY($3::UUID[])
       AND document.status = 'active'
       AND document.category = 'photo'
       AND document.mime_type IN ('image/jpeg', 'image/png')`,
    [context.companyId, constructionSiteId, requestedIds]
  );
  const records = new Map(result.rows.map((row) => [row.id, row]));
  if (records.size !== requestedIds.length) {
    throw new InputError(
      "Mindestens ein Berichtsfoto gehört nicht als JPG oder PNG zu dieser Baustelle.",
      409,
      "report_photo_conflict"
    );
  }
  return photos.map((photo) => {
    const record = records.get(photo.documentId);
    return {
      documentId: photo.documentId,
      title: record.title,
      caption: photo.caption,
      mimeType: record.mime_type
    };
  });
}

async function loadReportPhotoContents(client, context, structuredData) {
  const photos = Array.isArray(structuredData?.photos) ? structuredData.photos : [];
  if (photos.length === 0) return [];
  const requestedIds = photos.map((photo) => photo.documentId);
  const result = await client.query(
    `SELECT document.id, document.title, document.mime_type, content.content
     FROM documents AS document
     JOIN document_contents AS content
       ON content.company_id = document.company_id
      AND content.document_id = document.id
     WHERE document.company_id = $1
       AND document.id = ANY($2::UUID[])
       AND document.mime_type IN ('image/jpeg', 'image/png')`,
    [context.companyId, requestedIds]
  );
  const records = new Map(result.rows.map((row) => [row.id, row]));
  if (records.size !== requestedIds.length) {
    throw new InputError(
      "Mindestens ein Berichtsfoto ist nicht mehr vollständig verfügbar.",
      409,
      "report_photo_unavailable"
    );
  }
  return photos.flatMap((photo) => {
    const record = records.get(photo.documentId);
    return record ? [{
      documentId: photo.documentId,
      title: photo.title || record.title,
      caption: photo.caption,
      mimeType: record.mime_type,
      content: record.content
    }] : [];
  });
}

function structuredReportData(input, personnel, photos = []) {
  return {
    workPerformed: input.workPerformed,
    obstructions: input.obstructions,
    openItems: input.openItems,
    weather: input.weather,
    materialsAndEquipment: input.materialsAndEquipment,
    agreements: input.agreements,
    incidents: input.incidents,
    personnel,
    photos
  };
}

async function createSiteReport(client, context, input) {
  await requireEnabledModule(client, context, siteReportModuleKey(input.reportType));
  const roles = await requirePlanner(client, context);
  await requireConstructionSiteAccess(
    client,
    context,
    input.constructionSiteId,
    roles
  );
  await requireActiveSite(client, context, input.constructionSiteId);
  if (input.sourceDocumentId) {
    const document = await client.query(
      `SELECT document.id
       FROM documents AS document
       JOIN document_links AS link
         ON link.company_id = document.company_id AND link.document_id = document.id
       WHERE document.company_id = $1 AND document.id = $2
         AND document.mime_type IN ('image/jpeg', 'image/png', 'image/webp')
         AND document.status = 'active'
         AND link.entity_type = 'construction_site' AND link.construction_site_id = $3`,
      [context.companyId, input.sourceDocumentId, input.constructionSiteId]
    );
    if (document.rowCount !== 1) {
      throw new InputError("Das Originalfoto gehört nicht zu dieser Baustelle.", 409, "report_document_conflict");
    }
  }
  const personnel = await resolveReportPersonnel(
    client,
    context,
    input.constructionSiteId,
    input.workDate,
    input.personnel
  );
  const photos = await resolveReportPhotos(
    client,
    context,
    input.constructionSiteId,
    input.photos
  );
  const result = await client.query(
    `INSERT INTO site_reports (
       company_id, construction_site_id, report_number, report_type, work_date,
       source_mode, summary, details, structured_data, source_document_id,
       status, author_user_id
     ) VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, $8::JSONB, $9, 'submitted', $10)
     RETURNING id`,
    [context.companyId, input.constructionSiteId, input.reportType, input.workDate,
      input.sourceMode, input.summary, input.details,
      JSON.stringify(structuredReportData(input, personnel, photos)),
      input.sourceDocumentId, context.userId]
  );
  return getSiteReportRecord(client, context, result.rows[0].id);
}

async function createMobileSiteReport(client, context, input) {
  await requireEnabledModule(client, context, siteReportModuleKey(input.reportType));
  const duplicate = await client.query(
    `SELECT id, author_user_id, construction_site_id, work_date, report_type,
            source_mode, summary, details, structured_data
     FROM site_reports
     WHERE company_id = $1 AND client_report_id = $2`,
    [context.companyId, input.clientReportId]
  );
  if (duplicate.rowCount === 1) {
    const row = duplicate.rows[0];
    const same = row.author_user_id === context.userId
      && row.construction_site_id === input.constructionSiteId
      && databaseDate(row.work_date) === input.workDate
      && row.report_type === input.reportType
      && row.source_mode === input.sourceMode
      && row.summary === input.summary
      && (row.details || null) === input.details
      && (row.structured_data?.workPerformed || row.details || row.summary) === input.workPerformed
      && (row.structured_data?.obstructions || null) === input.obstructions
      && (row.structured_data?.openItems || null) === input.openItems
      && (row.structured_data?.weather || null) === input.weather
      && (row.structured_data?.materialsAndEquipment || null) === input.materialsAndEquipment
      && (row.structured_data?.agreements || null) === input.agreements
      && (row.structured_data?.incidents || null) === input.incidents
      && JSON.stringify((row.structured_data?.photos || []).map((photo) => ({
        documentId: photo.documentId,
        caption: photo.caption || null
      }))) === JSON.stringify(input.photos)
      && JSON.stringify((row.structured_data?.personnel || []).map((entry) => ({
        userId: entry.userId,
        minutes: entry.minutes
      }))) === JSON.stringify(input.personnel);
    if (!same) {
      throw new InputError(
        "Die Offline-Berichts-ID wurde bereits für einen anderen Bericht verwendet.",
        409,
        "idempotency_conflict"
      );
    }
    return { siteReport: await getSiteReportRecord(client, context, row.id), idempotent: true };
  }

  const assignment = await client.query(
    `SELECT id
     FROM site_assignments
     WHERE company_id = $1 AND user_id = $2 AND construction_site_id = $3
       AND work_date = $4 AND status IN ('released', 'completed')
       AND report_responsible
     FOR UPDATE`,
    [context.companyId, context.userId, input.constructionSiteId, input.workDate]
  );
  if (assignment.rowCount !== 1) {
    throw new InputError(
      "Du bist für diesen Baustellentag nicht als verantwortlicher Vorarbeiter eingeteilt.",
      403,
      "report_forbidden"
    );
  }
  if (input.personnelProvided && !input.personnel.some((entry) => entry.userId === context.userId)) {
    throw new InputError(
      "Der verantwortliche Vorarbeiter muss mit seinen Stunden im Bericht enthalten sein.",
      409,
      "report_author_hours_required"
    );
  }
  const personnel = await resolveReportPersonnel(
    client,
    context,
    input.constructionSiteId,
    input.workDate,
    input.personnel
  );
  const photos = await resolveReportPhotos(
    client,
    context,
    input.constructionSiteId,
    input.photos
  );

  const existingReport = await client.query(
    `SELECT id FROM site_reports
     WHERE company_id = $1 AND construction_site_id = $3 AND work_date = $4
       AND status IN ('submitted', 'approved', 'returned')
     ORDER BY (site_assignment_id = $2) DESC NULLS LAST, created_at DESC
     LIMIT 1`,
    [context.companyId, assignment.rows[0].id, input.constructionSiteId, input.workDate]
  );
  if (existingReport.rowCount === 1) {
    return {
      siteReport: await getSiteReportRecord(client, context, existingReport.rows[0].id),
      idempotent: true
    };
  }

  const result = await client.query(
    `INSERT INTO site_reports (
       company_id, construction_site_id, report_number, report_type, work_date,
       source_mode, summary, details, structured_data, source_document_id,
       status, author_user_id,
       site_assignment_id, client_report_id
     ) VALUES ($1, $2, NULL, $3, $4, 'digital', $5, $6, $7::JSONB, NULL, 'submitted', $8, $9, $10)
     RETURNING id`,
    [context.companyId, input.constructionSiteId, input.reportType, input.workDate,
      input.summary, input.details,
      JSON.stringify(structuredReportData(input, personnel, photos)),
      context.userId, assignment.rows[0].id, input.clientReportId]
  );
  return { siteReport: await getSiteReportRecord(client, context, result.rows[0].id), idempotent: false };
}

async function readCompanyLogo(staticDirectory, logoObjectKey) {
  if (!staticDirectory || !logoObjectKey || !/^[A-Za-z0-9/_-]+\.(?:png|webp|jpe?g)$/i.test(logoObjectKey)) return null;
  const assetsRoot = resolve(staticDirectory, "assets");
  const pngObjectKey = logoObjectKey.replace(/\.(?:webp|jpe?g)$/i, ".png");
  const candidate = resolve(assetsRoot, pngObjectKey);
  if (candidate !== assetsRoot && !candidate.startsWith(`${assetsRoot}${sep}`)) return null;
  try {
    return await readFile(candidate);
  } catch {
    return null;
  }
}

async function previewSiteReport(client, context, reportId, staticDirectory) {
  const roles = await requirePlanner(client, context);
  await requireScopedEntitySiteAccess(client, context, "site_reports", reportId, roles);
  const result = await client.query(
    `SELECT report.id, report.report_number, report.report_type, report.work_date,
            report.summary, report.details, report.structured_data, report.status,
            author.first_name || ' ' || author.last_name AS author_name,
            company.legal_name, company.display_name, company.street AS company_street,
            company.house_number AS company_house_number,
            company.postal_code AS company_postal_code,
            company.city AS company_city, company.phone AS company_phone,
            company.email AS company_email, company.website AS company_website,
            company.logo_object_key,
            site.site_number, site.name AS site_name,
            location.street AS site_street, location.house_number AS site_house_number,
            location.postal_code AS site_postal_code, location.city AS site_city,
            project.project_number, project.name AS project_name,
            COALESCE(customer.company_name, customer.first_name || ' ' || customer.last_name) AS customer_name
     FROM site_reports AS report
     JOIN users AS author
       ON author.company_id = report.company_id AND author.id = report.author_user_id
     JOIN companies AS company ON company.id = report.company_id
     JOIN construction_sites AS site
       ON site.company_id = report.company_id AND site.id = report.construction_site_id
     JOIN projects AS project
       ON project.company_id = site.company_id AND project.id = site.project_id
     JOIN customers AS customer
       ON customer.company_id = project.company_id AND customer.id = project.customer_id
     LEFT JOIN customer_locations AS location
       ON location.company_id = site.company_id AND location.id = site.customer_location_id
     WHERE report.company_id = $1
       AND report.id = $2
       AND report.status IN ('submitted', 'returned')`,
    [context.companyId, reportId]
  );
  if (result.rowCount !== 1) {
    throw new InputError(
      "Für diesen Bericht ist keine offene Vorschau verfügbar.",
      409,
      "site_report_preview_unavailable"
    );
  }
  const row = result.rows[0];
  const generatedAt = new Date().toISOString();
  const companySnapshot = {
    legalName: row.legal_name,
    displayName: row.display_name,
    street: row.company_street,
    houseNumber: row.company_house_number,
    postalCode: row.company_postal_code,
    city: row.company_city,
    phone: row.company_phone,
    email: row.company_email,
    website: row.company_website,
    logoObjectKey: row.logo_object_key
  };
  const siteAddress = [
    [row.site_street, row.site_house_number].filter(Boolean).join(" "),
    [row.site_postal_code, row.site_city].filter(Boolean).join(" ")
  ].filter(Boolean).join(", ");
  const pdf = await buildFinalReportPdf({
    report: {
      id: row.id,
      number: row.report_number,
      reportType: row.report_type,
      workDate: databaseDate(row.work_date),
      summary: row.summary,
      details: row.details,
      structuredData: row.structured_data,
      authorName: row.author_name
    },
    company: companySnapshot,
    context: {
      customerName: row.customer_name,
      projectNumber: row.project_number,
      projectName: row.project_name,
      siteNumber: row.site_number,
      siteName: row.site_name,
      siteAddress
    },
    finalizedAt: generatedAt,
    companyLogo: await readCompanyLogo(staticDirectory, row.logo_object_key),
    photos: await loadReportPhotoContents(client, context, row.structured_data),
    preview: true
  });
  return {
    fileName: `${row.report_number}-${databaseDate(row.work_date)}-Vorschau.pdf`,
    mimeType: "application/pdf",
    content: pdf
  };
}

async function returnSiteReport(client, context, reportId, input) {
  const roles = await requirePlanner(client, context);
  await requireScopedEntitySiteAccess(client, context, "site_reports", reportId, roles);
  const result = await client.query(
    `UPDATE site_reports
     SET status = 'returned',
         returned_by_user_id = $3,
         returned_at = CURRENT_TIMESTAMP,
         return_comment = $4,
         return_count = return_count + 1
     WHERE company_id = $1
       AND id = $2
       AND status = 'submitted'
       AND row_version = $5
     RETURNING id`,
    [context.companyId, reportId, context.userId, input.comment, input.rowVersion]
  );
  if (result.rowCount !== 1) {
    const current = await client.query(
      `SELECT status, row_version
       FROM site_reports
       WHERE company_id = $1 AND id = $2`,
      [context.companyId, reportId]
    );
    if (current.rowCount !== 1) {
      throw new InputError("Der Bericht wurde nicht gefunden.", 404, "site_report_not_found");
    }
    if (current.rows[0].status !== "submitted") {
      throw new InputError(
        "Nur ein Bericht mit offener Unterschrift kann zurückgegeben werden.",
        409,
        "site_report_state_conflict"
      );
    }
    throw new InputError(
      "Der Bericht wurde bereits geändert. Bitte neu laden.",
      409,
      "row_version_conflict"
    );
  }
  return getSiteReportRecord(client, context, reportId);
}

async function reviseMobileSiteReport(client, context, reportId, input) {
  const current = await client.query(
    `SELECT id, construction_site_id, work_date, author_user_id, status, row_version
     FROM site_reports
     WHERE company_id = $1 AND id = $2
     FOR UPDATE`,
    [context.companyId, reportId]
  );
  if (current.rowCount !== 1) {
    throw new InputError("Der Bericht wurde nicht gefunden.", 404, "site_report_not_found");
  }
  const row = current.rows[0];
  if (row.status !== "returned") {
    throw new InputError(
      "Nur ein zurückgegebener Bericht kann überarbeitet werden.",
      409,
      "site_report_state_conflict"
    );
  }
  if (row.author_user_id !== context.userId) {
    throw new InputError(
      "Nur der ursprüngliche Verfasser darf den Bericht überarbeiten.",
      403,
      "report_revision_forbidden"
    );
  }
  if (
    row.construction_site_id !== input.constructionSiteId
    || databaseDate(row.work_date) !== input.workDate
  ) {
    throw new InputError(
      "Baustelle und Arbeitstag eines Berichts sind unveränderlich.",
      409,
      "report_revision_conflict"
    );
  }
  if (Number(row.row_version) !== input.rowVersion) {
    throw new InputError(
      "Der Bericht wurde bereits geändert. Bitte neu laden.",
      409,
      "row_version_conflict"
    );
  }
  const access = await requireSiteWorkspaceAccess(
    client,
    context,
    input.constructionSiteId,
    input.workDate
  );
  if (!access.reportResponsible) {
    throw new InputError(
      "Du bist für diesen Baustellentag nicht berichtsverantwortlich.",
      403,
      "report_revision_forbidden"
    );
  }
  const personnel = await resolveReportPersonnel(
    client,
    context,
    input.constructionSiteId,
    input.workDate,
    input.personnel
  );
  const photos = await resolveReportPhotos(
    client,
    context,
    input.constructionSiteId,
    input.photos
  );
  if (
    input.personnelProvided
    && !input.personnel.some((entry) => entry.userId === context.userId)
  ) {
    throw new InputError(
      "Der verantwortliche Vorarbeiter muss mit seinen Stunden im Bericht enthalten sein.",
      409,
      "report_author_hours_required"
    );
  }
  const update = await client.query(
    `UPDATE site_reports
     SET report_type = $3,
         summary = $4,
         details = $5,
         structured_data = $6::JSONB,
         status = 'submitted'
     WHERE company_id = $1
       AND id = $2
       AND status = 'returned'
       AND row_version = $7
     RETURNING id`,
    [
      context.companyId,
      reportId,
      input.reportType,
      input.summary,
      input.details,
      JSON.stringify(structuredReportData(input, personnel, photos)),
      input.rowVersion
    ]
  );
  if (update.rowCount !== 1) {
    throw new InputError(
      "Der Bericht wurde bereits geändert. Bitte neu laden.",
      409,
      "row_version_conflict"
    );
  }
  return getSiteReportRecord(client, context, reportId);
}

async function finalizeSiteReport(client, context, reportId, input, staticDirectory) {
  const roles = await requirePlanner(client, context);
  await requireScopedEntitySiteAccess(client, context, "site_reports", reportId, roles);
  const result = await client.query(
    `SELECT report.id, report.report_number, report.report_type, report.work_date,
            report.summary, report.details, report.structured_data,
            report.status, report.row_version,
            author.first_name || ' ' || author.last_name AS author_name,
            company.legal_name, company.display_name, company.street AS company_street,
            company.house_number AS company_house_number, company.postal_code AS company_postal_code,
            company.city AS company_city, company.phone AS company_phone,
            company.email AS company_email, company.website AS company_website,
            company.logo_object_key,
            site.id AS construction_site_id, site.site_number, site.name AS site_name,
            location.street AS site_street, location.house_number AS site_house_number,
            location.postal_code AS site_postal_code, location.city AS site_city,
            project.project_number, project.name AS project_name,
            COALESCE(customer.company_name, customer.first_name || ' ' || customer.last_name) AS customer_name
     FROM site_reports AS report
     JOIN users AS author
       ON author.company_id = report.company_id AND author.id = report.author_user_id
     JOIN companies AS company ON company.id = report.company_id
     JOIN construction_sites AS site
       ON site.company_id = report.company_id AND site.id = report.construction_site_id
     JOIN projects AS project
       ON project.company_id = site.company_id AND project.id = site.project_id
     JOIN customers AS customer
       ON customer.company_id = project.company_id AND customer.id = project.customer_id
     LEFT JOIN customer_locations AS location
       ON location.company_id = site.company_id AND location.id = site.customer_location_id
     WHERE report.company_id = $1 AND report.id = $2
     FOR UPDATE OF report`,
    [context.companyId, reportId]
  );
  if (result.rowCount !== 1) throw new InputError("Der Bericht wurde nicht gefunden.", 404, "site_report_not_found");
  const row = result.rows[0];
  if (row.status !== "submitted") {
    throw new InputError("Nur ein eingereichter Bericht kann abgeschlossen werden.", 409, "site_report_state_conflict");
  }
  if (Number(row.row_version) !== input.rowVersion) {
    throw new InputError("Der Bericht wurde bereits geändert. Bitte neu laden.", 409, "row_version_conflict");
  }

  const finalizedAt = new Date().toISOString();
  const companySnapshot = {
    legalName: row.legal_name,
    displayName: row.display_name,
    street: row.company_street,
    houseNumber: row.company_house_number,
    postalCode: row.company_postal_code,
    city: row.company_city,
    phone: row.company_phone,
    email: row.company_email,
    website: row.company_website,
    logoObjectKey: row.logo_object_key
  };
  const siteAddress = [
    [row.site_street, row.site_house_number].filter(Boolean).join(" "),
    [row.site_postal_code, row.site_city].filter(Boolean).join(" ")
  ].filter(Boolean).join(", ");
  const reportSnapshot = {
    customerName: row.customer_name,
    projectNumber: row.project_number,
    projectName: row.project_name,
    siteNumber: row.site_number,
    siteName: row.site_name,
    siteAddress,
    structuredData: row.structured_data
  };
  const pdf = await buildFinalReportPdf({
    report: {
      id: row.id,
      number: row.report_number,
      reportType: row.report_type,
      workDate: databaseDate(row.work_date),
      summary: row.summary,
      details: row.details,
      structuredData: row.structured_data,
      authorName: row.author_name
    },
    company: companySnapshot,
    context: reportSnapshot,
    signatures: {
      employee: { name: input.employeeSignatureName, data: input.employeeSignatureData },
      customer: { name: input.customerSignatureName, data: input.customerSignatureData }
    },
    finalizedAt,
    companyLogo: await readCompanyLogo(staticDirectory, row.logo_object_key),
    photos: await loadReportPhotoContents(client, context, row.structured_data)
  });
  const reportLabel = row.report_type === "daily" ? "Bautagesbericht" : "Montageschein";
  const finalDocument = await createDocument(client, context, {
    title: `${reportLabel} ${row.report_number}`,
    category: "report",
    fileName: `${row.report_number}-${databaseDate(row.work_date)}.pdf`,
    mimeType: "application/pdf",
    content: pdf,
    customerId: null,
    projectId: null,
    constructionSiteId: row.construction_site_id
  });
  const update = await client.query(
    `UPDATE site_reports SET
       status = 'approved', approved_by_user_id = $3, approved_at = $4,
       employee_signature_name = $5, employee_signature_data = $6, employee_signed_at = $4,
       customer_signature_name = $7, customer_signature_data = $8, customer_signed_at = $4,
       final_document_id = $9, company_snapshot = $10::jsonb, report_snapshot = $11::jsonb
     WHERE company_id = $1 AND id = $2 AND status = 'submitted' AND row_version = $12
     RETURNING id`,
    [context.companyId, reportId, context.userId, finalizedAt,
      input.employeeSignatureName, input.employeeSignatureData,
      input.customerSignatureName, input.customerSignatureData,
      finalDocument.document.id, JSON.stringify(companySnapshot), JSON.stringify(reportSnapshot), input.rowVersion]
  );
  if (update.rowCount !== 1) {
    throw new InputError("Der Bericht wurde bereits geändert. Bitte neu laden.", 409, "row_version_conflict");
  }
  return getSiteReportRecord(client, context, reportId);
}

function publicAssignmentImportPreview(preview) {
  const { readyRows, rows, ...publicPreview } = preview;
  return {
    ...publicPreview,
    rows: rows.slice(0, 250),
    rowsTruncated: rows.length > 250
  };
}

async function prepareAssignmentImport(client, context, plan, mappings) {
  await requireFullPlanner(client, context);
  const [employeeResult, siteResult, existingResult] = await Promise.all([
    client.query(
      `SELECT id, personnel_number, first_name, last_name
       FROM users
       WHERE company_id = $1 AND status = 'active'`,
      [context.companyId]
    ),
    client.query(
      `SELECT site.id, site.name, site.installer_short_text,
              project.name AS project_name
       FROM construction_sites AS site
       JOIN projects AS project
         ON project.company_id = site.company_id AND project.id = site.project_id
       WHERE site.company_id = $1
         AND site.status IN ('planned', 'active', 'on_hold', 'delayed')`,
      [context.companyId]
    ),
    client.query(
      `SELECT assignment.user_id, assignment.construction_site_id,
              assignment.work_date, site.name AS site_name
       FROM site_assignments AS assignment
       JOIN construction_sites AS site
         ON site.company_id = assignment.company_id
        AND site.id = assignment.construction_site_id
       WHERE assignment.company_id = $1
         AND assignment.work_date BETWEEN $2 AND $3
         AND assignment.status <> 'cancelled'`,
      [context.companyId, plan.weekStart, plan.weekEnd]
    )
  ]);
  return buildAssignmentImportPreview(
    plan,
    employeeResult.rows.map((row) => ({
      id: row.id,
      personnelNumber: row.personnel_number,
      firstName: row.first_name,
      lastName: row.last_name
    })),
    siteResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      projectName: row.project_name,
      shortText: row.installer_short_text
    })),
    existingResult.rows.map((row) => ({
      employeeId: row.user_id,
      siteId: row.construction_site_id,
      siteName: row.site_name,
      workDate: databaseDate(row.work_date)
    })),
    mappings
  );
}

async function importAssignmentsFromWorkbook(client, context, plan, fileName, mappings) {
  const preview = await prepareAssignmentImport(client, context, plan, mappings);
  if (preview.readyRows.length === 0) {
    throw new InputError(
      "Es gibt keine sicher importierbaren X-Zuweisungen.",
      409,
      "no_importable_assignments"
    );
  }

  const groups = new Map();
  for (const row of preview.readyRows) {
    const key = `${row.employee.id}:${row.workDate}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  let importedCount = 0;
  let skippedChangedDays = 0;
  const affectedSiteDays = new Map();
  for (const rows of groups.values()) {
    const orderedRows = rows.sort((left, right) => left.siteOrder - right.siteOrder);
    const { employee, workDate } = orderedRows[0];
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`assignment:${context.companyId}:${employee.id}:${workDate}`]
    );
    const existing = await client.query(
      `SELECT 1 FROM site_assignments
       WHERE company_id = $1 AND user_id = $2 AND work_date = $3
         AND status <> 'cancelled'
       LIMIT 1`,
      [context.companyId, employee.id, workDate]
    );
    if (existing.rowCount) {
      skippedChangedDays += 1;
      continue;
    }
    const sequence = await client.query(
      `SELECT COALESCE(MAX(sequence_number), 0) AS maximum
       FROM site_assignments
       WHERE company_id = $1 AND user_id = $2 AND work_date = $3
         AND status <> 'cancelled'`,
      [context.companyId, employee.id, workDate]
    );
    let sequenceNumber = Number(sequence.rows[0].maximum) + 1;
    for (const row of orderedRows) {
      await client.query(
        `INSERT INTO site_assignments (
           company_id, user_id, construction_site_id, work_date,
           sequence_number, planned_start_time, status, comment,
           created_by_user_id, changed_by_user_id
         ) VALUES ($1, $2, $3, $4, $5, NULL, 'released', $6, $7, $7)`,
        [
          context.companyId,
          employee.id,
          row.site.id,
          workDate,
          sequenceNumber,
          `Excel-Import · ${fileName}`,
          context.userId
        ]
      );
      affectedSiteDays.set(
        `${row.site.id}:${workDate}`,
        { constructionSiteId: row.site.id, workDate }
      );
      sequenceNumber += 1;
      importedCount += 1;
    }
  }
  if (importedCount === 0) {
    throw new InputError(
      "Die Planung wurde zwischen Vorschau und Import geändert. Bitte Excel erneut prüfen.",
      409,
      "assignment_import_changed"
    );
  }
  for (const affected of affectedSiteDays.values()) {
    await reconcileAutomaticSiteForeman(
      client,
      context,
      affected.constructionSiteId,
      affected.workDate
    );
  }
  return {
    importedCount,
    skippedChangedDays,
    weekStart: plan.weekStart,
    weekEnd: plan.weekEnd
  };
}

function publicSiteImportPreview(preview) {
  const { readyRows, rows, ...publicPreview } = preview;
  return {
    ...publicPreview,
    rows: rows.slice(0, 200),
    rowsTruncated: rows.length > 200
  };
}

async function prepareSiteImport(client, context, plan) {
  await requireFullPlanner(client, context);
  const [siteResult, customerResult] = await Promise.all([
    client.query(
      `SELECT id, site_number, name
       FROM construction_sites
       WHERE company_id = $1 AND status IN ('planned', 'active', 'on_hold', 'delayed')`,
      [context.companyId]
    ),
    client.query(
      `SELECT id, company_name
       FROM customers
       WHERE company_id = $1 AND customer_type = 'company' AND status = 'active'`,
      [context.companyId]
    )
  ]);
  return buildSiteImportPreview(
    plan,
    siteResult.rows.map((row) => ({ id: row.id, number: row.site_number, name: row.name })),
    customerResult.rows.map((row) => ({ id: row.id, name: row.company_name }))
  );
}

async function importSitesFromWorkbook(client, context, plan) {
  await requireFullPlanner(client, context);
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    [`sites:${context.companyId}`]
  );
  const preview = await prepareSiteImport(client, context, plan);
  if (preview.readyRows.length === 0) {
    throw new InputError("Es gibt keine sicher importierbaren Baustellen.", 409, "no_importable_sites");
  }

  const createdCustomers = new Map();
  let createdCount = 0;
  for (const row of preview.readyRows) {
    const customerKey = normalizeImportText(row.customerName);
    let customerId = row.customerId || createdCustomers.get(customerKey);
    let isBillingLocation = false;
    if (!customerId) {
      const customer = await client.query(
        `INSERT INTO customers (
           company_id, customer_type, company_name,
           billing_street, billing_house_number, billing_postal_code, billing_city
         ) VALUES ($1, 'company', $2, $3, $4, $5, $6)
         RETURNING id`,
        [context.companyId, row.customerName, row.street, row.houseNumber, row.postalCode, row.city]
      );
      customerId = customer.rows[0].id;
      createdCustomers.set(customerKey, customerId);
      isBillingLocation = true;
    }
    const location = await client.query(
      `INSERT INTO customer_locations (
         company_id, customer_id, name, location_type, street, house_number,
         postal_code, city, is_billing_location
       ) VALUES ($1, $2, $3, 'construction', $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        context.companyId,
        customerId,
        row.siteName,
        row.street,
        row.houseNumber,
        row.postalCode,
        row.city,
        isBillingLocation
      ]
    );
    const project = await resolveConstructionSiteParent(client, context, {
      customerId,
      street: row.street,
      houseNumber: row.houseNumber,
      postalCode: row.postalCode,
      city: row.city
    });
    await client.query(
      `INSERT INTO project_locations (company_id, project_id, customer_location_id)
       VALUES ($1, $2, $3)`,
      [context.companyId, project.id, location.rows[0].id]
    );
    await client.query(
      `INSERT INTO construction_sites (
         company_id, project_id, customer_location_id, name, installer_short_text, status
       ) VALUES ($1, $2, $3, $4, $5, 'active')`,
      [context.companyId, project.id, location.rows[0].id, row.siteName, row.installerShortText]
    );
    createdCount += 1;
  }
  return { createdCount, skippedCount: preview.sourceRowCount - createdCount };
}

async function getEmployeeRecord(client, context, employeeId) {
  const result = await client.query(
    `SELECT account.id, account.personnel_number, account.first_name, account.last_name,
            account.email, account.phone,
            account.must_change_password, account.status, account.archived_at,
            account.archived_reason, account.row_version,
            account.trainer_user_id,
            account.driving_licence_classes,
            COALESCE(
              jsonb_agg(role.role_key ORDER BY role.role_key)
                FILTER (WHERE role.id IS NOT NULL),
              '[]'::jsonb
            ) AS roles
     FROM users AS account
     LEFT JOIN user_roles AS role_assignment
       ON role_assignment.company_id = account.company_id
      AND role_assignment.user_id = account.id
      AND role_assignment.revoked_at IS NULL
     LEFT JOIN roles AS role
       ON role.company_id = role_assignment.company_id
      AND role.id = role_assignment.role_id
      AND role.status = 'active'
     WHERE account.company_id = $1
       AND account.id = $2
       AND account.status IN ('active', 'archived')
     GROUP BY account.id`,
    [context.companyId, employeeId]
  );
  if (result.rowCount !== 1) {
    throw new InputError("Der Mitarbeiter wurde nicht gefunden.", 404, "employee_not_found");
  }
  return employeeDto(result.rows[0]);
}

async function createEmployee(client, context, input) {
  const roles = await requireFullPlanner(client, context);
  if (
    MANAGEMENT_ROLES.has(input.role)
    && ![...roles].some((role) => MANAGEMENT_ASSIGNER_ROLES.has(role))
  ) {
    throw new InputError(
      "Nur Geschäftsführung oder Administrator dürfen Verwaltungsrollen vergeben.",
      403,
      "forbidden"
    );
  }
  const duplicate = await client.query(
    `SELECT personnel_number, email
     FROM users
     WHERE company_id = $1
       AND (
         personnel_number = $2
         OR ($3::TEXT IS NOT NULL AND LOWER(email) = LOWER($3))
       )`,
    [context.companyId, input.personnelNumber, input.email]
  );
  if (duplicate.rows.some((row) => row.personnel_number === input.personnelNumber)) {
    throw new InputError("Diese Personalnummer ist bereits vergeben.", 409, "personnel_number_exists");
  }
  if (input.email && duplicate.rows.some((row) => row.email?.toLowerCase() === input.email.toLowerCase())) {
    throw new InputError("Diese E-Mail-Adresse ist bereits vergeben.", 409, "employee_email_exists");
  }
  const roleResult = await client.query(
    "SELECT id FROM roles WHERE company_id = $1 AND role_key = $2 AND status = 'active'",
    [context.companyId, input.role]
  );
  if (roleResult.rowCount !== 1) throw new InputError("Die gewählte Rolle ist nicht verfügbar.");

  const passwordHash = await hashPassword(input.temporaryPassword);
  const inserted = await client.query(
    `INSERT INTO users (
       company_id, personnel_number, first_name, last_name, email, phone,
       password_hash, must_change_password, driving_licence_classes
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8)
     RETURNING id, personnel_number, first_name, last_name, email, phone, must_change_password`,
    [
      context.companyId,
      input.personnelNumber,
      input.firstName,
      input.lastName,
      input.email,
      input.phone,
      passwordHash,
      input.drivingLicenceClasses
    ]
  );
  await client.query(
    `INSERT INTO user_roles (company_id, user_id, role_id, assigned_by_user_id, reason)
     VALUES ($1, $2, $3, $4, 'Anlage in der Verwaltung')`,
    [context.companyId, inserted.rows[0].id, roleResult.rows[0].id, context.userId]
  );
  return getEmployeeRecord(client, context, inserted.rows[0].id);
}

async function updateEmployee(client, context, employeeId, input) {
  const actorRoles = await requireFullPlanner(client, context);
  if (
    MANAGEMENT_ROLES.has(input.role)
    && ![...actorRoles].some((role) => MANAGEMENT_ASSIGNER_ROLES.has(role))
  ) {
    throw new InputError(
      "Nur Geschäftsführung oder Administrator dürfen Verwaltungsrollen vergeben.",
      403,
      "forbidden"
    );
  }

  const current = await client.query(
    `SELECT id, personnel_number, row_version
     FROM users
     WHERE company_id = $1 AND id = $2 AND status = 'active'
     FOR UPDATE`,
    [context.companyId, employeeId]
  );
  if (current.rowCount !== 1) {
    throw new InputError("Der Mitarbeiter wurde nicht gefunden.", 404, "employee_not_found");
  }
  if (Number(current.rows[0].row_version) !== input.rowVersion) {
    throw new InputError(
      "Der Mitarbeiter wurde zwischenzeitlich geändert. Bitte die Verwaltung aktualisieren.",
      409,
      "row_version_conflict"
    );
  }

  const currentRoles = await activeRoleKeys(client, {
    ...context,
    userId: employeeId
  });
  if (currentRoles.has("admin")) {
    throw new InputError(
      "Das Administratorkonto wird aus Sicherheitsgründen nicht über die Mitarbeiterliste geändert.",
      409,
      "admin_account_locked"
    );
  }
  if (
    currentRoles.has("apprentice")
    && input.role !== "apprentice"
    && !input.roleChangeConfirmed
  ) {
    throw new InputError(
      "Die Azubi-Rolle wurde nicht geändert. Bitte Schäfchen neu laden und die Rollenänderung erneut auswählen.",
      409,
      "employee_role_change_confirmation_required"
    );
  }
  if (
    [...currentRoles].some((role) => MANAGEMENT_ROLES.has(role))
    && ![...actorRoles].some((role) => MANAGEMENT_ASSIGNER_ROLES.has(role))
  ) {
    throw new InputError(
      "Nur Geschäftsführung oder Administrator dürfen Verwaltungsrollen ändern.",
      403,
      "forbidden"
    );
  }

  const duplicate = await client.query(
    `SELECT personnel_number, email
     FROM users
     WHERE company_id = $1
       AND id <> $3
       AND (
         personnel_number = $2
         OR ($4::TEXT IS NOT NULL AND LOWER(email) = LOWER($4))
       )`,
    [context.companyId, input.personnelNumber, employeeId, input.email]
  );
  if (duplicate.rows.some((row) => row.personnel_number === input.personnelNumber)) {
    throw new InputError("Diese Personalnummer ist bereits vergeben.", 409, "personnel_number_exists");
  }
  if (input.email && duplicate.rows.some((row) => row.email?.toLowerCase() === input.email.toLowerCase())) {
    throw new InputError("Diese E-Mail-Adresse ist bereits vergeben.", 409, "employee_email_exists");
  }

  if (currentRoles.has("foreman") && input.role !== "foreman") {
    const responsibility = await client.query(
      `SELECT 1
       FROM site_assignments
       WHERE company_id = $1
         AND user_id = $2
         AND status IN ('draft', 'released')
         AND report_responsible
         AND report_responsibility_source = 'manual'
       LIMIT 1`,
      [context.companyId, employeeId]
    );
    if (responsibility.rowCount) {
      throw new InputError(
        "Der Mitarbeiter ist noch als Vorarbeiter eingeplant. Bitte zuerst diese Einsätze ändern.",
        409,
        "employee_has_foreman_assignments"
      );
    }
  }

  const roleResult = await client.query(
    "SELECT id FROM roles WHERE company_id = $1 AND role_key = $2 AND status = 'active'",
    [context.companyId, input.role]
  );
  if (roleResult.rowCount !== 1) throw new InputError("Die gewählte Rolle ist nicht verfügbar.");

  // Ein Ausbilder muss zur selben Firma gehoeren und darf nicht der
  // Auszubildende selbst sein. Die Datenbank verlangt beides ohnehin; hier
  // entsteht daraus eine verstaendliche Meldung statt eines Fremdschluessels.
  if (input.trainerUserId) {
    if (input.trainerUserId === employeeId) {
      throw new InputError("Niemand bildet sich selbst aus.", 400, "trainer_is_self");
    }
    const trainer = await client.query(
      "SELECT 1 FROM users WHERE company_id = $1 AND id = $2 AND status = 'active'",
      [context.companyId, input.trainerUserId]
    );
    if (trainer.rowCount !== 1) {
      throw new InputError("Der Ausbilder wurde nicht gefunden.", 404, "trainer_not_found");
    }
  }

  const updated = await client.query(
    `UPDATE users
     SET personnel_number = $3, first_name = $4, last_name = $5,
         email = $6, phone = $7,
         trainer_user_id = $9,
         driving_licence_classes = $10
     WHERE company_id = $1 AND id = $2 AND row_version = $8
     RETURNING id`,
    [
      context.companyId,
      employeeId,
      input.personnelNumber,
      input.firstName,
      input.lastName,
      input.email,
      input.phone,
      input.rowVersion,
      input.trainerUserId,
      input.drivingLicenceClasses
    ]
  );
  if (updated.rowCount !== 1) {
    throw new InputError(
      "Der Mitarbeiter wurde zwischenzeitlich geändert. Bitte die Verwaltung aktualisieren.",
      409,
      "row_version_conflict"
    );
  }
  await client.query(
    `UPDATE user_roles AS zuordnung
     SET revoked_at = CURRENT_TIMESTAMP,
         revoked_by_user_id = $3,
         reason = 'Rollenänderung in der Mitarbeiterverwaltung'
     FROM roles AS rolle
     WHERE zuordnung.company_id = $1
       AND zuordnung.user_id = $2
       AND zuordnung.revoked_at IS NULL
       AND zuordnung.role_id <> $4
       AND rolle.company_id = zuordnung.company_id
       AND rolle.id = zuordnung.role_id`,
    [context.companyId, employeeId, context.userId, roleResult.rows[0].id]
  );
  await client.query(
    `INSERT INTO user_roles (
       company_id, user_id, role_id, assigned_by_user_id, reason
     )
     SELECT $1, $2, $3, $4, 'Rollenänderung in der Mitarbeiterverwaltung'
     WHERE NOT EXISTS (
       SELECT 1 FROM user_roles
       WHERE company_id = $1 AND user_id = $2 AND role_id = $3 AND revoked_at IS NULL
     )`,
    [context.companyId, employeeId, roleResult.rows[0].id, context.userId]
  );

  return getEmployeeRecord(client, context, employeeId);
}

function employeeLifecycleInput(body) {
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  const rowVersion = Number(body?.rowVersion);
  if (reason.length < 3 || reason.length > 500) {
    throw new InputError("Die Begründung muss zwischen 3 und 500 Zeichen lang sein.");
  }
  if (!Number.isSafeInteger(rowVersion) || rowVersion < 1) {
    throw new InputError("Die Mitarbeiterversion ist ungültig.");
  }
  return { reason, rowVersion };
}

async function requireEmployeeLifecycleAdministrator(client, context) {
  const roles = await requireFullPlanner(client, context);
  if (![...roles].some((role) => MANAGEMENT_ASSIGNER_ROLES.has(role))) {
    throw new InputError(
      "Mitarbeiter dürfen nur durch Administration oder Geschäftsführung entfernt oder reaktiviert werden.",
      403,
      "employee_lifecycle_forbidden"
    );
  }
  return roles;
}

async function removeEmployee(client, context, employeeId, input) {
  await requireEmployeeLifecycleAdministrator(client, context);
  if (employeeId === context.userId) {
    throw new InputError("Das eigene Konto kann nicht entfernt werden.", 409, "self_removal_forbidden");
  }
  const current = await client.query(
    `SELECT id, status, row_version FROM users
     WHERE company_id = $1 AND id = $2 FOR UPDATE`,
    [context.companyId, employeeId]
  );
  if (current.rowCount !== 1) {
    throw new InputError("Der Mitarbeiter wurde nicht gefunden.", 404, "employee_not_found");
  }
  if (Number(current.rows[0].row_version) !== input.rowVersion) {
    throw new InputError("Der Mitarbeiter wurde zwischenzeitlich geändert.", 409, "row_version_conflict");
  }
  if (current.rows[0].status === "archived") {
    throw new InputError("Der Mitarbeiter ist bereits archiviert.", 409, "employee_already_archived");
  }
  const targetRoles = await activeRoleKeys(client, { ...context, userId: employeeId });
  if (targetRoles.has("admin")) {
    throw new InputError("Das Firmenadministratorkonto kann nicht über die Mitarbeiterliste entfernt werden.", 409, "admin_account_locked");
  }
  const removal = await client.query(
    "SELECT removal_mode FROM api_remove_or_archive_employee($1,$2,$3)",
    [employeeId, context.userId, input.reason]
  );
  const mode = removal.rows[0]?.removal_mode;
  return {
    id: employeeId,
    mode,
    employee: mode === "archived" ? await getEmployeeRecord(client, context, employeeId) : null
  };
}

async function reactivateEmployee(client, context, employeeId, input) {
  await requireEmployeeLifecycleAdministrator(client, context);
  const current = await client.query(
    `SELECT id, status, row_version FROM users
     WHERE company_id = $1 AND id = $2 FOR UPDATE`,
    [context.companyId, employeeId]
  );
  if (current.rowCount !== 1) {
    throw new InputError("Der archivierte Mitarbeiter wurde nicht gefunden.", 404, "employee_not_found");
  }
  if (current.rows[0].status !== "archived") {
    throw new InputError("Nur archivierte Mitarbeiter können reaktiviert werden.", 409, "employee_not_archived");
  }
  if (Number(current.rows[0].row_version) !== input.rowVersion) {
    throw new InputError("Der Mitarbeiter wurde zwischenzeitlich geändert.", 409, "row_version_conflict");
  }
  await client.query(
    "SELECT set_config('app.employee_lifecycle_reason', $1, TRUE)",
    [input.reason]
  );
  const updated = await client.query(
    `UPDATE users SET status = 'active'
     WHERE company_id = $1 AND id = $2 AND row_version = $3 RETURNING id`,
    [context.companyId, employeeId, input.rowVersion]
  );
  if (updated.rowCount !== 1) {
    throw new InputError("Der Mitarbeiter wurde zwischenzeitlich geändert.", 409, "row_version_conflict");
  }
  return getEmployeeRecord(client, context, employeeId);
}

async function createCustomer(client, context, input) {
  await requireFullPlanner(client, context);
  const existing = await client.query(
    `SELECT customer_type, company_name, first_name, last_name
     FROM customers
     WHERE company_id = $1 AND status = 'active'`,
    [context.companyId]
  );
  const requestedName = input.customerType === "company"
    ? input.companyName
    : `${input.firstName} ${input.lastName}`;
  const duplicate = existing.rows.some((row) => {
    if (row.customer_type !== input.customerType) return false;
    const existingName = row.customer_type === "company"
      ? row.company_name
      : `${row.first_name} ${row.last_name}`;
    return normalizeImportText(existingName) === normalizeImportText(requestedName);
  });
  if (duplicate) {
    throw new InputError("Ein aktiver Kunde mit diesem Namen existiert bereits.", 409, "customer_name_exists");
  }

  const inserted = await client.query(
    `INSERT INTO customers (
       company_id, customer_type, company_name, first_name, last_name,
       email, phone, billing_street, billing_house_number, billing_postal_code, billing_city
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, customer_number, customer_type, company_name, first_name, last_name,
               email, phone, billing_street, billing_house_number, billing_postal_code, billing_city,
               status, row_version, updated_at`,
    [
      context.companyId,
      input.customerType,
      input.companyName,
      input.firstName,
      input.lastName,
      input.email,
      input.phone,
      input.street,
      input.houseNumber,
      input.postalCode,
      input.city
    ]
  );
  return customerDto(inserted.rows[0]);
}

async function updateCustomer(client, context, customerId, input) {
  await requireFullPlanner(client, context);
  const current = await client.query(
    `SELECT id, status, row_version
     FROM customers
     WHERE company_id = $1 AND id = $2 AND status <> 'merged'
     FOR UPDATE`,
    [context.companyId, customerId]
  );
  if (current.rowCount !== 1) {
    throw new InputError("Der Kunde wurde nicht gefunden.", 404, "customer_not_found");
  }
  const currentCustomer = current.rows[0];
  if (Number(currentCustomer.row_version) !== input.rowVersion) {
    throw new InputError(
      "Der Kunde wurde zwischenzeitlich geändert. Bitte die Verwaltung aktualisieren.",
      409,
      "row_version_conflict"
    );
  }

  const requestedName = input.customerType === "company"
    ? input.companyName
    : `${input.firstName} ${input.lastName}`;
  if (input.status === "active") {
    const activeCustomers = await client.query(
      `SELECT id, customer_type, company_name, first_name, last_name
       FROM customers
       WHERE company_id = $1 AND status = 'active' AND id <> $2`,
      [context.companyId, customerId]
    );
    const duplicate = activeCustomers.rows.some((row) => {
      if (row.customer_type !== input.customerType) return false;
      const existingName = row.customer_type === "company"
        ? row.company_name
        : `${row.first_name} ${row.last_name}`;
      return normalizeImportText(existingName) === normalizeImportText(requestedName);
    });
    if (duplicate) {
      throw new InputError("Ein aktiver Kunde mit diesem Namen existiert bereits.", 409, "customer_name_exists");
    }
  }

  if (currentCustomer.status === "active" && input.status === "archived") {
    const used = await client.query(
      `SELECT 1
       FROM projects
       WHERE company_id = $1 AND customer_id = $2
         AND status IN ('planned', 'active', 'on_hold')
       LIMIT 1`,
      [context.companyId, customerId]
    );
    if (used.rowCount > 0) {
      throw new InputError(
        "Der Kunde besitzt noch aktive Projekte und kann deshalb nicht archiviert werden.",
        409,
        "customer_has_active_projects"
      );
    }
  }

  const updated = await client.query(
    `UPDATE customers
     SET customer_type = $3, company_name = $4, first_name = $5, last_name = $6,
         email = $7, phone = $8, billing_street = $9, billing_house_number = $10,
         billing_postal_code = $11, billing_city = $12, status = $13::VARCHAR,
         archived_at = CASE
           WHEN $13::VARCHAR = 'archived' THEN COALESCE(archived_at, CURRENT_TIMESTAMP)
           ELSE NULL
         END
     WHERE company_id = $1 AND id = $2 AND row_version = $14
     RETURNING id, customer_number, customer_type, company_name, first_name, last_name,
               email, phone, billing_street, billing_house_number, billing_postal_code, billing_city,
               status, row_version, updated_at`,
    [
      context.companyId,
      customerId,
      input.customerType,
      input.companyName,
      input.firstName,
      input.lastName,
      input.email,
      input.phone,
      input.street,
      input.houseNumber,
      input.postalCode,
      input.city,
      input.status,
      input.rowVersion
    ]
  );
  if (updated.rowCount !== 1) {
    throw new InputError(
      "Der Kunde wurde zwischenzeitlich geändert. Bitte die Verwaltung aktualisieren.",
      409,
      "row_version_conflict"
    );
  }
  return customerDto(updated.rows[0]);
}

async function setProjectManager(client, context, projectId, projectManagerId) {
  const project = await client.query(
    `SELECT id
     FROM projects
     WHERE company_id = $1 AND id = $2
     FOR UPDATE`,
    [context.companyId, projectId]
  );
  if (project.rowCount !== 1) {
    throw new InputError("Das Projekt wurde nicht gefunden.", 404, "project_not_found");
  }
  if (projectManagerId) {
    const manager = await client.query(
      `SELECT account.id, account.first_name, account.last_name
       FROM users AS account
       JOIN user_roles AS assignment
         ON assignment.company_id = account.company_id
        AND assignment.user_id = account.id
        AND assignment.revoked_at IS NULL
       JOIN roles AS role
         ON role.company_id = assignment.company_id
        AND role.id = assignment.role_id
        AND role.status = 'active'
        AND role.role_key = 'project_manager'
       WHERE account.company_id = $1
         AND account.id = $2
         AND account.status = 'active'
       LIMIT 1`,
      [context.companyId, projectManagerId]
    );
    if (manager.rowCount !== 1) {
      throw new InputError(
        "Der gewählte Projektleiter ist nicht aktiv oder besitzt nicht die Projektleiterrolle.",
        409,
        "project_manager_role_conflict"
      );
    }
  }

  await client.query(
    `UPDATE project_responsibles
     SET removed_at = CURRENT_TIMESTAMP, is_primary = FALSE
     WHERE company_id = $1
       AND project_id = $2
       AND responsibility = 'project_management'
       AND removed_at IS NULL
       AND user_id IS DISTINCT FROM $3::UUID`,
    [context.companyId, projectId, projectManagerId]
  );
  if (projectManagerId) {
    await client.query(
      `INSERT INTO project_responsibles (
         company_id, project_id, user_id, responsibility, is_primary
       )
       SELECT $1, $2, $3, 'project_management', TRUE
       WHERE NOT EXISTS (
         SELECT 1
         FROM project_responsibles
         WHERE company_id = $1
           AND project_id = $2
           AND user_id = $3
           AND responsibility = 'project_management'
           AND removed_at IS NULL
       )`,
      [context.companyId, projectId, projectManagerId]
    );
    await client.query(
      `UPDATE project_responsibles
       SET is_primary = TRUE
       WHERE company_id = $1
         AND project_id = $2
         AND user_id = $3
         AND responsibility = 'project_management'
         AND removed_at IS NULL`,
      [context.companyId, projectId, projectManagerId]
    );
  }
}

async function getProjectManager(client, context, projectId) {
  const result = await client.query(
    `SELECT responsible.user_id AS project_manager_id,
            account.first_name || ' ' || account.last_name AS project_manager_name
     FROM project_responsibles AS responsible
     JOIN users AS account
       ON account.company_id = responsible.company_id
      AND account.id = responsible.user_id
     WHERE responsible.company_id = $1
       AND responsible.project_id = $2
       AND responsible.responsibility = 'project_management'
       AND responsible.removed_at IS NULL
     ORDER BY responsible.is_primary DESC, responsible.assigned_at, responsible.id
     LIMIT 1`,
    [context.companyId, projectId]
  );
  return result.rows[0] || {
    project_manager_id: null,
    project_manager_name: null
  };
}

async function createProject(client, context, input) {
  const roles = await requireFullPlanner(client, context);
  const customer = await client.query(
    `SELECT id, customer_type, company_name, first_name, last_name
     FROM customers
     WHERE company_id = $1 AND id = $2 AND status = 'active'`,
    [context.companyId, input.customerId]
  );
  if (customer.rowCount !== 1) {
    throw new InputError("Der Kunde wurde nicht gefunden.", 404, "customer_not_found");
  }
  const existing = await client.query(
    `SELECT name FROM projects
     WHERE company_id = $1 AND customer_id = $2
       AND status IN ('planned', 'active', 'on_hold')`,
    [context.companyId, input.customerId]
  );
  if (existing.rows.some((row) => normalizeImportText(row.name) === normalizeImportText(input.name))) {
    throw new InputError("Für diesen Kunden existiert bereits ein aktives Projekt mit diesem Namen.", 409, "project_name_exists");
  }
  const inserted = await client.query(
    `INSERT INTO projects (company_id, customer_id, name, status, installer_short_text)
     VALUES ($1, $2, $3, 'active', $4)
     RETURNING id, customer_id, project_number, name, installer_short_text,
               status, row_version, updated_at`,
    [context.companyId, input.customerId, input.name, input.installerShortText]
  );
  const projectManagerId = hasProjectScopedAccess(roles)
    ? context.userId
    : input.projectManagerId;
  await setProjectManager(
    client,
    context,
    inserted.rows[0].id,
    projectManagerId
  );
  const manager = await getProjectManager(client, context, inserted.rows[0].id);
  const row = customer.rows[0];
  return projectDto({
    ...inserted.rows[0],
    ...manager,
    customer_name: row.customer_type === "company"
      ? row.company_name
      : `${row.first_name} ${row.last_name}`,
    site_count: 0
  });
}

async function updateProject(client, context, projectId, input) {
  const roles = await requirePlanner(client, context);
  await requireProjectAccess(client, context, projectId, roles);
  if (
    hasProjectScopedAccess(roles)
    && input.projectManagerId !== undefined
    && input.projectManagerId !== context.userId
  ) {
    throw new InputError(
      "Projektleiter dürfen die Projektverantwortung nicht selbst übertragen.",
      403,
      "project_manager_assignment_forbidden"
    );
  }
  const current = await client.query(
    `SELECT project.id, project.customer_id, project.status, project.row_version,
            customer.status AS customer_status,
            COALESCE(customer.company_name, customer.first_name || ' ' || customer.last_name) AS customer_name
     FROM projects AS project
     JOIN customers AS customer
       ON customer.company_id = project.company_id AND customer.id = project.customer_id
     WHERE project.company_id = $1 AND project.id = $2 AND project.status <> 'cancelled'
     FOR UPDATE OF project`,
    [context.companyId, projectId]
  );
  if (current.rowCount !== 1) {
    throw new InputError("Das Projekt wurde nicht gefunden.", 404, "project_not_found");
  }
  const currentProject = current.rows[0];
  if (Number(currentProject.row_version) !== input.rowVersion) {
    throw new InputError(
      "Das Projekt wurde zwischenzeitlich geändert. Bitte die Verwaltung aktualisieren.",
      409,
      "row_version_conflict"
    );
  }
  if (["planned", "active", "on_hold"].includes(input.status) && currentProject.customer_status !== "active") {
    throw new InputError(
      "Das Projekt kann nur mit einem aktiven Kunden aktiviert werden.",
      409,
      "project_customer_archived"
    );
  }

  const duplicate = await client.query(
    `SELECT name
     FROM projects
     WHERE company_id = $1 AND customer_id = $2 AND id <> $3
       AND status IN ('planned', 'active', 'on_hold')`,
    [context.companyId, currentProject.customer_id, projectId]
  );
  if (
    ["planned", "active", "on_hold"].includes(input.status)
    && duplicate.rows.some((row) => normalizeImportText(row.name) === normalizeImportText(input.name))
  ) {
    throw new InputError(
      "Für diesen Kunden existiert bereits ein aktives Projekt mit diesem Namen.",
      409,
      "project_name_exists"
    );
  }

  if (
    ["planned", "active", "on_hold"].includes(currentProject.status)
    && ["completed", "archived"].includes(input.status)
  ) {
    const used = await client.query(
      `SELECT 1
       FROM construction_sites
       WHERE company_id = $1 AND project_id = $2
         AND status IN ('planned', 'active', 'on_hold', 'delayed')
       LIMIT 1`,
      [context.companyId, projectId]
    );
    if (used.rowCount > 0) {
      throw new InputError(
        "Das Projekt besitzt noch aktive Baustellen und kann deshalb nicht abgeschlossen werden.",
        409,
        "project_has_active_sites"
      );
    }
  }

  const updated = await client.query(
    `UPDATE projects
     SET name = $3, installer_short_text = $4, status = $5::VARCHAR,
         completed_at = CASE
           WHEN $5::VARCHAR = 'completed' THEN COALESCE(completed_at, CURRENT_TIMESTAMP)
           ELSE NULL
         END,
         archived_at = CASE
           WHEN $5::VARCHAR = 'archived' THEN COALESCE(archived_at, CURRENT_TIMESTAMP)
           ELSE NULL
         END,
         reopened_at = CASE
           WHEN status IN ('completed', 'archived') AND $5::VARCHAR IN ('planned', 'active', 'on_hold')
             THEN CURRENT_TIMESTAMP
           ELSE reopened_at
         END
     WHERE company_id = $1 AND id = $2 AND row_version = $6
     RETURNING id, customer_id, project_number, name, installer_short_text,
               status, row_version, updated_at`,
    [context.companyId, projectId, input.name, input.installerShortText, input.status, input.rowVersion]
  );
  if (updated.rowCount !== 1) {
    throw new InputError(
      "Das Projekt wurde zwischenzeitlich geändert. Bitte die Verwaltung aktualisieren.",
      409,
      "row_version_conflict"
    );
  }
  if (input.projectManagerId !== undefined && !hasProjectScopedAccess(roles)) {
    await setProjectManager(client, context, projectId, input.projectManagerId);
  }
  const manager = await getProjectManager(client, context, projectId);
  return projectDto({
    ...updated.rows[0],
    ...manager,
    customer_name: currentProject.customer_name,
    site_count: 0
  });
}

async function createConstructionSite(client, context, input) {
  const roles = await requirePlanner(client, context);
  if (hasProjectScopedAccess(roles) && !input.projectId) {
    throw new InputError(
      "Projektleiter können Baustellen nur innerhalb eines zugeordneten Projekts anlegen.",
      403,
      "site_project_required"
    );
  }
  if (input.projectId) {
    await requireProjectAccess(client, context, input.projectId, roles);
  } else if (input.customerId) {
    await requireCustomerAccess(client, context, input.customerId, roles);
  }
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    [`sites:${context.companyId}`]
  );
  const existingNames = await client.query(
    `SELECT name FROM construction_sites
     WHERE company_id = $1 AND status IN ('planned', 'active', 'on_hold', 'delayed')`,
    [context.companyId]
  );
  if (existingNames.rows.some((row) => normalizeImportText(row.name) === normalizeImportText(input.name))) {
    throw new InputError("Eine aktive Baustelle mit diesem Namen existiert bereits.", 409, "site_name_exists");
  }

  const projectRow = await resolveConstructionSiteParent(client, context, input);
  if (!hasProjectScopedAccess(roles) && input.projectManagerId !== undefined) {
    await setProjectManager(client, context, projectRow.id, input.projectManagerId);
  }
  const projectManager = await getProjectManager(client, context, projectRow.id);
  const location = await client.query(
    `INSERT INTO customer_locations (
       company_id, customer_id, name, location_type, street, house_number,
       postal_code, city, is_billing_location
     ) VALUES ($1, $2, $3, 'construction', $4, $5, $6, $7, FALSE)
     RETURNING id`,
    [
      context.companyId,
      projectRow.customer_id,
      input.name,
      input.street,
      input.houseNumber,
      input.postalCode,
      input.city
    ]
  );
  await client.query(
    `INSERT INTO project_locations (company_id, project_id, customer_location_id)
     VALUES ($1, $2, $3)`,
    [context.companyId, projectRow.id, location.rows[0].id]
  );
  const inserted = await client.query(
    `INSERT INTO construction_sites (
       company_id, project_id, customer_location_id, name, installer_short_text, status
     ) VALUES ($1, $2, $3, $4, $5, 'active')
     RETURNING id, project_id, site_number, name, installer_short_text, qr_code,
               status, row_version, updated_at`,
    [context.companyId, projectRow.id, location.rows[0].id, input.name, input.installerShortText]
  );
  return siteDto({
    ...inserted.rows[0],
    customer_id: projectRow.customer_id,
    customer_name: projectRow.customer_type === "company"
      ? projectRow.company_name
      : `${projectRow.first_name} ${projectRow.last_name}`,
    project_name: projectRow.name,
    project_manager_ids: projectManager.project_manager_id
      ? [projectManager.project_manager_id]
      : [],
    street: input.street,
    house_number: input.houseNumber,
    postal_code: input.postalCode,
    city: input.city
  });
}

async function buildConstructionSiteQrCode(
  client,
  context,
  constructionSiteId,
  allowedOrigin
) {
  const roles = await requirePlanner(client, context);
  await requireConstructionSiteAccess(
    client,
    context,
    constructionSiteId,
    roles
  );
  const result = await client.query(
    `SELECT site_number, qr_code
     FROM construction_sites
     WHERE company_id = $1
       AND id = $2
       AND status <> 'cancelled'`,
    [context.companyId, constructionSiteId]
  );
  if (result.rowCount !== 1) {
    throw new InputError("Die Baustelle wurde nicht gefunden.", 404, "site_not_found");
  }
  const row = result.rows[0];
  const target = new URL("/", allowedOrigin);
  target.searchParams.set("site", row.qr_code || constructionSiteId);
  const svg = await qrToString(target.toString(), {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
    width: 480,
    color: {
      dark: "#111111ff",
      light: "#ffffffff"
    }
  });
  return {
    fileName: `${row.site_number}-QR.svg`,
    mimeType: "image/svg+xml; charset=utf-8",
    content: Buffer.from(svg, "utf8"),
    target: target.toString()
  };
}

async function updateConstructionSite(client, context, siteId, input) {
  const roles = await requirePlanner(client, context);
  await requireConstructionSiteAccess(client, context, siteId, roles);
  if (hasProjectScopedAccess(roles) && input.projectManagerId !== undefined) {
    throw new InputError(
      "Projektleiter dürfen die Projektverantwortung nicht selbst übertragen.",
      403,
      "project_manager_assignment_forbidden"
    );
  }
  const current = await client.query(
    `SELECT site.id, site.project_id, site.customer_location_id, site.site_number,
            site.qr_code,
            site.name, site.status, site.row_version,
            project.customer_id, project.name AS project_name, project.status AS project_status,
            customer.customer_type, customer.company_name, customer.first_name, customer.last_name,
            customer.status AS customer_status
     FROM construction_sites AS site
     JOIN projects AS project
       ON project.company_id = site.company_id AND project.id = site.project_id
     JOIN customers AS customer
       ON customer.company_id = project.company_id AND customer.id = project.customer_id
     WHERE site.company_id = $1 AND site.id = $2
     FOR UPDATE OF site`,
    [context.companyId, siteId]
  );
  if (current.rowCount !== 1) {
    throw new InputError("Die Baustelle wurde nicht gefunden.", 404, "site_not_found");
  }
  const currentSite = current.rows[0];
  if (Number(currentSite.row_version) !== input.rowVersion) {
    throw new InputError(
      "Die Baustelle wurde zwischenzeitlich geändert. Bitte neu laden.",
      409,
      "site_version_conflict"
    );
  }

  if (input.status === "active") {
    if (
      !["planned", "active", "on_hold"].includes(currentSite.project_status)
      || currentSite.customer_status !== "active"
    ) {
      throw new InputError(
        "Die Baustelle kann nur mit einem aktiven Kunden und Projekt aktiviert werden.",
        409,
        "site_parent_inactive"
      );
    }
    const existingNames = await client.query(
      `SELECT name FROM construction_sites
       WHERE company_id = $1 AND id <> $2
         AND status IN ('planned', 'active', 'on_hold', 'delayed')`,
      [context.companyId, siteId]
    );
    if (existingNames.rows.some((row) => normalizeImportText(row.name) === normalizeImportText(input.name))) {
      throw new InputError("Eine aktive Baustelle mit diesem Namen existiert bereits.", 409, "site_name_exists");
    }
  }

  if (input.status !== "active" && !["completed", "archived"].includes(currentSite.status)) {
    const futureAssignments = await client.query(
      `SELECT COUNT(*)::INTEGER AS count
       FROM site_assignments
       WHERE company_id = $1 AND construction_site_id = $2
         AND work_date >= CURRENT_DATE AND status IN ('draft', 'released')`,
      [context.companyId, siteId]
    );
    if (futureAssignments.rows[0].count > 0) {
      throw new InputError(
        "Die Baustelle besitzt noch aktuelle oder zukünftige Einsätze. Bitte diese zuerst verschieben oder stornieren.",
        409,
        "site_has_assignments"
      );
    }
  }

  let locationId = currentSite.customer_location_id;
  if (locationId) {
    await client.query(
      `UPDATE customer_locations
       SET name = $3, street = $4, house_number = $5, postal_code = $6, city = $7
       WHERE company_id = $1 AND id = $2`,
      [context.companyId, locationId, input.name, input.street, input.houseNumber, input.postalCode, input.city]
    );
  } else {
    const location = await client.query(
      `INSERT INTO customer_locations (
         company_id, customer_id, name, location_type, street, house_number,
         postal_code, city, is_billing_location
       ) VALUES ($1, $2, $3, 'construction', $4, $5, $6, $7, FALSE)
       RETURNING id`,
      [
        context.companyId,
        currentSite.customer_id,
        input.name,
        input.street,
        input.houseNumber,
        input.postalCode,
        input.city
      ]
    );
    locationId = location.rows[0].id;
    await client.query(
      `INSERT INTO project_locations (company_id, project_id, customer_location_id)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [context.companyId, currentSite.project_id, locationId]
    );
  }

  const updated = await client.query(
    `UPDATE construction_sites
     SET customer_location_id = $3, name = $4, installer_short_text = $5, status = $6
     WHERE company_id = $1 AND id = $2 AND row_version = $7
     RETURNING id, project_id, site_number, name, installer_short_text, qr_code,
               status, row_version, updated_at`,
    [
      context.companyId,
      siteId,
      locationId,
      input.name,
      input.installerShortText,
      input.status,
      input.rowVersion
    ]
  );
  if (updated.rowCount !== 1) {
    throw new InputError(
      "Die Baustelle wurde zwischenzeitlich geändert. Bitte neu laden.",
      409,
      "site_version_conflict"
    );
  }
  if (input.projectManagerId !== undefined) {
    await setProjectManager(
      client,
      context,
      currentSite.project_id,
      input.projectManagerId
    );
  }
  const projectManager = await getProjectManager(
    client,
    context,
    currentSite.project_id
  );
  return siteDto({
    ...updated.rows[0],
    customer_id: currentSite.customer_id,
    customer_name: currentSite.customer_type === "company"
      ? currentSite.company_name
      : `${currentSite.first_name} ${currentSite.last_name}`,
    project_name: currentSite.project_name,
    project_manager_ids: projectManager.project_manager_id
      ? [projectManager.project_manager_id]
      : [],
    street: input.street,
    house_number: input.houseNumber,
    postal_code: input.postalCode,
    city: input.city
  });
}

async function createSiteBundle(client, context, input) {
  await requireFullPlanner(client, context);
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    [`sites:${context.companyId}`]
  );
  const existingNames = await client.query(
    `SELECT name FROM construction_sites
     WHERE company_id = $1 AND status IN ('planned', 'active', 'on_hold', 'delayed')`,
    [context.companyId]
  );
  if (existingNames.rows.some((row) => normalizeImportText(row.name) === normalizeImportText(input.siteName))) {
    throw new InputError("Eine aktive Baustelle mit diesem Namen existiert bereits.", 409, "site_name_exists");
  }
  const customer = await client.query(
    `INSERT INTO customers (
       company_id, customer_type, company_name,
       billing_street, billing_house_number, billing_postal_code, billing_city
     ) VALUES ($1, 'company', $2, $3, $4, $5, $6)
     RETURNING id, customer_number`,
    [context.companyId, input.customerName, input.street, input.houseNumber, input.postalCode, input.city]
  );
  const location = await client.query(
    `INSERT INTO customer_locations (
       company_id, customer_id, name, location_type, street, house_number,
       postal_code, city, is_billing_location
     ) VALUES ($1, $2, $3, 'construction', $4, $5, $6, $7, TRUE)
     RETURNING id, location_number`,
    [
      context.companyId,
      customer.rows[0].id,
      input.siteName,
      input.street,
      input.houseNumber,
      input.postalCode,
      input.city
    ]
  );
  const project = await client.query(
    `INSERT INTO projects (
       company_id, customer_id, name, status, installer_short_text
     ) VALUES ($1, $2, $3, 'active', $4)
     RETURNING id, project_number`,
    [context.companyId, customer.rows[0].id, "Baustellen", input.installerShortText]
  );
  await client.query(
    `INSERT INTO project_locations (company_id, project_id, customer_location_id)
     VALUES ($1, $2, $3)`,
    [context.companyId, project.rows[0].id, location.rows[0].id]
  );
  const site = await client.query(
    `INSERT INTO construction_sites (
       company_id, project_id, customer_location_id, name, installer_short_text, status
     ) VALUES ($1, $2, $3, $4, $5, 'active')
     RETURNING id, project_id, site_number, name, installer_short_text, qr_code,
               status, row_version, updated_at`,
    [context.companyId, project.rows[0].id, location.rows[0].id, input.siteName, input.installerShortText]
  );
  return siteDto({
    ...site.rows[0],
    customer_id: customer.rows[0].id,
    customer_name: input.customerName,
    project_name: "Baustellen",
    street: input.street,
    house_number: input.houseNumber,
    postal_code: input.postalCode,
    city: input.city
  });
}

async function reconcileAutomaticSiteForeman(client, context, constructionSiteId, workDate) {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    [`assignment-report:${context.companyId}:${constructionSiteId}:${workDate}`]
  );
  const result = await client.query(
    `SELECT assignment.id, assignment.user_id, assignment.report_responsible,
            assignment.report_responsibility_source,
            EXISTS (
              SELECT 1
              FROM site_reports AS report
              WHERE report.company_id = assignment.company_id
                AND report.site_assignment_id = assignment.id
            ) AS has_mobile_report
     FROM site_assignments AS assignment
     WHERE assignment.company_id = $1
       AND assignment.construction_site_id = $2
       AND assignment.work_date = $3
       AND assignment.status <> 'cancelled'
     ORDER BY assignment.created_at, assignment.id
     FOR UPDATE`,
    [context.companyId, constructionSiteId, workDate]
  );
  const assignmentsForSite = result.rows;
  const manualResponsible = assignmentsForSite.some((assignment) => (
    assignment.report_responsible
    && assignment.report_responsibility_source === "manual"
  ));
  // Entscheidend ist, wie viele Menschen auf der Baustelle sind, nicht wie
  // viele Einsatzzeilen es gibt. Wer nach einer Unterbrechung zurueckkehrt,
  // bekommt einen zweiten Eintrag und galt dadurch faelschlich als Team: die
  // automatische Vorarbeiterfunktion wurde ihm wieder entzogen, obwohl er
  // weiterhin allein arbeitete.
  const menschenAufDerBaustelle = new Set(
    assignmentsForSite.map((assignment) => assignment.user_id)
  );

  if (menschenAufDerBaustelle.size === 1 && !manualResponsible) {
    const traegt = assignmentsForSite.some((assignment) => assignment.report_responsible);
    const hatBericht = assignmentsForSite.some((assignment) => assignment.has_mobile_report);
    if (!traegt && !hatBericht) {
      const [assignment] = assignmentsForSite;
      await client.query(
        `UPDATE site_assignments
         SET report_responsible = TRUE,
             report_responsibility_source = 'automatic',
             changed_by_user_id = $3,
             last_change_reason = 'Automatisch: alleiniger Mitarbeiter auf der Baustelle'
         WHERE company_id = $1 AND id = $2`,
        [context.companyId, assignment.id, context.userId]
      );
    }
    return;
  }

  if (menschenAufDerBaustelle.size !== 1) {
    await client.query(
      `UPDATE site_assignments AS assignment
       SET report_responsible = FALSE,
           report_responsibility_source = NULL,
           changed_by_user_id = $4,
           last_change_reason = 'Automatische Vorarbeiterfunktion beendet: Teambelegung geändert'
       WHERE assignment.company_id = $1
         AND assignment.construction_site_id = $2
         AND assignment.work_date = $3
         AND assignment.status <> 'cancelled'
         AND assignment.report_responsible
         AND assignment.report_responsibility_source = 'automatic'
         AND NOT EXISTS (
           SELECT 1
           FROM site_reports AS report
           WHERE report.company_id = assignment.company_id
             AND report.site_assignment_id = assignment.id
         )`,
      [context.companyId, constructionSiteId, workDate, context.userId]
    );
  }
}

// Eine Teamvorlage darf jeden aktiven Mitarbeiter enthalten, weil auch jeder
// aktive Mitarbeiter einzeln eingeplant werden kann. Alles andere wäre für die
// Planung nicht nachvollziehbar: derselbe Mensch wäre einzeln planbar, im Team
// aber nicht.
async function assertPlanningTeamEmployees(client, context, memberIds) {
  const result = await client.query(
    `SELECT account.id
     FROM users AS account
     WHERE account.company_id = $1
       AND account.id = ANY($2::UUID[])
       AND account.status = 'active'`,
    [context.companyId, memberIds]
  );
  if (result.rowCount !== memberIds.length) {
    throw new InputError(
      "Teamvorlagen dürfen nur aktive Mitarbeiter der eigenen Firma enthalten.",
      409,
      "planning_team_member_conflict"
    );
  }
}

async function getPlanningTeamRecord(client, context, planningTeamId) {
  const result = await client.query(
    `SELECT team.id, team.name, team.status, team.row_version,
            COALESCE(
              jsonb_agg(
                jsonb_build_object(
                  'userId', member.user_id,
                  'employeeName', account.first_name || ' ' || account.last_name
                )
                ORDER BY LOWER(account.last_name), LOWER(account.first_name), member.user_id
              ) FILTER (WHERE member.user_id IS NOT NULL),
              '[]'::jsonb
            ) AS members
     FROM planning_teams AS team
     LEFT JOIN planning_team_members AS member
       ON member.company_id = team.company_id
      AND member.planning_team_id = team.id
      AND member.ended_at IS NULL
     LEFT JOIN users AS account
       ON account.company_id = member.company_id
      AND account.id = member.user_id
     WHERE team.company_id = $1 AND team.id = $2
     GROUP BY team.id`,
    [context.companyId, planningTeamId]
  );
  if (result.rowCount !== 1) {
    throw new InputError("Die Teamvorlage wurde nicht gefunden.", 404, "planning_team_not_found");
  }
  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    rowVersion: Number(row.row_version),
    members: row.members
  };
}

async function createPlanningTeam(client, context, input) {
  await requireFullPlanner(client, context);
  await assertPlanningTeamEmployees(client, context, input.memberIds);
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1 || LOWER($2), 0))",
    [`planning-team-name:${context.companyId}:`, input.name]
  );
  const duplicate = await client.query(
    `SELECT 1 FROM planning_teams
     WHERE company_id = $1 AND LOWER(name) = LOWER($2) AND status = 'active'`,
    [context.companyId, input.name]
  );
  if (duplicate.rowCount) {
    throw new InputError(
      "Eine aktive Teamvorlage mit diesem Namen existiert bereits.",
      409,
      "planning_team_name_conflict"
    );
  }
  const inserted = await client.query(
    `INSERT INTO planning_teams (
       company_id, name, created_by_user_id, changed_by_user_id
     ) VALUES ($1, $2, $3, $3)
     RETURNING id`,
    [context.companyId, input.name, context.userId]
  );
  const planningTeamId = inserted.rows[0].id;
  await client.query(
    `INSERT INTO planning_team_members (
       company_id, planning_team_id, user_id, added_by_user_id
     )
     SELECT $1, $2, member_id, $3
     FROM UNNEST($4::UUID[]) AS member_id`,
    [context.companyId, planningTeamId, context.userId, input.memberIds]
  );
  await client.query(
    `INSERT INTO planning_team_member_events (
       company_id, planning_team_id, user_id, event_type, actor_user_id
     )
     SELECT $1, $2, member_id, 'added', $3
     FROM UNNEST($4::UUID[]) AS member_id`,
    [context.companyId, planningTeamId, context.userId, input.memberIds]
  );
  return getPlanningTeamRecord(client, context, planningTeamId);
}

async function updatePlanningTeam(client, context, planningTeamId, input) {
  await requireFullPlanner(client, context);
  await assertPlanningTeamEmployees(client, context, input.memberIds);
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1 || LOWER($2), 0))",
    [`planning-team-name:${context.companyId}:`, input.name]
  );
  const current = await client.query(
    `SELECT id, row_version
     FROM planning_teams
     WHERE company_id = $1 AND id = $2
     FOR UPDATE`,
    [context.companyId, planningTeamId]
  );
  if (current.rowCount !== 1) {
    throw new InputError("Die Teamvorlage wurde nicht gefunden.", 404, "planning_team_not_found");
  }
  if (Number(current.rows[0].row_version) !== input.rowVersion) {
    throw new InputError(
      "Die Teamvorlage wurde bereits geändert. Bitte neu laden.",
      409,
      "row_version_conflict"
    );
  }
  const duplicate = await client.query(
    `SELECT 1 FROM planning_teams
     WHERE company_id = $1
       AND id <> $2
       AND LOWER(name) = LOWER($3)
       AND status = 'active'`,
    [context.companyId, planningTeamId, input.name]
  );
  if (input.status === "active" && duplicate.rowCount) {
    throw new InputError(
      "Eine aktive Teamvorlage mit diesem Namen existiert bereits.",
      409,
      "planning_team_name_conflict"
    );
  }
  const previousMembers = await client.query(
    `SELECT user_id, ended_at
     FROM planning_team_members
     WHERE company_id = $1 AND planning_team_id = $2
     FOR UPDATE`,
    [context.companyId, planningTeamId]
  );
  const activeIds = new Set(
    previousMembers.rows.filter((row) => row.ended_at === null).map((row) => row.user_id)
  );
  const knownIds = new Set(previousMembers.rows.map((row) => row.user_id));
  const requestedIds = new Set(input.memberIds);
  const removedIds = [...activeIds].filter((userId) => !requestedIds.has(userId));
  const addedIds = input.memberIds.filter((userId) => !knownIds.has(userId));
  const reactivatedIds = input.memberIds.filter((userId) => (
    knownIds.has(userId) && !activeIds.has(userId)
  ));

  await client.query(
    `UPDATE planning_teams
     SET name = $3,
         status = $4,
         changed_by_user_id = $5,
         last_change_reason = $6
     WHERE company_id = $1 AND id = $2 AND row_version = $7`,
    [
      context.companyId,
      planningTeamId,
      input.name,
      input.status,
      context.userId,
      input.changeReason,
      input.rowVersion
    ]
  );
  if (removedIds.length) {
    await client.query(
      `UPDATE planning_team_members
       SET ended_at = CURRENT_TIMESTAMP, ended_by_user_id = $3
       WHERE company_id = $1
         AND planning_team_id = $2
         AND user_id = ANY($4::UUID[])
         AND ended_at IS NULL`,
      [context.companyId, planningTeamId, context.userId, removedIds]
    );
  }
  if (addedIds.length) {
    await client.query(
      `INSERT INTO planning_team_members (
         company_id, planning_team_id, user_id, added_by_user_id
       )
       SELECT $1, $2, member_id, $3
       FROM UNNEST($4::UUID[]) AS member_id`,
      [context.companyId, planningTeamId, context.userId, addedIds]
    );
  }
  if (reactivatedIds.length) {
    await client.query(
      `UPDATE planning_team_members
       SET added_at = CURRENT_TIMESTAMP,
           added_by_user_id = $3,
           ended_at = NULL,
           ended_by_user_id = NULL
       WHERE company_id = $1
         AND planning_team_id = $2
         AND user_id = ANY($4::UUID[])`,
      [context.companyId, planningTeamId, context.userId, reactivatedIds]
    );
  }
  const memberEvents = [
    ...removedIds.map((userId) => ({ userId, eventType: "removed" })),
    ...addedIds.map((userId) => ({ userId, eventType: "added" })),
    ...reactivatedIds.map((userId) => ({ userId, eventType: "reactivated" }))
  ];
  for (const event of memberEvents) {
    await client.query(
      `INSERT INTO planning_team_member_events (
         company_id, planning_team_id, user_id, event_type, actor_user_id
       ) VALUES ($1, $2, $3, $4, $5)`,
      [
        context.companyId,
        planningTeamId,
        event.userId,
        event.eventType,
        context.userId
      ]
    );
  }
  return getPlanningTeamRecord(client, context, planningTeamId);
}

function assignmentStartMinutes(plannedStartTime) {
  if (!plannedStartTime) return null;
  const [hours, minutes] = plannedStartTime.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

function planningAssignmentDto(row) {
  return {
    id: row.id,
    employeeId: row.user_id,
    constructionSiteId: row.construction_site_id,
    workDate: databaseDate(row.work_date),
    sequenceNumber: row.sequence_number,
    plannedStartTime: row.planned_start_time,
    plannedDurationMinutes: row.planned_duration_minutes === null
      ? null
      : Number(row.planned_duration_minutes),
    comment: row.comment,
    status: row.status,
    planningTeamId: row.planning_template_key || null,
    reportResponsible: row.report_responsible,
    reportResponsibilitySource: row.report_responsibility_source,
    rowVersion: Number(row.row_version)
  };
}

async function assertNoAssignmentTimeOverlap(
  client,
  context,
  employeeId,
  workDate,
  plannedStartTime,
  plannedDurationMinutes,
  excludedAssignmentId = null
) {
  if (!plannedStartTime || !plannedDurationMinutes) return;
  const startMinutes = assignmentStartMinutes(plannedStartTime);
  const endMinutes = startMinutes + Number(plannedDurationMinutes);
  if (endMinutes > 1440) {
    throw new InputError(
      "Der Einsatz darf nicht über Mitternacht hinaus geplant werden.",
      409,
      "assignment_crosses_midnight"
    );
  }
  const conflict = await client.query(
    `SELECT assignment.id, site.name AS site_name
     FROM site_assignments AS assignment
     JOIN construction_sites AS site
       ON site.company_id = assignment.company_id
      AND site.id = assignment.construction_site_id
     WHERE assignment.company_id = $1
       AND assignment.user_id = $2
       AND assignment.work_date = $3
       AND assignment.status <> 'cancelled'
       AND assignment.id <> COALESCE(
         $4::UUID,
         '00000000-0000-0000-0000-000000000000'::UUID
       )
       AND assignment.planned_start_time IS NOT NULL
       AND assignment.planned_duration_minutes IS NOT NULL
       AND EXTRACT(EPOCH FROM assignment.planned_start_time)::INTEGER / 60 < $6
       AND (
         EXTRACT(EPOCH FROM assignment.planned_start_time)::INTEGER / 60
         + assignment.planned_duration_minutes
       ) > $5
     LIMIT 1`,
    [
      context.companyId,
      employeeId,
      workDate,
      excludedAssignmentId,
      startMinutes,
      endMinutes
    ]
  );
  if (conflict.rowCount) {
    throw new InputError(
      `Der Einsatz überschneidet sich mit „${conflict.rows[0].site_name}“.`,
      409,
      "assignment_time_overlap"
    );
  }
}

async function createAssignment(client, context, input) {
  const roles = await requirePlanner(client, context);
  await requireConstructionSiteAccess(
    client,
    context,
    input.constructionSiteId,
    roles
  );
  await lockAssignmentAvailability(client, context, input.employeeId, input.workDate);
  await assertNoApprovedFullDayAbsence(client, context, input.employeeId, input.workDate);
  const [employee, site] = await Promise.all([
    client.query(
      `SELECT account.is_foreman
       FROM users AS account
       WHERE account.company_id = $1
         AND account.id = $2
         AND account.status = 'active'`,
      [context.companyId, input.employeeId]
    ),
    client.query(
      `SELECT 1 FROM construction_sites
       WHERE company_id = $1 AND id = $2
         AND status IN ('planned', 'active', 'on_hold', 'delayed')`,
      [context.companyId, input.constructionSiteId]
    )
  ]);
  // Jeder aktive Mitarbeiter kann auf eine Baustelle eingeplant werden. In
  // kleinen Betrieben arbeiten Administration, Geschäftsführung und
  // Projektleitung regelmäßig selbst mit; die frühere Beschränkung auf Monteure
  // und Vorarbeiter sperrte sie ohne Ausweg aus. Wer eingeplant wird,
  // entscheidet die Planung, nicht die Rollenzuordnung.
  if (employee.rowCount !== 1) throw new InputError("Der Mitarbeiter wurde nicht gefunden.", 404, "employee_not_found");
  if (site.rowCount !== 1) throw new InputError("Die Baustelle wurde nicht gefunden.", 404, "site_not_found");
  if (input.reportResponsible && !employee.rows[0].is_foreman) {
    throw new InputError("Nur ein Mitarbeiter mit der Rolle Vorarbeiter kann den Baustellenbericht übernehmen.");
  }
  await assertNoAssignmentTimeOverlap(
    client,
    context,
    input.employeeId,
    input.workDate,
    input.plannedStartTime,
    input.plannedDurationMinutes
  );

  if (input.reportResponsible) {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`assignment-report:${context.companyId}:${input.constructionSiteId}:${input.workDate}`]
    );
    await client.query(
      `UPDATE site_assignments AS assignment
       SET report_responsible = FALSE,
           report_responsibility_source = NULL,
           changed_by_user_id = $4,
           last_change_reason = 'Manuell eingeteilter Vorarbeiter übernimmt'
       WHERE assignment.company_id = $1
         AND assignment.construction_site_id = $2
         AND assignment.work_date = $3
         AND assignment.status <> 'cancelled'
         AND assignment.report_responsible
         AND assignment.report_responsibility_source = 'automatic'
         AND NOT EXISTS (
           SELECT 1
           FROM site_reports AS report
           WHERE report.company_id = assignment.company_id
             AND report.site_assignment_id = assignment.id
         )`,
      [context.companyId, input.constructionSiteId, input.workDate, context.userId]
    );
    const existingResponsible = await client.query(
      `SELECT 1 FROM site_assignments
       WHERE company_id = $1 AND construction_site_id = $2 AND work_date = $3
         AND status <> 'cancelled' AND report_responsible
       LIMIT 1`,
      [context.companyId, input.constructionSiteId, input.workDate]
    );
    if (existingResponsible.rowCount) {
      throw new InputError(
        "Für diese Baustelle ist an diesem Tag bereits ein Vorarbeiter für den Bericht eingeteilt.",
        409,
        "report_responsibility_conflict"
      );
    }
  }

  const sequence = await client.query(
    `SELECT COALESCE(MAX(sequence_number), 0) + 1 AS next_sequence
     FROM site_assignments
     WHERE company_id = $1 AND user_id = $2 AND work_date = $3 AND status <> 'cancelled'`,
    [context.companyId, input.employeeId, input.workDate]
  );
  const inserted = await client.query(
    `INSERT INTO site_assignments (
       company_id, user_id, construction_site_id, work_date, sequence_number,
       planned_start_time, planned_duration_minutes, status, comment, report_responsible,
       report_responsibility_source, planning_template_key,
       created_by_user_id, changed_by_user_id
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, 'released', $8, $9, $10, $11, $12, $12
     )
     RETURNING id`,
    [
      context.companyId,
      input.employeeId,
      input.constructionSiteId,
      input.workDate,
      sequence.rows[0].next_sequence,
      input.plannedStartTime,
      input.plannedDurationMinutes,
      input.comment,
      input.reportResponsible,
      input.reportResponsible ? "manual" : null,
      input.planningTeamId || null,
      context.userId
    ]
  );
  await reconcileAutomaticSiteForeman(
    client,
    context,
    input.constructionSiteId,
    input.workDate
  );
  const assignment = await client.query(
    `SELECT id, user_id, construction_site_id, work_date,
            sequence_number, planned_start_time::TEXT,
            planned_duration_minutes, comment, report_responsible,
            report_responsibility_source, planning_template_key,
            status, row_version
     FROM site_assignments
     WHERE company_id = $1 AND id = $2`,
    [context.companyId, inserted.rows[0].id]
  );
  return planningAssignmentDto(assignment.rows[0]);
}

async function createAssignmentBatch(client, context, input) {
  const roles = await requirePlanner(client, context);
  await requireConstructionSiteAccess(
    client,
    context,
    input.constructionSiteId,
    roles
  );
  if (input.planningTeamId) {
    const planningTeam = await getPlanningTeamRecord(
      client,
      context,
      input.planningTeamId
    );
    if (planningTeam.status !== "active") {
      throw new InputError(
        "Die gewählte Teamvorlage ist archiviert.",
        409,
        "planning_team_archived"
      );
    }
    const selectedIds = new Set(input.employeeIds);
    if (planningTeam.members.some((member) => !selectedIds.has(member.userId))) {
      throw new InputError(
        "Die ausgewählten Mitarbeiter bilden die Teamvorlage nicht vollständig ab.",
        409,
        "planning_team_selection_conflict"
      );
    }
  }
  await lockAssignmentTargets(
    client,
    context,
    input.employeeIds.map((employeeId) => ({
      employeeId,
      workDate: input.workDate
    }))
  );
  const assignmentIds = [];
  for (const employeeId of input.employeeIds) {
    const assignment = await createAssignment(client, context, {
      employeeId,
      constructionSiteId: input.constructionSiteId,
      workDate: input.workDate,
      plannedStartTime: input.plannedStartTime,
      plannedDurationMinutes: input.plannedDurationMinutes,
      comment: input.comment,
      reportResponsible: input.reportResponsibleEmployeeId === employeeId,
      planningTeamId: input.planningTeamId
    });
    assignmentIds.push(assignment.id);
  }
  const refreshed = await client.query(
    `SELECT id, user_id, construction_site_id, work_date, sequence_number,
            planned_start_time::TEXT, planned_duration_minutes, comment,
            status, report_responsible, report_responsibility_source,
            planning_template_key, row_version
     FROM site_assignments
     WHERE company_id = $1 AND id = ANY($2::UUID[])`,
    [context.companyId, assignmentIds]
  );
  const assignmentsById = new Map(
    refreshed.rows.map((row) => [row.id, planningAssignmentDto(row)])
  );
  return assignmentIds.map((assignmentId) => assignmentsById.get(assignmentId));
}

async function updateAssignment(client, context, assignmentId, input) {
  const roles = await requirePlanner(client, context);
  const current = await client.query(
    `SELECT assignment.id, assignment.user_id, assignment.construction_site_id,
            assignment.work_date, assignment.sequence_number, assignment.status,
            assignment.planned_start_time::TEXT,
            assignment.planned_duration_minutes, assignment.comment,
            assignment.report_responsible, assignment.report_responsibility_source,
            assignment.planning_template_key, assignment.row_version,
            EXISTS (
              SELECT 1 FROM site_reports AS report
              WHERE report.company_id = assignment.company_id
                AND report.site_assignment_id = assignment.id
            ) AS has_mobile_report
     FROM site_assignments AS assignment
     WHERE assignment.company_id = $1 AND assignment.id = $2
     FOR UPDATE`,
    [context.companyId, assignmentId]
  );
  if (current.rowCount !== 1) {
    throw new InputError("Der Einsatz wurde nicht gefunden.", 404, "assignment_not_found");
  }
  const assignment = current.rows[0];
  await requireConstructionSiteAccess(
    client,
    context,
    assignment.construction_site_id,
    roles
  );
  if (!["draft", "released"].includes(assignment.status)) {
    throw new InputError("Dieser Einsatz kann nicht mehr geändert werden.", 409, "assignment_locked");
  }
  if (Number(assignment.row_version) !== input.rowVersion) {
    throw new InputError(
      "Der Einsatz wurde bereits geändert. Bitte neu laden.",
      409,
      "row_version_conflict"
    );
  }
  const employeeId = input.employeeId || assignment.user_id;
  await lockAssignmentTargets(client, context, [
    {
      employeeId: assignment.user_id,
      workDate: databaseDate(assignment.work_date)
    },
    { employeeId, workDate: input.workDate }
  ]);
  await assertNoApprovedFullDayAbsence(
    client,
    context,
    employeeId,
    input.workDate
  );
  await assertPlanningTeamEmployees(client, context, [employeeId]);
  const targetEmployee = await client.query(
    "SELECT is_foreman FROM users WHERE company_id = $1 AND id = $2 AND status = 'active'",
    [context.companyId, employeeId]
  );
  if (targetEmployee.rowCount !== 1) {
    throw new InputError("Der Mitarbeiter wurde nicht gefunden.", 404, "employee_not_found");
  }

  const plannedDurationMinutes = input.plannedDurationMinutes === undefined
    ? assignment.planned_duration_minutes
    : input.plannedDurationMinutes;
  const plannedStartTime = input.plannedStartTime === undefined
    ? assignment.planned_start_time
    : input.plannedStartTime;
  const comment = input.comment === undefined ? assignment.comment : input.comment;
  let reportResponsible = input.reportResponsible === null
    ? assignment.report_responsible
    : input.reportResponsible;
  let reportResponsibilitySource = input.reportResponsible === null
    ? assignment.report_responsibility_source
    : (input.reportResponsible ? "manual" : null);
  if (
    (
      databaseDate(assignment.work_date) !== input.workDate
      || assignment.user_id !== employeeId
    )
    && assignment.report_responsibility_source === "automatic"
    && input.reportResponsible === null
  ) {
    reportResponsible = false;
    reportResponsibilitySource = null;
  }
  if (assignment.has_mobile_report && (
    databaseDate(assignment.work_date) !== input.workDate
    || assignment.user_id !== employeeId
    || reportResponsible !== assignment.report_responsible
  )) {
    throw new InputError(
      "Der Einsatz besitzt bereits einen Baustellenbericht und kann nicht mehr verschoben oder neu zugeordnet werden.",
      409,
      "assignment_has_report"
    );
  }
  if (reportResponsible && reportResponsibilitySource === "manual") {
    if (!targetEmployee.rows[0].is_foreman) {
      throw new InputError("Nur ein Mitarbeiter mit der Rolle Vorarbeiter kann den Baustellenbericht übernehmen.");
    }
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`assignment-report:${context.companyId}:${assignment.construction_site_id}:${input.workDate}`]
    );
    await client.query(
      `UPDATE site_assignments AS candidate
       SET report_responsible = FALSE,
           report_responsibility_source = NULL,
           changed_by_user_id = $5,
           last_change_reason = 'Manuell eingeteilter Vorarbeiter übernimmt'
       WHERE candidate.company_id = $1
         AND candidate.construction_site_id = $2
         AND candidate.work_date = $3
         AND candidate.id <> $4
         AND candidate.status <> 'cancelled'
         AND candidate.report_responsible
         AND candidate.report_responsibility_source = 'automatic'
         AND NOT EXISTS (
           SELECT 1
           FROM site_reports AS report
           WHERE report.company_id = candidate.company_id
             AND report.site_assignment_id = candidate.id
         )`,
      [
        context.companyId,
        assignment.construction_site_id,
        input.workDate,
        assignmentId,
        context.userId
      ]
    );
    const existingResponsible = await client.query(
      `SELECT 1 FROM site_assignments
       WHERE company_id = $1 AND construction_site_id = $2 AND work_date = $3
         AND status <> 'cancelled' AND report_responsible AND id <> $4
       LIMIT 1`,
      [context.companyId, assignment.construction_site_id, input.workDate, assignmentId]
    );
    if (existingResponsible.rowCount) {
      throw new InputError(
        "Für diese Baustelle ist an diesem Tag bereits ein Vorarbeiter für den Bericht eingeteilt.",
        409,
        "report_responsibility_conflict"
      );
    }
  }
  await assertNoAssignmentTimeOverlap(
    client,
    context,
    employeeId,
    input.workDate,
    plannedStartTime,
    plannedDurationMinutes,
    assignmentId
  );

  let sequenceNumber = assignment.sequence_number;
  if (
    databaseDate(assignment.work_date) !== input.workDate
    || assignment.user_id !== employeeId
  ) {
    const sequence = await client.query(
      `SELECT COALESCE(MAX(sequence_number), 0) + 1 AS next_sequence
       FROM site_assignments
       WHERE company_id = $1 AND user_id = $2 AND work_date = $3
         AND status <> 'cancelled' AND id <> $4`,
      [context.companyId, employeeId, input.workDate, assignmentId]
    );
    sequenceNumber = sequence.rows[0].next_sequence;
  }

  const updated = await client.query(
    `UPDATE site_assignments
     SET user_id = $3,
         work_date = $4,
         sequence_number = $5,
         planned_start_time = $6,
         planned_duration_minutes = $7,
         comment = $8,
         report_responsible = $9,
         report_responsibility_source = $10,
         changed_by_user_id = $11,
         last_change_reason = $12
     WHERE company_id = $1 AND id = $2 AND row_version = $13
     RETURNING id`,
    [
      context.companyId,
      assignmentId,
      employeeId,
      input.workDate,
      sequenceNumber,
      plannedStartTime,
      plannedDurationMinutes,
      comment,
      reportResponsible,
      reportResponsibilitySource,
      context.userId,
      input.changeReason,
      input.rowVersion
    ]
  );
  if (updated.rowCount !== 1) {
    throw new InputError(
      "Der Einsatz wurde bereits geändert. Bitte neu laden.",
      409,
      "row_version_conflict"
    );
  }
  const previousDate = databaseDate(assignment.work_date);
  await reconcileAutomaticSiteForeman(
    client,
    context,
    assignment.construction_site_id,
    previousDate
  );
  if (previousDate !== input.workDate) {
    await reconcileAutomaticSiteForeman(
      client,
      context,
      assignment.construction_site_id,
      input.workDate
    );
  }
  const refreshed = await client.query(
    `SELECT id, user_id, construction_site_id, work_date, sequence_number,
            planned_start_time::TEXT, planned_duration_minutes, comment,
            status, report_responsible,
            report_responsibility_source, planning_template_key, row_version
     FROM site_assignments
     WHERE company_id = $1 AND id = $2`,
    [context.companyId, updated.rows[0].id]
  );
  return planningAssignmentDto(refreshed.rows[0]);
}

async function cancelAssignment(client, context, assignmentId, changeReason) {
  const roles = await requirePlanner(client, context);
  await requireScopedEntitySiteAccess(
    client,
    context,
    "site_assignments",
    assignmentId,
    roles
  );
  const updated = await client.query(
    `UPDATE site_assignments
     SET status = 'cancelled',
         changed_by_user_id = $3,
         last_change_reason = $4
     WHERE company_id = $1 AND id = $2 AND status IN ('draft', 'released')
       AND NOT EXISTS (
         SELECT 1 FROM site_reports AS report
         WHERE report.company_id = site_assignments.company_id
           AND report.site_assignment_id = site_assignments.id
       )
     RETURNING id, construction_site_id, work_date`,
    [context.companyId, assignmentId, context.userId, changeReason]
  );
  if (updated.rowCount !== 1) {
    throw new InputError("Der Einsatz wurde nicht gefunden oder ist bereits abgeschlossen.", 409, "assignment_locked");
  }
  await reconcileAutomaticSiteForeman(
    client,
    context,
    updated.rows[0].construction_site_id,
    databaseDate(updated.rows[0].work_date)
  );
  return { id: assignmentId, status: "cancelled" };
}

async function changeInitialPassword(client, context, newPassword) {
  const account = await client.query(
    "SELECT must_change_password FROM users WHERE company_id = $1 AND id = $2 AND status = 'active' FOR UPDATE",
    [context.companyId, context.userId]
  );
  if (account.rowCount !== 1) throw new InputError("Das Benutzerkonto ist nicht mehr aktiv.", 401, "unauthorized");
  if (!account.rows[0].must_change_password) {
    throw new InputError("Das Startpasswort wurde bereits geändert.", 409, "password_already_changed");
  }
  const passwordHash = await hashPassword(newPassword);
  await client.query(
    `UPDATE users
     SET password_hash = $3, must_change_password = FALSE, password_changed_at = CURRENT_TIMESTAMP
     WHERE company_id = $1 AND id = $2`,
    [context.companyId, context.userId, passwordHash]
  );
  await client.query(
    `UPDATE user_sessions
     SET revoked_at = CURRENT_TIMESTAMP, revocation_reason = 'initial_password_changed'
     WHERE company_id = $1 AND user_id = $2 AND id <> $3 AND revoked_at IS NULL`,
    [context.companyId, context.userId, context.sessionId]
  );
  return sessionView(client, context);
}

async function insertTimeEntry(client, context, input, timeZone) {
  const workDate = localDate(input.recordedAt, timeZone);
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    [`time-entry:${context.companyId}:${context.userId}:${workDate}`]
  );

  const duplicate = await client.query(
    `SELECT id, work_day_id, client_entry_id, entry_type, recorded_at,
            client_created_at, construction_site_id
     FROM time_entries
     WHERE company_id = $1 AND user_id = $2 AND client_entry_id = $3`,
    [context.companyId, context.userId, input.clientEntryId]
  );
  if (duplicate.rowCount === 1) {
    const row = duplicate.rows[0];
    const same = row.entry_type === input.entryType
      && new Date(row.recorded_at).valueOf() === new Date(input.recordedAt).valueOf()
      && new Date(row.client_created_at).valueOf() === new Date(input.clientCreatedAt).valueOf()
      && row.construction_site_id === input.constructionSiteId;
    if (!same) {
      throw new InputError(
        "clientEntryId wurde bereits für eine andere Buchung verwendet.",
        409,
        "idempotency_conflict"
      );
    }
    return timeEntryDto(row, true);
  }

  if (new Date(input.recordedAt).valueOf() > Date.now() + 5 * 60 * 1000) {
    throw new InputError("recordedAt darf nicht in der Zukunft liegen.");
  }

  let matchedAssignment = null;
  if (input.constructionSiteId) {
    matchedAssignment = await ensureOwnSiteAssignment(
      client,
      context,
      workDate,
      input.constructionSiteId,
      "Selbst gewählt bei der Buchung"
    );
  }

  if (input.entryType === "site_departure" && matchedAssignment?.report_responsible) {
    const report = await client.query(
      `SELECT 1 FROM site_reports
       WHERE company_id = $1
         AND construction_site_id = $3
         AND work_date = $4
         AND status IN ('submitted', 'approved')
         AND (site_assignment_id = $2 OR site_assignment_id IS NULL)
       LIMIT 1`,
      [context.companyId, matchedAssignment.id, input.constructionSiteId, workDate]
    );
    if (report.rowCount === 0) {
      throw new InputError(
        "Bitte zuerst den Baustellenbericht speichern. Danach kannst du die Baustelle verlassen.",
        409,
        "site_report_required"
      );
    }
  }

  const timeline = await client.query(
    `SELECT entry.entry_type, entry.recorded_at, entry.construction_site_id
     FROM time_entries AS entry
     JOIN work_days AS day
       ON day.company_id = entry.company_id
      AND day.user_id = entry.user_id
      AND day.id = entry.work_day_id
     WHERE entry.company_id = $1 AND entry.user_id = $2 AND day.work_date = $3
       AND entry.invalidated_at IS NULL
       AND entry.correction_kind IS DISTINCT FROM 'invalidation'
       AND (
         (entry.original_entry_id IS NULL AND entry.correction_status IS NULL)
         OR entry.correction_status = 'approved'
       )
     ORDER BY entry.recorded_at DESC, entry.created_at DESC, entry.id DESC
     LIMIT 1`,
    [context.companyId, context.userId, workDate]
  );
  const previous = timeline.rows[0] ?? null;
  if (previous && new Date(input.recordedAt).valueOf() <= new Date(previous.recorded_at).valueOf()) {
    throw new InputError("Offline-Buchungen müssen in zeitlicher Reihenfolge synchronisiert werden.", 409, "out_of_order");
  }

  const allowed = expectedNextTypes(previous?.entry_type);
  if (!allowed.includes(input.entryType)) {
    throw new InputError(
      `Nach ${previous?.entry_type ?? "Tagesbeginn"} ist ${input.entryType} nicht zulässig.`,
      409,
      "invalid_sequence"
    );
  }
  if (
    (input.entryType === "site_departure" && previous?.construction_site_id !== input.constructionSiteId)
    || (input.entryType === "site_arrival" && previous?.entry_type === "next_site"
      && previous.construction_site_id !== input.constructionSiteId)
  ) {
    throw new InputError("Die Baustelle passt nicht zum vorherigen Arbeitsschritt.", 409, "site_sequence_conflict");
  }

  let day = await client.query(
    `SELECT id, status FROM work_days
     WHERE company_id = $1 AND user_id = $2 AND work_date = $3
     FOR UPDATE`,
    [context.companyId, context.userId, workDate]
  );
  if (day.rowCount === 0) {
    day = await client.query(
      `INSERT INTO work_days (company_id, user_id, work_date, target_work_minutes)
       VALUES ($1, $2, $3, NULL)
       RETURNING id, status`,
      [context.companyId, context.userId, workDate]
    );
  }
  if (day.rows[0].status !== "open") {
    throw new InputError("Der Arbeitstag ist nicht mehr zur Buchung geöffnet.", 409, "work_day_closed");
  }

  const inserted = await client.query(
    `INSERT INTO time_entries (
       company_id, user_id, work_day_id, construction_site_id, entry_type,
       recorded_at, client_entry_id, client_created_at, source, entered_by_user_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'offline', $2)
     RETURNING id, work_day_id, client_entry_id, entry_type, recorded_at,
               client_created_at, construction_site_id`,
    [
      context.companyId,
      context.userId,
      day.rows[0].id,
      input.constructionSiteId,
      input.entryType,
      input.recordedAt,
      input.clientEntryId,
      input.clientCreatedAt
    ]
  );
  return timeEntryDto(inserted.rows[0]);
}

async function assertCorrectionTimeline(client, {
  companyId,
  userId,
  workDayId,
  originalEntryId,
  entryType,
  recordedAt,
  constructionSiteId,
  omitProposed = false
}) {
  const result = await client.query(
    `SELECT id, entry_type, recorded_at, construction_site_id
     FROM time_entries
     WHERE company_id = $1
       AND user_id = $2
       AND work_day_id = $3
       AND ($4::UUID IS NULL OR id <> $4)
       AND invalidated_at IS NULL
       AND correction_kind IS DISTINCT FROM 'invalidation'
       AND (
         (original_entry_id IS NULL AND correction_status IS NULL)
         OR correction_status = 'approved'
       )
     ORDER BY recorded_at, created_at, id`,
    [companyId, userId, workDayId, originalEntryId]
  );
  const timeline = [...result.rows];
  if (!omitProposed) {
    timeline.push({
      id: originalEntryId,
      entry_type: entryType,
      recorded_at: recordedAt,
      construction_site_id: constructionSiteId
    });
  }
  timeline.sort((left, right) => (
    new Date(left.recorded_at).valueOf() - new Date(right.recorded_at).valueOf()
  ));

  let previous = null;
  for (const entry of timeline) {
    if (
      previous
      && new Date(entry.recorded_at).valueOf() <= new Date(previous.recorded_at).valueOf()
    ) {
      throw new InputError(
        "Die gewünschte Uhrzeit überschneidet sich mit einer anderen Buchung.",
        409,
        "time_correction_overlap"
      );
    }
    if (!expectedNextTypes(previous?.entry_type).includes(entry.entry_type)) {
      throw new InputError(
        "Die gewünschte Uhrzeit würde die Reihenfolge des Arbeitstags ungültig machen.",
        409,
        "time_correction_sequence"
      );
    }
    if (
      (entry.entry_type === "site_departure"
        && previous?.construction_site_id !== entry.construction_site_id)
      || (
        entry.entry_type === "site_arrival"
        && previous?.entry_type === "next_site"
        && previous.construction_site_id !== entry.construction_site_id
      )
    ) {
      throw new InputError(
        "Die korrigierte Buchung passt nicht mehr zur Baustellenreihenfolge.",
        409,
        "time_correction_site_sequence"
      );
    }
    previous = entry;
  }
}

function assertEffectiveTimeline(entries) {
  const timeline = [...entries].sort((left, right) => (
    new Date(left.recorded_at).valueOf() - new Date(right.recorded_at).valueOf()
    || String(left.id).localeCompare(String(right.id))
  ));
  let previous = null;
  for (const entry of timeline) {
    if (
      previous
      && new Date(entry.recorded_at).valueOf() <= new Date(previous.recorded_at).valueOf()
    ) {
      throw new InputError(
        "Die Änderung würde eine doppelte oder überschneidende Buchungszeit erzeugen.",
        409,
        "time_edit_overlap"
      );
    }
    if (!expectedNextTypes(previous?.entry_type).includes(entry.entry_type)) {
      throw new InputError(
        "Die Änderung würde die Reihenfolge des Arbeitsblocks ungültig machen.",
        409,
        "time_edit_sequence"
      );
    }
    if (
      (entry.entry_type === "site_departure"
        && previous?.construction_site_id !== entry.construction_site_id)
      || (
        entry.entry_type === "site_arrival"
        && previous?.entry_type === "next_site"
        && previous.construction_site_id !== entry.construction_site_id
      )
    ) {
      throw new InputError(
        "Die geänderte Baustelle passt nicht zur Ankunfts- und Abfahrtsfolge.",
        409,
        "time_edit_site_sequence"
      );
    }
    previous = entry;
  }
}

async function effectiveEntriesForDays(client, companyId, userId, workDayIds) {
  if (workDayIds.length === 0) return [];
  const result = await client.query(
    `SELECT id, work_day_id, entry_type, recorded_at, construction_site_id,
            activity_note, travel_minutes_override, created_at
     FROM time_entries
     WHERE company_id = $1 AND user_id = $2 AND work_day_id = ANY($3::UUID[])
       AND invalidated_at IS NULL
       AND correction_kind IS DISTINCT FROM 'invalidation'
       AND ((original_entry_id IS NULL AND correction_status IS NULL)
            OR correction_status = 'approved')
     ORDER BY recorded_at, created_at, id
     FOR UPDATE`,
    [companyId, userId, workDayIds]
  );
  return result.rows;
}

function enclosingWorkBlock(entries, selectedId) {
  const index = entries.findIndex((entry) => entry.id === selectedId);
  if (index < 0) return [];
  let start = index;
  while (start > 0 && entries[start].entry_type !== "clock_in") start -= 1;
  if (entries[start]?.entry_type !== "clock_in") start = index;
  let end = index;
  while (end < entries.length - 1 && entries[end].entry_type !== "clock_out") end += 1;
  if (entries[end]?.entry_type !== "clock_out") end = entries.length - 1;
  return entries.slice(start, end + 1);
}

function siteOccurrenceIds(entries, selectedId) {
  const index = entries.findIndex((entry) => entry.id === selectedId);
  if (index < 0) return new Set([selectedId]);
  const selected = entries[index];
  let arrivalIndex = selected.entry_type === "site_arrival" ? index : -1;
  if (selected.entry_type === "next_site") {
    arrivalIndex = entries.findIndex((entry, candidate) => (
      candidate > index && entry.entry_type === "site_arrival"
    ));
  }
  if (selected.entry_type === "site_departure") {
    for (let candidate = index - 1; candidate >= 0; candidate -= 1) {
      if (entries[candidate].entry_type === "site_arrival") {
        arrivalIndex = candidate;
        break;
      }
      if (["clock_in", "clock_out"].includes(entries[candidate].entry_type)) break;
    }
  }
  if (arrivalIndex < 0) return new Set([selectedId]);
  const identifiers = new Set([entries[arrivalIndex].id]);
  if (entries[arrivalIndex - 1]?.entry_type === "next_site") {
    identifiers.add(entries[arrivalIndex - 1].id);
  }
  for (let candidate = arrivalIndex + 1; candidate < entries.length; candidate += 1) {
    if (entries[candidate].entry_type === "site_departure") {
      identifiers.add(entries[candidate].id);
      break;
    }
    if (["site_arrival", "clock_out", "clock_in"].includes(entries[candidate].entry_type)) break;
  }
  return identifiers;
}

function timeChangeOperationDto(operation, items = []) {
  return {
    id: operation.id,
    clientChangeId: operation.client_change_id,
    employeeId: operation.user_id,
    action: operation.action,
    reason: operation.reason,
    status: operation.status,
    requestedAt: new Date(operation.requested_at).toISOString(),
    reviewedAt: operation.reviewed_at ? new Date(operation.reviewed_at).toISOString() : null,
    rowVersion: Number(operation.row_version),
    changes: items.map((item) => ({
      id: item.id,
      action: item.item_action,
      originalEntryId: item.original_entry_id || null,
      replacementEntryId: item.replacement_entry_id || null,
      oldValue: item.old_value || null,
      newValue: item.new_value || null
    }))
  };
}

async function existingTimeChange(client, companyId, userId, clientChangeId, expectedAction) {
  const operation = await client.query(
    `SELECT * FROM time_change_operations
     WHERE company_id = $1 AND client_change_id = $2`,
    [companyId, clientChangeId]
  );
  if (operation.rowCount === 0) return null;
  if (operation.rows[0].user_id !== userId) {
    throw new InputError(
      "Diese Änderungs-ID wurde bereits für einen anderen Mitarbeiter verwendet.",
      409,
      "time_change_id_conflict"
    );
  }
  const expectedActions = expectedAction == null
    ? null
    : new Set(Array.isArray(expectedAction) ? expectedAction : [expectedAction]);
  if (expectedActions && !expectedActions.has(operation.rows[0].action)) {
    throw new InputError(
      "Diese Änderungs-ID wurde bereits für eine andere Aktion verwendet.",
      409,
      "time_change_id_conflict"
    );
  }
  const items = await client.query(
    "SELECT * FROM time_change_items WHERE company_id = $1 AND operation_id = $2 ORDER BY created_at, id",
    [companyId, operation.rows[0].id]
  );
  return timeChangeOperationDto(operation.rows[0], items.rows);
}

async function editableTimeEntry(client, context, entryId, administrator) {
  if (administrator) await requireFullPlanner(client, context);
  const result = await client.query(
    `SELECT entry.*, day.work_date, day.status AS work_day_status,
            day.break_minutes_override, day.break_minutes, day.row_version AS work_day_row_version
     FROM time_entries AS entry
     JOIN work_days AS day
       ON day.company_id = entry.company_id AND day.user_id = entry.user_id
      AND day.id = entry.work_day_id
     WHERE entry.company_id = $1 AND entry.id = $2
       AND ($3::BOOLEAN OR entry.user_id = $4)
       AND entry.invalidated_at IS NULL
       AND entry.correction_kind IS DISTINCT FROM 'invalidation'
       AND ((entry.original_entry_id IS NULL AND entry.correction_status IS NULL)
            OR entry.correction_status = 'approved')
     FOR UPDATE OF entry, day`,
    [context.companyId, entryId, administrator, context.userId]
  );
  if (result.rowCount !== 1) {
    throw new InputError("Der bearbeitbare Zeiteintrag wurde nicht gefunden.", 404, "time_entry_not_found");
  }
  return result.rows[0];
}

async function lockTimeEntryStream(client, context, entryId, administrator) {
  if (administrator) await requireFullPlanner(client, context);
  const owner = await client.query(
    `SELECT user_id FROM time_entries
     WHERE company_id = $1 AND id = $2 AND ($3::BOOLEAN OR user_id = $4)`,
    [context.companyId, entryId, administrator, context.userId]
  );
  if (owner.rowCount !== 1) {
    throw new InputError("Der Zeiteintrag wurde nicht gefunden.", 404, "time_entry_not_found");
  }
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    [`time-edit:${context.companyId}:${owner.rows[0].user_id}`]
  );
  return owner.rows[0].user_id;
}

async function expectedTimeEditAction(client, context, entryId, input, administrator) {
  if (administrator) await requireFullPlanner(client, context);
  const result = await client.query(
    `SELECT entry.construction_site_id,day.work_date
     FROM time_entries AS entry
     JOIN work_days AS day
       ON day.company_id = entry.company_id AND day.user_id = entry.user_id
      AND day.id = entry.work_day_id
     WHERE entry.company_id = $1 AND entry.id = $2
       AND ($3::BOOLEAN OR entry.user_id = $4)`,
    [context.companyId, entryId, administrator, context.userId]
  );
  if (result.rowCount !== 1) return null;
  return input.workDate !== databaseDate(result.rows[0].work_date)
    ? "move_work_day"
    : input.constructionSiteId !== result.rows[0].construction_site_id
      ? "move_site"
      : "edit_entry";
}

async function ensureEditableSite(client, context, userId, workDate, siteId, administrator) {
  const site = await client.query(
    `SELECT id FROM construction_sites
     WHERE company_id = $1 AND id = $2 AND status IN ('active','planned','on_hold')`,
    [context.companyId, siteId]
  );
  if (site.rowCount !== 1) {
    throw new InputError("Die Zielbaustelle wurde nicht gefunden oder ist nicht aktiv.", 404, "site_not_found");
  }
  // Beim Berichtigen der eigenen Zeiten gilt dieselbe Regel wie beim Buchen:
  // Fehlt der Einsatz auf der Zielbaustelle, wird er als Auswahl des
  // Mitarbeiters angelegt statt die Korrektur abzuweisen. Das Büro bearbeitet
  // fremde Zeiten ohnehin ohne diese Einschränkung.
  if (!administrator && userId === context.userId) {
    await ensureOwnSiteAssignment(
      client,
      context,
      workDate,
      siteId,
      "Selbst gewählt beim Berichtigen"
    );
  }
}

async function targetWorkDay(client, companyId, userId, workDate) {
  let result = await client.query(
    `SELECT * FROM work_days
     WHERE company_id = $1 AND user_id = $2 AND work_date = $3 FOR UPDATE`,
    [companyId, userId, workDate]
  );
  if (result.rowCount === 0) {
    result = await client.query(
      `INSERT INTO work_days (company_id,user_id,work_date,target_work_minutes)
       VALUES ($1,$2,$3,NULL) RETURNING *`,
      [companyId, userId, workDate]
    );
  }
  return result.rows[0];
}

async function editTimeEntry(client, context, entryId, input, timeZone, administrator = false) {
  const expectedActionHint = await expectedTimeEditAction(
    client, context, entryId, input, administrator
  );
  const editableActions = expectedActionHint
    || ["edit_entry", "move_site", "move_work_day", "change_break", "controlled_correction"];
  const streamUserId = await lockTimeEntryStream(client, context, entryId, administrator);
  const idempotent = await existingTimeChange(
    client, context.companyId, streamUserId, input.clientChangeId, editableActions
  );
  if (idempotent) return { operation: idempotent, idempotent: true };
  const original = await editableTimeEntry(client, context, entryId, administrator);
  const expectedAction = input.workDate !== databaseDate(original.work_date)
    ? "move_work_day"
    : input.constructionSiteId !== original.construction_site_id
      ? "move_site"
      : "edit_entry";
  if (new Date(input.expectedRecordedAt).valueOf() !== new Date(original.recorded_at).valueOf()) {
    throw new InputError("Der Zeiteintrag wurde zwischenzeitlich geändert.", 409, "stale_time_entry");
  }
  if (new Date(input.recordedAt).valueOf() > Date.now()) {
    throw new InputError("Die neue Buchungszeit darf nicht in der Zukunft liegen.");
  }
  if (localDate(input.recordedAt, timeZone) !== input.workDate) {
    throw new InputError("Zeitpunkt und ausgewählter Arbeitstag stimmen nicht überein.", 409, "time_edit_wrong_day");
  }
  const siteEntry = ["site_arrival", "site_departure", "next_site"].includes(original.entry_type);
  if (siteEntry && !input.constructionSiteId) {
    throw new InputError("Diese Buchung benötigt eine Baustelle.");
  }
  if (!siteEntry && input.constructionSiteId) {
    throw new InputError("Diese Buchungsart darf keine Baustelle enthalten.");
  }
  if (input.travelMinutes !== undefined
      && !["clock_in", "site_departure"].includes(original.entry_type)) {
    throw new InputError("Eine Fahrzeit kann nur am Beginn eines Fahrtsegments korrigiert werden.");
  }

  if (siteEntry) {
    await ensureEditableSite(
      client,
      context,
      original.user_id,
      input.workDate,
      input.constructionSiteId,
      administrator
    );
  }
  const targetDay = await targetWorkDay(
    client,
    context.companyId,
    original.user_id,
    input.workDate
  );
  const lockedDay = ["approved", "locked"].includes(original.work_day_status)
    || ["approved", "locked"].includes(targetDay.status);
  const policy = administrator ? null : await companyTimeCorrectionPolicy(client, context);
  const controlled = lockedDay
    || (!administrator && ownCorrectionNeedsReview(
      policy, databaseDate(original.work_date), timeZone
    ));
  if (lockedDay && administrator) {
    await requireEmployeeLifecycleAdministrator(client, context);
  }

  const dayIds = [...new Set([original.work_day_id, targetDay.id])];
  const allEntries = await effectiveEntriesForDays(
    client,
    context.companyId,
    original.user_id,
    dayIds
  );
  const sourceEntries = allEntries.filter((entry) => entry.work_day_id === original.work_day_id);
  const selectedSiteIds = siteOccurrenceIds(sourceEntries, original.id);
  const movingDay = input.workDate !== databaseDate(original.work_date);
  const related = movingDay
    ? enclosingWorkBlock(sourceEntries, original.id)
    : sourceEntries.filter((entry) => (
      entry.id === original.id
      || (siteEntry && input.constructionSiteId !== original.construction_site_id
          && selectedSiteIds.has(entry.id))
    ));
  if (related.length === 0) throw new InputError("Der Arbeitsblock konnte nicht aufgelöst werden.", 409, "time_block_missing");

  const delta = new Date(input.recordedAt).valueOf() - new Date(original.recorded_at).valueOf();
  const replacements = related.map((entry) => ({
    ...entry,
    work_day_id: targetDay.id,
    recorded_at: entry.id === original.id
      ? input.recordedAt
      : movingDay
        ? new Date(new Date(entry.recorded_at).valueOf() + delta).toISOString()
        : entry.recorded_at,
    construction_site_id: siteEntry && selectedSiteIds.has(entry.id)
      ? input.constructionSiteId
      : entry.construction_site_id,
    activity_note: entry.id === original.id ? input.activityNote : entry.activity_note,
    travel_minutes_override: entry.id === original.id && input.travelMinutes !== undefined
      ? input.travelMinutes
      : entry.travel_minutes_override
  }));
  for (const replacement of replacements) {
    if (localDate(replacement.recorded_at, timeZone) !== input.workDate) {
      throw new InputError(
        "Der vollständige Arbeitsblock passt nach der Verschiebung nicht in den Zieltag.",
        409,
        "time_block_crosses_day"
      );
    }
  }

  const relatedIds = new Set(related.map((entry) => entry.id));
  for (const dayId of dayIds) {
    const proposed = allEntries
      .filter((entry) => entry.work_day_id === dayId && !relatedIds.has(entry.id))
      .concat(replacements.filter((entry) => entry.work_day_id === dayId));
    assertEffectiveTimeline(proposed);
  }

  if (!controlled) {
    for (const dayId of dayIds) {
      await client.query(
        `UPDATE work_days SET status = 'open'
         WHERE company_id = $1 AND id = $2 AND status = 'submitted'`,
        [context.companyId, dayId]
      );
    }
  }

  const operation = await client.query(
    `INSERT INTO time_change_operations (
       company_id,user_id,client_change_id,action,reason,status,requested_by_user_id,
       applied_without_review
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      context.companyId, original.user_id, input.clientChangeId, expectedAction,
      input.reason, controlled ? "pending" : "applied", context.userId, !controlled
    ]
  );
  const insertedItems = [];
  for (const replacement of replacements) {
    const inserted = await client.query(
      `INSERT INTO time_entries (
         company_id,user_id,work_day_id,construction_site_id,entry_type,
         recorded_at,client_entry_id,client_created_at,source,entered_by_user_id,
         original_entry_id,correction_kind,correction_reason,activity_note,
         travel_minutes_override,edit_operation_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_TIMESTAMP,$8,$9,$10,
                 'replacement',$11,$12,$13,$14)
       RETURNING *`,
      [
        context.companyId, original.user_id, replacement.work_day_id,
        replacement.construction_site_id, replacement.entry_type, replacement.recorded_at,
        randomUUID(), administrator ? "office" : "employee", context.userId,
        replacement.id, input.reason, replacement.activity_note,
        replacement.travel_minutes_override, operation.rows[0].id
      ]
    );
    if (!controlled) {
      // Ohne Prüfung wirksam: kein Prüfer, sondern die ausdrückliche
      // Kennzeichnung, dass das Büro nicht beteiligt war.
      await client.query(
        `UPDATE time_entries
         SET correction_status = 'approved', applied_without_review = TRUE
         WHERE company_id = $1 AND id = $2`,
        [context.companyId, inserted.rows[0].id]
      );
    }
    const item = await client.query(
      `INSERT INTO time_change_items (
         company_id,operation_id,original_entry_id,replacement_entry_id,
         item_action,old_value,new_value
       ) VALUES ($1,$2,$3,$4,'replace',$5::JSONB,$6::JSONB) RETURNING *`,
      [
        context.companyId, operation.rows[0].id, replacement.id, inserted.rows[0].id,
        JSON.stringify({
          workDayId: original.work_day_id,
          recordedAt: related.find((entry) => entry.id === replacement.id).recorded_at,
          constructionSiteId: related.find((entry) => entry.id === replacement.id).construction_site_id,
          activityNote: related.find((entry) => entry.id === replacement.id).activity_note,
          travelMinutes: related.find((entry) => entry.id === replacement.id).travel_minutes_override
        }),
        JSON.stringify({
          workDayId: replacement.work_day_id,
          workDate: input.workDate,
          recordedAt: replacement.recorded_at,
          constructionSiteId: replacement.construction_site_id,
          activityNote: replacement.activity_note,
          travelMinutes: replacement.travel_minutes_override
        })
      ]
    );
    insertedItems.push(item.rows[0]);
  }

  if (input.breakMinutes !== undefined) {
    const oldBreak = targetDay.break_minutes_override;
    if (!controlled) {
      await client.query(
        `UPDATE work_days
         SET break_minutes_override = $3,
             break_override_reason = CASE WHEN $3::INTEGER IS NULL THEN NULL ELSE $4 END,
             break_override_by_user_id = CASE WHEN $3::INTEGER IS NULL THEN NULL ELSE $5::UUID END
         WHERE company_id = $1 AND id = $2`,
        [context.companyId, targetDay.id, input.breakMinutes, input.reason, context.userId]
      );
      await client.query(
        "SELECT recalculate_work_day($1,$2,$3)",
        [context.companyId, original.user_id, targetDay.id]
      );
    }
    const item = await client.query(
      `INSERT INTO time_change_items (
         company_id,operation_id,item_action,old_value,new_value
       ) VALUES ($1,$2,'break_override',$3::JSONB,$4::JSONB) RETURNING *`,
      [
        context.companyId, operation.rows[0].id,
        JSON.stringify({ workDayId: targetDay.id, minutes: oldBreak }),
        JSON.stringify({ workDayId: targetDay.id, minutes: input.breakMinutes })
      ]
    );
    insertedItems.push(item.rows[0]);
  }

  return {
    operation: timeChangeOperationDto(operation.rows[0], insertedItems),
    idempotent: false
  };
}

async function deleteTimeEntry(client, context, entryId, input, timeZone, administrator = false) {
  const streamUserId = await lockTimeEntryStream(client, context, entryId, administrator);
  const idempotent = await existingTimeChange(
    client, context.companyId, streamUserId, input.clientChangeId, "delete_entry"
  );
  if (idempotent) return { operation: idempotent, idempotent: true };
  const original = await editableTimeEntry(client, context, entryId, administrator);
  if (new Date(input.expectedRecordedAt).valueOf() !== new Date(original.recorded_at).valueOf()) {
    throw new InputError("Der Zeiteintrag wurde zwischenzeitlich geändert.", 409, "stale_time_entry");
  }
  const sourceEntries = await effectiveEntriesForDays(
    client,
    context.companyId,
    original.user_id,
    [original.work_day_id]
  );
  const block = enclosingWorkBlock(sourceEntries, original.id);
  if (block.length === 0) throw new InputError("Der Arbeitsblock wurde nicht gefunden.", 409, "time_block_missing");
  const remaining = sourceEntries.filter((entry) => !block.some((item) => item.id === entry.id));
  assertEffectiveTimeline(remaining);
  const lockedDay = ["approved", "locked"].includes(original.work_day_status);
  const policy = administrator ? null : await companyTimeCorrectionPolicy(client, context);
  const controlled = lockedDay
    || (!administrator && ownCorrectionNeedsReview(
      policy, databaseDate(original.work_date), timeZone
    ));
  if (lockedDay && administrator) await requireEmployeeLifecycleAdministrator(client, context);
  if (!controlled) {
    await client.query(
      `UPDATE work_days SET status = 'open'
       WHERE company_id = $1 AND id = $2 AND status = 'submitted'`,
      [context.companyId, original.work_day_id]
    );
  }
  const operation = await client.query(
    `INSERT INTO time_change_operations (
       company_id,user_id,client_change_id,action,reason,status,requested_by_user_id,
       applied_without_review
     ) VALUES ($1,$2,$3,'delete_entry',$4,$5,$6,$7) RETURNING *`,
    [
      context.companyId, original.user_id, input.clientChangeId, input.reason,
      controlled ? "pending" : "applied", context.userId, !controlled
    ]
  );
  const items = [];
  for (const entry of block) {
    const invalidation = await client.query(
      `INSERT INTO time_entries (
         company_id,user_id,work_day_id,construction_site_id,entry_type,
         recorded_at,client_entry_id,client_created_at,source,entered_by_user_id,
         original_entry_id,correction_kind,correction_reason,activity_note,
         travel_minutes_override,edit_operation_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_TIMESTAMP,$8,$9,$10,
                 'invalidation',$11,$12,$13,$14) RETURNING *`,
      [
        context.companyId, original.user_id, entry.work_day_id,
        entry.construction_site_id, entry.entry_type, entry.recorded_at, randomUUID(),
        administrator ? "office" : "employee", context.userId, entry.id,
        input.reason, entry.activity_note, entry.travel_minutes_override, operation.rows[0].id
      ]
    );
    if (!controlled) {
      // Ohne Prüfung wirksam: kein Prüfer, sondern die ausdrückliche
      // Kennzeichnung, dass das Büro nicht beteiligt war.
      await client.query(
        `UPDATE time_entries
         SET correction_status = 'approved', applied_without_review = TRUE
         WHERE company_id = $1 AND id = $2`,
        [context.companyId, invalidation.rows[0].id]
      );
    }
    const item = await client.query(
      `INSERT INTO time_change_items (
         company_id,operation_id,original_entry_id,replacement_entry_id,
         item_action,old_value,new_value
       ) VALUES ($1,$2,$3,$4,'invalidate',$5::JSONB,$6::JSONB) RETURNING *`,
      [
        context.companyId, operation.rows[0].id, entry.id, invalidation.rows[0].id,
        JSON.stringify({
          workDayId: entry.work_day_id, recordedAt: entry.recorded_at,
          entryType: entry.entry_type, constructionSiteId: entry.construction_site_id,
          activityNote: entry.activity_note, travelMinutes: entry.travel_minutes_override
        }),
        JSON.stringify({ deleted: true })
      ]
    );
    items.push(item.rows[0]);
  }
  return { operation: timeChangeOperationDto(operation.rows[0], items), idempotent: false };
}

async function reviewTimeChangeOperation(client, context, operationId, input) {
  await requireFullPlanner(client, context);
  const operation = await client.query(
    `SELECT * FROM time_change_operations
     WHERE company_id = $1 AND id = $2 FOR UPDATE`,
    [context.companyId, operationId]
  );
  if (operation.rowCount !== 1 || operation.rows[0].status !== "pending") {
    throw new InputError("Die kontrollierte Korrektur wurde nicht gefunden oder bereits entschieden.", 409, "time_change_not_pending");
  }
  const items = await client.query(
    `SELECT * FROM time_change_items
     WHERE company_id = $1 AND operation_id = $2 ORDER BY created_at, id`,
    [context.companyId, operationId]
  );
  const oldWorkDayIds = [...new Set(
    items.rows.map((item) => item.old_value?.workDayId).filter(Boolean)
  )];
  const newWorkDayIds = [...new Set(
    items.rows.map((item) => item.new_value?.workDayId).filter(Boolean)
  )];
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    [`time-edit:${context.companyId}:${operation.rows[0].user_id}`]
  );
  if (input.decision === "approved") {
    const workDayIds = [...new Set([...oldWorkDayIds, ...newWorkDayIds])];
    const currentEntries = await effectiveEntriesForDays(
      client,
      context.companyId,
      operation.rows[0].user_id,
      workDayIds
    );
    const originalIds = new Set(
      items.rows.map((item) => item.original_entry_id).filter(Boolean)
    );
    const pending = await client.query(
      `SELECT id,work_day_id,entry_type,recorded_at,construction_site_id,
              activity_note,travel_minutes_override,created_at,correction_kind
       FROM time_entries
       WHERE company_id = $1 AND edit_operation_id = $2
         AND correction_status = 'pending'
       ORDER BY recorded_at,created_at,id
       FOR UPDATE`,
      [context.companyId, operationId]
    );
    for (const workDayId of workDayIds) {
      const proposed = currentEntries
        .filter((entry) => entry.work_day_id === workDayId && !originalIds.has(entry.id))
        .concat(pending.rows.filter((entry) => (
          entry.work_day_id === workDayId && entry.correction_kind !== "invalidation"
        )));
      assertEffectiveTimeline(proposed);
    }
  }
  await client.query(
    "SELECT set_config('app.controlled_time_correction','on',TRUE)"
  );
  await client.query(
    `UPDATE time_entries SET correction_status = $3, reviewed_by_user_id = $4
     WHERE company_id = $1 AND edit_operation_id = $2 AND correction_status = 'pending'`,
    [context.companyId, operationId, input.decision, context.userId]
  );
  if (input.decision === "approved") {
    const movedToDayIds = newWorkDayIds.filter((workDayId) => !oldWorkDayIds.includes(workDayId));
    if (movedToDayIds.length && oldWorkDayIds.length) {
      const sourceStatus = await client.query(
        `SELECT CASE WHEN BOOL_OR(status = 'locked') THEN 'locked'
                     WHEN BOOL_OR(status = 'approved') THEN 'approved'
                     ELSE NULL END AS final_status
         FROM work_days WHERE company_id = $1 AND id = ANY($2::UUID[])`,
        [context.companyId, oldWorkDayIds]
      );
      const finalStatus = sourceStatus.rows[0]?.final_status;
      if (finalStatus) {
        await client.query(
          `UPDATE work_days SET
             status = CASE WHEN status = 'locked' OR $3 = 'locked' THEN 'locked' ELSE 'approved' END,
             approved_by_user_id = COALESCE(approved_by_user_id,$4),
             locked_by_user_id = CASE
               WHEN status = 'locked' OR $3 = 'locked' THEN COALESCE(locked_by_user_id,$4)
               ELSE NULL END
           WHERE company_id = $1 AND id = ANY($2::UUID[])`,
          [context.companyId, movedToDayIds, finalStatus, context.userId]
        );
      }
    }
    for (const item of items.rows.filter((row) => row.item_action === "break_override")) {
      const value = item.new_value;
      await client.query(
        `UPDATE work_days
         SET break_minutes_override = $3,
             break_override_reason = CASE WHEN $3::INTEGER IS NULL THEN NULL ELSE $4 END,
             break_override_by_user_id = CASE WHEN $3::INTEGER IS NULL THEN NULL ELSE $5::UUID END
         WHERE company_id = $1 AND id = $2`,
        [context.companyId, value.workDayId, value.minutes, operation.rows[0].reason, context.userId]
      );
      await client.query(
        "SELECT recalculate_work_day($1,$2,$3)",
        [context.companyId, operation.rows[0].user_id, value.workDayId]
      );
    }
  }
  const updated = await client.query(
    `UPDATE time_change_operations
     SET status = $3, reviewed_by_user_id = $4, reviewed_at = CURRENT_TIMESTAMP,
         row_version = row_version + 1
     WHERE company_id = $1 AND id = $2 RETURNING *`,
    [context.companyId, operationId, input.decision, context.userId]
  );
  return timeChangeOperationDto(updated.rows[0], items.rows);
}

async function createTimeEntryCorrection(client, context, input, timeZone) {
  const requestedAt = new Date(input.requestedRecordedAt);
  if (requestedAt.valueOf() > Date.now()) {
    throw new InputError("Die gewünschte Uhrzeit darf nicht in der Zukunft liegen.");
  }

  const originalResult = await client.query(
    `SELECT entry.id, entry.user_id, entry.work_day_id, entry.entry_type,
            entry.recorded_at, entry.construction_site_id, day.work_date, day.status
     FROM time_entries AS entry
     JOIN work_days AS day
       ON day.company_id = entry.company_id
      AND day.user_id = entry.user_id
      AND day.id = entry.work_day_id
     WHERE entry.company_id = $1
       AND entry.user_id = $2
       AND entry.id = $3
       AND entry.invalidated_at IS NULL
       AND entry.correction_kind IS DISTINCT FROM 'invalidation'
       AND (
         (entry.original_entry_id IS NULL AND entry.correction_status IS NULL)
         OR entry.correction_status = 'approved'
       )
     FOR UPDATE OF entry, day`,
    [context.companyId, context.userId, input.originalEntryId]
  );
  if (originalResult.rowCount !== 1) {
    throw new InputError(
      "Die zu korrigierende eigene Zeitbuchung wurde nicht gefunden.",
      404,
      "time_entry_not_found"
    );
  }
  const original = originalResult.rows[0];
  const workDate = databaseDate(original.work_date);
  if (localDate(input.requestedRecordedAt, timeZone) !== localDate(original.recorded_at, timeZone)) {
    throw new InputError(
      "Die korrigierte Uhrzeit muss am selben Arbeitstag liegen.",
      409,
      "time_correction_wrong_day"
    );
  }
  if (requestedAt.valueOf() === new Date(original.recorded_at).valueOf()) {
    throw new InputError("Die gewünschte Uhrzeit entspricht bereits der vorhandenen Buchung.");
  }

  const pending = await client.query(
    `SELECT 1
     FROM time_entries
     WHERE company_id = $1
       AND user_id = $2
       AND original_entry_id = $3
       AND correction_status = 'pending'
     LIMIT 1`,
    [context.companyId, context.userId, original.id]
  );
  if (pending.rowCount !== 0) {
    throw new InputError(
      "Für diese Buchung wartet bereits eine Korrektur auf Prüfung.",
      409,
      "time_correction_pending"
    );
  }

  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    [`time-correction:${context.companyId}:${context.userId}:${original.work_day_id}`]
  );
  await assertCorrectionTimeline(client, {
    companyId: context.companyId,
    userId: context.userId,
    workDayId: original.work_day_id,
    originalEntryId: original.id,
    entryType: original.entry_type,
    recordedAt: input.requestedRecordedAt,
    constructionSiteId: original.construction_site_id
  });

  const correctionId = randomUUID();
  await client.query(
    `INSERT INTO time_entries (
       id, company_id, user_id, work_day_id, construction_site_id,
       entry_type, recorded_at, client_entry_id, client_created_at,
       source, entered_by_user_id, original_entry_id, correction_kind, correction_reason
     ) VALUES (
       $1, $2, $3, $4, $5,
       $6, $7, $8, CURRENT_TIMESTAMP,
       'employee', $3, $9, 'replacement', $10
     )`,
    [
      correctionId,
      context.companyId,
      context.userId,
      original.work_day_id,
      original.construction_site_id,
      original.entry_type,
      input.requestedRecordedAt,
      randomUUID(),
      original.id,
      input.reason
    ]
  );

  const created = await client.query(
    `SELECT correction.id, correction.user_id, correction.work_day_id,
            correction.work_date, correction.original_entry_id,
            correction.correction_kind,
            correction.entry_type, correction.requested_recorded_at,
            correction.original_recorded_at, correction.correction_reason,
            correction.requested_at, 'pending'::TEXT AS correction_status,
            NULL::TIMESTAMPTZ AS reviewed_at,
            account.first_name || ' ' || account.last_name AS employee_name
     FROM pending_time_entry_corrections_v2 AS correction
     JOIN users AS account
       ON account.company_id = correction.company_id
      AND account.id = correction.user_id
     WHERE correction.company_id = $1 AND correction.id = $2`,
    [context.companyId, correctionId]
  );
  return timeEntryCorrectionDto(created.rows[0]);
}

async function createTimeEntryAddition(client, context, input, timeZone) {
  const requestedAt = new Date(input.recordedAt);
  if (requestedAt.valueOf() > Date.now()) {
    throw new InputError("Die ergänzte Uhrzeit darf nicht in der Zukunft liegen.");
  }
  if (localDate(input.recordedAt, timeZone) !== input.workDate) {
    throw new InputError(
      "Die ergänzte Uhrzeit muss am ausgewählten Arbeitstag liegen.",
      409,
      "time_addition_wrong_day"
    );
  }

  const dayResult = await client.query(
    `SELECT id, status
     FROM work_days
     WHERE company_id = $1 AND user_id = $2 AND work_date = $3
     FOR UPDATE`,
    [context.companyId, context.userId, input.workDate]
  );
  if (dayResult.rowCount !== 1) {
    throw new InputError(
      "Für diesen Tag existiert noch kein Stundenzettel.",
      404,
      "work_day_not_found"
    );
  }
  const day = dayResult.rows[0];

  if (input.constructionSiteId) {
    await ensureOwnSiteAssignment(
      client,
      context,
      input.workDate,
      input.constructionSiteId,
      "Selbst gewählt beim Nachtragen"
    );
  }

  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    [`time-correction:${context.companyId}:${context.userId}:${day.id}`]
  );
  await assertCorrectionTimeline(client, {
    companyId: context.companyId,
    userId: context.userId,
    workDayId: day.id,
    originalEntryId: null,
    entryType: input.entryType,
    recordedAt: input.recordedAt,
    constructionSiteId: input.constructionSiteId
  });

  const correctionId = randomUUID();
  await client.query(
    `INSERT INTO time_entries (
       id, company_id, user_id, work_day_id, construction_site_id,
       entry_type, recorded_at, client_entry_id, client_created_at,
       source, entered_by_user_id, correction_kind, correction_reason
     ) VALUES (
       $1, $2, $3, $4, $5,
       $6, $7, $8, CURRENT_TIMESTAMP,
       'employee', $3, 'addition', $9
     )`,
    [
      correctionId,
      context.companyId,
      context.userId,
      day.id,
      input.constructionSiteId,
      input.entryType,
      input.recordedAt,
      randomUUID(),
      input.reason
    ]
  );
  const created = await client.query(
    `SELECT correction.id, correction.user_id, correction.work_day_id,
            correction.work_date, correction.original_entry_id,
            correction.correction_kind, correction.entry_type,
            correction.requested_recorded_at, correction.original_recorded_at,
            correction.correction_reason, correction.requested_at,
            'pending'::TEXT AS correction_status,
            NULL::TIMESTAMPTZ AS reviewed_at,
            account.first_name || ' ' || account.last_name AS employee_name
     FROM pending_time_entry_corrections_v2 AS correction
     JOIN users AS account
       ON account.company_id = correction.company_id
      AND account.id = correction.user_id
     WHERE correction.company_id = $1 AND correction.id = $2`,
    [context.companyId, correctionId]
  );
  return timeEntryCorrectionDto(created.rows[0]);
}

async function createTimeEntryInvalidation(client, context, input) {
  const originalResult = await client.query(
    `SELECT entry.id, entry.user_id, entry.work_day_id, entry.entry_type,
            entry.recorded_at, entry.construction_site_id, day.work_date
     FROM time_entries AS entry
     JOIN work_days AS day
       ON day.company_id = entry.company_id
      AND day.user_id = entry.user_id
      AND day.id = entry.work_day_id
     WHERE entry.company_id = $1
       AND entry.user_id = $2
       AND entry.id = $3
       AND entry.invalidated_at IS NULL
       AND entry.correction_kind IS DISTINCT FROM 'invalidation'
       AND (
         (entry.original_entry_id IS NULL AND entry.correction_status IS NULL)
         OR entry.correction_status = 'approved'
       )
     FOR UPDATE OF entry, day`,
    [context.companyId, context.userId, input.originalEntryId]
  );
  if (originalResult.rowCount !== 1) {
    throw new InputError(
      "Die eigene Zeitbuchung wurde nicht gefunden.",
      404,
      "time_entry_not_found"
    );
  }
  const original = originalResult.rows[0];
  const pending = await client.query(
    `SELECT 1 FROM time_entries
     WHERE company_id = $1 AND user_id = $2
       AND original_entry_id = $3 AND correction_status = 'pending'
     LIMIT 1`,
    [context.companyId, context.userId, original.id]
  );
  if (pending.rowCount !== 0) {
    throw new InputError(
      "Für diese Buchung wartet bereits eine Änderung auf Prüfung.",
      409,
      "time_correction_pending"
    );
  }

  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    [`time-correction:${context.companyId}:${context.userId}:${original.work_day_id}`]
  );
  await assertCorrectionTimeline(client, {
    companyId: context.companyId,
    userId: context.userId,
    workDayId: original.work_day_id,
    originalEntryId: original.id,
    entryType: original.entry_type,
    recordedAt: original.recorded_at,
    constructionSiteId: original.construction_site_id,
    omitProposed: true
  });

  const correctionId = randomUUID();
  await client.query(
    `INSERT INTO time_entries (
       id, company_id, user_id, work_day_id, construction_site_id,
       entry_type, recorded_at, client_entry_id, client_created_at,
       source, entered_by_user_id, original_entry_id, correction_kind, correction_reason
     ) VALUES (
       $1, $2, $3, $4, $5,
       $6, $7, $8, CURRENT_TIMESTAMP,
       'employee', $3, $9, 'invalidation', $10
     )`,
    [
      correctionId,
      context.companyId,
      context.userId,
      original.work_day_id,
      original.construction_site_id,
      original.entry_type,
      original.recorded_at,
      randomUUID(),
      original.id,
      input.reason
    ]
  );
  const created = await client.query(
    `SELECT correction.id, correction.user_id, correction.work_day_id,
            correction.work_date, correction.original_entry_id,
            correction.correction_kind, correction.entry_type,
            correction.requested_recorded_at, correction.original_recorded_at,
            correction.correction_reason, correction.requested_at,
            'pending'::TEXT AS correction_status,
            NULL::TIMESTAMPTZ AS reviewed_at,
            account.first_name || ' ' || account.last_name AS employee_name
     FROM pending_time_entry_corrections_v2 AS correction
     JOIN users AS account
       ON account.company_id = correction.company_id
      AND account.id = correction.user_id
     WHERE correction.company_id = $1 AND correction.id = $2`,
    [context.companyId, correctionId]
  );
  return timeEntryCorrectionDto(created.rows[0]);
}

async function reviewTimeEntryCorrection(client, context, correctionId, input) {
  await requireFullPlanner(client, context);
  const correctionResult = await client.query(
    `SELECT correction.id, correction.user_id, correction.work_day_id,
            day.work_date, correction.original_entry_id,
            correction.correction_kind,
            correction.edit_operation_id,
            correction.entry_type,
            correction.recorded_at AS requested_recorded_at,
            original.recorded_at AS original_recorded_at,
            correction.construction_site_id,
            correction.correction_reason,
            correction.created_at AS requested_at,
            correction.correction_status, correction.reviewed_at,
            account.first_name || ' ' || account.last_name AS employee_name
     FROM time_entries AS correction
     LEFT JOIN time_entries AS original
       ON original.company_id = correction.company_id
      AND original.user_id = correction.user_id
      AND original.id = correction.original_entry_id
     JOIN work_days AS day
       ON day.company_id = correction.company_id
      AND day.user_id = correction.user_id
      AND day.id = correction.work_day_id
     JOIN users AS account
       ON account.company_id = correction.company_id
      AND account.id = correction.user_id
     WHERE correction.company_id = $1
       AND correction.id = $2
       AND correction.correction_status = 'pending'
     FOR UPDATE OF correction, day`,
    [context.companyId, correctionId]
  );
  if (correctionResult.rowCount !== 1) {
    throw new InputError(
      "Der offene Korrekturantrag wurde nicht gefunden.",
      404,
      "time_correction_not_found"
    );
  }
  const correction = correctionResult.rows[0];
  if (correction.edit_operation_id) {
    throw new InputError(
      "Diese zusammenhängende Änderung muss als vollständiger Korrekturvorgang geprüft werden.",
      409,
      "time_change_operation_review_required"
    );
  }
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    [`time-correction:${context.companyId}:${correction.user_id}:${correction.work_day_id}`]
  );
  if (input.decision === "approved") {
    await assertCorrectionTimeline(client, {
      companyId: context.companyId,
      userId: correction.user_id,
      workDayId: correction.work_day_id,
      originalEntryId: correction.original_entry_id,
      entryType: correction.entry_type,
      recordedAt: correction.requested_recorded_at,
      constructionSiteId: correction.construction_site_id,
      omitProposed: correction.correction_kind === "invalidation"
    });
  }
  const reviewed = await client.query(
    `UPDATE time_entries
     SET correction_status = $3,
         reviewed_by_user_id = $4
     WHERE company_id = $1 AND id = $2
     RETURNING correction_status, reviewed_at`,
    [context.companyId, correction.id, input.decision, context.userId]
  );
  return timeEntryCorrectionDto({
    ...correction,
    correction_status: reviewed.rows[0].correction_status,
    reviewed_at: reviewed.rows[0].reviewed_at
  });
}

function sanitizedRequestPath(requestUrl) {
  try {
    return new URL(requestUrl, "http://api.local").pathname
      .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id")
      .replace(/\/\d{4}-\d{2}-\d{2}(?=\/|$)/g, "/:date")
      .slice(0, 240);
  } catch {
    return "/unknown";
  }
}

function clientRuntime(userAgent = "") {
  const ua = String(userAgent).slice(0, 500);
  const deviceClass = /ipad|tablet/i.test(ua)
    ? "tablet"
    : /mobile|android|iphone/i.test(ua) ? "mobile" : "desktop";
  const browser = /edg\//i.test(ua) ? "Edge"
    : /firefox\//i.test(ua) ? "Firefox"
      : /chrome\//i.test(ua) ? "Chrome"
        : /safari\//i.test(ua) ? "Safari" : "Unbekannt";
  const operatingSystem = /android/i.test(ua) ? "Android"
    : /iphone|ipad|ios/i.test(ua) ? "iOS/iPadOS"
      : /windows/i.test(ua) ? "Windows"
        : /mac os|macintosh/i.test(ua) ? "macOS"
          : /linux/i.test(ua) ? "Linux" : "Unbekannt";
  return { deviceClass, browser, operatingSystem };
}

async function recordUnhandledPlatformError(pool, request, requestId, error) {
  const path = sanitizedRequestPath(request.url);
  if (!path.startsWith("/api/")) return;
  const safeCode = typeof error?.code === "string" && /^[A-Za-z0-9_]{1,80}$/.test(error.code)
    ? error.code
    : "internal_error";
  const moduleName = path.startsWith("/api/v1/platform/")
    ? "platform_administration"
    : path.startsWith("/api/v1/vde/") ? "vde"
      : path.includes("time") || path.includes("work-day") ? "time_tracking" : "web_api";
  const fingerprint = createHash("sha256")
    .update(`${safeCode}|${request.method}|${path}|${error?.name || "Error"}`)
    .digest("hex");
  const runtime = clientRuntime(request.headers["user-agent"]);
  await withPlatformTransaction(pool, async (client) => {
    const group = await client.query(
      `INSERT INTO platform_error_groups (
         fingerprint,error_code,severity,module,application_version,
         sanitized_message,sanitized_details,first_seen_at,last_seen_at
       ) VALUES ($1,$2,'error',$3,$6,$4,$5::JSONB,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
       ON CONFLICT (fingerprint) DO UPDATE SET
         occurrence_count = platform_error_groups.occurrence_count + 1,
         last_seen_at = CURRENT_TIMESTAMP,
         status = CASE WHEN platform_error_groups.status = 'resolved' THEN 'reopened'
                       ELSE platform_error_groups.status END,
         resolved_at = NULL
       RETURNING id`,
      [
        fingerprint,
        safeCode,
        moduleName,
        `Unbehandelte Serverausnahme bei ${request.method} ${path}`,
        JSON.stringify({ method: request.method, path, errorType: error?.name || "Error" }),
        APPLICATION_VERSION
      ]
    );
    await client.query(
      `INSERT INTO platform_error_occurrences (
         error_group_id,device_class,browser,operating_system,request_id,sanitized_context
       ) VALUES ($1,$2,$3,$4,$5,$6::JSONB)`,
      [
        group.rows[0].id, runtime.deviceClass, runtime.browser,
        runtime.operatingSystem, requestId, JSON.stringify({ method: request.method, path })
      ]
    );
  });
}

export function createApp({ pool, config, limiter = new LoginRateLimiter(), logger = console }) {
  const platformHandler = createPlatformHandler({ pool, config, limiter });
  let runtimeCache = { validUntil: 0, value: null };
  const runtimeState = async () => {
    const now = Date.now();
    if (runtimeCache.value && runtimeCache.validUntil > now) return runtimeCache.value;
    const value = await readPlatformRuntimeState(pool);
    runtimeCache = { validUntil: now + 2_000, value };
    return value;
  };
  return async function app(request, response) {
    const requestId = randomUUID();
    response.setHeader("X-Request-Id", requestId);

    const origin = request.headers.origin;
    if (origin && origin !== config.allowedOrigin) {
      return json(response, 403, { error: { code: "origin_forbidden", message: "Ursprung nicht erlaubt." }, requestId });
    }
    if (origin === config.allowedOrigin) {
      response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader("Access-Control-Allow-Credentials", "true");
      response.setHeader("Vary", "Origin");
    }
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Schaefchen-Version, X-Support-Access-Id",
        "Access-Control-Max-Age": "600"
      });
      return response.end();
    }

    try {
      const url = new URL(request.url, "http://api.local");

      if (request.method === "GET" && url.pathname === "/health") {
        await pool.query("SELECT 1");
        return json(response, 200, { status: "ok" });
      }

      if (await platformHandler(request, response, url)) return;

      if (!url.pathname.startsWith("/api/") && await serveStatic(
        request,
        response,
        config.staticDirectory,
        url.pathname
      )) return;

      const platformRuntime = await runtimeState();
      if (request.method === "GET" && url.pathname === "/api/v1/runtime") {
        return json(response, 200, { runtime: platformRuntime, requestId });
      }
      const logoutDuringBlock = request.method === "DELETE"
        && url.pathname === "/api/v1/session";
      if (platformRuntime.maintenanceEnabled && !logoutDuringBlock) {
        return json(response, 503, {
          error: {
            code: "maintenance_mode",
            message: "Schäfchen befindet sich im Wartungsmodus. Bitte versuchen Sie es in Kürze erneut."
          },
          requestId
        }, { "Retry-After": "120" });
      }
      if (platformRuntime.mandatoryUpdate && platformRuntime.productionVersion
          && !logoutDuringBlock) {
        // Der Kopfzeileneintrag geht nur mit, wenn die App die Anfrage selbst
        // stellt. Ein Blatt, das der Browser holt - ein Rahmen mit der
        // Vorschau, ein neuer Reiter mit dem Wochennachweis -, traegt ihn
        // nicht: dort erschien statt des PDFs die Meldung ueber das
        // notwendige Update, obwohl die App laengst aktuell war. Deshalb darf
        // die Fassung auch im Adressteil stehen. Schwaecher wird die Abfrage
        // dadurch nicht - wer die Zahl frei waehlen will, kann das bei der
        // Kopfzeile ebenso.
        const clientVersion = request.headers["x-schaefchen-version"]
          || url.searchParams.get("appVersion");
        const comparison = compareApplicationVersions(clientVersion, platformRuntime.productionVersion);
        if (comparison === null || comparison < 0) {
          return json(response, 426, {
            error: {
              code: "mandatory_update",
              message: `Für Schäfchen ist das verpflichtende Update ${platformRuntime.productionVersion} verfügbar.`
            },
            update: { requiredVersion: platformRuntime.productionVersion },
            requestId
          });
        }
      }

      if (request.method === "GET" && url.pathname === "/api/v1/setup") {
        const setup = await setupStatus(pool, config.initialCompanyNumber);
        return json(response, 200, { setup });
      }

      if (request.method === "POST" && url.pathname === "/api/v1/setup") {
        const account = await createInitialAdmin(pool, config, limiter, request, await readJson(request));
        return json(response, 201, { created: true, account });
      }

      if (request.method === "POST" && url.pathname === "/api/v1/session") {
        const { token, view } = await createLogin(pool, config, limiter, request, await readJson(request));
        return json(response, 201, { session: view }, {
          "Set-Cookie": sessionCookie(token, { secure: config.cookieSecure, maxAge: config.sessionTtlSeconds })
        });
      }

      const token = parseCookies(request.headers.cookie)[SESSION_COOKIE];
      if (!token || token.length < 40 || token.length > 128) {
        throw new InputError("Anmeldung erforderlich.", 401, "unauthorized");
      }
      const tokenHash = hashSessionToken(token);

      if (request.method === "GET" && url.pathname === "/api/v1/session") {
        const view = await withSessionTransaction(pool, tokenHash, sessionView);
        return json(response, 200, { session: view });
      }

      if (request.method === "DELETE" && url.pathname === "/api/v1/session") {
        await withSessionTransaction(pool, tokenHash, async (client, context) => {
          await client.query(
            `UPDATE user_sessions
             SET revoked_at = CURRENT_TIMESTAMP, revocation_reason = 'logout'
             WHERE company_id = $1 AND id = $2 AND revoked_at IS NULL`,
            [context.companyId, context.sessionId]
          );
        });
        response.setHeader("Set-Cookie", sessionCookie("", { secure: config.cookieSecure, maxAge: 0 }));
        return json(response, 200, { loggedOut: true });
      }

      if (request.method === "POST" && url.pathname === "/api/v1/account/initial-password") {
        const input = validateInitialPasswordChange(await readJson(request));
        const view = await withSessionTransaction(
          pool,
          tokenHash,
          (client, context) => changeInitialPassword(client, context, input.newPassword)
        );
        return json(response, 200, { changed: true, session: view });
      }

      if (request.method === "GET" && url.pathname === "/api/v1/announcements") {
        const announcements = await withReadySession(
          pool,
          tokenHash,
          (client, context) => getPlatformAnnouncements(client, context)
        );
        return json(response, 200, { announcements });
      }

      const announcementReadMatch = /^\/api\/v1\/announcements\/([^/]+)\/read$/.exec(
        url.pathname
      );
      if (request.method === "POST" && announcementReadMatch) {
        const announcement = await withReadySession(
          pool,
          tokenHash,
          (client, context) => markPlatformAnnouncementRead(
            client,
            context,
            validateId(announcementReadMatch[1], "Mitteilungs-ID")
          )
        );
        return json(response, 200, { announcement });
      }

      // Maschinen & Geräte kapselt seine umfangreiche Fachlogik in einem
      // eigenen Modul. Die Sitzung wird trotzdem hier aufgeloest: company_id
      // und user_id kommen damit ausschliesslich aus dem HttpOnly-Cookie und
      // nie aus einem QR-Code oder einem Frontend-Feld.
      if (
        url.pathname.startsWith("/api/v1/devices")
        || url.pathname.startsWith("/api/v1/admin/devices")
      ) {
        const handled = await withReadySession(
          pool,
          tokenHash,
          (client, context) => handleDeviceRequest({
            request,
            url,
            client,
            context,
            allowedOrigin: config.allowedOrigin,
            today: localDate(new Date().toISOString(), config.timeZone)
          })
        );
        if (handled?.document) return inlineDocument(response, handled.document);
        if (handled) return json(response, handled.status, handled.body);
      }

      // Baustromverteiler haengen an der Geraeteverwaltung und bekommen
      // deshalb keine eigene Freigabe - nur einen eigenen Weg, weil ihre
      // beiden Fristen und die Zaehlerstaende sonst im Geraetemodul
      // untergingen.
      if (url.pathname.startsWith("/api/v1/power")) {
        const handled = await withReadySession(
          pool,
          tokenHash,
          (client, context) => handlePowerRequest({
            request,
            url,
            client,
            context,
            today: localDate(new Date().toISOString(), config.timeZone)
          })
        );
        if (handled) return json(response, handled.status, handled.body);
      }

      if (request.method === "GET" && url.pathname === "/api/v1/time-account") {
        const asOfDate = localDate(new Date().toISOString(), config.timeZone);
        const year = validateTimeAccountYear(
          url.searchParams.get("year") || asOfDate.slice(0, 4)
        );
        const timeAccount = await withReadySession(
          pool,
          tokenHash,
          (client, context) => getOwnTimeAccount(
            client,
            context,
            year,
            asOfDate
          )
        );
        return json(response, 200, { timeAccount });
      }

      if (request.method === "GET" && url.pathname === "/api/v1/apprentice/reports") {
        const range = timesheetExportRange(url);
        const body = await withReadySession(
          pool,
          tokenHash,
          (client, context) => getOwnApprenticeReports(client, context, range)
        );
        return json(response, 200, body);
      }

      // Mehrere Wochen am Stueck. Der Weg steht vor dem Wochenmuster, sonst
      // fiele "pdf" nie auf: die Woche im Pfad ist zwar ein Datum, aber ein
      // spaeterer Zweig wird nicht mehr erreicht.
      if (request.method === "GET" && url.pathname === "/api/v1/apprentice/reports/pdf") {
        const range = timesheetExportRange(url);
        const apprenticeUserId = url.searchParams.get("apprenticeUserId");
        if (apprenticeUserId && !UUID_PATTERN.test(apprenticeUserId)) {
          throw new InputError("Die Kennung des Auszubildenden ist ungültig.");
        }
        const datei = await withReadySession(
          pool,
          tokenHash,
          (client, context) => buildApprenticeBookPdf(
            client, context, range, apprenticeUserId, config.staticDirectory
          )
        );
        return binaryAttachment(response, { ...datei, mimeType: "application/pdf" });
      }

      const apprenticeWeekMatch =
        /^\/api\/v1\/apprentice\/reports\/(\d{4}-\d{2}-\d{2})$/.exec(url.pathname);
      if (request.method === "PUT" && apprenticeWeekMatch) {
        const weekStart = validateApprenticeWeek(apprenticeWeekMatch[1]);
        const input = validateApprenticeReport(await readJson(request), weekStart);
        const report = await withReadySession(
          pool,
          tokenHash,
          (client, context) => putOwnApprenticeReport(client, context, weekStart, input)
        );
        return json(response, 200, { report });
      }

      const apprenticeSubmitMatch =
        /^\/api\/v1\/apprentice\/reports\/(\d{4}-\d{2}-\d{2})\/submit$/.exec(url.pathname);
      if (request.method === "POST" && apprenticeSubmitMatch) {
        const weekStart = validateApprenticeWeek(apprenticeSubmitMatch[1]);
        const report = await withReadySession(
          pool,
          tokenHash,
          (client, context) => submitApprenticeReport(client, context, weekStart)
        );
        return json(response, 200, { report });
      }

      const apprenticeWithdrawMatch =
        /^\/api\/v1\/apprentice\/reports\/(\d{4}-\d{2}-\d{2})\/withdraw$/.exec(url.pathname);
      if (request.method === "POST" && apprenticeWithdrawMatch) {
        const weekStart = validateApprenticeWeek(apprenticeWithdrawMatch[1]);
        const report = await withReadySession(
          pool,
          tokenHash,
          (client, context) => withdrawApprenticeReport(client, context, weekStart)
        );
        return json(response, 200, { report });
      }

      const apprenticePdfMatch =
        /^\/api\/v1\/apprentice\/reports\/(\d{4}-\d{2}-\d{2})\/pdf$/.exec(url.pathname);
      if (request.method === "GET" && apprenticePdfMatch) {
        const weekStart = validateApprenticeWeek(apprenticePdfMatch[1]);
        const apprenticeUserId = url.searchParams.get("apprenticeUserId");
        if (apprenticeUserId && !UUID_PATTERN.test(apprenticeUserId)) {
          throw new InputError("Die Kennung des Auszubildenden ist ungültig.");
        }
        const datei = await withReadySession(
          pool,
          tokenHash,
          (client, context) => buildApprenticePdf(
            client, context, weekStart, apprenticeUserId, config.staticDirectory,
            url.searchParams.get("preview") === "true"
          )
        );
        return binaryAttachment(response, { ...datei, mimeType: "application/pdf" });
      }

      if (request.method === "GET" && url.pathname === "/api/v1/admin/apprentice-reports") {
        const body = await withReadySession(pool, tokenHash, getApprenticeReviews);
        return json(response, 200, body);
      }

      if (request.method === "POST" && url.pathname === "/api/v1/admin/apprentice-reports/review") {
        const input = validateApprenticeReview(await readJson(request));
        const reports = await withReadySession(
          pool,
          tokenHash,
          (client, context) => decideApprenticeReports(client, context, input)
        );
        return json(response, 200, { reports });
      }

      if (request.method === "GET" && url.pathname === "/api/v1/absences") {
        const range = timesheetExportRange(url);
        const absences = await withReadySession(
          pool,
          tokenHash,
          (client, context) => listOwnAbsenceRequests(client, context, range)
        );
        return json(response, 200, { absences });
      }

      if (request.method === "POST" && url.pathname === "/api/v1/absences") {
        const input = validateAbsenceRequest(await readJson(request));
        const absence = await withReadySession(
          pool,
          tokenHash,
          (client, context) => createAbsenceRequest(client, context, input)
        );
        return json(response, 201, { absence });
      }

      const vdeAccessDate = () => validateWorkDate(
        url.searchParams.get("date")
        || localDate(new Date().toISOString(), config.timeZone)
      );

      if (request.method === "GET" && url.pathname === "/api/v1/vde/context") {
        const constructionSiteId = validateId(
          url.searchParams.get("constructionSiteId"),
          "Baustellen-ID"
        );
        const vdeContext = await withReadySession(
          pool,
          tokenHash,
          (client, context) => getVdeSiteContext(
            client,
            context,
            constructionSiteId,
            vdeAccessDate()
          )
        );
        return json(response, 200, {
          context: publicVdeSiteContext(vdeContext)
        });
      }

      if (
        request.method === "POST"
        && url.pathname === "/api/v1/vde/inspections"
      ) {
        const input = validateVdeInspectionCreate(
          await readJson(request, 650_000)
        );
        const result = await withReadySession(
          pool,
          tokenHash,
          (client, context) => createVdeInspection(
            client,
            context,
            input,
            vdeAccessDate()
          )
        );
        return json(
          response,
          result.idempotent ? 200 : 201,
          result
        );
      }

      if (
        request.method === "POST"
        && url.pathname === "/api/v1/vde/imports"
      ) {
        const input = validateVdeInspectionImport(
          await readJson(request, 7_500_000)
        );
        const result = await withReadySession(
          pool,
          tokenHash,
          (client, context) => createVdeInspection(
            client,
            context,
            input,
            vdeAccessDate(),
            input.originalPdf
          )
        );
        return json(
          response,
          result.idempotent ? 200 : 201,
          result
        );
      }

      const vdeCompleteMatch =
        /^\/api\/v1\/vde\/inspections\/([^/]+)\/complete$/.exec(
          url.pathname
        );
      if (request.method === "POST" && vdeCompleteMatch) {
        const inspectionId = validateId(
          vdeCompleteMatch[1],
          "VDE-Prüfungs-ID"
        );
        const input = validateVdeInspectionCompletion(
          await readJson(request, 1_200_000)
        );
        const inspection = await withReadySession(
          pool,
          tokenHash,
          (client, context) => completeVdeInspection(
            client,
            context,
            inspectionId,
            input,
            vdeAccessDate(),
            config.staticDirectory
          )
        );
        return json(response, 200, { inspection });
      }

      const vdePdfMatch =
        /^\/api\/v1\/vde\/inspections\/([^/]+)\/pdf$/.exec(url.pathname);
      if (request.method === "GET" && vdePdfMatch) {
        const inspectionId = validateId(
          vdePdfMatch[1],
          "VDE-Prüfungs-ID"
        );
        const document = await withReadySession(
          pool,
          tokenHash,
          (client, context) => getVdeInspectionPdf(
            client,
            context,
            inspectionId,
            vdeAccessDate()
          )
        );
        return attachment(response, document);
      }

      const vdeInspectionMatch =
        /^\/api\/v1\/vde\/inspections\/([^/]+)$/.exec(url.pathname);
      if (request.method === "GET" && vdeInspectionMatch) {
        const inspectionId = validateId(
          vdeInspectionMatch[1],
          "VDE-Prüfungs-ID"
        );
        const inspection = await withReadySession(
          pool,
          tokenHash,
          async (client, context) => {
            const row = await getVdeInspectionRecord(
              client,
              context,
              inspectionId
            );
            await vdeSiteAccess(
              client,
              context,
              row.construction_site_id,
              vdeAccessDate()
            );
            return vdeInspectionDto(row, true);
          }
        );
        return json(response, 200, { inspection });
      }
      if (request.method === "PATCH" && vdeInspectionMatch) {
        const inspectionId = validateId(
          vdeInspectionMatch[1],
          "VDE-Prüfungs-ID"
        );
        const input = validateVdeInspectionUpdate(
          await readJson(request, 650_000)
        );
        const inspection = await withReadySession(
          pool,
          tokenHash,
          (client, context) => updateVdeInspection(
            client,
            context,
            inspectionId,
            input,
            vdeAccessDate()
          )
        );
        return json(response, 200, { inspection });
      }

      const ownAbsenceCancelMatch = /^\/api\/v1\/absences\/([^/]+)\/cancel$/.exec(url.pathname);
      if (request.method === "PATCH" && ownAbsenceCancelMatch) {
        const absenceId = validateId(ownAbsenceCancelMatch[1], "Abwesenheits-ID");
        const input = validateAbsenceDecision(await readJson(request));
        const absence = await withReadySession(
          pool,
          tokenHash,
          (client, context) => cancelOwnAbsenceRequest(client, context, absenceId, input)
        );
        return json(response, 200, { absence });
      }

      const siteWorkspaceMatch = /^\/api\/v1\/construction-sites\/([^/]+)\/dashboard$/.exec(url.pathname);
      if (request.method === "GET" && siteWorkspaceMatch) {
        const constructionSiteId = validateId(siteWorkspaceMatch[1], "Baustellen-ID");
        const date = validateWorkDate(
          url.searchParams.get("date") || localDate(new Date().toISOString(), config.timeZone)
        );
        const dashboard = await withReadySession(
          pool,
          tokenHash,
          (client, context) => getSiteWorkspace(client, context, constructionSiteId, date)
        );
        return json(response, 200, { dashboard });
      }

      const mobileSiteTaskMatch =
        /^\/api\/v1\/construction-sites\/([^/]+)\/tasks\/([^/]+)$/.exec(url.pathname);
      if (request.method === "PATCH" && mobileSiteTaskMatch) {
        const constructionSiteId = validateId(mobileSiteTaskMatch[1], "Baustellen-ID");
        const taskId = validateId(mobileSiteTaskMatch[2], "Aufgaben-ID");
        const date = validateWorkDate(
          url.searchParams.get("date") || localDate(new Date().toISOString(), config.timeZone)
        );
        const input = validateSiteTaskUpdate(await readJson(request));
        const siteTask = await withReadySession(
          pool,
          tokenHash,
          (client, context) => updateMobileSiteTask(
            client,
            context,
            constructionSiteId,
            taskId,
            date,
            input
          )
        );
        return json(response, 200, { siteTask });
      }

      const siteNoteMatch = /^\/api\/v1\/construction-sites\/([^/]+)\/notes$/.exec(url.pathname);
      if (request.method === "POST" && siteNoteMatch) {
        const constructionSiteId = validateId(siteNoteMatch[1], "Baustellen-ID");
        const date = validateWorkDate(
          url.searchParams.get("date") || localDate(new Date().toISOString(), config.timeZone)
        );
        const input = validateSiteNote({
          ...await readJson(request),
          constructionSiteId
        });
        const result = await withReadySession(
          pool,
          tokenHash,
          (client, context) => createMobileSiteNote(client, context, input, date)
        );
        return json(response, result.idempotent ? 200 : 201, { siteNote: result.siteNote });
      }

      // Material von der Baustelle aus - derselbe Zugang wie bei Notizen und
      // Fotos: wer an diesem Tag dort eingeteilt ist.
      const siteMaterialWorkspaceMatch =
        /^\/api\/v1\/construction-sites\/([^/]+)\/materials$/.exec(url.pathname);
      if (request.method === "POST" && siteMaterialWorkspaceMatch) {
        const constructionSiteId = validateId(siteMaterialWorkspaceMatch[1], "Baustellen-ID");
        const date = validateWorkDate(
          url.searchParams.get("date") || localDate(new Date().toISOString(), config.timeZone)
        );
        const input = validateSiteMaterial({
          ...await readJson(request),
          constructionSiteId
        });
        const siteMaterial = await withReadySession(
          pool,
          tokenHash,
          (client, context) => createMobileSiteMaterial(client, context, input, date)
        );
        return json(response, 201, { siteMaterial });
      }

      const siteMaterialWorkspaceItemMatch =
        /^\/api\/v1\/construction-sites\/([^/]+)\/materials\/([^/]+)$/.exec(url.pathname);
      if (request.method === "PATCH" && siteMaterialWorkspaceItemMatch) {
        const constructionSiteId = validateId(siteMaterialWorkspaceItemMatch[1], "Baustellen-ID");
        const materialId = validateId(siteMaterialWorkspaceItemMatch[2], "Material-ID");
        const date = validateWorkDate(
          url.searchParams.get("date") || localDate(new Date().toISOString(), config.timeZone)
        );
        const input = validateSiteMaterialUpdate(await readJson(request));
        const siteMaterial = await withReadySession(
          pool,
          tokenHash,
          (client, context) => updateMobileSiteMaterial(
            client, context, constructionSiteId, materialId, date, input
          )
        );
        return json(response, 200, { siteMaterial });
      }

      const sitePhotoMatch = /^\/api\/v1\/construction-sites\/([^/]+)\/photos$/.exec(url.pathname);
      if (request.method === "POST" && sitePhotoMatch) {
        const constructionSiteId = validateId(sitePhotoMatch[1], "Baustellen-ID");
        const date = validateWorkDate(
          url.searchParams.get("date") || localDate(new Date().toISOString(), config.timeZone)
        );
        const body = await readJson(request, 7_000_000);
        const input = validateDocumentUpload({
          ...body,
          category: "photo",
          customerId: null,
          projectId: null,
          constructionSiteId
        });
        const created = await withReadySession(
          pool,
          tokenHash,
          (client, context) => createSitePhoto(client, context, constructionSiteId, date, input)
        );
        return json(response, 201, created);
      }

      const siteDocumentContentMatch =
        /^\/api\/v1\/construction-sites\/([^/]+)\/documents\/([^/]+)\/content$/.exec(url.pathname);
      if (request.method === "GET" && siteDocumentContentMatch) {
        const constructionSiteId = validateId(siteDocumentContentMatch[1], "Baustellen-ID");
        const documentId = validateId(siteDocumentContentMatch[2], "Dokument-ID");
        const date = validateWorkDate(
          url.searchParams.get("date") || localDate(new Date().toISOString(), config.timeZone)
        );
        const document = await withReadySession(
          pool,
          tokenHash,
          (client, context) => getSiteDocumentContent(
            client,
            context,
            constructionSiteId,
            documentId,
            date
          )
        );
        return attachment(response, document);
      }

      if (request.method === "GET" && url.pathname === "/api/v1/admin/overview") {
        const date = validateWorkDate(url.searchParams.get("date") || localDate(new Date().toISOString(), config.timeZone));
        const overview = await withReadySession(
          pool,
          tokenHash,
          (client, context) => adminOverview(client, context, date)
        );
        return json(response, 200, { overview });
      }

      // Fuhrpark. Lesen darf die Planung, aendern nur die volle Planung -
      // dieselbe Trennung wie bei den Mitarbeitern.
      if (request.method === "GET" && url.pathname === "/api/v1/admin/vehicles") {
        const vehicles = await withReadySession(
          pool,
          tokenHash,
          (client, context) => listVehicles(client, context)
        );
        return json(response, 200, { vehicles });
      }

      if (request.method === "POST" && url.pathname === "/api/v1/admin/vehicles") {
        const input = validateVehicle(await readJson(request));
        const vehicle = await withReadySession(
          pool,
          tokenHash,
          (client, context) => createVehicle(client, context, input)
        );
        return json(response, 201, { vehicle });
      }

      const vehicleMatch = /^\/api\/v1\/admin\/vehicles\/([^/]+)$/.exec(url.pathname);
      if (request.method === "PATCH" && vehicleMatch) {
        const vehicleId = validateId(vehicleMatch[1], "Fahrzeug-ID");
        const input = validateVehicleUpdate(await readJson(request));
        const vehicle = await withReadySession(
          pool,
          tokenHash,
          (client, context) => updateVehicle(client, context, vehicleId, input)
        );
        return json(response, 200, { vehicle });
      }

      if (request.method === "GET" && url.pathname === "/api/v1/admin/holiday-calendar") {
        const asOfDate = localDate(new Date().toISOString(), config.timeZone);
        const year = validateTimeAccountYear(
          url.searchParams.get("year") || asOfDate.slice(0, 4)
        );
        const holidayCalendar = await withReadySession(
          pool,
          tokenHash,
          async (client, context) => {
            await requireFullPlanner(client, context);
            return getHolidayCalendar(client, context, year, true);
          }
        );
        return json(response, 200, { holidayCalendar });
      }

      if (request.method === "GET" && url.pathname === "/api/v1/admin/time-correction-policy") {
        const timeCorrectionPolicy = await withReadySession(
          pool,
          tokenHash,
          (client, context) => getTimeCorrectionPolicy(client, context)
        );
        return json(response, 200, { timeCorrectionPolicy });
      }

      if (request.method === "PATCH" && url.pathname === "/api/v1/admin/time-correction-policy") {
        const input = validateTimeCorrectionPolicy(await readJson(request));
        const timeCorrectionPolicy = await withReadySession(
          pool,
          tokenHash,
          (client, context) => updateTimeCorrectionPolicy(client, context, input)
        );
        return json(response, 200, { timeCorrectionPolicy });
      }

      if (request.method === "PATCH" && url.pathname === "/api/v1/admin/holiday-calendar") {
        const input = validateHolidayCalendar(await readJson(request));
        const holidayCalendar = await withReadySession(
          pool,
          tokenHash,
          (client, context) => updateHolidayCalendar(client, context, input)
        );
        return json(response, 200, { holidayCalendar });
      }

      if (
        request.method === "POST"
        && url.pathname === "/api/v1/admin/holiday-calendar/closures"
      ) {
        const input = validateHolidayClosure(await readJson(request));
        const result = await withReadySession(
          pool,
          tokenHash,
          (client, context) => createHolidayClosure(client, context, input)
        );
        return json(response, result.idempotent ? 200 : 201, result);
      }

      const holidayClosureCancelMatch =
        /^\/api\/v1\/admin\/holiday-calendar\/closures\/([^/]+)\/cancel$/.exec(
          url.pathname
        );
      if (request.method === "PATCH" && holidayClosureCancelMatch) {
        const closureId = validateId(
          holidayClosureCancelMatch[1],
          "Betrieblicher-freier-Tag-ID"
        );
        const input = validateHolidayClosureCancellation(await readJson(request));
        const closure = await withReadySession(
          pool,
          tokenHash,
          (client, context) => cancelHolidayClosure(
            client,
            context,
            closureId,
            input
          )
        );
        return json(response, 200, { closure });
      }

      if (request.method === "GET" && url.pathname === "/api/v1/admin/time-accounts") {
        const asOfDate = localDate(new Date().toISOString(), config.timeZone);
        const year = validateTimeAccountYear(
          url.searchParams.get("year") || asOfDate.slice(0, 4)
        );
        const timeAccounts = await withReadySession(
          pool,
          tokenHash,
          (client, context) => getAdminTimeAccounts(
            client,
            context,
            year,
            asOfDate
          )
        );
        return json(response, 200, { timeAccounts });
      }

      const adminTimeAccountProfileMatch =
        /^\/api\/v1\/admin\/time-accounts\/([^/]+)\/profile$/.exec(url.pathname);
      if (request.method === "PATCH" && adminTimeAccountProfileMatch) {
        const employeeId = validateId(
          adminTimeAccountProfileMatch[1],
          "Mitarbeiter-ID"
        );
        const input = validateTimeAccountProfile(await readJson(request));
        const profile = await withReadySession(
          pool,
          tokenHash,
          (client, context) => updateTimeAccountProfile(
            client,
            context,
            employeeId,
            input
          )
        );
        return json(response, 200, { profile });
      }

      if (
        request.method === "POST"
        && url.pathname === "/api/v1/admin/time-account-adjustments"
      ) {
        const input = validateTimeAccountAdjustment(await readJson(request));
        const asOfDate = localDate(new Date().toISOString(), config.timeZone);
        const result = await withReadySession(
          pool,
          tokenHash,
          (client, context) => createTimeAccountAdjustment(
            client,
            context,
            input,
            asOfDate
          )
        );
        return json(
          response,
          result.idempotent ? 200 : 201,
          { adjustment: result.adjustment, idempotent: result.idempotent }
        );
      }

      const adminAbsenceMatch = /^\/api\/v1\/admin\/absence-requests\/([^/]+)$/.exec(url.pathname);
      if (request.method === "PATCH" && adminAbsenceMatch) {
        const absenceId = validateId(adminAbsenceMatch[1], "Abwesenheits-ID");
        const input = validateAbsenceDecision(await readJson(request));
        const absence = await withReadySession(
          pool,
          tokenHash,
          (client, context) => reviewAbsenceRequest(client, context, absenceId, input)
        );
        return json(response, 200, { absence });
      }

      if (request.method === "POST" && url.pathname === "/api/v1/admin/site-notes") {
        const input = validateSiteNote(await readJson(request));
        const result = await withReadySession(
          pool,
          tokenHash,
          (client, context) => createAdminSiteNote(client, context, input)
        );
        return json(response, result.idempotent ? 200 : 201, { siteNote: result.siteNote });
      }

      if (request.method === "POST" && url.pathname === "/api/v1/admin/site-tasks") {
        const input = validateSiteTask(await readJson(request));
        const siteTask = await withReadySession(pool, tokenHash, (client, context) => createSiteTask(client, context, input));
        return json(response, 201, { siteTask });
      }

      const siteTaskMatch = /^\/api\/v1\/admin\/site-tasks\/([^/]+)$/.exec(url.pathname);
      if (request.method === "PATCH" && siteTaskMatch) {
        const taskId = validateId(siteTaskMatch[1], "Aufgaben-ID");
        const input = validateSiteTaskUpdate(await readJson(request));
        const siteTask = await withReadySession(pool, tokenHash, (client, context) => updateSiteTask(client, context, taskId, input));
        return json(response, 200, { siteTask });
      }

      if (request.method === "POST" && url.pathname === "/api/v1/admin/site-materials") {
        const input = validateSiteMaterial(await readJson(request));
        const siteMaterial = await withReadySession(pool, tokenHash, (client, context) => createSiteMaterial(client, context, input));
        return json(response, 201, { siteMaterial });
      }

      const siteMaterialMatch = /^\/api\/v1\/admin\/site-materials\/([^/]+)$/.exec(url.pathname);
      if (request.method === "PATCH" && siteMaterialMatch) {
        const materialId = validateId(siteMaterialMatch[1], "Material-ID");
        const input = validateSiteMaterialUpdate(await readJson(request));
        const siteMaterial = await withReadySession(pool, tokenHash, (client, context) => updateSiteMaterial(client, context, materialId, input));
        return json(response, 200, { siteMaterial });
      }

      if (request.method === "POST" && url.pathname === "/api/v1/admin/site-reports") {
        const input = validateSiteReport(await readJson(request));
        const siteReport = await withReadySession(pool, tokenHash, (client, context) => createSiteReport(client, context, input));
        return json(response, 201, { siteReport });
      }

      const siteReportPreviewMatch =
        /^\/api\/v1\/admin\/site-reports\/([^/]+)\/preview$/.exec(url.pathname);
      if (request.method === "GET" && siteReportPreviewMatch) {
        const reportId = validateId(siteReportPreviewMatch[1], "Berichts-ID");
        const document = await withReadySession(
          pool,
          tokenHash,
          (client, context) => previewSiteReport(
            client,
            context,
            reportId,
            config.staticDirectory
          )
        );
        return attachment(response, document);
      }

      const siteReportReturnMatch =
        /^\/api\/v1\/admin\/site-reports\/([^/]+)\/return$/.exec(url.pathname);
      if (request.method === "POST" && siteReportReturnMatch) {
        const reportId = validateId(siteReportReturnMatch[1], "Berichts-ID");
        const input = validateSiteReportReturn(await readJson(request));
        const siteReport = await withReadySession(
          pool,
          tokenHash,
          (client, context) => returnSiteReport(client, context, reportId, input)
        );
        return json(response, 200, { siteReport });
      }

      const siteReportFinalizeMatch = /^\/api\/v1\/admin\/site-reports\/([^/]+)\/finalize$/.exec(url.pathname);
      if (request.method === "POST" && siteReportFinalizeMatch) {
        const reportId = validateId(siteReportFinalizeMatch[1], "Berichts-ID");
        const input = validateSiteReportFinalization(await readJson(request, 1_400_000));
        const siteReport = await withReadySession(
          pool,
          tokenHash,
          (client, context) => finalizeSiteReport(client, context, reportId, input, config.staticDirectory)
        );
        return json(response, 200, { siteReport });
      }

      if (request.method === "POST" && url.pathname === "/api/v1/admin/documents") {
        const input = validateDocumentUpload(await readJson(request, 7_000_000));
        const created = await withReadySession(
          pool,
          tokenHash,
          (client, context) => createDocument(client, context, input)
        );
        return json(response, 201, created);
      }

      const adminDocumentContentMatch = /^\/api\/v1\/admin\/documents\/([^/]+)\/content$/.exec(url.pathname);
      if (request.method === "GET" && adminDocumentContentMatch) {
        const documentId = validateId(adminDocumentContentMatch[1], "Dokument-ID");
        const document = await withReadySession(
          pool,
          tokenHash,
          (client, context) => getDocumentContent(client, context, documentId)
        );
        return attachment(response, document);
      }

      const adminDocumentMatch = /^\/api\/v1\/admin\/documents\/([^/]+)$/.exec(url.pathname);
      if (request.method === "PATCH" && adminDocumentMatch) {
        const documentId = validateId(adminDocumentMatch[1], "Dokument-ID");
        const input = validateDocumentStatusUpdate(await readJson(request));
        const document = await withReadySession(
          pool,
          tokenHash,
          (client, context) => updateDocumentStatus(client, context, documentId, input)
        );
        return json(response, 200, { document });
      }

      if (request.method === "POST" && url.pathname === "/api/v1/admin/assignment-imports/preview") {
        await withReadySession(pool, tokenHash, requirePlanner);
        const { workbook, mappings } = validateAssignmentImportPayload(await readJson(request, 2_100_000));
        const plan = await parseAssignmentWorkbook(workbook);
        const preview = await withReadySession(
          pool,
          tokenHash,
          (client, context) => prepareAssignmentImport(client, context, plan, mappings)
        );
        return json(response, 200, { importPreview: publicAssignmentImportPreview(preview) });
      }

      if (request.method === "POST" && url.pathname === "/api/v1/admin/assignment-imports") {
        await withReadySession(pool, tokenHash, requirePlanner);
        const { fileName, workbook, mappings } = validateAssignmentImportPayload(await readJson(request, 2_100_000));
        const plan = await parseAssignmentWorkbook(workbook);
        const result = await withReadySession(
          pool,
          tokenHash,
          (client, context) => importAssignmentsFromWorkbook(client, context, plan, fileName, mappings)
        );
        return json(response, 201, { import: result });
      }

      if (request.method === "POST" && url.pathname === "/api/v1/admin/site-imports/preview") {
        await withReadySession(pool, tokenHash, requirePlanner);
        const { workbook } = validateAssignmentImportPayload(await readJson(request, 2_100_000));
        const plan = await parseSiteWorkbook(workbook);
        const preview = await withReadySession(
          pool,
          tokenHash,
          (client, context) => prepareSiteImport(client, context, plan)
        );
        return json(response, 200, { importPreview: publicSiteImportPreview(preview) });
      }

      if (request.method === "POST" && url.pathname === "/api/v1/admin/site-imports") {
        await withReadySession(pool, tokenHash, requirePlanner);
        const { workbook } = validateAssignmentImportPayload(await readJson(request, 2_100_000));
        const plan = await parseSiteWorkbook(workbook);
        const result = await withReadySession(
          pool,
          tokenHash,
          (client, context) => importSitesFromWorkbook(client, context, plan)
        );
        return json(response, 201, { import: result });
      }

      if (request.method === "POST" && url.pathname === "/api/v1/admin/employees") {
        const input = validateEmployee(await readJson(request));
        const employee = await withReadySession(
          pool,
          tokenHash,
          (client, context) => createEmployee(client, context, input)
        );
        return json(response, 201, { employee });
      }

      const adminEmployeeMatch = /^\/api\/v1\/admin\/employees\/([^/]+)$/.exec(url.pathname);
      if (request.method === "PATCH" && adminEmployeeMatch) {
        const employeeId = validateId(adminEmployeeMatch[1], "Mitarbeiter-ID");
        const input = validateEmployeeUpdate(await readJson(request));
        const employee = await withReadySession(
          pool,
          tokenHash,
          (client, context) => updateEmployee(client, context, employeeId, input)
        );
        return json(response, 200, { employee });
      }

      if (request.method === "DELETE" && adminEmployeeMatch) {
        const employeeId = validateId(adminEmployeeMatch[1], "Mitarbeiter-ID");
        const input = employeeLifecycleInput(await readJson(request));
        const result = await withReadySession(
          pool,
          tokenHash,
          (client, context) => removeEmployee(client, context, employeeId, input)
        );
        return json(response, 200, result);
      }

      const adminEmployeeReactivateMatch =
        /^\/api\/v1\/admin\/employees\/([^/]+)\/reactivate$/.exec(url.pathname);
      if (request.method === "POST" && adminEmployeeReactivateMatch) {
        const employeeId = validateId(adminEmployeeReactivateMatch[1], "Mitarbeiter-ID");
        const input = employeeLifecycleInput(await readJson(request));
        const employee = await withReadySession(
          pool,
          tokenHash,
          (client, context) => reactivateEmployee(client, context, employeeId, input)
        );
        return json(response, 200, { employee });
      }

      if (request.method === "POST" && url.pathname === "/api/v1/admin/customers") {
        const input = validateCustomer(await readJson(request));
        const customer = await withReadySession(
          pool,
          tokenHash,
          (client, context) => createCustomer(client, context, input)
        );
        return json(response, 201, { customer });
      }

      const adminCustomerMatch = /^\/api\/v1\/admin\/customers\/([^/]+)$/.exec(url.pathname);
      if (request.method === "PATCH" && adminCustomerMatch) {
        const customerId = validateId(adminCustomerMatch[1], "Kunden-ID");
        const input = validateCustomerUpdate(await readJson(request));
        const customer = await withReadySession(
          pool,
          tokenHash,
          (client, context) => updateCustomer(client, context, customerId, input)
        );
        return json(response, 200, { customer });
      }

      if (request.method === "POST" && url.pathname === "/api/v1/admin/projects") {
        const input = validateProject(await readJson(request));
        const project = await withReadySession(
          pool,
          tokenHash,
          (client, context) => createProject(client, context, input)
        );
        return json(response, 201, { project });
      }

      const adminProjectMatch = /^\/api\/v1\/admin\/projects\/([^/]+)$/.exec(url.pathname);
      if (request.method === "PATCH" && adminProjectMatch) {
        const projectId = validateId(adminProjectMatch[1], "Projekt-ID");
        const input = validateProjectUpdate(await readJson(request));
        const project = await withReadySession(
          pool,
          tokenHash,
          (client, context) => updateProject(client, context, projectId, input)
        );
        return json(response, 200, { project });
      }

      if (request.method === "POST" && url.pathname === "/api/v1/admin/construction-sites") {
        const input = validateConstructionSite(await readJson(request));
        const site = await withReadySession(
          pool,
          tokenHash,
          (client, context) => createConstructionSite(client, context, input)
        );
        return json(response, 201, { site });
      }

      const adminSiteQrMatch =
        /^\/api\/v1\/admin\/construction-sites\/([^/]+)\/qr$/.exec(url.pathname);
      if (request.method === "GET" && adminSiteQrMatch) {
        const siteId = validateId(adminSiteQrMatch[1], "Baustellen-ID");
        const document = await withReadySession(
          pool,
          tokenHash,
          (client, context) => buildConstructionSiteQrCode(
            client,
            context,
            siteId,
            config.allowedOrigin
          )
        );
        return inlineDocument(response, document);
      }

      const adminSiteMatch = /^\/api\/v1\/admin\/construction-sites\/([^/]+)$/.exec(url.pathname);
      if (request.method === "PATCH" && adminSiteMatch) {
        const siteId = validateId(adminSiteMatch[1], "Baustellen-ID");
        const input = validateConstructionSiteUpdate(await readJson(request));
        const site = await withReadySession(
          pool,
          tokenHash,
          (client, context) => updateConstructionSite(client, context, siteId, input)
        );
        return json(response, 200, { site });
      }

      const adminFieldSiteConfirmMatch =
        /^\/api\/v1\/admin\/construction-sites\/([^/]+)\/confirm$/.exec(url.pathname);
      if (request.method === "POST" && adminFieldSiteConfirmMatch) {
        const siteId = validateId(adminFieldSiteConfirmMatch[1], "Baustellen-ID");
        const site = await withReadySession(
          pool,
          tokenHash,
          (client, context) => confirmFieldConstructionSite(client, context, siteId)
        );
        return json(response, 200, { site });
      }

      if (request.method === "POST" && url.pathname === "/api/v1/admin/sites") {
        const input = validateSiteBundle(await readJson(request));
        const site = await withReadySession(
          pool,
          tokenHash,
          (client, context) => createSiteBundle(client, context, input)
        );
        return json(response, 201, { site });
      }

      if (request.method === "POST" && url.pathname === "/api/v1/admin/planning-teams") {
        const input = validatePlanningTeam(await readJson(request));
        const planningTeam = await withReadySession(
          pool,
          tokenHash,
          (client, context) => createPlanningTeam(client, context, input)
        );
        return json(response, 201, { planningTeam });
      }

      const adminPlanningTeamMatch =
        /^\/api\/v1\/admin\/planning-teams\/([^/]+)$/.exec(url.pathname);
      if (request.method === "PATCH" && adminPlanningTeamMatch) {
        const planningTeamId = validateId(
          adminPlanningTeamMatch[1],
          "Teamvorlagen-ID"
        );
        const input = validatePlanningTeamUpdate(await readJson(request));
        const planningTeam = await withReadySession(
          pool,
          tokenHash,
          (client, context) => updatePlanningTeam(
            client,
            context,
            planningTeamId,
            input
          )
        );
        return json(response, 200, { planningTeam });
      }

      if (
        request.method === "POST"
        && url.pathname === "/api/v1/admin/assignment-batches"
      ) {
        const input = validateAssignmentBatch(await readJson(request));
        const assignments = await withReadySession(
          pool,
          tokenHash,
          (client, context) => createAssignmentBatch(client, context, input)
        );
        return json(response, 201, { assignments });
      }

      if (request.method === "POST" && url.pathname === "/api/v1/admin/assignments") {
        const input = validateAssignment(await readJson(request));
        const assignment = await withReadySession(
          pool,
          tokenHash,
          (client, context) => createAssignment(client, context, input)
        );
        return json(response, 201, { assignment });
      }

      const adminAssignmentCancelMatch = /^\/api\/v1\/admin\/assignments\/([^/]+)\/cancel$/.exec(url.pathname);
      if (request.method === "POST" && adminAssignmentCancelMatch) {
        const assignmentId = validateId(adminAssignmentCancelMatch[1], "Einsatz-ID");
        const input = validateAssignmentCancellation(await readJson(request));
        const assignment = await withReadySession(
          pool,
          tokenHash,
          (client, context) => cancelAssignment(client, context, assignmentId, input.changeReason)
        );
        return json(response, 200, { assignment });
      }

      const adminAssignmentMatch = /^\/api\/v1\/admin\/assignments\/([^/]+)$/.exec(url.pathname);
      if (request.method === "PATCH" && adminAssignmentMatch) {
        const assignmentId = validateId(adminAssignmentMatch[1], "Einsatz-ID");
        const input = validateAssignmentUpdate(await readJson(request));
        const assignment = await withReadySession(
          pool,
          tokenHash,
          (client, context) => updateAssignment(client, context, assignmentId, input)
        );
        return json(response, 200, { assignment });
      }

      const adminTimeCorrectionMatch =
        /^\/api\/v1\/admin\/time-entry-corrections\/([^/]+)$/.exec(url.pathname);
      if (request.method === "PATCH" && adminTimeCorrectionMatch) {
        const correctionId = validateId(adminTimeCorrectionMatch[1], "Korrektur-ID");
        const input = validateTimeEntryCorrectionDecision(await readJson(request));
        const correction = await withReadySession(
          pool,
          tokenHash,
          (client, context) => reviewTimeEntryCorrection(client, context, correctionId, input)
        );
        return json(response, 200, { timeCorrection: correction });
      }

      const adminTimeEntryEditMatch =
        /^\/api\/v1\/admin\/time-entries\/([^/]+)$/.exec(url.pathname);
      if (request.method === "PATCH" && adminTimeEntryEditMatch) {
        const entryId = validateId(adminTimeEntryEditMatch[1], "Zeitbuchungs-ID");
        const input = validateTimeEntryEdit(await readJson(request));
        const result = await withReadySession(
          pool,
          tokenHash,
          (client, context) => editTimeEntry(
            client,
            context,
            entryId,
            input,
            config.timeZone,
            true
          )
        );
        return json(response, 200, result);
      }
      if (request.method === "DELETE" && adminTimeEntryEditMatch) {
        const entryId = validateId(adminTimeEntryEditMatch[1], "Zeitbuchungs-ID");
        const input = validateTimeEntryDelete(await readJson(request));
        const result = await withReadySession(
          pool,
          tokenHash,
          (client, context) => deleteTimeEntry(client, context, entryId, input, config.timeZone, true)
        );
        return json(response, 200, result);
      }

      const adminTimeOperationMatch =
        /^\/api\/v1\/admin\/time-change-operations\/([^/]+)$/.exec(url.pathname);
      if (request.method === "PATCH" && adminTimeOperationMatch) {
        const operationId = validateId(adminTimeOperationMatch[1], "Zeitänderungs-ID");
        const input = validateTimeEntryCorrectionDecision(await readJson(request));
        const operation = await withReadySession(
          pool,
          tokenHash,
          (client, context) => reviewTimeChangeOperation(client, context, operationId, input)
        );
        return json(response, 200, { operation });
      }

      const adminWorkDayMatch = /^\/api\/v1\/admin\/work-days\/([^/]+)$/.exec(url.pathname);
      if (request.method === "GET" && adminWorkDayMatch) {
        const workDayId = validateId(adminWorkDayMatch[1], "Stundenzettel-ID");
        const workDay = await withReadySession(
          pool,
          tokenHash,
          (client, context) => getAdminWorkDayEntries(client, context, workDayId)
        );
        return json(response, 200, { workDay });
      }
      if (request.method === "PATCH" && adminWorkDayMatch) {
        const workDayId = validateId(adminWorkDayMatch[1], "Stundenzettel-ID");
        const input = validateWorkDayDecision(await readJson(request));
        const workDay = await withReadySession(
          pool,
          tokenHash,
          (client, context) => reviewWorkDay(client, context, workDayId, input)
        );
        return json(response, 200, { workDay });
      }

      if (request.method === "GET" && url.pathname === "/api/v1/admin/timesheets.xlsx") {
        const parameters = timesheetExportParameters(url);
        const document = await withReadySession(
          pool,
          tokenHash,
          (client, context) => exportTimesheets(client, context, parameters, config.timeZone)
        );
        return binaryAttachment(response, document);
      }

      if (request.method === "GET" && url.pathname === "/api/v1/admin/timesheets.pdf") {
        const parameters = timesheetExportParameters(url);
        const document = await withReadySession(
          pool,
          tokenHash,
          (client, context) => exportTimesheets(
            client,
            context,
            parameters,
            config.timeZone,
            { format: "pdf" }
          )
        );
        return binaryAttachment(response, document);
      }

      if (request.method === "GET" && url.pathname === "/api/v1/timesheets.xlsx") {
        const parameters = employeeTimesheetExportParameters(url);
        const document = await withReadySession(
          pool,
          tokenHash,
          (client, context) => exportTimesheets(
            client,
            context,
            parameters,
            config.timeZone,
            { ownApprovedOnly: true }
          )
        );
        return binaryAttachment(response, document);
      }

      if (request.method === "GET" && url.pathname === "/api/v1/timesheets.pdf") {
        const parameters = employeeTimesheetExportParameters(url);
        const document = await withReadySession(
          pool,
          tokenHash,
          (client, context) => exportTimesheets(
            client,
            context,
            parameters,
            config.timeZone,
            { ownApprovedOnly: true, format: "pdf" }
          )
        );
        return binaryAttachment(response, document);
      }

      const workDayMatch = /^\/api\/v1\/work-days\/(\d{4}-\d{2}-\d{2})$/.exec(url.pathname);
      if (request.method === "GET" && workDayMatch) {
        const date = validateWorkDate(workDayMatch[1]);
        const day = await withReadySession(pool, tokenHash, (client, context) => getWorkDay(client, context, date));
        return json(response, 200, { workDay: day });
      }

      const workWeekMatch = /^\/api\/v1\/work-weeks\/(\d{4}-\d{2}-\d{2})$/.exec(url.pathname);
      if (request.method === "GET" && workWeekMatch) {
        const weekStart = validateWorkDate(workWeekMatch[1]);
        const week = await withReadySession(
          pool,
          tokenHash,
          (client, context) => getWorkWeek(client, context, weekStart)
        );
        return json(response, 200, { week });
      }

      const assignmentMatch = /^\/api\/v1\/site-assignments\/(\d{4}-\d{2}-\d{2})$/.exec(url.pathname);
      if (request.method === "GET" && assignmentMatch) {
        const date = validateWorkDate(assignmentMatch[1]);
        const assignments = await withReadySession(
          pool,
          tokenHash,
          (client, context) => getAssignments(client, context, date)
        );
        return json(response, 200, { assignments });
      }

      const timeTrackingSiteOptionsMatch =
        /^\/api\/v1\/time-tracking\/site-options\/(\d{4}-\d{2}-\d{2})$/.exec(url.pathname);
      if (request.method === "GET" && timeTrackingSiteOptionsMatch) {
        const date = validateWorkDate(timeTrackingSiteOptionsMatch[1]);
        const options = await withReadySession(
          pool,
          tokenHash,
          (client, context) => getTimeTrackingSiteOptions(client, context, date)
        );
        return json(response, 200, { options });
      }

      if (request.method === "POST" && url.pathname === "/api/v1/time-tracking/site-selection") {
        const input = validateSpontaneousSiteSelection(await readJson(request));
        const selection = await withReadySession(
          pool,
          tokenHash,
          (client, context) => selectSpontaneousSite(client, context, input, config.timeZone)
        );
        return json(response, 200, { selection });
      }

      if (request.method === "POST" && url.pathname === "/api/v1/time-tracking/sites") {
        const input = validateFieldConstructionSite(await readJson(request));
        const selection = await withReadySession(
          pool,
          tokenHash,
          (client, context) => createFieldConstructionSite(client, context, input, config.timeZone)
        );
        return json(response, 201, { selection });
      }

      if (request.method === "POST" && url.pathname === "/api/v1/site-reports") {
        const input = validateMobileSiteReport(await readJson(request));
        const created = await withReadySession(
          pool,
          tokenHash,
          (client, context) => createMobileSiteReport(client, context, input)
        );
        return json(response, created.idempotent ? 200 : 201, created);
      }

      const mobileSiteReportMatch = /^\/api\/v1\/site-reports\/([^/]+)$/.exec(url.pathname);
      if (request.method === "PATCH" && mobileSiteReportMatch) {
        const reportId = validateId(mobileSiteReportMatch[1], "Berichts-ID");
        const input = validateMobileSiteReportRevision(await readJson(request));
        const siteReport = await withReadySession(
          pool,
          tokenHash,
          (client, context) => reviseMobileSiteReport(client, context, reportId, input)
        );
        return json(response, 200, { siteReport });
      }

      if (request.method === "POST" && url.pathname === "/api/v1/time-entries") {
        const input = validateTimeEntry(await readJson(request));
        const entry = await withReadySession(
          pool,
          tokenHash,
          (client, context) => insertTimeEntry(client, context, input, config.timeZone)
        );
        return json(response, entry.idempotent ? 200 : 201, { timeEntry: entry });
      }

      const ownTimeEntryEditMatch = /^\/api\/v1\/time-entries\/([^/]+)$/.exec(url.pathname);
      if (request.method === "PATCH" && ownTimeEntryEditMatch) {
        const entryId = validateId(ownTimeEntryEditMatch[1], "Zeitbuchungs-ID");
        const input = validateTimeEntryEdit(await readJson(request));
        const result = await withReadySession(
          pool,
          tokenHash,
          (client, context) => editTimeEntry(
            client,
            context,
            entryId,
            input,
            config.timeZone,
            false
          )
        );
        return json(response, 200, result);
      }
      if (request.method === "DELETE" && ownTimeEntryEditMatch) {
        const entryId = validateId(ownTimeEntryEditMatch[1], "Zeitbuchungs-ID");
        const input = validateTimeEntryDelete(await readJson(request));
        const result = await withReadySession(
          pool,
          tokenHash,
          (client, context) => deleteTimeEntry(client, context, entryId, input, config.timeZone, false)
        );
        return json(response, 200, result);
      }

      if (request.method === "POST" && url.pathname === "/api/v1/time-entry-corrections") {
        const input = validateTimeEntryCorrection(await readJson(request));
        const correction = await withReadySession(
          pool,
          tokenHash,
          (client, context) => createTimeEntryCorrection(
            client,
            context,
            input,
            config.timeZone
          )
        );
        return json(response, 201, { timeCorrection: correction });
      }

      if (request.method === "POST" && url.pathname === "/api/v1/time-entry-additions") {
        const input = validateTimeEntryAddition(await readJson(request));
        const correction = await withReadySession(
          pool,
          tokenHash,
          (client, context) => createTimeEntryAddition(client, context, input, config.timeZone)
        );
        return json(response, 201, { timeCorrection: correction });
      }

      if (request.method === "POST" && url.pathname === "/api/v1/time-entry-invalidations") {
        const input = validateTimeEntryInvalidation(await readJson(request));
        const correction = await withReadySession(
          pool,
          tokenHash,
          (client, context) => createTimeEntryInvalidation(client, context, input)
        );
        return json(response, 201, { timeCorrection: correction });
      }

      return json(response, 404, { error: { code: "not_found", message: "Endpunkt nicht gefunden." }, requestId });
    } catch (error) {
      if (error instanceof InputError) {
        return json(response, error.status, { error: { code: error.code, message: error.message }, requestId });
      }
      logger.error?.({ requestId, error: error?.message }, "API-Anfrage fehlgeschlagen");
      await recordUnhandledPlatformError(pool, request, requestId, error).catch((recordError) => {
        logger.error?.(
          { requestId, error: recordError?.message },
          "Plattformfehler konnte nicht gruppiert werden"
        );
      });
      return json(response, 500, {
        error: { code: "internal_error", message: "Die Anfrage konnte nicht verarbeitet werden." },
        requestId
      });
    }
  };
}
