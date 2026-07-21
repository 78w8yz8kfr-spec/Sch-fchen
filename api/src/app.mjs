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
  validateCustomer,
  validateCustomerUpdate,
  validateDocumentStatusUpdate,
  validateDocumentUpload,
  validateEmployee,
  validateId,
  validateInitialPasswordChange,
  validateInitialSetup,
  validateLogin,
  validateProject,
  validateProjectUpdate,
  validateSiteMaterial,
  validateSiteMaterialUpdate,
  validateMobileSiteReport,
  validateSiteReport,
  validateSiteReportFinalization,
  validateSiteTask,
  validateSiteTaskUpdate,
  validateSiteBundle,
  validateTimeEntry,
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
    idempotent
  };
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
    entries: entries.map((entry) => timeEntryDto(entry))
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
    `SELECT * FROM work_days
     WHERE company_id = $1 AND user_id = $2 AND work_date = $3`,
    [context.companyId, context.userId, date]
  );
  if (dayResult.rowCount === 0) return null;

  const day = dayResult.rows[0];
  const entries = await client.query(
    `SELECT id, work_day_id, client_entry_id, entry_type, recorded_at,
            client_created_at, construction_site_id
     FROM time_entries
     WHERE company_id = $1 AND user_id = $2 AND work_day_id = $3
       AND invalidated_at IS NULL
       AND (original_entry_id IS NULL OR correction_status = 'approved')
     ORDER BY recorded_at, created_at, id`,
    [context.companyId, context.userId, day.id]
  );
  return workDayDto(day, entries.rows);
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
    roles: row.roles,
    mustChangePassword: row.must_change_password
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

