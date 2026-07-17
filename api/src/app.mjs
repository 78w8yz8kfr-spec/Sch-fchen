import { randomUUID } from "node:crypto";
import {
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
  parseAssignmentWorkbook,
  validateAssignmentImportPayload
} from "./assignment-import.mjs";
import {
  expectedNextTypes,
  InputError,
  localDate,
  readJson,
  validateAssignment,
  validateAssignmentCancellation,
  validateAssignmentUpdate,
  validateEmployee,
  validateId,
  validateInitialPasswordChange,
  validateInitialSetup,
  validateLogin,
  validateSiteBundle,
  validateTimeEntry,
  validateWorkDate
} from "./validation.mjs";

const DUMMY_HASH = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$zJbDCEum4Q2YZolIS8tIPfMbbOMR2eM8lXJj1i9Cq2Q";
const PLANNER_ROLES = new Set([
  "admin",
  "office",
  "planner",
  "project_manager",
  "executive_assistant"
]);
const ADMIN_ASSIGNED_ROLES = new Set(["planner", "project_manager", "executive_assistant"]);

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

async function setupStatus(pool, companyNumber) {
  return withApiTransaction(pool, async (client) => {
    const result = await client.query(
      `SELECT company_number, display_name, setup_required
       FROM api_get_initial_setup_status($1::VARCHAR)`,
      [companyNumber]
    );
    if (result.rowCount !== 1) {
      throw new InputError("Die Firma für die Ersteinrichtung wurde nicht gefunden.", 404, "company_not_found");
    }
    const row = result.rows[0];
    return {
      companyNumber: row.company_number,
      displayName: row.display_name,
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
       site.id AS construction_site_id,
       site.site_number,
       site.name,
       site.area_label,
       site.installer_short_text
     FROM site_assignments AS assignment
     JOIN construction_sites AS site
       ON site.company_id = assignment.company_id
      AND site.id = assignment.construction_site_id
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
    number: row.site_number,
    name: row.name,
    shortText: row.installer_short_text,
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
  const [employeeResult, siteResult, assignmentResult] = await Promise.all([
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
      `SELECT site.id, site.site_number, site.name, site.installer_short_text,
              project.name AS project_name,
              customer.company_name AS customer_name,
              location.street, location.house_number, location.postal_code, location.city
       FROM construction_sites AS site
       JOIN projects AS project
         ON project.company_id = site.company_id AND project.id = site.project_id
       JOIN customers AS customer
         ON customer.company_id = project.company_id AND customer.id = project.customer_id
       LEFT JOIN customer_locations AS location
         ON location.company_id = site.company_id AND location.id = site.customer_location_id
       WHERE site.company_id = $1
         AND site.status IN ('planned', 'active', 'on_hold', 'delayed')
       ORDER BY LOWER(site.name), site.site_number`,
      [context.companyId]
    ),
    client.query(
      `SELECT assignment.id, assignment.user_id, assignment.construction_site_id,
              assignment.work_date,
              assignment.sequence_number, assignment.planned_start_time::TEXT,
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
    )
  ]);

  const weekAssignments = assignmentResult.rows.map((row) => ({
    id: row.id,
    employeeId: row.user_id,
    constructionSiteId: row.construction_site_id,
    workDate: databaseDate(row.work_date),
    sequenceNumber: row.sequence_number,
    plannedStartTime: row.planned_start_time,
    employeeName: `${row.first_name} ${row.last_name}`,
    siteName: row.site_name
  }));

  return {
    date,
    weekStart,
    canCreateManagementRoles: roles.has("admin"),
    employees: employeeResult.rows.map(employeeDto),
    sites: siteResult.rows.map(siteDto),
    assignments: weekAssignments.filter((assignment) => assignment.workDate === date),
    weekAssignments
  };
}

function publicAssignmentImportPreview(preview) {
  const { readyRows, rows, ...publicPreview } = preview;
  return {
    ...publicPreview,
    rows: rows.slice(0, 250),
    rowsTruncated: rows.length > 250
  };
}

async function prepareAssignmentImport(client, context, plan) {
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
    }))
  );
}

async function importAssignmentsFromWorkbook(client, context, plan, fileName) {
  const preview = await prepareAssignmentImport(client, context, plan);
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

async function createEmployee(client, context, input) {
  const roles = await requirePlanner(client, context);
  if (ADMIN_ASSIGNED_ROLES.has(input.role) && !roles.has("admin")) {
    throw new InputError("Nur ein Admin darf Rollen für Planung und Verwaltung vergeben.", 403, "forbidden");
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

async function createSiteBundle(client, context, input) {
  await requirePlanner(client, context);
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
     RETURNING id, site_number, name, installer_short_text`,
    [context.companyId, project.rows[0].id, location.rows[0].id, input.siteName, input.installerShortText]
  );
  return siteDto({
    ...site.rows[0],
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
      "SELECT 1 FROM users WHERE company_id = $1 AND id = $2 AND status = 'active'",
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
       planned_start_time, status, comment, created_by_user_id, changed_by_user_id
     ) VALUES ($1, $2, $3, $4, $5, $6, 'released', $7, $8, $8)
     RETURNING id, sequence_number, planned_start_time::TEXT`,
    [
      context.companyId,
      input.employeeId,
      input.constructionSiteId,
      input.workDate,
      sequence.rows[0].next_sequence,
      input.plannedStartTime,
      input.comment,
      context.userId
    ]
  );
  return {
    id: inserted.rows[0].id,
    employeeId: input.employeeId,
    constructionSiteId: input.constructionSiteId,
    workDate: input.workDate,
    sequenceNumber: inserted.rows[0].sequence_number,
    plannedStartTime: inserted.rows[0].planned_start_time
  };
}

async function updateAssignment(client, context, assignmentId, input) {
  await requirePlanner(client, context);
  const current = await client.query(
    `SELECT id, user_id, work_date, sequence_number, status
     FROM site_assignments
     WHERE company_id = $1 AND id = $2
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
         changed_by_user_id = $6,
         last_change_reason = $7
     WHERE company_id = $1 AND id = $2
     RETURNING id, user_id, construction_site_id, work_date,
               sequence_number, planned_start_time::TEXT, status`,
    [
      context.companyId,
      assignmentId,
      input.workDate,
      sequenceNumber,
      input.plannedStartTime,
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
    status: row.status
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

  if (input.constructionSiteId) {
    const assignment = await client.query(
      `SELECT 1 FROM site_assignments
       WHERE company_id = $1 AND user_id = $2 AND construction_site_id = $3
         AND work_date = $4 AND status IN ('released', 'completed')`,
      [context.companyId, context.userId, input.constructionSiteId, workDate]
    );
    if (assignment.rowCount === 0) {
      throw new InputError("Die Baustelle ist für diesen Arbeitstag nicht freigegeben.", 403, "site_not_assigned");
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

      if (request.method === "POST" && url.pathname === "/api/v1/admin/assignment-imports/preview") {
        await withReadySession(pool, tokenHash, requirePlanner);
        const { workbook } = validateAssignmentImportPayload(await readJson(request, 2_100_000));
        const plan = await parseAssignmentWorkbook(workbook);
        const preview = await withReadySession(
          pool,
          tokenHash,
          (client, context) => prepareAssignmentImport(client, context, plan)
        );
        return json(response, 200, { importPreview: publicAssignmentImportPreview(preview) });
      }

      if (request.method === "POST" && url.pathname === "/api/v1/admin/assignment-imports") {
        await withReadySession(pool, tokenHash, requirePlanner);
        const { fileName, workbook } = validateAssignmentImportPayload(await readJson(request, 2_100_000));
        const plan = await parseAssignmentWorkbook(workbook);
        const result = await withReadySession(
          pool,
          tokenHash,
          (client, context) => importAssignmentsFromWorkbook(client, context, plan, fileName)
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
