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
  expectedNextTypes,
  InputError,
  localDate,
  readJson,
  validateInitialSetup,
  validateLogin,
  validateTimeEntry,
  validateWorkDate
} from "./validation.mjs";

const DUMMY_HASH = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$zJbDCEum4Q2YZolIS8tIPfMbbOMR2eM8lXJj1i9Cq2Q";

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
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
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

      const workDayMatch = /^\/api\/v1\/work-days\/(\d{4}-\d{2}-\d{2})$/.exec(url.pathname);
      if (request.method === "GET" && workDayMatch) {
        const date = validateWorkDate(workDayMatch[1]);
        const day = await withSessionTransaction(pool, tokenHash, (client, context) => getWorkDay(client, context, date));
        return json(response, 200, { workDay: day });
      }

      const assignmentMatch = /^\/api\/v1\/site-assignments\/(\d{4}-\d{2}-\d{2})$/.exec(url.pathname);
      if (request.method === "GET" && assignmentMatch) {
        const date = validateWorkDate(assignmentMatch[1]);
        const assignments = await withSessionTransaction(
          pool,
          tokenHash,
          (client, context) => getAssignments(client, context, date)
        );
        return json(response, 200, { assignments });
      }

      if (request.method === "POST" && url.pathname === "/api/v1/time-entries") {
        const input = validateTimeEntry(await readJson(request));
        const entry = await withSessionTransaction(
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