async function adminOverview(client, context, date) {
  const roles = await requirePlanner(client, context);
  const weekStart = mondayFor(date);
  const weekEnd = addUtcDays(weekStart, 4);
  const [
    employeeResult,
    customerResult,
    projectResult,
    siteResult,
    assignmentResult,
    documentResult,
    taskResult,
    materialResult,
    reportResult
  ] = await Promise.all([
    client.query(
      `SELECT account.id, account.personnel_number, account.first_name, account.last_name,
              account.must_change_password,
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
              assignment.report_responsible,
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
      `SELECT report.id, report.construction_site_id, report.report_number,
              report.report_type, report.work_date, report.source_mode,
              report.summary, report.details, report.source_document_id,
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
    )
  ]);

  const weekAssignments = assignmentResult.rows.map((row) => ({
    id: row.id,
    employeeId: row.user_id,
    constructionSiteId: row.construction_site_id,
    workDate: databaseDate(row.work_date),
    sequenceNumber: row.sequence_number,
    plannedStartTime: row.planned_start_time,
    reportResponsible: row.report_responsible,
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
    siteReports: reportResult.rows.map(siteReportDto),
    assignments: weekAssignments.filter((assignment) => assignment.workDate === date),
    weekAssignments
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

async function createDocument(client, context, input) {
  await requirePlanner(client, context);
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

async function getSiteReportRecord(client, context, reportId) {
  const result = await client.query(
    `SELECT report.id, report.construction_site_id, report.report_number,
            report.report_type, report.work_date, report.source_mode,
            report.summary, report.details, report.source_document_id,
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
  const result = await client.query(
    `INSERT INTO site_reports (
       company_id, construction_site_id, report_number, report_type, work_date,
       source_mode, summary, details, source_document_id, status, author_user_id
     ) VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, $8, 'submitted', $9)
     RETURNING id`,
    [context.companyId, input.constructionSiteId, input.reportType, input.workDate,
      input.sourceMode, input.summary, input.details, input.sourceDocumentId, context.userId]
  );
  return getSiteReportRecord(client, context, result.rows[0].id);
}

async function createMobileSiteReport(client, context, input) {
  const duplicate = await client.query(
    `SELECT id, author_user_id, construction_site_id, work_date, report_type,
            source_mode, summary, details
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
      && (row.details || null) === input.details;
    if (!same) {
      throw new InputError(
        "Die Offline-Berichts-ID wurde bereits für einen anderen Bericht verwendet.",
        409,
        "idempotency_conflict"
      );
    }
    return { siteReport: await getSiteReportRecord(client, context, row.id), idempotent: true };
  }

  const roles = await activeRoleKeys(client, context);
  if (!roles.has("foreman")) {
    throw new InputError(
      "Nur der für diesen Einsatz bestimmte Vorarbeiter darf den Baustellenbericht erfassen.",
      403,
      "report_forbidden"
    );
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
      "Du bist für diesen Baustellentag nicht als berichtspflichtiger Vorarbeiter eingeteilt.",
      403,
      "report_assignment_required"
    );
  }

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
       source_mode, summary, details, source_document_id, status, author_user_id,
       site_assignment_id, client_report_id
     ) VALUES ($1, $2, NULL, $3, $4, 'digital', $5, $6, NULL, 'submitted', $7, $8, $9)
     RETURNING id`,
    [context.companyId, input.constructionSiteId, input.reportType, input.workDate,
      input.summary, input.details, context.userId, assignment.rows[0].id, input.clientReportId]
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
            report.summary, report.details, report.status, report.row_version,
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
    siteAddress
  };
  const pdf = await buildFinalReportPdf({
    report: {
      id: row.id,
      number: row.report_number,
      reportType: row.report_type,
      workDate: databaseDate(row.work_date),
      summary: row.summary,
      details: row.details,
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
  const reportLabel = row.report_type === "daily" ? "Bautagesbericht" : "Montagebericht";
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
    const project = await client.query(
      `INSERT INTO projects (company_id, customer_id, name, status, installer_short_text)
       VALUES ($1, $2, $3, 'active', $4)
       RETURNING id`,
      [context.companyId, customerId, row.projectName || row.siteName, row.installerShortText]
    );
    await client.query(
      `INSERT INTO project_locations (company_id, project_id, customer_location_id)
       VALUES ($1, $2, $3)`,
      [context.companyId, project.rows[0].id, location.rows[0].id]
    );
    await client.query(
      `INSERT INTO construction_sites (
         company_id, project_id, customer_location_id, name, installer_short_text, status
       ) VALUES ($1, $2, $3, $4, $5, 'active')`,
      [context.companyId, project.rows[0].id, location.rows[0].id, row.siteName, row.installerShortText]
    );
    createdCount += 1;
  }
  return { createdCount, skippedCount: preview.sourceRowCount - createdCount };
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
    "SELECT 1 FROM users WHERE company_id = $1 AND personnel_number = $2",
    [context.companyId, input.personnelNumber]
  );
  if (duplicate.rowCount) {
    throw new InputError("Diese Personalnummer ist bereits vergeben.", 409, "personnel_number_exists");
  }
  const roleResult = await client.query(
    "SELECT id FROM roles WHERE company_id = $1 AND role_key = $2 AND status = 'active'",
    [context.companyId, input.role]
  );
  if (roleResult.rowCount !== 1) throw new InputError("Die gewählte Rolle ist nicht verfügbar.");

  const passwordHash = await hashPassword(input.temporaryPassword);
  const inserted = await client.query(
    `INSERT INTO users (
       company_id, personnel_number, first_name, last_name, password_hash, must_change_password
     ) VALUES ($1, $2, $3, $4, $5, TRUE)
     RETURNING id, personnel_number, first_name, last_name, must_change_password`,
    [context.companyId, input.personnelNumber, input.firstName, input.lastName, passwordHash]
  );
  await client.query(
    `INSERT INTO user_roles (company_id, user_id, role_id, assigned_by_user_id, reason)
     VALUES ($1, $2, $3, $4, 'Anlage in der Verwaltung')`,
    [context.companyId, inserted.rows[0].id, roleResult.rows[0].id, context.userId]
  );
  return employeeDto({ ...inserted.rows[0], roles: [input.role] });
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
  const project = await client.query(
    `SELECT project.id, project.name, project.customer_id,
            customer.customer_type, customer.company_name, customer.first_name, customer.last_name
     FROM projects AS project
     JOIN customers AS customer
       ON customer.company_id = project.company_id AND customer.id = project.customer_id
     WHERE project.company_id = $1 AND project.id = $2
       AND project.status IN ('planned', 'active', 'on_hold')
       AND customer.status = 'active'`,
    [context.companyId, input.projectId]
  );
  if (project.rowCount !== 1) {
    throw new InputError("Das Projekt wurde nicht gefunden.", 404, "project_not_found");
  }
  const existingNames = await client.query(
    `SELECT name FROM construction_sites
     WHERE company_id = $1 AND status IN ('planned', 'active', 'on_hold', 'delayed')`,
    [context.companyId]
  );
  if (existingNames.rows.some((row) => normalizeImportText(row.name) === normalizeImportText(input.name))) {
    throw new InputError("Eine aktive Baustelle mit diesem Namen existiert bereits.", 409, "site_name_exists");
  }

  const projectRow = project.rows[0];
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
    [context.companyId, input.projectId, location.rows[0].id]
  );
  const inserted = await client.query(
    `INSERT INTO construction_sites (
       company_id, project_id, customer_location_id, name, installer_short_text, status
     ) VALUES ($1, $2, $3, $4, $5, 'active')
     RETURNING id, project_id, site_number, name, installer_short_text, status, row_version, updated_at`,
    [context.companyId, input.projectId, location.rows[0].id, input.name, input.installerShortText]
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
    [context.companyId, customer.rows[0].id, input.projectName || input.siteName, input.installerShortText]
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
    project_name: input.projectName || input.siteName,
    street: input.street,
    house_number: input.houseNumber,
    postal_code: input.postalCode,
    city: input.city
  });
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
       planned_start_time, status, comment, report_responsible,
       created_by_user_id, changed_by_user_id
     ) VALUES ($1, $2, $3, $4, $5, $6, 'released', $7, $8, $9, $9)
     RETURNING id, sequence_number, planned_start_time::TEXT, report_responsible`,
    [
      context.companyId,
      input.employeeId,
      input.constructionSiteId,
      input.workDate,
      sequence.rows[0].next_sequence,
      input.plannedStartTime,
      input.comment,
      input.reportResponsible,
      context.userId
    ]
  );
  return {
    id: inserted.rows[0].id,
    employeeId: input.employeeId,
    constructionSiteId: input.constructionSiteId,
    workDate: input.workDate,
    sequenceNumber: inserted.rows[0].sequence_number,
    plannedStartTime: inserted.rows[0].planned_start_time,
    reportResponsible: inserted.rows[0].report_responsible
  };
}

async function updateAssignment(client, context, assignmentId, input) {
  await requirePlanner(client, context);
  const current = await client.query(
    `SELECT assignment.id, assignment.user_id, assignment.construction_site_id,
            assignment.work_date, assignment.sequence_number, assignment.status,
            assignment.report_responsible,
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

  const reportResponsible = input.reportResponsible === null
    ? assignment.report_responsible
    : input.reportResponsible;
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
  if (reportResponsible) {
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
         report_responsible = $6,
         changed_by_user_id = $7,
         last_change_reason = $8
     WHERE company_id = $1 AND id = $2
     RETURNING id, user_id, construction_site_id, work_date,
               sequence_number, planned_start_time::TEXT, status, report_responsible`,
    [
      context.companyId,
      assignmentId,
      input.workDate,
      sequenceNumber,
      input.plannedStartTime,
      reportResponsible,
      context.userId,
      input.changeReason
    ]
  );
  const row = updated.rows[0];
  return {
    id: row.id,
    employeeId: row.user_id,
    constructionSiteId: row.construction_site_id,
    workDate: databaseDate(row.work_date),
    sequenceNumber: row.sequence_number,
    plannedStartTime: row.planned_start_time,
    status: row.status,
    reportResponsible: row.report_responsible
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
     RETURNING id`,
    [context.companyId, assignmentId, context.userId, changeReason]
  );
  if (updated.rowCount !== 1) {
    throw new InputError("Der Einsatz wurde nicht gefunden oder ist bereits abgeschlossen.", 409, "assignment_locked");
  }
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
       AND (entry.original_entry_id IS NULL OR entry.correction_status = 'approved')
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

      if (request.method === "GET" && url.pathname === "/api/v1/admin/overview") {
        const date = validateWorkDate(url.searchParams.get("date") || localDate(new Date().toISOString(), config.timeZone));
        const overview = await withReadySession(
          pool,
          tokenHash,
          (client, context) => adminOverview(client, context, date)
        );
        return json(response, 200, { overview });
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

      const workDayMatch = /^\/api\/v1\/work-days\/(\d{4}-\d{2}-\d{2})$/.exec(url.pathname);
      if (request.method === "GET" && workDayMatch) {
        const date = validateWorkDate(workDayMatch[1]);
        const day = await withReadySession(pool, tokenHash, (client, context) => getWorkDay(client, context, date));
        return json(response, 200, { workDay: day });
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
