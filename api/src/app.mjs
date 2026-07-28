import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import {
  companyLogoUrl,
  sessionView,
  withApiTransaction,
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
import {
  expectedNextTypes,
  InputError,
  localDate,
  readJson,
  validateAssignment,
  validateAssignmentCancellation,
  validateAssignmentUpdate,
  validateConstructionSite,
  validateConstructionSiteUpdate,
  validateCompanyModuleUpdate,
  validateCustomer,
  validateCustomerUpdate,
  validateDocumentStatusUpdate,
  validateDocumentUpload,
  validateEmployee,
  validateEmployeeUpdate,
  validateId,
  validateInitialPasswordChange,
  validateInitialSetup,
  validateLogin,
  validateProject,
  validateProjectUpdate,
  validateSiteMaterial,
  validateSiteMaterialUpdate,
  validateSiteNote,
  validateMobileSiteReport,
  validateSiteReport,
  validateSiteReportFinalization,
  validateSiteTask,
  validateSiteTaskUpdate,
  validateSiteBundle,
  validateTimeEntry,
  validateTimeEntryAddition,
  validateTimeEntryCorrection,
  validateTimeEntryCorrectionDecision,
  validateTimeEntryInvalidation,
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
const MANAGEMENT_ROLES = new Set(["managing_director", "dispatch_office", "project_manager"]);
const MANAGEMENT_ASSIGNER_ROLES = new Set(["admin", "managing_director"]);
const ELECTRICAL_MODULES = [
  {
    key: "vde",
    name: "VDE",
    description: "Prüfungen elektrischer Anlagen und Betriebsmittel"
  },
  {
    key: "dguv",
    name: "DGUV",
    description: "Wiederkehrende Prüfungen elektrischer Betriebsmittel"
  }
];

function json(response, status, body, headers = {}) {
  const encoded = JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(encoded),
    "Cache-Control": "no-store",
    ...securityHeaders(),
    ...headers
  });
  response.end(encoded);
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

function binaryAttachment(response, { content, fileName, mimeType }) {
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
    "Content-Disposition": `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`,
    "Cache-Control": "no-store",
    ...securityHeaders()
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

function timeEntryDto(row, idempotent = false) {
  return {
    id: row.id,
    workDayId: row.work_day_id,
    clientEntryId: row.client_entry_id,
    entryType: row.entry_type,
    recordedAt: new Date(row.recorded_at).toISOString(),
    clientCreatedAt: new Date(row.client_created_at).toISOString(),
    constructionSiteId: row.construction_site_id,
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
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null
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
      `INSERT INTO user_sessions (company_id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [context.companyId, context.userId, tokenHash, expiresAt]
    );
    context.sessionId = inserted.rows[0].id;
    await client.query(
      "UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE company_id = $1 AND id = $2",
      [context.companyId, context.userId]
    );
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
            pending.id AS pending_correction_id,
            pending.recorded_at AS pending_requested_recorded_at,
            pending.correction_reason AS pending_correction_reason,
            pending.created_at AS pending_requested_at
     FROM time_entries AS entry
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
  await requirePlanner(client, context);
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
       report.id AS mobile_report_id,
       report.report_number AS mobile_report_number,
       report.status AS mobile_report_status,
       site.id AS construction_site_id,
       site.site_number,
       site.name,
       site.area_label,
       site.installer_short_text
     FROM site_assignments AS assignment
     JOIN construction_sites AS site
      ON site.company_id = assignment.company_id
      AND site.id = assignment.construction_site_id
     LEFT JOIN LATERAL (
       SELECT candidate.id, candidate.report_number, candidate.status
       FROM site_reports AS candidate
       WHERE candidate.company_id = assignment.company_id
         AND candidate.construction_site_id = assignment.construction_site_id
         AND candidate.work_date = assignment.work_date
         AND candidate.status IN ('submitted', 'approved')
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
    reportResponsible: row.report_responsible,
    reportResponsibilitySource: row.report_responsibility_source,
    mobileReport: row.mobile_report_id ? {
      id: row.mobile_report_id,
      number: row.mobile_report_number,
      status: row.mobile_report_status
    } : null,
    constructionSite: {
      id: row.construction_site_id,
      number: row.site_number,
      name: row.name,
      area: row.area_label,
      shortText: row.installer_short_text
    }
  }));
}

async function getTimeTrackingSiteOptions(client, context, date) {
  const suggested = await getAssignments(client, context, date);
  const suggestedSiteIds = suggested.map((assignment) => assignment.constructionSite.id);
  const [sites, projects, customers] = await Promise.all([
    client.query(
      `SELECT site.id, site.project_id, project.customer_id, site.site_number,
              site.name, site.installer_short_text, site.status, site.row_version,
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
  return {
    workDate: date,
    suggestedAssignments: suggested,
    sites: sites.rows.map(siteDto),
    projects: projects.rows.map(projectDto),
    customers: customers.rows.map((customer) => ({
      id: customer.id,
      number: customer.customer_number,
      displayName: customer.display_name
    }))
  };
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
  const site = await client.query(
    `SELECT id, name
     FROM construction_sites
     WHERE company_id = $1 AND id = $2
       AND status IN ('planned', 'active', 'on_hold', 'delayed')`,
    [context.companyId, input.constructionSiteId]
  );
  if (site.rowCount !== 1) {
    throw new InputError("Die Baustelle wurde nicht gefunden.", 404, "site_not_found");
  }
  const assignments = await createEmployeeSelectedAssignment(
    client,
    context,
    input.workDate,
    input.constructionSiteId,
    `Spontan gewählt · ${site.rows[0].name}`,
    input.newOccurrence
  );
  return { assignments, selectedSiteId: input.constructionSiteId };
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
     RETURNING id, project_id, site_number, name, installer_short_text,
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
  await requirePlanner(client, context);
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

async function requireModuleAdministrator(client, context) {
  const roles = await activeRoleKeys(client, context);
  if (![...roles].some((role) => MANAGEMENT_ASSIGNER_ROLES.has(role))) {
    throw new InputError(
      "Module dürfen nur durch Administration oder Geschäftsführung freigeschaltet werden.",
      403,
      "module_administration_forbidden"
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
    rowVersion: Number(row.row_version || 1)
  };
}

function companyModuleDto(definition, row) {
  return {
    key: definition.key,
    name: definition.name,
    description: definition.description,
    enabled: Boolean(row?.is_enabled),
    rowVersion: row ? Number(row.row_version) : 0,
    changedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : null,
    changedByName: row?.changed_by_name || null
  };
}

async function loadCompanyModules(client, context) {
  const result = await client.query(
    `SELECT module.module_key, module.is_enabled, module.row_version,
            module.updated_at,
            account.first_name || ' ' || account.last_name AS changed_by_name
     FROM company_modules AS module
     JOIN users AS account
       ON account.company_id = module.company_id
      AND account.id = module.changed_by_user_id
     WHERE module.company_id = $1`,
    [context.companyId]
  );
  const rows = new Map(result.rows.map((row) => [row.module_key, row]));
  return ELECTRICAL_MODULES.map((definition) => (
    companyModuleDto(definition, rows.get(definition.key))
  ));
}

async function getCompanyModules(client, context) {
  await requireModuleAdministrator(client, context);
  return loadCompanyModules(client, context);
}

async function updateCompanyModule(client, context, input) {
  await requireModuleAdministrator(client, context);
  const existing = await client.query(
    `SELECT module_key, is_enabled, row_version
     FROM company_modules
     WHERE company_id = $1 AND module_key = $2
     FOR UPDATE`,
    [context.companyId, input.moduleKey]
  );

  if (existing.rowCount === 0) {
    if (input.rowVersion !== 0) {
      throw new InputError(
        "Die Modulfreigabe wurde geändert. Bitte neu laden.",
        409,
        "row_version_conflict"
      );
    }
    const inserted = await client.query(
      `INSERT INTO company_modules (
         company_id, module_key, is_enabled, changed_by_user_id
       ) VALUES ($1, $2, $3, $4)
       ON CONFLICT (company_id, module_key) DO NOTHING
       RETURNING module_key`,
      [context.companyId, input.moduleKey, input.enabled, context.userId]
    );
    if (inserted.rowCount !== 1) {
      throw new InputError(
        "Die Modulfreigabe wurde gleichzeitig angelegt. Bitte neu laden.",
        409,
        "row_version_conflict"
      );
    }
  } else {
    const current = existing.rows[0];
    if (Number(current.row_version) !== input.rowVersion) {
      throw new InputError(
        "Die Modulfreigabe wurde geändert. Bitte neu laden.",
        409,
        "row_version_conflict"
      );
    }
    if (current.is_enabled !== input.enabled) {
      await client.query(
        `UPDATE company_modules
         SET is_enabled = $3, changed_by_user_id = $4
         WHERE company_id = $1 AND module_key = $2`,
        [context.companyId, input.moduleKey, input.enabled, context.userId]
      );
    }
  }

  const modules = await loadCompanyModules(client, context);
  return modules.find((module) => module.key === input.moduleKey);
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
    rowVersion: Number(row.row_version || 1),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    customerName: row.customer_name,
    projectName: row.project_name,
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
    siteCount: Number(row.site_count || 0)
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
  if (!ownApprovedOnly) await requirePlanner(client, context);
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

async function adminOverview(client, context, date) {
  const roles = await requirePlanner(client, context);
  const weekStart = mondayFor(date);
  const weekEnd = addUtcDays(weekStart, 4);
  const reviewWeekEnd = addUtcDays(weekStart, 6);
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
    correctionResult
  ] = await Promise.all([
    client.query(
      `SELECT account.id, account.personnel_number, account.first_name, account.last_name,
              account.email, account.phone,
              account.must_change_password, account.row_version,
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
       WHERE account.company_id = $1 AND account.status = 'active'
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
              site.status, site.row_version, site.updated_at,
              site.creation_source, site.field_review_status,
              project.name AS project_name,
              COALESCE(customer.company_name, customer.first_name || ' ' || customer.last_name) AS customer_name,
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
              assignment.report_responsible, assignment.report_responsibility_source,
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
      [context.companyId, weekStart, weekEnd]
    ),
    client.query(
      `SELECT document.id, document.document_number, document.title, document.category,
              document.original_file_name, document.mime_type, document.size_bytes,
              document.sha256_hex, document.status, document.row_version,
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
      `SELECT id, construction_site_id, item_name, quantity, unit, status,
              note, row_version, created_at
       FROM site_material_entries
       WHERE company_id = $1
       ORDER BY CASE status WHEN 'planned' THEN 1 WHEN 'ordered' THEN 2 WHEN 'available' THEN 3 WHEN 'used' THEN 4 ELSE 5 END,
                created_at DESC`,
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
              report.row_version, report.created_at,
              author.first_name || ' ' || author.last_name AS author_name,
              approver.first_name || ' ' || approver.last_name AS approved_by_name,
              document.original_file_name AS source_document_file_name,
              final_document.original_file_name AS final_document_file_name
       FROM site_reports AS report
       JOIN users AS author
         ON author.company_id = report.company_id AND author.id = report.author_user_id
       LEFT JOIN documents AS document
         ON document.company_id = report.company_id AND document.id = report.source_document_id
       LEFT JOIN users AS approver
         ON approver.company_id = report.company_id AND approver.id = report.approved_by_user_id
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
              correction.entry_type, correction.requested_recorded_at,
              correction.original_recorded_at, correction.correction_reason,
              correction.requested_at, 'pending'::TEXT AS correction_status,
              NULL::TIMESTAMPTZ AS reviewed_at,
              account.first_name || ' ' || account.last_name AS employee_name
       FROM pending_time_entry_corrections_v2 AS correction
       JOIN users AS account
         ON account.company_id = correction.company_id
        AND account.id = correction.user_id
       WHERE correction.company_id = $1
       ORDER BY correction.work_date DESC, correction.requested_at, correction.id`,
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
    reportResponsible: row.report_responsible,
    reportResponsibilitySource: row.report_responsibility_source,
    employeeName: `${row.first_name} ${row.last_name}`,
    siteName: row.site_name
  }));

  return {
    date,
    weekStart,
    canCreateManagementRoles: [...roles].some((role) => MANAGEMENT_ASSIGNER_ROLES.has(role)),
    employees: employeeResult.rows.map(employeeDto),
    customers: customerResult.rows.map(customerDto),
    projects: projectResult.rows.map(projectDto),
    sites: siteResult.rows.map(siteDto),
    documents: documentResult.rows.map(documentDto),
    siteTasks: taskResult.rows.map(siteTaskDto),
    siteMaterials: materialResult.rows.map(siteMaterialDto),
    siteNotes: noteResult.rows.map(siteNoteDto),
    siteReports: reportResult.rows.map(siteReportDto),
    workDays: workDayResult.rows.map(adminWorkDayDto),
    timeCorrections: correctionResult.rows.map(timeEntryCorrectionDto),
    assignments: weekAssignments.filter((assignment) => assignment.workDate === date),
    weekAssignments
  };
}

async function requireSiteWorkspaceAccess(client, context, constructionSiteId, date) {
  const roles = await activeRoleKeys(client, context);
  const canManage = [...roles].some((role) => PLANNER_ROLES.has(role));
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
              document.created_at,
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
      `SELECT id, construction_site_id, item_name, quantity, unit, status,
              note, row_version, created_at
       FROM site_material_entries
       WHERE company_id = $1
         AND construction_site_id = $2
         AND status <> 'archived'
       ORDER BY CASE status WHEN 'planned' THEN 1 WHEN 'ordered' THEN 2 WHEN 'available' THEN 3 WHEN 'used' THEN 4 ELSE 5 END,
                created_at DESC`,
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
              report.row_version, report.created_at,
              author.first_name || ' ' || author.last_name AS author_name,
              approver.first_name || ' ' || approver.last_name AS approved_by_name,
              document.original_file_name AS source_document_file_name,
              final_document.original_file_name AS final_document_file_name
       FROM site_reports AS report
       JOIN users AS author
         ON author.company_id = report.company_id AND author.id = report.author_user_id
       LEFT JOIN documents AS document
         ON document.company_id = report.company_id AND document.id = report.source_document_id
       LEFT JOIN users AS approver
         ON approver.company_id = report.company_id AND approver.id = report.approved_by_user_id
       LEFT JOIN documents AS final_document
         ON final_document.company_id = report.company_id AND final_document.id = report.final_document_id
       WHERE report.company_id = $1
         AND report.construction_site_id = $2
         AND report.status <> 'archived'
         AND ($3::BOOLEAN OR report.status IN ('submitted', 'approved'))
       ORDER BY report.work_date DESC, report.created_at DESC`,
      [context.companyId, constructionSiteId, access.canLead]
    )
  ]);

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
    reports: reportResult.rows.map(siteReportDto)
  };
}

async function getDocumentRecord(client, context, documentId) {
  const result = await client.query(
    `SELECT document.id, document.document_number, document.title, document.category,
            document.original_file_name, document.mime_type, document.size_bytes,
            document.sha256_hex, document.status, document.row_version,
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
  const inserted = await client.query(
    `INSERT INTO documents (
       company_id, document_number, title, category, original_file_name,
       mime_type, size_bytes, sha256_hex, uploaded_by_user_id
     ) VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8)
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
      context.userId
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
        "UPDATE documents SET status = 'active' WHERE company_id = $1 AND id = $2",
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
  await requirePlanner(client, context);
  return storeDocument(client, context, input);
}

async function createSitePhoto(client, context, constructionSiteId, date, input) {
  await requireSiteWorkspaceAccess(client, context, constructionSiteId, date);
  return storeDocument(client, context, input);
}

async function getDocumentContent(client, context, documentId) {
  await requirePlanner(client, context);
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
       AND document.status = 'active'`,
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
  await requirePlanner(client, context);
  const current = await client.query(
    `SELECT status, row_version
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
  if (current.rows[0].status !== input.status) {
    await client.query(
      `UPDATE documents SET status = $3
       WHERE company_id = $1 AND id = $2 AND row_version = $4`,
      [context.companyId, documentId, input.status, input.rowVersion]
    );
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
  await requirePlanner(client, context);
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
  await requirePlanner(client, context);
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
    `SELECT id, construction_site_id, item_name, quantity, unit, status,
            note, row_version, created_at
     FROM site_material_entries
     WHERE company_id = $1 AND id = $2`,
    [context.companyId, materialId]
  );
  if (result.rowCount !== 1) throw new InputError("Der Materialeintrag wurde nicht gefunden.", 404, "site_material_not_found");
  return siteMaterialDto(result.rows[0]);
}

async function createSiteMaterial(client, context, input) {
  await requirePlanner(client, context);
  await requireActiveSite(client, context, input.constructionSiteId);
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

async function updateSiteMaterial(client, context, materialId, input) {
  await requirePlanner(client, context);
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
  await requirePlanner(client, context);
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
            report.row_version, report.created_at,
            author.first_name || ' ' || author.last_name AS author_name,
            approver.first_name || ' ' || approver.last_name AS approved_by_name,
            document.original_file_name AS source_document_file_name,
            final_document.original_file_name AS final_document_file_name
     FROM site_reports AS report
     JOIN users AS author
       ON author.company_id = report.company_id AND author.id = report.author_user_id
     LEFT JOIN documents AS document
       ON document.company_id = report.company_id AND document.id = report.source_document_id
     LEFT JOIN users AS approver
       ON approver.company_id = report.company_id AND approver.id = report.approved_by_user_id
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

function structuredReportData(input, personnel) {
  return {
    workPerformed: input.workPerformed,
    obstructions: input.obstructions,
    openItems: input.openItems,
    weather: input.weather,
    materialsAndEquipment: input.materialsAndEquipment,
    agreements: input.agreements,
    incidents: input.incidents,
    personnel
  };
}

async function createSiteReport(client, context, input) {
  await requirePlanner(client, context);
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
  const result = await client.query(
    `INSERT INTO site_reports (
       company_id, construction_site_id, report_number, report_type, work_date,
       source_mode, summary, details, structured_data, source_document_id,
       status, author_user_id
     ) VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, $8::JSONB, $9, 'submitted', $10)
     RETURNING id`,
    [context.companyId, input.constructionSiteId, input.reportType, input.workDate,
      input.sourceMode, input.summary, input.details,
      JSON.stringify(structuredReportData(input, personnel)),
      input.sourceDocumentId, context.userId]
  );
  return getSiteReportRecord(client, context, result.rows[0].id);
}

async function createMobileSiteReport(client, context, input) {
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

  const existingReport = await client.query(
    `SELECT id FROM site_reports
     WHERE company_id = $1 AND construction_site_id = $3 AND work_date = $4
       AND status IN ('submitted', 'approved')
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
      input.summary, input.details, JSON.stringify(structuredReportData(input, personnel)),
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

async function finalizeSiteReport(client, context, reportId, input, staticDirectory) {
  await requirePlanner(client, context);
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
    companyLogo: await readCompanyLogo(staticDirectory, row.logo_object_key)
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
  await requirePlanner(client, context);
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
  await requirePlanner(client, context);
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
  await requirePlanner(client, context);
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
            account.must_change_password, account.row_version,
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
       AND account.status = 'active'
     GROUP BY account.id`,
    [context.companyId, employeeId]
  );
  if (result.rowCount !== 1) {
    throw new InputError("Der Mitarbeiter wurde nicht gefunden.", 404, "employee_not_found");
  }
  return employeeDto(result.rows[0]);
}

async function createEmployee(client, context, input) {
  const roles = await requirePlanner(client, context);
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
       password_hash, must_change_password
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
     RETURNING id, personnel_number, first_name, last_name, email, phone, must_change_password`,
    [
      context.companyId,
      input.personnelNumber,
      input.firstName,
      input.lastName,
      input.email,
      input.phone,
      passwordHash
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
  const actorRoles = await requirePlanner(client, context);
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

  const updated = await client.query(
    `UPDATE users
     SET personnel_number = $3, first_name = $4, last_name = $5,
         email = $6, phone = $7
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
      input.rowVersion
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
    `UPDATE user_roles
     SET revoked_at = CURRENT_TIMESTAMP,
         revoked_by_user_id = $3,
         reason = 'Rollenänderung in der Mitarbeiterverwaltung'
     WHERE company_id = $1
       AND user_id = $2
       AND revoked_at IS NULL
       AND role_id <> $4`,
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

async function createCustomer(client, context, input) {
  await requirePlanner(client, context);
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
  await requirePlanner(client, context);
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

async function createProject(client, context, input) {
  await requirePlanner(client, context);
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
  const row = customer.rows[0];
  return projectDto({
    ...inserted.rows[0],
    customer_name: row.customer_type === "company"
      ? row.company_name
      : `${row.first_name} ${row.last_name}`,
    site_count: 0
  });
}

async function updateProject(client, context, projectId, input) {
  await requirePlanner(client, context);
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
  return projectDto({
    ...updated.rows[0],
    customer_name: currentProject.customer_name,
    site_count: 0
  });
}

async function createConstructionSite(client, context, input) {
  await requirePlanner(client, context);
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
     RETURNING id, project_id, site_number, name, installer_short_text, status, row_version, updated_at`,
    [context.companyId, projectRow.id, location.rows[0].id, input.name, input.installerShortText]
  );
  return siteDto({
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
}

async function updateConstructionSite(client, context, siteId, input) {
  await requirePlanner(client, context);
  const current = await client.query(
    `SELECT site.id, site.project_id, site.customer_location_id, site.site_number,
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
     RETURNING id, project_id, site_number, name, installer_short_text,
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
  return siteDto({
    ...updated.rows[0],
    customer_id: currentSite.customer_id,
    customer_name: currentSite.customer_type === "company"
      ? currentSite.company_name
      : `${currentSite.first_name} ${currentSite.last_name}`,
    project_name: currentSite.project_name,
    street: input.street,
    house_number: input.houseNumber,
    postal_code: input.postalCode,
    city: input.city
  });
}

async function createSiteBundle(client, context, input) {
  await requirePlanner(client, context);
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
     RETURNING id, project_id, site_number, name, installer_short_text, status, row_version, updated_at`,
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
    `SELECT assignment.id, assignment.report_responsible,
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

  if (assignmentsForSite.length === 1 && !manualResponsible) {
    const [assignment] = assignmentsForSite;
    if (!assignment.report_responsible && !assignment.has_mobile_report) {
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

  if (assignmentsForSite.length !== 1) {
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

async function createAssignment(client, context, input) {
  await requirePlanner(client, context);
  const [employee, site] = await Promise.all([
    client.query(
      "SELECT is_foreman FROM users WHERE company_id = $1 AND id = $2 AND status = 'active'",
      [context.companyId, input.employeeId]
    ),
    client.query(
      `SELECT 1 FROM construction_sites
       WHERE company_id = $1 AND id = $2
         AND status IN ('planned', 'active', 'on_hold', 'delayed')`,
      [context.companyId, input.constructionSiteId]
    )
  ]);
  if (employee.rowCount !== 1) throw new InputError("Der Mitarbeiter wurde nicht gefunden.", 404, "employee_not_found");
  if (site.rowCount !== 1) throw new InputError("Die Baustelle wurde nicht gefunden.", 404, "site_not_found");
  if (input.reportResponsible && !employee.rows[0].is_foreman) {
    throw new InputError("Nur ein Mitarbeiter mit der Rolle Vorarbeiter kann den Baustellenbericht übernehmen.");
  }

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

  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    [`assignment:${context.companyId}:${input.employeeId}:${input.workDate}`]
  );
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
       report_responsibility_source,
       created_by_user_id, changed_by_user_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'released', $8, $9, $10, $11, $11)
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
    `SELECT id, sequence_number, planned_start_time::TEXT,
            planned_duration_minutes, comment, report_responsible,
            report_responsibility_source
     FROM site_assignments
     WHERE company_id = $1 AND id = $2`,
    [context.companyId, inserted.rows[0].id]
  );
  return {
    id: assignment.rows[0].id,
    employeeId: input.employeeId,
    constructionSiteId: input.constructionSiteId,
    workDate: input.workDate,
    sequenceNumber: assignment.rows[0].sequence_number,
    plannedStartTime: assignment.rows[0].planned_start_time,
    plannedDurationMinutes: assignment.rows[0].planned_duration_minutes === null
      ? null
      : Number(assignment.rows[0].planned_duration_minutes),
    comment: assignment.rows[0].comment,
    reportResponsible: assignment.rows[0].report_responsible,
    reportResponsibilitySource: assignment.rows[0].report_responsibility_source
  };
}

async function updateAssignment(client, context, assignmentId, input) {
  await requirePlanner(client, context);
  const current = await client.query(
    `SELECT assignment.id, assignment.user_id, assignment.construction_site_id,
            assignment.work_date, assignment.sequence_number, assignment.status,
            assignment.planned_duration_minutes, assignment.comment,
            assignment.report_responsible, assignment.report_responsibility_source,
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
  if (!["draft", "released"].includes(assignment.status)) {
    throw new InputError("Dieser Einsatz kann nicht mehr geändert werden.", 409, "assignment_locked");
  }

  const plannedDurationMinutes = input.plannedDurationMinutes === undefined
    ? assignment.planned_duration_minutes
    : input.plannedDurationMinutes;
  const comment = input.comment === undefined ? assignment.comment : input.comment;
  let reportResponsible = input.reportResponsible === null
    ? assignment.report_responsible
    : input.reportResponsible;
  let reportResponsibilitySource = input.reportResponsible === null
    ? assignment.report_responsibility_source
    : (input.reportResponsible ? "manual" : null);
  if (
    databaseDate(assignment.work_date) !== input.workDate
    && assignment.report_responsibility_source === "automatic"
    && input.reportResponsible === null
  ) {
    reportResponsible = false;
    reportResponsibilitySource = null;
  }
  if (assignment.has_mobile_report && (
    databaseDate(assignment.work_date) !== input.workDate
    || reportResponsible !== assignment.report_responsible
  )) {
    throw new InputError(
      "Der Einsatz besitzt bereits einen Baustellenbericht und kann nicht mehr verschoben oder neu zugeordnet werden.",
      409,
      "assignment_has_report"
    );
  }
  if (reportResponsible && reportResponsibilitySource === "manual") {
    const employee = await client.query(
      "SELECT is_foreman FROM users WHERE company_id = $1 AND id = $2 AND status = 'active'",
      [context.companyId, assignment.user_id]
    );
    if (employee.rowCount !== 1 || !employee.rows[0].is_foreman) {
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

  let sequenceNumber = assignment.sequence_number;
  if (databaseDate(assignment.work_date) !== input.workDate) {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`assignment:${context.companyId}:${assignment.user_id}:${input.workDate}`]
    );
    const sequence = await client.query(
      `SELECT COALESCE(MAX(sequence_number), 0) + 1 AS next_sequence
       FROM site_assignments
       WHERE company_id = $1 AND user_id = $2 AND work_date = $3
         AND status <> 'cancelled' AND id <> $4`,
      [context.companyId, assignment.user_id, input.workDate, assignmentId]
    );
    sequenceNumber = sequence.rows[0].next_sequence;
  }

  const updated = await client.query(
    `UPDATE site_assignments
     SET work_date = $3,
         sequence_number = $4,
         planned_start_time = $5,
         planned_duration_minutes = $6,
         comment = $7,
         report_responsible = $8,
         report_responsibility_source = $9,
         changed_by_user_id = $10,
         last_change_reason = $11
     WHERE company_id = $1 AND id = $2
     RETURNING id`,
    [
      context.companyId,
      assignmentId,
      input.workDate,
      sequenceNumber,
      input.plannedStartTime,
      plannedDurationMinutes,
      comment,
      reportResponsible,
      reportResponsibilitySource,
      context.userId,
      input.changeReason
    ]
  );
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
            report_responsibility_source
     FROM site_assignments
     WHERE company_id = $1 AND id = $2`,
    [context.companyId, updated.rows[0].id]
  );
  const row = refreshed.rows[0];
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
    reportResponsible: row.report_responsible,
    reportResponsibilitySource: row.report_responsibility_source
  };
}

async function cancelAssignment(client, context, assignmentId, changeReason) {
  await requirePlanner(client, context);
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
    const assignment = await client.query(
      `SELECT id, report_responsible FROM site_assignments
       WHERE company_id = $1 AND user_id = $2 AND construction_site_id = $3
         AND work_date = $4 AND status IN ('released', 'completed')
       ORDER BY report_responsible DESC, sequence_number`,
      [context.companyId, context.userId, input.constructionSiteId, workDate]
    );
    if (assignment.rowCount === 0) {
      throw new InputError("Die Baustelle ist für diesen Arbeitstag nicht freigegeben.", 403, "site_not_assigned");
    }
    matchedAssignment = assignment.rows[0];
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
    const assignment = await client.query(
      `SELECT 1
       FROM site_assignments
       WHERE company_id = $1 AND user_id = $2 AND construction_site_id = $3
         AND work_date = $4 AND status IN ('released', 'completed')
       LIMIT 1`,
      [context.companyId, context.userId, input.constructionSiteId, input.workDate]
    );
    if (assignment.rowCount !== 1) {
      throw new InputError(
        "Die Baustelle war diesem Arbeitstag nicht zugeordnet.",
        403,
        "site_not_assigned"
      );
    }
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
  await requirePlanner(client, context);
  const correctionResult = await client.query(
    `SELECT correction.id, correction.user_id, correction.work_day_id,
            day.work_date, correction.original_entry_id,
            correction.correction_kind,
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

export function createApp({ pool, config, limiter = new LoginRateLimiter(), logger = console }) {
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
        "Access-Control-Allow-Headers": "Content-Type",
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

      if (!url.pathname.startsWith("/api/") && await serveStatic(
        request,
        response,
        config.staticDirectory,
        url.pathname
      )) return;

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

      if (request.method === "GET" && url.pathname === "/api/v1/admin/modules") {
        const modules = await withReadySession(
          pool,
          tokenHash,
          getCompanyModules
        );
        return json(response, 200, { modules });
      }

      const adminModuleMatch = /^\/api\/v1\/admin\/modules\/([^/]+)$/.exec(url.pathname);
      if (request.method === "PATCH" && adminModuleMatch) {
        const input = validateCompanyModuleUpdate(
          adminModuleMatch[1],
          await readJson(request)
        );
        const module = await withReadySession(
          pool,
          tokenHash,
          (client, context) => updateCompanyModule(client, context, input)
        );
        return json(response, 200, { module });
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

      const adminWorkDayMatch = /^\/api\/v1\/admin\/work-days\/([^/]+)$/.exec(url.pathname);
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

      if (request.method === "POST" && url.pathname === "/api/v1/time-entries") {
        const input = validateTimeEntry(await readJson(request));
        const entry = await withReadySession(
          pool,
          tokenHash,
          (client, context) => insertTimeEntry(client, context, input, config.timeZone)
        );
        return json(response, entry.idempotent ? 200 : 201, { timeEntry: entry });
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
      return json(response, 500, {
        error: { code: "internal_error", message: "Die Anfrage konnte nicht verarbeitet werden." },
        requestId
      });
    }
  };
}
