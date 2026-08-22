import { randomUUID } from "node:crypto";
import {
  platformSessionView,
  withPlatformSessionTransaction,
  withPlatformTransaction
} from "./database.mjs";
import { createTemporaryPassword, hashPassword, verifyPassword } from "./password.mjs";
import {
  clientIp,
  createSessionToken,
  hashSessionToken,
  parseCookies,
  PLATFORM_SESSION_COOKIE,
  platformSessionCookie,
  secretsEqual
} from "./security.mjs";
import { securityHeaders } from "./static.mjs";
import { InputError, readJson, validateId } from "./validation.mjs";

const DUMMY_HASH = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$zJbDCEum4Q2YZolIS8tIPfMbbOMR2eM8lXJj1i9Cq2Q";
const COMPANY_STATUSES = new Set([
  "trial", "active", "payment_due", "restricted", "suspended",
  "cancelled", "archived", "pending_deletion"
]);
const SUPPORT_REASONS = new Set([
  "support_request", "technical_analysis", "setup", "data_correction",
  "migration", "restore"
]);
const ANNOUNCEMENT_SCOPES = new Set([
  "all", "companies", "plans", "modules", "company_roles", "user_groups"
]);
const KNOWN_PLATFORM_PERMISSIONS = new Set([
  "*", "dashboard.read", "companies.read", "companies.create",
  "companies.manage", "companies.trials", "accounts.read", "accounts.unlock",
  "accounts.manage", "platform_users.manage", "platform_roles.manage",
  "contracts.assign", "contracts.manage", "plans.manage", "modules.manage",
  "support.manage", "support.access", "health.manage", "errors.manage",
  "versions.manage", "announcements.manage", "backups.manage",
  "privacy.manage", "audit.read", "settings.manage"
]);
const CLIENT_IP = Symbol("schaefchenClientIp");

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

export function requiredText(value, name, maximum = 1000) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maximum) {
    throw new InputError(`${name} ist erforderlich und darf höchstens ${maximum} Zeichen lang sein.`);
  }
  return value.trim();
}

export function optionalText(value, name, maximum = 1000) {
  if (value == null || value === "") return null;
  return requiredText(value, name, maximum);
}

export function integer(value, name, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new InputError(`${name} ist ungültig.`);
  }
  return value;
}

export function enumValue(value, allowed, name) {
  if (!allowed.has(value)) throw new InputError(`${name} ist ungültig.`);
  return value;
}

export function optionalTimestamp(value, name) {
  if (value == null || value === "") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) throw new InputError(`${name} ist ungültig.`);
  return parsed.toISOString();
}

async function ensureCompany(client, companyId) {
  const company = await client.query(
    "SELECT id,company_number,display_name FROM companies WHERE id = $1",
    [companyId]
  );
  if (company.rowCount !== 1) {
    throw new InputError("Die Firma wurde nicht gefunden.", 404, "company_not_found");
  }
  return company.rows[0];
}

async function ensurePlatformAssignee(client, value) {
  if (value == null || value === "") return null;
  const id = validateId(value, "Administrator-ID");
  const account = await client.query(
    "SELECT id FROM platform_users WHERE id = $1 AND status = 'active'",
    [id]
  );
  if (account.rowCount !== 1) {
    throw new InputError("Der zuständige Plattformadministrator ist nicht aktiv.", 409, "platform_assignee_unavailable");
  }
  return id;
}

async function validateAnnouncementTargets(client, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InputError("Die Empfängerauswahl ist ungültig.");
  }
  const scope = enumValue(value.scope, ANNOUNCEMENT_SCOPES, "Empfängergruppe");
  if (scope === "all") return { scope: "all" };
  if (!Array.isArray(value.values) || value.values.length === 0 || value.values.length > 250) {
    throw new InputError("Für die Empfängergruppe ist mindestens ein Ziel erforderlich.");
  }
  const values = [...new Set(value.values.map((item) => requiredText(item, "Empfängerwert", 120)))];
  let result;
  if (scope === "companies") {
    const ids = values.map((item) => validateId(item, "Firmen-ID"));
    result = await client.query("SELECT id::TEXT AS value FROM companies WHERE id = ANY($1::UUID[])", [ids]);
  } else if (scope === "plans") {
    result = await client.query("SELECT plan_key AS value FROM license_plans WHERE plan_key = ANY($1::VARCHAR[])", [values]);
  } else if (scope === "modules") {
    result = await client.query("SELECT module_key AS value FROM module_catalog WHERE module_key = ANY($1::VARCHAR[])", [values]);
  } else {
    result = await client.query("SELECT DISTINCT role_key AS value FROM roles WHERE role_key = ANY($1::VARCHAR[])", [values]);
  }
  const found = new Set(result.rows.map((row) => row.value));
  const missing = values.filter((item) => !found.has(item));
  if (missing.length) throw new InputError(`Unbekannte Empfängerwerte: ${missing.join(", ")}.`);
  return { scope, values };
}

async function validatedSettingValue(client, key, value) {
  const stringSettings = new Map([
    ["platform.name", 120], ["support.contact", 254], ["email.sender", 254],
    ["legal.privacy_policy", 100_000], ["legal.terms", 100_000],
    ["legal.imprint", 100_000], ["release.notes", 50_000]
  ]);
  if (stringSettings.has(key)) {
    const text = requiredText(value, "Einstellungswert", stringSettings.get(key));
    if (key === "email.sender" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
      throw new InputError("Die Absender-E-Mail ist ungültig.");
    }
    return text;
  }
  if (key === "platform.default_logo") {
    if (value == null) return null;
    return requiredText(value, "Standardlogo", 500);
  }
  if (["registration.self_service_enabled", "security.require_two_factor", "maintenance.enabled"].includes(key)) {
    if (typeof value !== "boolean") throw new InputError("Der Einstellungswert muss Ja oder Nein sein.");
    return value;
  }
  const integerRanges = {
    "trial.default_days": [0, 365], "security.session_minutes": [5, 43_200],
    "files.max_size_bytes": [1_024, 5_368_709_120],
    "storage.default_limit_bytes": [0, Number.MAX_SAFE_INTEGER],
    "retention.default_days": [1, 36_500]
  };
  if (Object.hasOwn(integerRanges, key)) {
    return integer(value, "Einstellungswert", ...integerRanges[key]);
  }
  if (key === "security.password_policy") {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new InputError("Die Passwortregeln sind ungültig.");
    }
    const policy = {
      minLength: integer(value.minLength, "Mindestlänge", 12, 256),
      requireUpper: Boolean(value.requireUpper), requireLower: Boolean(value.requireLower),
      requireNumber: Boolean(value.requireNumber)
    };
    return policy;
  }
  if (key === "files.allowed_types") {
    if (!Array.isArray(value) || value.length === 0 || value.length > 50
        || value.some((item) => typeof item !== "string" || !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(item))) {
      throw new InputError("Die erlaubten Dateiformate sind ungültig.");
    }
    return [...new Set(value)];
  }
  if (key === "companies.default_plan") {
    const planKey = requiredText(value, "Standardtarif", 60);
    const plan = await client.query(
      "SELECT 1 FROM license_plans WHERE plan_key = $1 AND status = 'active'",
      [planKey]
    );
    if (plan.rowCount !== 1) throw new InputError("Der Standardtarif ist nicht aktiv.");
    return planKey;
  }
  if (key === "companies.default_modules") {
    if (!Array.isArray(value) || value.length > 50) throw new InputError("Die Standardmodule sind ungültig.");
    const keys = [...new Set(value.map((item) => requiredText(item, "Modulschlüssel", 60)))];
    const modules = await client.query(
      "SELECT module_key FROM module_catalog WHERE module_key = ANY($1::VARCHAR[]) AND status = 'active'",
      [keys]
    );
    if (modules.rowCount !== keys.length) throw new InputError("Mindestens ein Standardmodul ist unbekannt.");
    return keys;
  }
  throw new InputError("Diese Systemeinstellung ist nicht freigegeben.", 404, "setting_not_supported");
}

function requestIp(request) {
  const value = request[CLIENT_IP] || clientIp(request, 0);
  return value === "unknown" ? null : value;
}

async function consumeRateLimit(limiter, scope, key, limits, message, code) {
  const outcome = await limiter.consume(scope, key, limits);
  if (!outcome.allowed) {
    throw new InputError(message, 429, code, {
      retryAfterSeconds: outcome.retryAfterSeconds
    });
  }
}

function requestAppVersion(request) {
  const value = request.headers["x-schaefchen-version"];
  return typeof value === "string" && /^[0-9A-Za-z.+_-]{1,40}$/.test(value)
    ? value
    : null;
}

function camelKey(key) {
  return key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function publicValue(value) {
  if (Array.isArray(value)) return value.map(publicValue);
  if (!value || typeof value !== "object" || value instanceof Date) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    const numericVersion = key === "row_version" && typeof item === "string"
      ? Number(item)
      : Number.NaN;
    return [
      camelKey(key),
      Number.isSafeInteger(numericVersion) ? numericVersion : publicValue(item)
    ];
  }));
}

function publicRegistration(value) {
  if (!value) return value;
  const {
    invitation_token_hash: _invitationTokenHash,
    ...registration
  } = value;
  return publicValue(registration);
}

const AUDIT_REDACTED_KEYS = new Set([
  "password_hash", "passwordHash", "token_hash", "tokenHash",
  "invitation_token_hash", "invitationTokenHash", "setupToken",
  "temporaryPassword"
]);

function sanitizeAuditState(value) {
  if (Array.isArray(value)) return value.map(sanitizeAuditState);
  if (!value || typeof value !== "object" || value instanceof Date) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    AUDIT_REDACTED_KEYS.has(key) ? "[REDACTED]" : sanitizeAuditState(item)
  ]));
}

async function permissionsFor(client, platformUserId) {
  const result = await client.query(
    `SELECT DISTINCT permission.value
     FROM platform_user_roles AS assignment
     JOIN platform_roles AS role ON role.id = assignment.platform_role_id
     CROSS JOIN LATERAL jsonb_array_elements_text(role.permissions) AS permission(value)
     WHERE assignment.platform_user_id = $1 AND assignment.revoked_at IS NULL`,
    [platformUserId]
  );
  return new Set(result.rows.map((row) => row.value));
}

function requirePermission(permissions, permission) {
  if (permissions.has("*") || permissions.has(permission)) return;
  throw new InputError("Für diese Plattformaktion fehlt die Berechtigung.", 403, "platform_permission_forbidden");
}

function requireAnyPermission(permissions, allowed) {
  if (permissions.has("*") || allowed.some((permission) => permissions.has(permission))) return;
  throw new InputError("Für diese Plattformaktion fehlt die Berechtigung.", 403, "platform_permission_forbidden");
}

async function audit(client, context, request, {
  action,
  targetType,
  targetId = null,
  companyId = null,
  oldState = null,
  newState = null,
  reason,
  result = "success"
}) {
  await client.query(
    `INSERT INTO platform_audit_log (
       platform_user_id, platform_session_id, action, target_type, target_id,
       company_id, old_state, new_state, reason, ip_address,
       session_identifier, result
     ) VALUES ($1,$2::UUID,$3,$4,$5,$6,$7::JSONB,$8::JSONB,$9,$10,$2::UUID::TEXT,$11)`,
    [
      context.platformUserId,
      context.sessionId,
      action,
      targetType,
      targetId == null ? null : String(targetId),
      companyId,
      oldState == null ? null : JSON.stringify(sanitizeAuditState(oldState)),
      newState == null ? null : JSON.stringify(sanitizeAuditState(newState)),
      requiredText(reason, "Begründung", 1000),
      requestIp(request),
      result
    ]
  );
  const supportAccessId = request.headers["x-support-access-id"];
  if (companyId && typeof supportAccessId === "string"
      && /^[0-9a-f-]{36}$/i.test(supportAccessId)) {
    const supportChange = {
      action,
      targetType,
      targetId: targetId == null ? null : String(targetId),
      occurredAt: new Date().toISOString()
    };
    const active = await client.query(
      `UPDATE support_access_sessions
       SET changes = changes || $4::JSONB
       WHERE id = $1 AND platform_user_id = $2 AND company_id = $3
         AND ended_at IS NULL AND expires_at > CURRENT_TIMESTAMP
       RETURNING id`,
      [supportAccessId, context.platformUserId, companyId, JSON.stringify([supportChange])]
    );
    if (active.rowCount === 1) {
      await client.query(
        `INSERT INTO support_access_events (
           support_access_session_id,platform_user_id,event_type,area,details
         ) VALUES ($1,$2,'change_confirmed',$3,$4::JSONB)`,
        [supportAccessId, context.platformUserId, targetType, JSON.stringify(supportChange)]
      );
    }
  }
}

async function authenticated(pool, request, callback) {
  const token = parseCookies(request.headers.cookie)[PLATFORM_SESSION_COOKIE];
  if (!token || token.length < 40 || token.length > 128) {
    throw new InputError("Plattformanmeldung erforderlich.", 401, "unauthorized");
  }
  return withPlatformSessionTransaction(pool, hashSessionToken(token), async (client, context) => {
    const permissions = await permissionsFor(client, context.platformUserId);
    const supportAccessId = request.headers["x-support-access-id"];
    if (supportAccessId !== undefined) {
      if (typeof supportAccessId !== "string"
          || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(supportAccessId)) {
        throw new InputError("Der Supportmodus ist ungültig.", 409, "support_access_inactive");
      }
      const activeSupport = await client.query(
        `SELECT 1 FROM support_access_sessions
         WHERE id = $1 AND platform_user_id = $2
           AND ended_at IS NULL AND expires_at > CURRENT_TIMESTAMP`,
        [supportAccessId, context.platformUserId]
      );
      if (activeSupport.rowCount !== 1) {
        throw new InputError("Der Supportmodus ist nicht mehr aktiv.", 409, "support_access_inactive");
      }
    }
    return callback(client, context, permissions);
  });
}

async function setupStatus(pool) {
  return withPlatformTransaction(pool, async (client) => {
    const result = await client.query("SELECT COUNT(*)::INTEGER AS count FROM platform_users");
    return { required: result.rows[0].count === 0 };
  });
}

async function createPlatformSuperadmin(pool, config, limiter, request, body) {
  const rateKey = limiter.key(requestIp(request), "platform-setup");
  await consumeRateLimit(
    limiter,
    "platform_setup",
    rateKey,
    { maximum: 5, windowMs: 15 * 60 * 1000 },
    "Zu viele Einrichtungsversuche. Bitte später erneut versuchen.",
    "setup_rate_limited"
  );
  if (!config.platformSetupToken || !secretsEqual(body.setupToken, config.platformSetupToken)) {
    throw new InputError("Der Plattform-Einrichtungsschlüssel ist ungültig.", 403, "setup_forbidden");
  }
  const firstName = requiredText(body.firstName, "Vorname", 100);
  const lastName = requiredText(body.lastName, "Nachname", 100);
  const email = requiredText(body.email, "E-Mail-Adresse", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InputError("Die E-Mail-Adresse ist ungültig.");
  const passwordHash = await hashPassword(body.password);
  const account = await withPlatformTransaction(pool, async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('platform-initial-setup', 0))");
    const count = await client.query("SELECT COUNT(*)::INTEGER AS count FROM platform_users");
    if (count.rows[0].count !== 0) {
      throw new InputError("Die Plattformverwaltung wurde bereits eingerichtet.", 409, "setup_completed");
    }
    const account = await client.query(
      `INSERT INTO platform_users (first_name, last_name, email, password_hash)
       VALUES ($1,$2,$3,$4)
       RETURNING id, first_name, last_name, email`,
      [firstName, lastName, email, passwordHash]
    );
    await client.query(
      `INSERT INTO platform_user_roles (
         platform_user_id, platform_role_id, reason
       )
       SELECT $1, id, 'Ersteinrichtung der Plattformverwaltung'
       FROM platform_roles WHERE role_key = 'superadmin'`,
      [account.rows[0].id]
    );
    await client.query(
      "SELECT set_config('app.current_platform_user_id', $1, TRUE)",
      [account.rows[0].id]
    );
    await client.query(
      `INSERT INTO platform_audit_log (
         platform_user_id, action, target_type, target_id, new_state, reason,
         session_identifier, result
       ) VALUES ($1::UUID,'platform.setup','platform_user',$1::UUID::TEXT,$2::JSONB,
                 'Ersteinrichtung der Plattformverwaltung','initial-setup','success')`,
      [account.rows[0].id, JSON.stringify(account.rows[0])]
    );
    return publicValue(account.rows[0]);
  });
  await limiter.clearBucket("platform_setup", rateKey);
  return account;
}

async function login(pool, config, limiter, request, body) {
  const email = requiredText(body.email, "E-Mail-Adresse", 254).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  const rateKey = limiter.key(requestIp(request), "platform", email);
  const ipKey = limiter.key(requestIp(request), "platform-login");
  await consumeRateLimit(
    limiter,
    "platform_login_ip",
    ipKey,
    { maximum: 30, windowMs: 15 * 60 * 1000 },
    "Zu viele Anmeldeversuche von diesem Anschluss.",
    "login_rate_limited"
  );
  await consumeRateLimit(
    limiter,
    "platform_login_identity",
    rateKey,
    { maximum: 5, windowMs: 15 * 60 * 1000 },
    "Zu viele fehlgeschlagene Anmeldeversuche.",
    "login_rate_limited"
  );
  const lookup = await withPlatformTransaction(
    pool,
    (client) => client.query(
      `SELECT platform_user_id, password_hash, two_factor_enabled,
              failed_login_attempts, locked_until
       FROM api_lookup_platform_user($1)`,
      [email]
    )
  );
  const row = lookup.rows[0];
  const valid = await verifyPassword(password, row?.password_hash || DUMMY_HASH);
  if (!row || !valid) {
    if (row?.platform_user_id) {
      await withPlatformTransaction(pool, (client) => client.query(
        `UPDATE platform_users
         SET failed_login_attempts = failed_login_attempts + 1,
             locked_until = CASE WHEN failed_login_attempts + 1 >= 10
               THEN CURRENT_TIMESTAMP + INTERVAL '30 minutes' ELSE locked_until END
         WHERE id = $1`,
        [row.platform_user_id]
      ));
    }
    throw new InputError("E-Mail-Adresse oder Passwort ist falsch.", 401, "login_failed");
  }
  await limiter.clearBucket("platform_login_identity", rateKey);
  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);
  const result = await withPlatformTransaction(pool, async (client) => {
    const session = await client.query(
      `INSERT INTO platform_sessions (
         platform_user_id, token_hash, authentication_method, ip_address,
         user_agent, expires_at, app_version
       ) VALUES ($1,$2,'password',$3,$4,CURRENT_TIMESTAMP + ($5 * INTERVAL '1 second'),$6)
       RETURNING id, expires_at`,
      [
        row.platform_user_id, tokenHash, requestIp(request),
        request.headers["user-agent"] || null, config.sessionTtlSeconds,
        requestAppVersion(request)
      ]
    );
    await client.query(
      `UPDATE platform_users SET last_login_at = CURRENT_TIMESTAMP,
              failed_login_attempts = 0, locked_until = NULL
       WHERE id = $1`,
      [row.platform_user_id]
    );
    const context = {
      sessionId: session.rows[0].id,
      platformUserId: row.platform_user_id,
      expiresAt: session.rows[0].expires_at
    };
    await client.query("SELECT set_config('app.current_platform_user_id', $1, TRUE)", [row.platform_user_id]);
    return platformSessionView(client, context);
  });
  return { token, session: result };
}

function pagination(url) {
  const page = integer(Number(url.searchParams.get("page") || 1), "Seite", 1, 1_000_000);
  const pageSize = integer(Number(url.searchParams.get("pageSize") || 25), "Seitengröße", 1, 100);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

async function dashboard(client) {
  const result = await client.query(
    `SELECT
       (SELECT COUNT(*)::INTEGER FROM companies) AS companies_total,
       (SELECT COUNT(*)::INTEGER FROM companies WHERE status = 'active') AS companies_active,
       (SELECT COUNT(*)::INTEGER FROM companies WHERE status = 'trial') AS companies_trial,
       (SELECT COUNT(*)::INTEGER FROM companies WHERE status IN ('suspended','restricted')) AS companies_disabled,
       (SELECT COUNT(*)::INTEGER FROM companies WHERE status = 'cancelled') AS companies_cancelled,
       (SELECT COUNT(*)::INTEGER FROM users
        WHERE status = 'active' AND (locked_until IS NULL OR locked_until <= CURRENT_TIMESTAMP)) AS accounts_active,
       (SELECT COUNT(*)::INTEGER FROM users
        WHERE status <> 'active' OR locked_until > CURRENT_TIMESTAMP) AS accounts_blocked,
       (SELECT COUNT(*)::INTEGER FROM company_contracts WHERE status IN ('active','trial')) AS licenses_active,
       (SELECT COUNT(*)::INTEGER FROM companies WHERE trial_ends_at BETWEEN CURRENT_TIMESTAMP AND CURRENT_TIMESTAMP + INTERVAL '14 days') AS trials_expiring,
       (SELECT COUNT(*)::INTEGER FROM companies WHERE contract_ends_at BETWEEN CURRENT_TIMESTAMP AND CURRENT_TIMESTAMP + INTERVAL '30 days') AS contracts_expiring,
       (SELECT COALESCE(SUM(storage_used_bytes),0)::BIGINT FROM companies) AS storage_used_bytes,
       (SELECT COUNT(*)::INTEGER FROM system_health_components WHERE status = 'outage') AS components_outage,
       (SELECT status FROM platform_backup_runs ORDER BY requested_at DESC LIMIT 1) AS backup_status,
       (SELECT version FROM application_versions WHERE release_status = 'production' ORDER BY released_at DESC NULLS LAST LIMIT 1) AS application_version,
       (SELECT COUNT(*)::INTEGER FROM platform_error_groups WHERE severity = 'critical' AND status <> 'resolved') AS critical_errors,
       (SELECT COUNT(*)::INTEGER FROM support_tickets WHERE status NOT IN ('resolved','closed')) AS support_open,
       (SELECT COUNT(*)::INTEGER FROM background_process_runs WHERE status = 'failed' AND started_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours') AS failed_jobs`
  );
  return publicValue(result.rows[0]);
}

async function listCompanies(client, url) {
  const { page, pageSize, offset } = pagination(url);
  const search = (url.searchParams.get("search") || "").trim();
  const status = url.searchParams.get("status");
  if (status && status !== "disabled") enumValue(status, COMPANY_STATUSES, "Firmenstatus");
  const sortColumns = new Map([
    ["name", "company.display_name"], ["number", "company.company_number"],
    ["registered", "company.created_at"], ["lastLogin", "company.last_active_login_at"],
    ["status", "company.status"]
  ]);
  const sort = sortColumns.get(url.searchParams.get("sort") || "name") || sortColumns.get("name");
  const direction = url.searchParams.get("direction") === "desc" ? "DESC" : "ASC";
  const result = await client.query(
    `SELECT company.id, company.company_number, company.legal_name, company.display_name,
            company.contact_name, COALESCE(company.contact_email, company.email) AS contact_email,
            company.status, company.license_plan, company.user_limit,
            company.storage_used_bytes, company.storage_limit_bytes, company.created_at,
            company.last_active_login_at, company.row_version,
            (SELECT COUNT(*)::INTEGER FROM users AS account
             WHERE account.company_id = company.id AND account.status = 'active') AS active_user_count,
            COALESCE((SELECT jsonb_agg(catalog.module_key ORDER BY catalog.module_key)
              FROM company_module_entitlements AS entitlement
              JOIN module_catalog AS catalog ON catalog.id = entitlement.module_id
              WHERE entitlement.company_id = company.id
                AND entitlement.entitlement_status <> 'inactive'
                AND (entitlement.starts_at IS NULL OR entitlement.starts_at <= CURRENT_TIMESTAMP)
                AND (entitlement.ends_at IS NULL OR entitlement.ends_at > CURRENT_TIMESTAMP)), '[]'::jsonb) AS active_modules,
            COUNT(*) OVER()::INTEGER AS total_count
     FROM companies AS company
     WHERE ($1 = '' OR company.display_name ILIKE '%' || $1 || '%'
                     OR company.legal_name ILIKE '%' || $1 || '%'
                     OR company.company_number ILIKE '%' || $1 || '%'
                     OR COALESCE(company.contact_email, company.email, '') ILIKE '%' || $1 || '%')
       AND (
         $2::VARCHAR IS NULL
         OR ($2::VARCHAR = 'disabled' AND company.status IN ('suspended','restricted'))
         OR company.status = $2
       )
     ORDER BY ${sort} ${direction}, company.id
     LIMIT $3 OFFSET $4`,
    [search, status || null, pageSize, offset]
  );
  return {
    items: publicValue(result.rows.map(({ total_count: _total, ...row }) => row)),
    pagination: { page, pageSize, total: Number(result.rows[0]?.total_count || 0) }
  };
}

async function companyDetail(client, companyId) {
  const company = await client.query(
    `SELECT company.*,
            (SELECT COUNT(*)::INTEGER FROM users WHERE company_id = company.id AND status = 'active') AS active_user_count,
            (SELECT COUNT(*)::INTEGER FROM support_tickets WHERE company_id = company.id AND status NOT IN ('resolved','closed')) AS open_support_count,
            (SELECT MAX(last_login_at) FROM users WHERE company_id = company.id) AS last_active_login_at,
            (SELECT MAX(occurred_at) FROM platform_audit_log WHERE company_id = company.id) AS last_platform_activity_at
     FROM companies AS company WHERE company.id = $1`,
    [companyId]
  );
  if (company.rowCount !== 1) throw new InputError("Die Firma wurde nicht gefunden.", 404, "company_not_found");
  const modules = await client.query(
    `SELECT catalog.module_key, catalog.name, catalog.description, catalog.category,
            catalog.is_special, catalog.dependencies, entitlement.id AS entitlement_id,
            COALESCE(entitlement.entitlement_status, 'inactive') AS entitlement_status,
            entitlement.starts_at, entitlement.ends_at, entitlement.included_in_plan,
            entitlement.separately_billed, entitlement.user_limit,
            COALESCE(entitlement.feature_scope, catalog.default_feature_scope) AS feature_scope,
            entitlement.row_version
     FROM module_catalog AS catalog
     LEFT JOIN company_module_entitlements AS entitlement
       ON entitlement.module_id = catalog.id AND entitlement.company_id = $1
     WHERE catalog.status = 'active' ORDER BY catalog.category, catalog.name`,
    [companyId]
  );
  const contracts = await client.query(
    `SELECT contract.*, plan.name AS plan_name, version.version_number
     FROM company_contracts AS contract
     LEFT JOIN license_plan_versions AS version ON version.id = contract.license_plan_version_id
     LEFT JOIN license_plans AS plan ON plan.id = version.license_plan_id
     WHERE contract.company_id = $1 ORDER BY contract.created_at DESC`,
    [companyId]
  );
  const supportCases = await client.query(
    `SELECT id,ticket_number,subject,category,priority,status,assigned_platform_user_id,
            created_at,updated_at
     FROM support_tickets WHERE company_id = $1
     ORDER BY updated_at DESC LIMIT 50`,
    [companyId]
  );
  return publicValue({
    company: company.rows[0], modules: modules.rows,
    contracts: contracts.rows, supportCases: supportCases.rows
  });
}

function updateStatement(body, mapping, startIndex = 1) {
  const sets = [];
  const values = [];
  for (const [inputKey, column] of Object.entries(mapping)) {
    if (!Object.hasOwn(body, inputKey)) continue;
    values.push(body[inputKey]);
    sets.push(`${column} = $${startIndex + values.length - 1}`);
  }
  return { sets, values };
}

async function updateCompany(client, context, permissions, request, companyId, body) {
  const changedKeys = new Set(Object.keys(body).filter((key) => !["reason", "rowVersion", "confirmation"].includes(key)));
  const identityKeys = ["legalName", "displayName", "contactName", "contactEmail", "email", "phone", "street", "houseNumber", "postalCode", "city", "userLimit", "storageLimitBytes", "deletionScheduledAt"];
  const trialKeys = ["trialEndsAt"];
  const contractKeys = ["licensePlan", "licenseValidUntil", "contractEndsAt", "cancellationRecordedAt"];
  if (identityKeys.some((key) => changedKeys.has(key))) requirePermission(permissions, "companies.manage");
  if (trialKeys.some((key) => changedKeys.has(key))) requireAnyPermission(permissions, ["companies.manage", "companies.trials"]);
  if (contractKeys.some((key) => changedKeys.has(key))) requireAnyPermission(permissions, ["companies.manage", "contracts.assign", "contracts.manage"]);
  if (changedKeys.has("status")) {
    const statusPermissions = ["companies.manage"];
    if (["trial", "active"].includes(body.status)) statusPermissions.push("companies.trials", "contracts.assign");
    if (["payment_due", "restricted", "suspended", "cancelled"].includes(body.status)) statusPermissions.push("contracts.manage");
    requireAnyPermission(permissions, statusPermissions);
  }
  const reason = requiredText(body.reason, "Begründung", 1000);
  const rowVersion = integer(body.rowVersion, "Datenversion", 1);
  if (body.status) enumValue(body.status, COMPANY_STATUSES, "Firmenstatus");
  if (Object.hasOwn(body, "userLimit") && body.userLimit != null) {
    integer(body.userLimit, "Benutzerlimit", 1);
  }
  if (Object.hasOwn(body, "storageLimitBytes") && body.storageLimitBytes != null) {
    integer(body.storageLimitBytes, "Speicherlimit", 0);
  }
  if (Object.hasOwn(body, "legalName")) body.legalName = requiredText(body.legalName, "Firmenname", 200);
  if (Object.hasOwn(body, "displayName")) body.displayName = requiredText(body.displayName, "Anzeigename", 120);
  for (const [key, label, maximum] of [
    ["contactName", "Ansprechpartner", 200], ["contactEmail", "E-Mail-Adresse", 254],
    ["email", "Firmen-E-Mail", 254], ["phone", "Telefon", 50], ["street", "Straße", 150],
    ["houseNumber", "Hausnummer", 30], ["postalCode", "Postleitzahl", 20], ["city", "Ort", 120]
  ]) {
    if (Object.hasOwn(body, key)) body[key] = optionalText(body[key], label, maximum);
  }
  if (Object.hasOwn(body, "contactEmail") && body.contactEmail) body.contactEmail = body.contactEmail.toLowerCase();
  if (Object.hasOwn(body, "email") && body.email) body.email = body.email.toLowerCase();
  if (Object.hasOwn(body, "licensePlan")) {
    body.licensePlan = requiredText(body.licensePlan, "Tarif", 60).toLowerCase();
    if (!/^[a-z][a-z0-9_]*$/.test(body.licensePlan)) throw new InputError("Der Tarifschlüssel ist ungültig.");
    const plan = await client.query(
      "SELECT 1 FROM license_plans WHERE plan_key = $1 AND status IN ('active','draft')",
      [body.licensePlan]
    );
    if (plan.rowCount !== 1) throw new InputError("Der Tarif wurde nicht gefunden.", 404, "plan_not_found");
  }
  for (const [key, label] of [
    ["licenseValidUntil", "Lizenzende"], ["trialEndsAt", "Testphasenende"],
    ["contractEndsAt", "Vertragsende"], ["cancellationRecordedAt", "Kündigungsdatum"],
    ["deletionScheduledAt", "Löschdatum"]
  ]) {
    if (Object.hasOwn(body, key)) body[key] = optionalTimestamp(body[key], label);
  }
  const before = await client.query("SELECT * FROM companies WHERE id = $1 FOR UPDATE", [companyId]);
  if (before.rowCount !== 1) throw new InputError("Die Firma wurde nicht gefunden.", 404, "company_not_found");
  const criticalStatusChange = Object.hasOwn(body, "status")
    && body.status !== before.rows[0].status
    && ["suspended", "cancelled", "archived", "pending_deletion"].includes(body.status);
  const criticalLifecycleDateChange = [
    ["cancellationRecordedAt", "cancellation_recorded_at"],
    ["deletionScheduledAt", "deletion_scheduled_at"]
  ].some(([inputKey, column]) => Object.hasOwn(body, inputKey)
    && (body[inputKey] ? new Date(body[inputKey]).valueOf() : null)
      !== (before.rows[0][column] ? new Date(before.rows[0][column]).valueOf() : null));
  if ((criticalStatusChange || criticalLifecycleDateChange)
      && body.confirmation !== before.rows[0].company_number) {
    throw new InputError(
      "Die kritische Statusänderung benötigt die Kundennummer als Bestätigung.",
      409,
      "company_confirmation_required"
    );
  }
  const { sets, values } = updateStatement(body, {
    legalName: "legal_name", displayName: "display_name", contactName: "contact_name",
    contactEmail: "contact_email", email: "email", phone: "phone", street: "street",
    houseNumber: "house_number", postalCode: "postal_code", city: "city",
    status: "status", licensePlan: "license_plan", licenseValidUntil: "license_valid_until",
    userLimit: "user_limit", storageLimitBytes: "storage_limit_bytes",
    trialEndsAt: "trial_ends_at", contractEndsAt: "contract_ends_at",
    cancellationRecordedAt: "cancellation_recorded_at",
    deletionScheduledAt: "deletion_scheduled_at"
  });
  if (sets.length === 0) throw new InputError("Es wurden keine Änderungen übermittelt.");
  values.push(companyId, rowVersion);
  const updated = await client.query(
    `UPDATE companies SET ${sets.join(", ")}
     WHERE id = $${values.length - 1} AND row_version = $${values.length}
     RETURNING *`,
    values
  );
  if (updated.rowCount !== 1) throw new InputError("Die Firma wurde zwischenzeitlich geändert.", 409, "stale_write");
  await audit(client, context, request, {
    action: "company.update", targetType: "company", targetId: companyId, companyId,
    oldState: before.rows[0], newState: updated.rows[0], reason
  });
  return publicValue(updated.rows[0]);
}

// Legt den ersten Firmenadministrator an.
//
// Eine ueber "Firma anlegen" erzeugte Firma hatte bisher keinen Benutzer und
// keinen Weg, einen zu bekommen: die Ersteinrichtung der App gilt nur fuer die
// im Server hinterlegte erste Firma. Solche Firmen blieben dauerhaft
// unbenutzbar.
//
// Der Weg ist bewusst eng: er greift nur, solange die Firma keinen aktiven
// Administrator hat. Danach vergibt die Firma ihre Konten selbst; die
// Plattform legt keine Benutzer in einem laufenden Betrieb an.
async function createFirstCompanyAdministrator(client, context, permissions, request, companyId, body) {
  requirePermission(permissions, "companies.manage");
  const company = await ensureCompany(client, companyId);
  const reason = requiredText(body.reason, "Begründung", 1000);
  const personnelNumber = requiredText(body.personnelNumber, "Personalnummer", 30);
  const firstName = requiredText(body.firstName, "Vorname", 100);
  const lastName = requiredText(body.lastName, "Nachname", 100);
  const temporaryPassword = requiredText(body.temporaryPassword, "Startpasswort", 256);
  if (temporaryPassword.length < 12) {
    throw new InputError("Das Startpasswort ist zu kurz.");
  }

  const vorhandene = await client.query(
    `SELECT 1
     FROM users AS account
     JOIN user_roles AS zuweisung
       ON zuweisung.company_id = account.company_id AND zuweisung.user_id = account.id
      AND zuweisung.revoked_at IS NULL
     JOIN roles AS rolle
       ON rolle.company_id = zuweisung.company_id AND rolle.id = zuweisung.role_id
     WHERE account.company_id = $1 AND account.status = 'active'
       AND rolle.role_key = 'admin' AND rolle.status = 'active'
     LIMIT 1`,
    [companyId]
  );
  if (vorhandene.rowCount > 0) {
    throw new InputError(
      "Diese Firma hat bereits eine Administration. Weitere Konten vergibt sie selbst.",
      409,
      "company_administrator_exists"
    );
  }

  const user = await client.query(
    `INSERT INTO users (
       company_id, personnel_number, first_name, last_name, email,
       password_hash, must_change_password, status
     ) VALUES ($1,$2,$3,$4,$5,$6,TRUE,'active')
     RETURNING id, personnel_number`,
    [
      companyId, personnelNumber, firstName, lastName,
      optionalText(body.email, "E-Mail-Adresse", 254)?.toLowerCase() || company.contact_email || null,
      await hashPassword(temporaryPassword)
    ]
  );
  const zuweisung = await client.query(
    `INSERT INTO user_roles (company_id, user_id, role_id, reason)
     SELECT $1, $2, id, $3 FROM roles
     WHERE company_id = $1 AND role_key = 'admin' AND status = 'active'`,
    [companyId, user.rows[0].id, "Erster Firmenadministrator durch die Plattformverwaltung"]
  );
  if (zuweisung.rowCount !== 1) {
    throw new InputError("Für diese Firma fehlt die Adminrolle.", 409, "company_admin_role_missing");
  }

  await audit(client, context, request, {
    action: "company.first_administrator_created",
    targetType: "user",
    targetId: user.rows[0].id,
    companyId,
    newState: { personnelNumber: user.rows[0].personnel_number },
    reason
  });

  return {
    companyNumber: company.company_number,
    personnelNumber: user.rows[0].personnel_number,
    mustChangePassword: true
  };
}

async function createCompany(client, context, permissions, request, body) {
  requirePermission(permissions, "companies.create");
  const legalName = requiredText(body.legalName, "Firmenname", 200);
  const displayName = requiredText(body.displayName || body.legalName, "Anzeigename", 120);
  const status = enumValue(body.status || (body.isTestCompany ? "trial" : "active"), COMPANY_STATUSES, "Firmenstatus");
  if (!["trial", "active"].includes(status)) requirePermission(permissions, "companies.manage");
  const reason = requiredText(body.reason, "Begründung", 1000);
  const licensePlan = requiredText(body.licensePlan || "standard", "Tarif", 60).toLowerCase();
  if (!/^[a-z][a-z0-9_]*$/.test(licensePlan)) throw new InputError("Der Tarifschlüssel ist ungültig.");
  const plan = await client.query(
    "SELECT 1 FROM license_plans WHERE plan_key = $1 AND status IN ('active','draft')",
    [licensePlan]
  );
  if (plan.rowCount !== 1) throw new InputError("Der Tarif wurde nicht gefunden.", 404, "plan_not_found");
  const result = await client.query(
    `INSERT INTO companies (
       legal_name, display_name, status, contact_name, contact_email, email,
       phone, license_plan, user_limit, storage_limit_bytes, trial_ends_at,
       registration_completed_at
     ) VALUES ($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,$10,CURRENT_TIMESTAMP)
     RETURNING *`,
    [
      legalName, displayName, status, optionalText(body.contactName, "Ansprechpartner", 200),
      optionalText(body.contactEmail, "E-Mail-Adresse", 254)?.toLowerCase(),
      optionalText(body.phone, "Telefon", 50), licensePlan,
      body.userLimit == null ? null : integer(body.userLimit, "Benutzerlimit", 1),
      body.storageLimitBytes == null ? null : integer(body.storageLimitBytes, "Speicherlimit", 0),
      optionalTimestamp(body.trialEndsAt, "Testphasenende")
    ]
  );
  const company = result.rows[0];
  await audit(client, context, request, {
    action: body.isTestCompany ? "company.create_test" : "company.create",
    targetType: "company", targetId: company.id, companyId: company.id,
    newState: company, reason
  });
  return publicValue(company);
}

async function updateCompanyModule(client, context, permissions, request, companyId, moduleKey, body) {
  requirePermission(permissions, "modules.manage");
  const reason = requiredText(body.reason, "Begründung", 1000);
  const status = enumValue(body.status, new Set(["inactive", "permanent", "trial"]), "Modulstatus");
  await ensureCompany(client, companyId);
  if (!/^[a-z][a-z0-9_]*$/.test(moduleKey)) throw new InputError("Der Modulschlüssel ist ungültig.");
  const startsAt = status === "inactive" ? null : optionalTimestamp(body.startsAt, "Startdatum");
  const endsAt = status === "inactive" ? null : optionalTimestamp(body.endsAt, "Ablaufdatum");
  if (status === "trial" && (!startsAt || !endsAt)) {
    throw new InputError("Eine Testfreigabe benötigt Start- und Ablaufdatum.");
  }
  if (endsAt && (!startsAt || new Date(endsAt).valueOf() <= new Date(startsAt).valueOf())) {
    throw new InputError("Das Ende der Testfreigabe muss nach dem Start liegen.");
  }
  if (body.featureScope != null
      && (typeof body.featureScope !== "object" || Array.isArray(body.featureScope))) {
    throw new InputError("Der Funktionsumfang ist ungültig.");
  }
  const moduleResult = await client.query(
    "SELECT id, dependencies FROM module_catalog WHERE module_key = $1 AND status = 'active'",
    [moduleKey]
  );
  if (moduleResult.rowCount !== 1) throw new InputError("Das Modul wurde nicht gefunden.", 404, "module_not_found");
  for (const dependency of status === "inactive" ? [] : (moduleResult.rows[0].dependencies || [])) {
    const enabled = await client.query(
      `SELECT 1 FROM company_module_entitlements AS entitlement
       JOIN module_catalog AS catalog ON catalog.id = entitlement.module_id
       WHERE entitlement.company_id = $1 AND catalog.module_key = $2
         AND entitlement.entitlement_status <> 'inactive'
         AND (entitlement.ends_at IS NULL OR entitlement.ends_at > CURRENT_TIMESTAMP)`,
      [companyId, dependency]
    );
    if (enabled.rowCount !== 1) throw new InputError(`Zuerst muss das abhängige Modul ${dependency} freigeschaltet werden.`, 409, "module_dependency_missing");
  }
  if (status === "inactive") {
    const dependents = await client.query(
      `SELECT dependent.name
       FROM company_module_entitlements AS entitlement
       JOIN module_catalog AS dependent ON dependent.id = entitlement.module_id
       WHERE entitlement.company_id = $1
         AND dependent.dependencies ? $2
         AND entitlement.entitlement_status <> 'inactive'
         AND (entitlement.ends_at IS NULL OR entitlement.ends_at > CURRENT_TIMESTAMP)`,
      [companyId, moduleKey]
    );
    if (dependents.rowCount) {
      throw new InputError(
        `Zuerst müssen abhängige Module deaktiviert werden: ${dependents.rows.map((row) => row.name).join(", ")}.`,
        409,
        "module_dependency_active"
      );
    }
  }
  const before = await client.query(
    "SELECT * FROM company_module_entitlements WHERE company_id = $1 AND module_id = $2 FOR UPDATE",
    [companyId, moduleResult.rows[0].id]
  );
  if (before.rowCount && body.rowVersion !== undefined
      && Number(before.rows[0].row_version) !== integer(body.rowVersion, "Datenversion", 1)) {
    throw new InputError("Die Modulfreigabe wurde zwischenzeitlich geändert.", 409, "stale_write");
  }
  const updated = await client.query(
    `INSERT INTO company_module_entitlements (
       company_id, module_id, entitlement_status, starts_at, ends_at,
       included_in_plan, separately_billed, user_limit, feature_scope,
       changed_by_platform_user_id, change_reason
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::JSONB,$10,$11)
     ON CONFLICT (company_id, module_id) DO UPDATE SET
       entitlement_status = EXCLUDED.entitlement_status,
       starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
       included_in_plan = EXCLUDED.included_in_plan,
       separately_billed = EXCLUDED.separately_billed,
       user_limit = EXCLUDED.user_limit, feature_scope = EXCLUDED.feature_scope,
       changed_by_platform_user_id = EXCLUDED.changed_by_platform_user_id,
       change_reason = EXCLUDED.change_reason
     RETURNING *`,
    [
      companyId, moduleResult.rows[0].id, status, startsAt, endsAt,
      Boolean(body.includedInPlan), Boolean(body.separatelyBilled),
      body.userLimit == null ? null : integer(body.userLimit, "Benutzerlimit", 1),
      JSON.stringify(body.featureScope || {}), context.platformUserId, reason
    ]
  );
  await audit(client, context, request, {
    action: "module.entitlement_change", targetType: "company_module",
    targetId: updated.rows[0].id, companyId,
    oldState: before.rows[0] || null, newState: updated.rows[0], reason
  });
  return publicValue(updated.rows[0]);
}

async function listPlatformAccounts(client, url) {
  const { page, pageSize, offset } = pagination(url);
  const search = (url.searchParams.get("search") || "").trim();
  const status = url.searchParams.get("status") || null;
  if (status) enumValue(status, new Set(["active", "inactive", "archived"]), "Kontostatus");
  const companyId = url.searchParams.get("companyId") ? validateId(url.searchParams.get("companyId"), "Firmen-ID") : null;
  const result = await client.query(
    `SELECT account.id, account.first_name, account.last_name, account.email,
            account.personnel_number, account.status, account.last_login_at,
            account.must_change_password AS invitation_pending,
            account.two_factor_enabled, account.failed_login_attempts,
            account.locked_until,
            account.company_id, company.display_name AS company_name,
            CASE WHEN account.email IS NULL THEN 0 ELSE (
              SELECT COUNT(*)::INTEGER FROM users AS duplicate
              WHERE LOWER(duplicate.email) = LOWER(account.email)
                AND duplicate.id <> account.id
            ) END AS duplicate_account_count,
            COALESCE(jsonb_agg(DISTINCT role.role_key ORDER BY role.role_key)
              FILTER (WHERE role.id IS NOT NULL), '[]'::jsonb) AS company_roles,
            (SELECT COUNT(*)::INTEGER FROM user_sessions AS session
             WHERE session.company_id = account.company_id AND session.user_id = account.id
               AND session.revoked_at IS NULL AND session.expires_at > CURRENT_TIMESTAMP) AS active_session_count,
            COUNT(*) OVER()::INTEGER AS total_count
     FROM users AS account
     JOIN companies AS company ON company.id = account.company_id
     LEFT JOIN user_roles AS assignment
       ON assignment.company_id = account.company_id AND assignment.user_id = account.id
      AND assignment.revoked_at IS NULL
     LEFT JOIN roles AS role ON role.company_id = assignment.company_id AND role.id = assignment.role_id
     WHERE ($1 = '' OR account.first_name ILIKE '%' || $1 || '%'
                     OR account.last_name ILIKE '%' || $1 || '%'
                     OR COALESCE(account.email, '') ILIKE '%' || $1 || '%')
       AND ($2::VARCHAR IS NULL OR account.status = $2)
       AND ($3::UUID IS NULL OR account.company_id = $3)
     GROUP BY account.id, company.display_name
     ORDER BY account.last_name, account.first_name, account.id
     LIMIT $4 OFFSET $5`,
    [search, status, companyId, pageSize, offset]
  );
  return {
    items: publicValue(result.rows.map(({ total_count: _total, ...row }) => row)),
    pagination: { page, pageSize, total: Number(result.rows[0]?.total_count || 0) }
  };
}

async function listPlatformAdministrators(client) {
  const result = await client.query(
    `SELECT account.id,account.first_name,account.last_name,account.email,
            account.status,account.two_factor_enabled,account.failed_login_attempts,
            account.locked_until,account.last_login_at,account.row_version,
            COALESCE(jsonb_agg(role.role_key ORDER BY role.role_key)
              FILTER (WHERE role.id IS NOT NULL),'[]'::JSONB) AS roles,
            (SELECT COUNT(*)::INTEGER FROM platform_sessions AS session
             WHERE session.platform_user_id = account.id AND session.revoked_at IS NULL
               AND session.expires_at > CURRENT_TIMESTAMP) AS active_session_count
     FROM platform_users AS account
     LEFT JOIN platform_user_roles AS assignment
       ON assignment.platform_user_id = account.id AND assignment.revoked_at IS NULL
     LEFT JOIN platform_roles AS role ON role.id = assignment.platform_role_id
     GROUP BY account.id ORDER BY account.last_name,account.first_name,account.id`
  );
  const roles = await client.query(
    "SELECT id,role_key,name,description,permissions,row_version FROM platform_roles ORDER BY name"
  );
  return publicValue({ administrators: result.rows, roles: roles.rows });
}

async function createPlatformAdministrator(client, context, permissions, request, body) {
  requirePermission(permissions, "platform_users.manage");
  const reason = requiredText(body.reason, "Begründung", 1000);
  const roleKeys = Array.isArray(body.roleKeys) ? [...new Set(body.roleKeys)] : [];
  if (!roleKeys.length) throw new InputError("Mindestens eine Plattformrolle ist erforderlich.");
  const roles = await client.query(
    "SELECT id,role_key FROM platform_roles WHERE role_key = ANY($1::VARCHAR[])",
    [roleKeys]
  );
  if (roles.rowCount !== roleKeys.length) throw new InputError("Mindestens eine Plattformrolle ist unbekannt.");
  const email = requiredText(body.email, "E-Mail-Adresse", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InputError("Die E-Mail-Adresse ist ungültig.");
  const duplicate = await client.query(
    "SELECT 1 FROM platform_users WHERE LOWER(email) = $1",
    [email]
  );
  if (duplicate.rowCount) throw new InputError("Für diese E-Mail existiert bereits ein Plattformkonto.", 409, "platform_account_exists");
  const passwordHash = await hashPassword(body.temporaryPassword);
  const account = await client.query(
    `INSERT INTO platform_users (first_name,last_name,email,password_hash)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [
      requiredText(body.firstName, "Vorname", 100),
      requiredText(body.lastName, "Nachname", 100),
      email,
      passwordHash
    ]
  );
  for (const role of roles.rows) {
    await client.query(
      `INSERT INTO platform_user_roles (
         platform_user_id,platform_role_id,granted_by_platform_user_id,reason
       ) VALUES ($1,$2,$3,$4)`,
      [account.rows[0].id, role.id, context.platformUserId, reason]
    );
  }
  await audit(client, context, request, {
    action: "platform_account.create", targetType: "platform_user",
    targetId: account.rows[0].id,
    newState: { ...account.rows[0], password_hash: undefined, roles: roleKeys }, reason
  });
  return publicValue({
    id: account.rows[0].id,
    firstName: account.rows[0].first_name,
    lastName: account.rows[0].last_name,
    email: account.rows[0].email,
    status: account.rows[0].status,
    roles: roleKeys
  });
}

async function platformAdministratorAction(
  client, context, permissions, request, administratorId, body
) {
  requirePermission(permissions, "platform_users.manage");
  const action = enumValue(
    body.action,
    new Set(["assign_roles", "enable", "disable", "unlock", "end_sessions"]),
    "Administratoraktion"
  );
  const reason = requiredText(body.reason, "Begründung", 1000);
  const current = await client.query(
    `SELECT id,first_name,last_name,email,status,two_factor_enabled,
            failed_login_attempts,locked_until,last_login_at,row_version
     FROM platform_users WHERE id = $1 FOR UPDATE`,
    [administratorId]
  );
  if (current.rowCount !== 1) throw new InputError("Das Plattformkonto wurde nicht gefunden.", 404, "platform_account_not_found");
  const account = current.rows[0];
  if (["assign_roles", "disable"].includes(action) && body.confirmation !== account.email) {
    throw new InputError("Kritische Plattformkontoaktionen benötigen die E-Mail-Adresse als Bestätigung.", 409, "platform_account_confirmation_required");
  }
  if (action === "assign_roles") {
    const roleKeys = Array.isArray(body.roleKeys) ? [...new Set(body.roleKeys)] : [];
    if (!roleKeys.length) throw new InputError("Mindestens eine Plattformrolle ist erforderlich.");
    if (administratorId === context.platformUserId && !roleKeys.includes("superadmin")) {
      throw new InputError("Der aktive Superadministrator darf sich nicht selbst herabstufen.", 409, "self_demotion_forbidden");
    }
    const roles = await client.query(
      "SELECT id,role_key FROM platform_roles WHERE role_key = ANY($1::VARCHAR[])",
      [roleKeys]
    );
    if (roles.rowCount !== roleKeys.length) throw new InputError("Mindestens eine Plattformrolle ist unbekannt.");
    await client.query(
      `UPDATE platform_user_roles SET revoked_at = CURRENT_TIMESTAMP,
              revoked_by_platform_user_id = $2
       WHERE platform_user_id = $1 AND revoked_at IS NULL`,
      [administratorId, context.platformUserId]
    );
    for (const role of roles.rows) {
      await client.query(
        `INSERT INTO platform_user_roles (
           platform_user_id,platform_role_id,granted_by_platform_user_id,reason
         ) VALUES ($1,$2,$3,$4)`,
        [administratorId, role.id, context.platformUserId, reason]
      );
    }
  } else if (action === "disable") {
    if (administratorId === context.platformUserId) {
      throw new InputError("Das aktive Plattformkonto darf sich nicht selbst deaktivieren.", 409, "self_disable_forbidden");
    }
    await client.query("UPDATE platform_users SET status = 'disabled' WHERE id = $1", [administratorId]);
    await client.query(
      `UPDATE platform_sessions SET revoked_at = CURRENT_TIMESTAMP,
              revocation_reason = 'platform_account_disabled'
       WHERE platform_user_id = $1 AND revoked_at IS NULL`,
      [administratorId]
    );
  } else if (action === "enable") {
    await client.query("UPDATE platform_users SET status = 'active' WHERE id = $1", [administratorId]);
  } else if (action === "unlock") {
    await client.query(
      "UPDATE platform_users SET status = 'active',failed_login_attempts = 0,locked_until = NULL WHERE id = $1",
      [administratorId]
    );
  } else {
    await client.query(
      `UPDATE platform_sessions SET revoked_at = CURRENT_TIMESTAMP,
              revocation_reason = 'platform_end_sessions'
       WHERE platform_user_id = $1 AND revoked_at IS NULL`,
      [administratorId]
    );
  }
  const after = await client.query(
    `SELECT id,first_name,last_name,email,status,two_factor_enabled,
            failed_login_attempts,locked_until,last_login_at,row_version
     FROM platform_users WHERE id = $1`,
    [administratorId]
  );
  const roleState = await client.query(
    `SELECT COALESCE(jsonb_agg(role.role_key ORDER BY role.role_key),'[]'::JSONB) AS roles
     FROM platform_user_roles AS assignment
     JOIN platform_roles AS role ON role.id = assignment.platform_role_id
     WHERE assignment.platform_user_id = $1 AND assignment.revoked_at IS NULL`,
    [administratorId]
  );
  await audit(client, context, request, {
    action: `platform_account.${action}`, targetType: "platform_user",
    targetId: administratorId, oldState: account,
    newState: { ...after.rows[0], roles: roleState.rows[0].roles }, reason
  });
  return publicValue({ ...after.rows[0], roles: roleState.rows[0].roles });
}

async function updatePlatformRole(client, context, permissions, request, roleId, body) {
  requirePermission(permissions, "platform_roles.manage");
  const reason = requiredText(body.reason, "Begründung", 1000);
  const rowVersion = integer(body.rowVersion, "Datenversion", 1);
  if (!Array.isArray(body.permissions) || body.permissions.length === 0) {
    throw new InputError("Mindestens eine Berechtigung ist erforderlich.");
  }
  const requested = [...new Set(body.permissions.map((item) => requiredText(item, "Berechtigung", 80)))];
  const unknown = requested.filter((item) => !KNOWN_PLATFORM_PERMISSIONS.has(item));
  if (unknown.length) throw new InputError(`Unbekannte Berechtigungen: ${unknown.join(", ")}.`);
  const current = await client.query("SELECT * FROM platform_roles WHERE id = $1 FOR UPDATE", [roleId]);
  if (current.rowCount !== 1) throw new InputError("Die Plattformrolle wurde nicht gefunden.", 404, "platform_role_not_found");
  if (Number(current.rows[0].row_version) !== rowVersion) {
    throw new InputError("Die Plattformrolle wurde zwischenzeitlich geändert.", 409, "stale_write");
  }
  if (body.confirmation !== current.rows[0].role_key) {
    throw new InputError("Die Rollenänderung benötigt den Rollenschlüssel als Bestätigung.", 409, "platform_role_confirmation_required");
  }
  if (current.rows[0].role_key === "superadmin" && !requested.includes("*")) {
    throw new InputError("Die Superadministratorrolle muss den Vollzugriff behalten.", 409, "superadmin_permission_required");
  }
  if (current.rows[0].role_key !== "superadmin" && requested.includes("*")) {
    throw new InputError("Vollzugriff darf nur der Superadministratorrolle zugeordnet werden.", 409, "wildcard_permission_forbidden");
  }
  const updated = await client.query(
    `UPDATE platform_roles SET permissions = $2::JSONB
     WHERE id = $1 RETURNING *`,
    [roleId, JSON.stringify(requested)]
  );
  await audit(client, context, request, {
    action: "platform_role.permissions_update", targetType: "platform_role", targetId: roleId,
    oldState: current.rows[0], newState: updated.rows[0], reason
  });
  return publicValue(updated.rows[0]);
}

async function accountAction(client, context, permissions, request, accountId, body) {
  const action = requiredText(body.action, "Aktion", 50);
  const reason = requiredText(body.reason, "Begründung", 1000);
  if (["unlock", "end_sessions", "resend_invitation", "reset_password"].includes(action)) {
    requirePermission(permissions, action === "unlock" ? "accounts.unlock" : "accounts.manage");
  } else {
    requirePermission(permissions, "accounts.manage");
  }
  const safeAccountColumns = `id,company_id,personnel_number,first_name,last_name,email,
    status,must_change_password,two_factor_enabled,failed_login_attempts,
    locked_until,last_login_at,row_version,created_at,updated_at`;
  const before = await client.query(
    `SELECT ${safeAccountColumns} FROM users WHERE id = $1 FOR UPDATE`,
    [accountId]
  );
  if (before.rowCount !== 1) throw new InputError("Das Benutzerkonto wurde nicht gefunden.", 404, "account_not_found");
  const account = before.rows[0];
  let temporaryPassword = null;
  if (action === "unlock") {
    if (account.status !== "active") {
      throw new InputError("Ein deaktiviertes oder archiviertes Konto kann nicht als Sperrfall entsperrt werden.", 409, "account_not_locked");
    }
    await client.query(
      "UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1",
      [accountId]
    );
  } else if (action === "disable") {
    await client.query("UPDATE users SET status = 'inactive' WHERE id = $1", [accountId]);
  } else if (action === "revoke_invitation") {
    if (!account.must_change_password) {
      throw new InputError("Für dieses Konto liegt keine offene Einladung vor.", 409, "invitation_not_pending");
    }
    await client.query(
      `UPDATE users SET status = 'inactive', must_change_password = FALSE
       WHERE id = $1`,
      [accountId]
    );
    await client.query(
      `UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP,
              revocation_reason = 'platform_revoke_invitation'
       WHERE company_id = $2 AND user_id = $1 AND revoked_at IS NULL`,
      [accountId, account.company_id]
    );
  } else if (action === "correct_email") {
    const email = requiredText(body.email, "E-Mail-Adresse", 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InputError("Die E-Mail-Adresse ist ungültig.");
    const duplicate = await client.query(
      "SELECT 1 FROM users WHERE company_id = $1 AND id <> $2 AND LOWER(email) = $3",
      [account.company_id, accountId, email]
    );
    if (duplicate.rowCount) throw new InputError("Diese E-Mail-Adresse wird in der Firma bereits verwendet.", 409, "account_email_conflict");
    await client.query("UPDATE users SET email = $2 WHERE id = $1", [accountId, email]);
  } else if (["end_sessions", "reset_password", "resend_invitation"].includes(action)) {
    await client.query(
      `UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP, revocation_reason = $2
       WHERE company_id = $3 AND user_id = $1 AND revoked_at IS NULL`,
      [accountId, `platform_${action}`, account.company_id]
    );
    if (action === "reset_password") {
      if (account.status !== "active") {
        throw new InputError(
          "Ein deaktiviertes oder archiviertes Konto kann kein neues Startpasswort erhalten.",
          409,
          "password_reset_inactive"
        );
      }
      temporaryPassword = createTemporaryPassword();
      const passwordHash = await hashPassword(temporaryPassword);
      await client.query(
        `UPDATE users
         SET password_hash = $2, must_change_password = TRUE,
             failed_login_attempts = 0, locked_until = NULL
         WHERE id = $1`,
        [accountId, passwordHash]
      );
    } else if (action === "resend_invitation") {
      await client.query("UPDATE users SET must_change_password = TRUE WHERE id = $1", [accountId]);
    }
  } else if (action === "reassign_company") {
    const targetCompanyId = validateId(body.companyId, "Ziel-Firmen-ID");
    await ensureCompany(client, targetCompanyId);
    if (targetCompanyId === account.company_id) {
      throw new InputError("Das Konto gehört bereits zu dieser Firma.");
    }
    const collision = await client.query(
      `SELECT 1 FROM users AS candidate
       WHERE candidate.company_id = $1 AND candidate.id <> $2
         AND (candidate.personnel_number = $3
              OR ($4::VARCHAR IS NOT NULL AND LOWER(candidate.email) = LOWER($4)))
       LIMIT 1`,
      [targetCompanyId, accountId, account.personnel_number, account.email]
    );
    if (collision.rowCount) {
      throw new InputError("Personalnummer oder E-Mail existiert bereits in der Zielfirma.", 409, "account_reassignment_conflict");
    }
    await client.query(
      "SELECT platform_reassign_unhistorical_user($1,$2,$3)",
      [accountId, targetCompanyId, reason]
    );
  } else {
    throw new InputError("Die Kontoaktion ist unbekannt.");
  }
  const after = await client.query(`SELECT ${safeAccountColumns} FROM users WHERE id = $1`, [accountId]);
  await audit(client, context, request, {
    action: `account.${action}`, targetType: "user_account", targetId: accountId,
    companyId: after.rows[0]?.company_id || account.company_id,
    oldState: account, newState: after.rows[0] || { sessionsEnded: true }, reason
  });
  return {
    ...publicValue(after.rows[0] || account),
    ...(temporaryPassword ? { temporaryPassword } : {})
  };
}

async function listPlans(client) {
  const result = await client.query(
    `SELECT plan.id, plan.plan_key, plan.name, plan.status, plan.description, plan.row_version,
            COALESCE(jsonb_agg(to_jsonb(version) ORDER BY version.version_number DESC)
              FILTER (WHERE version.id IS NOT NULL), '[]'::jsonb) AS versions
     FROM license_plans AS plan
     LEFT JOIN license_plan_versions AS version ON version.license_plan_id = plan.id
     GROUP BY plan.id ORDER BY plan.name`
  );
  return publicValue(result.rows);
}

async function updatePlan(client, context, permissions, request, planId, body) {
  requirePermission(permissions, "plans.manage");
  const reason = requiredText(body.reason, "Begründung", 1000);
  const rowVersion = integer(body.rowVersion, "Datenversion", 1);
  const current = await client.query(
    "SELECT * FROM license_plans WHERE id = $1 FOR UPDATE",
    [planId]
  );
  if (current.rowCount !== 1) {
    throw new InputError("Der Tarif wurde nicht gefunden.", 404, "plan_not_found");
  }
  if (Number(current.rows[0].row_version) !== rowVersion) {
    throw new InputError(
      "Der Tarif wurde zwischenzeitlich geändert.",
      409,
      "stale_write"
    );
  }
  const status = enumValue(
    body.status ?? current.rows[0].status,
    new Set(["draft", "active", "retired"]),
    "Tarifstatus"
  );
  const updated = await client.query(
    `UPDATE license_plans
     SET name = $2, status = $3, description = $4
     WHERE id = $1 AND row_version = $5
     RETURNING *`,
    [
      planId,
      requiredText(body.name ?? current.rows[0].name, "Tarifname", 120),
      status,
      optionalText(body.description, "Beschreibung", 2000),
      rowVersion
    ]
  );
  if (updated.rowCount !== 1) {
    throw new InputError("Der Tarif wurde zwischenzeitlich geändert.", 409, "stale_write");
  }
  await audit(client, context, request, {
    action: "plan.update",
    targetType: "license_plan",
    targetId: planId,
    oldState: current.rows[0],
    newState: updated.rows[0],
    reason
  });
  return publicValue(updated.rows[0]);
}

async function createPlanVersion(client, context, permissions, request, planId, body) {
  requirePermission(permissions, "plans.manage");
  const reason = requiredText(body.reason, "Begründung", 1000);
  const plan = await client.query("SELECT * FROM license_plans WHERE id = $1 FOR UPDATE", [planId]);
  if (plan.rowCount !== 1) throw new InputError("Der Tarif wurde nicht gefunden.", 404, "plan_not_found");
  for (const [key, label] of [
    ["employeeTiers", "Mitarbeiterstaffeln"],
    ["includedModules", "Enthaltene Module"],
    ["addonModules", "Zusatzmodule"]
  ]) {
    if (body[key] != null && !Array.isArray(body[key])) {
      throw new InputError(`${label} müssen als Liste übermittelt werden.`);
    }
  }
  const version = await client.query(
    `INSERT INTO license_plan_versions (
       license_plan_id, version_number, monthly_price_cents, annual_price_cents,
       currency, employee_tiers, user_limit, storage_limit_bytes,
       included_modules, addon_modules, trial_days, cancellation_notice_days,
       minimum_term_months, active_from, created_by_platform_user_id
     ) SELECT $1, COALESCE(MAX(version_number),0)+1, $2,$3,$4,$5::JSONB,$6,$7,
              $8::JSONB,$9::JSONB,$10,$11,$12,COALESCE($13::TIMESTAMPTZ,CURRENT_TIMESTAMP),$14
       FROM license_plan_versions WHERE license_plan_id = $1
     RETURNING *`,
    [
      planId, integer(body.monthlyPriceCents, "Monatspreis", 0),
      integer(body.annualPriceCents, "Jahrespreis", 0), body.currency || "EUR",
      JSON.stringify(body.employeeTiers || []), body.userLimit == null ? null : integer(body.userLimit, "Benutzerlimit", 1),
      body.storageLimitBytes == null ? null : integer(body.storageLimitBytes, "Speicherlimit", 0),
      JSON.stringify(body.includedModules || []), JSON.stringify(body.addonModules || []),
      integer(body.trialDays ?? 14, "Testtage", 0, 365),
      integer(body.cancellationNoticeDays ?? 30, "Kündigungsfrist", 0, 3650),
      integer(body.minimumTermMonths ?? 1, "Mindestlaufzeit", 0, 120),
      optionalTimestamp(body.activeFrom, "Gültigkeitsbeginn"), context.platformUserId
    ]
  );
  await audit(client, context, request, {
    action: "plan.version_create", targetType: "license_plan", targetId: planId,
    newState: version.rows[0], reason
  });
  return publicValue(version.rows[0]);
}

async function assignCompanyContract(client, context, permissions, request, companyId, body) {
  requireAnyPermission(permissions, ["contracts.assign", "contracts.manage"]);
  const company = await ensureCompany(client, companyId);
  if (body.confirmation !== company.company_number) {
    throw new InputError("Die Vertragszuweisung benötigt die Kundennummer als Bestätigung.", 409, "contract_confirmation_required");
  }
  const reason = requiredText(body.reason, "Begründung", 1000);
  const versionId = validateId(body.planVersionId, "Tarifversion-ID");
  const version = await client.query(
    `SELECT version.*, plan.plan_key, plan.name AS plan_name
     FROM license_plan_versions AS version
     JOIN license_plans AS plan ON plan.id = version.license_plan_id
     WHERE version.id = $1 AND plan.status IN ('active','draft')`,
    [versionId]
  );
  if (version.rowCount !== 1) throw new InputError("Die Tarifversion wurde nicht gefunden.", 404, "plan_version_not_found");
  const status = enumValue(body.status || "active", new Set(["trial", "active", "payment_due", "suspended"]), "Vertragsstatus");
  const billingCycle = enumValue(
    body.billingCycle || "monthly",
    new Set(["monthly", "annual", "custom"]),
    "Abrechnungszyklus"
  );
  const current = await client.query(
    `SELECT * FROM company_contracts
     WHERE company_id = $1 AND status IN ('trial','active','payment_due','suspended')
     FOR UPDATE`,
    [companyId]
  );
  if (current.rowCount) {
    await client.query(
      `UPDATE company_contracts SET status = 'expired', ends_at = COALESCE(ends_at,CURRENT_TIMESTAMP),
              changed_by_platform_user_id = $2, change_reason = $3
       WHERE id = $1`,
      [current.rows[0].id, context.platformUserId, reason]
    );
  }
  const plan = version.rows[0];
  const startsAt = optionalTimestamp(body.startsAt, "Vertragsbeginn") || new Date().toISOString();
  const endsAt = optionalTimestamp(body.endsAt, "Vertragsende");
  const trialEndsAt = optionalTimestamp(body.trialEndsAt, "Testphasenende");
  const goodwillUntil = optionalTimestamp(body.goodwillUntil, "Kulanzende");
  if (endsAt && new Date(endsAt) <= new Date(startsAt)) {
    throw new InputError("Das Vertragsende muss nach dem Beginn liegen.");
  }
  if (trialEndsAt && new Date(trialEndsAt) <= new Date(startsAt)) {
    throw new InputError("Das Ende der Testphase muss nach dem Vertragsbeginn liegen.");
  }
  const monthlyPriceCents = body.monthlyPriceCents == null
    ? plan.monthly_price_cents : integer(body.monthlyPriceCents, "Monatspreis", 0);
  const annualPriceCents = body.annualPriceCents == null
    ? plan.annual_price_cents : integer(body.annualPriceCents, "Jahrespreis", 0);
  const userLimit = body.userLimit == null
    ? plan.user_limit : integer(body.userLimit, "Benutzerlimit", 1);
  const storageLimitBytes = body.storageLimitBytes == null
    ? plan.storage_limit_bytes : integer(body.storageLimitBytes, "Speicherlimit", 0);
  const cancellationNoticeDays = body.cancellationNoticeDays == null
    ? plan.cancellation_notice_days
    : integer(body.cancellationNoticeDays, "Kündigungsfrist", 0, 3650);
  const minimumTermMonths = body.minimumTermMonths == null
    ? plan.minimum_term_months
    : integer(body.minimumTermMonths, "Mindestlaufzeit", 0, 120);
  const modules = body.modules == null ? plan.included_modules : body.modules;
  if (!Array.isArray(modules)) throw new InputError("Der Modul-Snapshot muss eine Liste sein.");
  const moduleKeys = [...new Set(modules.map((item) => requiredText(item, "Modulschlüssel", 60)))];
  if (moduleKeys.length) {
    const knownModules = await client.query(
      "SELECT module_key FROM module_catalog WHERE module_key = ANY($1::VARCHAR[])",
      [moduleKeys]
    );
    if (knownModules.rowCount !== moduleKeys.length) throw new InputError("Der Vertrag enthält ein unbekanntes Modul.");
  }
  const discountPercent = Number(body.discountPercent || 0);
  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
    throw new InputError("Der Rabatt muss zwischen 0 und 100 Prozent liegen.");
  }
  const contract = await client.query(
    `INSERT INTO company_contracts (
       company_id,license_plan_version_id,status,starts_at,ends_at,trial_ends_at,
       billing_cycle,monthly_price_cents,annual_price_cents,currency,user_limit,
       storage_limit_bytes,module_snapshot,special_terms,discount_percent,
       goodwill_until,cancellation_notice_days,minimum_term_months,
       changed_by_platform_user_id,change_reason
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::JSONB,$14,$15,$16,$17,$18,$19,$20)
     RETURNING *`,
    [
      companyId, versionId, status, startsAt, endsAt,
      status === "trial" ? trialEndsAt || new Date(Date.now() + plan.trial_days * 86_400_000).toISOString() : null,
      billingCycle, monthlyPriceCents, annualPriceCents,
      plan.currency, userLimit, storageLimitBytes,
      JSON.stringify(moduleKeys),
      optionalText(body.specialTerms, "Sonderkonditionen", 10_000),
      discountPercent, goodwillUntil,
      cancellationNoticeDays, minimumTermMonths,
      context.platformUserId, reason
    ]
  );
  await client.query(
    `UPDATE companies SET license_plan = $2, license_valid_until = $3,
       user_limit = COALESCE($4,user_limit), storage_limit_bytes = COALESCE($5,storage_limit_bytes),
       trial_ends_at = $6, contract_ends_at = $7
     WHERE id = $1`,
    [
      companyId, plan.plan_key, endsAt, contract.rows[0].user_limit,
      contract.rows[0].storage_limit_bytes, contract.rows[0].trial_ends_at, endsAt
    ]
  );
  await audit(client, context, request, {
    action: "contract.assign", targetType: "company_contract", targetId: contract.rows[0].id,
    companyId, oldState: current.rows[0] || null, newState: contract.rows[0], reason
  });
  return publicValue(contract.rows[0]);
}

async function updateRegistration(client, context, permissions, request, registrationId, body) {
  requirePermission(permissions, "companies.create");
  const action = enumValue(body.action, new Set(["approve", "reject", "remove", "resend"]), "Registrierungsaktion");
  const reason = requiredText(body.reason, "Begründung", 1000);
  const rowVersion = integer(body.rowVersion, "Datenversion", 1);
  const current = await client.query(
    "SELECT * FROM company_registration_requests WHERE id = $1 FOR UPDATE",
    [registrationId]
  );
  if (current.rowCount !== 1) throw new InputError("Die Registrierung wurde nicht gefunden.", 404, "registration_not_found");
  if (Number(current.rows[0].row_version) !== rowVersion) throw new InputError("Die Registrierung wurde zwischenzeitlich geändert.", 409, "stale_write");
  let invitationToken = null;
  let company = null;
  if (action === "resend") {
    invitationToken = createSessionToken();
    await client.query(
      `UPDATE company_registration_requests
       SET invitation_token_hash = $2, invitation_expires_at = CURRENT_TIMESTAMP + ($3 * INTERVAL '1 day'),
           status = 'pending'
       WHERE id = $1`,
      [registrationId, hashSessionToken(invitationToken), integer(body.expiresInDays ?? 7, "Einladungsdauer", 1, 90)]
    );
  } else if (action === "approve") {
    if (!["pending", "incomplete"].includes(current.rows[0].status)) {
      throw new InputError("Nur offene Registrierungen können freigegeben werden.", 409, "registration_not_open");
    }
    const temporaryPassword = requiredText(body.temporaryPassword, "Startpasswort", 256);
    if (temporaryPassword.length < 12 || !/[A-Za-zÄÖÜäöüß]/.test(temporaryPassword) || !/\d/.test(temporaryPassword)) {
      throw new InputError("Das Startpasswort benötigt mindestens 12 Zeichen, einen Buchstaben und eine Zahl.");
    }
    const passwordHash = await hashPassword(temporaryPassword);
    const plan = await client.query(
      "SELECT 1 FROM license_plans WHERE plan_key = $1 AND status IN ('active','draft')",
      [current.rows[0].requested_plan_key || "standard"]
    );
    if (plan.rowCount !== 1) throw new InputError("Der gewünschte Tarif ist nicht mehr verfügbar.", 409, "plan_unavailable");
    const created = await client.query(
      `INSERT INTO companies (
         legal_name,display_name,status,contact_name,contact_email,email,
         license_plan,trial_ends_at,registration_completed_at
       ) VALUES ($1,$2,$3,$4,$5,$5,$6,$7,CURRENT_TIMESTAMP) RETURNING *`,
      [
        current.rows[0].legal_name, current.rows[0].display_name,
        current.rows[0].is_test_company ? "trial" : "active",
        current.rows[0].contact_name, current.rows[0].contact_email,
        current.rows[0].requested_plan_key || "standard",
        current.rows[0].is_test_company
          ? new Date(Date.now() + integer(body.trialDays ?? 14, "Testtage", 1, 365) * 86_400_000).toISOString()
          : null
      ]
    );
    company = created.rows[0];
    const user = await client.query(
      `INSERT INTO users (
         company_id,personnel_number,first_name,last_name,email,password_hash,
         must_change_password,status
       ) VALUES ($1,$2,$3,$4,$5,$6,TRUE,'active') RETURNING id`,
      [
        company.id, requiredText(body.personnelNumber, "Personalnummer", 30),
        requiredText(body.firstName, "Vorname", 100), requiredText(body.lastName, "Nachname", 100),
        current.rows[0].contact_email, passwordHash
      ]
    );
    await client.query(
      `INSERT INTO user_roles (company_id,user_id,role_id,reason)
       SELECT $1,$2,id,$3 FROM roles
       WHERE company_id = $1 AND role_key = 'admin' AND status = 'active'`,
      [company.id, user.rows[0].id, "Erster Firmenadministrator aus freigegebener Registrierung"]
    );
    await client.query(
      `UPDATE company_registration_requests
       SET status = 'approved', reviewed_by_platform_user_id = $2,
           reviewed_at = CURRENT_TIMESTAMP, review_reason = $3, company_id = $4,
           invitation_token_hash = NULL, invitation_expires_at = NULL
       WHERE id = $1`,
      [registrationId, context.platformUserId, reason, company.id]
    );
  } else {
    await client.query(
      `UPDATE company_registration_requests
       SET status = $2, reviewed_by_platform_user_id = $3,
           reviewed_at = CURRENT_TIMESTAMP, review_reason = $4,
           invitation_token_hash = NULL, invitation_expires_at = NULL
       WHERE id = $1`,
      [registrationId, action === "reject" ? "rejected" : "removed", context.platformUserId, reason]
    );
  }
  const updated = await client.query("SELECT * FROM company_registration_requests WHERE id = $1", [registrationId]);
  await audit(client, context, request, {
    action: `registration.${action}`, targetType: "registration", targetId: registrationId,
    companyId: company?.id || current.rows[0].company_id,
    oldState: current.rows[0], newState: updated.rows[0], reason
  });
  return { registration: publicRegistration(updated.rows[0]), invitationToken };
}

async function updateSupportTicket(client, context, permissions, request, ticketId, body) {
  requirePermission(permissions, "support.manage");
  const reason = requiredText(body.reason, "Begründung", 1000);
  const rowVersion = integer(body.rowVersion, "Datenversion", 1);
  const current = await client.query("SELECT * FROM support_tickets WHERE id = $1 FOR UPDATE", [ticketId]);
  if (current.rowCount !== 1) throw new InputError("Der Supportfall wurde nicht gefunden.", 404, "support_ticket_not_found");
  if (Number(current.rows[0].row_version) !== rowVersion) throw new InputError("Der Supportfall wurde zwischenzeitlich geändert.", 409, "stale_write");
  const status = body.status == null ? current.rows[0].status : enumValue(
    body.status,
    new Set(["new", "assigned", "in_progress", "question", "waiting_customer", "resolved", "closed"]),
    "Supportstatus"
  );
  const priority = body.priority == null ? current.rows[0].priority : enumValue(
    body.priority, new Set(["low", "normal", "high", "critical"]), "Priorität"
  );
  const assignedTo = Object.hasOwn(body, "assigneeId")
    ? await ensurePlatformAssignee(client, body.assigneeId)
    : current.rows[0].assigned_platform_user_id;
  const updated = await client.query(
    `UPDATE support_tickets SET status = $2::VARCHAR, priority = $3,
            assigned_platform_user_id = $4,
            closed_at = CASE WHEN $2::VARCHAR = 'closed' THEN CURRENT_TIMESTAMP ELSE NULL END
     WHERE id = $1 RETURNING *`,
    [ticketId, status, priority, assignedTo]
  );
  await client.query(
    `INSERT INTO support_ticket_events (
       support_ticket_id,platform_user_id,event_type,message,old_state,new_state
     ) VALUES ($1,$2,'status_changed',$3,$4::JSONB,$5::JSONB)`,
    [ticketId, context.platformUserId, reason, JSON.stringify(current.rows[0]), JSON.stringify(updated.rows[0])]
  );
  await audit(client, context, request, {
    action: "support.ticket_update", targetType: "support_ticket", targetId: ticketId,
    companyId: current.rows[0].company_id, oldState: current.rows[0], newState: updated.rows[0], reason
  });
  return publicValue(updated.rows[0]);
}

async function updateHealthComponent(client, context, permissions, request, componentKey, body) {
  requirePermission(permissions, "health.manage");
  const reason = requiredText(body.reason, "Begründung", 1000);
  const status = enumValue(body.status, new Set(["available", "degraded", "outage"]), "Systemstatus");
  const current = await client.query("SELECT * FROM system_health_components WHERE component_key = $1 FOR UPDATE", [componentKey]);
  if (current.rowCount !== 1) throw new InputError("Die Systemkomponente wurde nicht gefunden.", 404, "health_component_not_found");
  const updated = await client.query(
    `UPDATE system_health_components SET status = $2::VARCHAR, checked_at = CURRENT_TIMESTAMP,
       last_success_at = CASE WHEN $2::VARCHAR = 'available' THEN CURRENT_TIMESTAMP ELSE last_success_at END,
       last_error_at = CASE WHEN $2::VARCHAR <> 'available' THEN CURRENT_TIMESTAMP ELSE last_error_at END,
       last_error_summary = CASE WHEN $2::VARCHAR = 'available' THEN NULL ELSE $3 END,
       error_count_24h = CASE WHEN $2::VARCHAR = 'available' THEN 0 ELSE error_count_24h + 1 END,
       updated_at = CURRENT_TIMESTAMP
     WHERE component_key = $1 RETURNING *`,
    [componentKey, status, status === "available" ? null : optionalText(body.errorSummary, "Fehlerhinweis", 2000) || reason]
  );
  await audit(client, context, request, {
    action: "health.status_update", targetType: "health_component", targetId: componentKey,
    oldState: current.rows[0], newState: updated.rows[0], reason
  });
  return publicValue(updated.rows[0]);
}

async function updateErrorGroup(client, context, permissions, request, errorId, body) {
  requirePermission(permissions, "errors.manage");
  const reason = requiredText(body.reason, "Begründung", 1000);
  const status = enumValue(body.status, new Set(["new", "investigating", "resolved", "reopened"]), "Fehlerstatus");
  const current = await client.query("SELECT * FROM platform_error_groups WHERE id = $1 FOR UPDATE", [errorId]);
  if (current.rowCount !== 1) throw new InputError("Der Fehler wurde nicht gefunden.", 404, "error_group_not_found");
  const updated = await client.query(
    `UPDATE platform_error_groups SET status = $2::VARCHAR,
       resolved_at = CASE WHEN $2::VARCHAR = 'resolved' THEN CURRENT_TIMESTAMP ELSE NULL END
     WHERE id = $1 RETURNING *`,
    [errorId, status]
  );
  await audit(client, context, request, {
    action: "error.status_update", targetType: "error_group", targetId: errorId,
    oldState: current.rows[0], newState: updated.rows[0], reason
  });
  return publicValue(updated.rows[0]);
}

async function createVersion(client, context, permissions, request, body) {
  requirePermission(permissions, "versions.manage");
  const reason = requiredText(body.reason, "Begründung", 1000);
  const status = enumValue(body.status || "draft", new Set(["draft", "rolling_out", "production"]), "Versionsstatus");
  const rolloutPercent = integer(body.rolloutPercent ?? (status === "production" ? 100 : 0), "Rollout", 0, 100);
  if (body.knownIssues != null && !Array.isArray(body.knownIssues)) {
    throw new InputError("Bekannte Fehler müssen als Liste übermittelt werden.");
  }
  if (body.databaseMigrations != null && !Array.isArray(body.databaseMigrations)) {
    throw new InputError("Datenbankmigrationen müssen als Liste übermittelt werden.");
  }
  const versionName = requiredText(body.version, "Version", 40);
  if (status === "production" && body.confirmation !== versionName) {
    throw new InputError("Eine direkte Produktionsfreigabe benötigt die Version als Bestätigung.", 409, "version_confirmation_required");
  }
  if (status === "production") {
    await client.query(
      "UPDATE application_versions SET release_status = 'superseded' WHERE release_status = 'production'"
    );
  }
  const result = await client.query(
    `INSERT INTO application_versions (
       version,release_status,released_at,changelog,known_issues,
       database_migrations,rollout_percent,mandatory_update,created_by_platform_user_id
     ) VALUES ($1,$2::VARCHAR,CASE WHEN $2::VARCHAR = 'production' THEN CURRENT_TIMESTAMP ELSE NULL END,
       $3,$4::JSONB,$5::JSONB,$6,$7,$8) RETURNING *`,
    [
      versionName, status,
      optionalText(body.changelog, "Changelog", 50_000) || "",
      JSON.stringify(body.knownIssues || []), JSON.stringify(body.databaseMigrations || []),
      rolloutPercent, Boolean(body.mandatoryUpdate), context.platformUserId
    ]
  );
  await audit(client, context, request, {
    action: "version.create", targetType: "application_version", targetId: result.rows[0].id,
    newState: result.rows[0], reason
  });
  return publicValue(result.rows[0]);
}

async function updateVersion(client, context, permissions, request, versionId, body) {
  requirePermission(permissions, "versions.manage");
  const reason = requiredText(body.reason, "Begründung", 1000);
  const current = await client.query("SELECT * FROM application_versions WHERE id = $1 FOR UPDATE", [versionId]);
  if (current.rowCount !== 1) throw new InputError("Die Version wurde nicht gefunden.", 404, "version_not_found");
  const status = body.status == null ? current.rows[0].release_status : enumValue(
    body.status, new Set(["draft", "rolling_out", "production", "withdrawn", "superseded"]), "Versionsstatus"
  );
  const rolloutPercent = body.rolloutPercent == null
    ? current.rows[0].rollout_percent
    : integer(body.rolloutPercent, "Rollout", 0, 100);
  if (body.knownIssues != null && !Array.isArray(body.knownIssues)) {
    throw new InputError("Bekannte Fehler müssen als Liste übermittelt werden.");
  }
  if (["withdrawn", "production"].includes(status) && body.confirmation !== current.rows[0].version) {
    throw new InputError("Kritische Versionsaktionen benötigen die Version als Bestätigung.", 409, "version_confirmation_required");
  }
  if (status === "production") {
    await client.query(
      `UPDATE application_versions SET release_status = 'superseded'
       WHERE release_status = 'production' AND id <> $1`,
      [versionId]
    );
  }
  const updated = await client.query(
    `UPDATE application_versions SET release_status = $2::VARCHAR, rollout_percent = $3,
       mandatory_update = COALESCE($4, mandatory_update),
       released_at = CASE WHEN $2::VARCHAR = 'production' THEN COALESCE(released_at,CURRENT_TIMESTAMP) ELSE released_at END,
       withdrawn_at = CASE WHEN $2::VARCHAR = 'withdrawn' THEN CURRENT_TIMESTAMP ELSE NULL END,
       changelog = COALESCE($5,changelog), known_issues = COALESCE($6::JSONB,known_issues)
     WHERE id = $1 RETURNING *`,
    [versionId, status, rolloutPercent, body.mandatoryUpdate ?? null, body.changelog ?? null, body.knownIssues == null ? null : JSON.stringify(body.knownIssues)]
  );
  await audit(client, context, request, {
    action: "version.update", targetType: "application_version", targetId: versionId,
    oldState: current.rows[0], newState: updated.rows[0], reason
  });
  return publicValue(updated.rows[0]);
}

async function prepareRestore(client, context, permissions, request, body) {
  requirePermission(permissions, "backups.manage");
  const reason = requiredText(body.reason, "Begründung", 1000);
  const type = enumValue(body.type, new Set(["test", "company", "deleted_data", "full"]), "Wiederherstellungsart");
  const backupId = validateId(body.backupId, "Backup-ID");
  const backup = await client.query(
    "SELECT * FROM platform_backup_runs WHERE id = $1 AND status = 'success' AND integrity_status = 'valid'",
    [backupId]
  );
  if (backup.rowCount !== 1) throw new InputError("Nur ein erfolgreiches, geprüftes Backup kann wiederhergestellt werden.", 409, "backup_not_restorable");
  const companyId = body.companyId ? validateId(body.companyId, "Firmen-ID") : null;
  if (type === "company" && !companyId) {
    throw new InputError("Eine Firmenwiederherstellung benötigt eine Firma.");
  }
  if (type === "full" && companyId) {
    throw new InputError("Eine vollständige Wiederherstellung darf nicht auf eine einzelne Firma begrenzt werden.");
  }
  if (companyId) await ensureCompany(client, companyId);
  if (backup.rows[0].scope_company_id
      && backup.rows[0].scope_company_id !== companyId) {
    throw new InputError("Das Firmenbackup darf nur in seiner ursprünglichen Firma verwendet werden.", 409, "backup_scope_mismatch");
  }
  const restore = await client.query(
    `INSERT INTO platform_restore_requests (
       backup_run_id,scope_company_id,restore_type,reason,prepared_by_platform_user_id
     ) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [backupId, companyId, type, reason, context.platformUserId]
  );
  await audit(client, context, request, {
    action: "restore.prepare", targetType: "restore", targetId: restore.rows[0].id,
    companyId: restore.rows[0].scope_company_id, newState: restore.rows[0], reason
  });
  return publicValue(restore.rows[0]);
}

async function confirmRestore(client, context, permissions, request, restoreId, body) {
  requirePermission(permissions, "backups.manage");
  const reason = requiredText(body.reason, "Begründung", 1000);
  const current = await client.query("SELECT * FROM platform_restore_requests WHERE id = $1 FOR UPDATE", [restoreId]);
  if (current.rowCount !== 1 || current.rows[0].status !== "prepared") {
    throw new InputError("Die Wiederherstellung ist nicht mehr bestätigbar.", 409, "restore_not_prepared");
  }
  if (current.rows[0].prepared_by_platform_user_id === context.platformUserId) {
    throw new InputError("Eine zweite berechtigte Person muss die Wiederherstellung bestätigen.", 403, "four_eyes_required");
  }
  if (body.confirmation !== `RESTORE ${restoreId}`) {
    throw new InputError("Die Wiederherstellungsbestätigung ist nicht korrekt.", 409, "restore_confirmation_required");
  }
  const updated = await client.query(
    `UPDATE platform_restore_requests SET status = 'confirmed',
       confirmed_by_platform_user_id = $2, confirmed_at = CURRENT_TIMESTAMP
     WHERE id = $1 RETURNING *`,
    [restoreId, context.platformUserId]
  );
  await audit(client, context, request, {
    action: "restore.confirm", targetType: "restore", targetId: restoreId,
    companyId: current.rows[0].scope_company_id, oldState: current.rows[0], newState: updated.rows[0], reason
  });
  return publicValue(updated.rows[0]);
}

async function updateAnnouncement(client, context, permissions, request, announcementId, body) {
  requirePermission(permissions, "announcements.manage");
  const reason = requiredText(body.reason, "Begründung", 1000);
  const rowVersion = integer(body.rowVersion, "Datenversion", 1);
  const current = await client.query("SELECT * FROM platform_announcements WHERE id = $1 FOR UPDATE", [announcementId]);
  if (current.rowCount !== 1) throw new InputError("Die Mitteilung wurde nicht gefunden.", 404, "announcement_not_found");
  if (Number(current.rows[0].row_version) !== rowVersion) throw new InputError("Die Mitteilung wurde zwischenzeitlich geändert.", 409, "stale_write");
  const status = body.status == null ? current.rows[0].status : enumValue(
    body.status, new Set(["draft", "scheduled", "published", "disabled"]), "Mitteilungsstatus"
  );
  const type = body.type == null ? null : enumValue(
    body.type,
    new Set(["maintenance", "outage", "security", "feature", "update", "terms"]),
    "Mitteilungsart"
  );
  const targets = body.targets == null
    ? null
    : await validateAnnouncementTargets(client, body.targets);
  const publishAt = Object.hasOwn(body, "publishAt")
    ? optionalTimestamp(body.publishAt, "Veröffentlichung")
    : current.rows[0].publish_at;
  const expiresAt = Object.hasOwn(body, "expiresAt")
    ? optionalTimestamp(body.expiresAt, "Ablaufdatum")
    : current.rows[0].expires_at;
  if (publishAt && expiresAt && new Date(expiresAt) <= new Date(publishAt)) {
    throw new InputError("Das Ablaufdatum muss nach der Veröffentlichung liegen.");
  }
  if (status === "scheduled" && !publishAt) {
    throw new InputError("Eine geplante Mitteilung benötigt einen Veröffentlichungszeitpunkt.");
  }
  const updated = await client.query(
    `UPDATE platform_announcements SET
       title = COALESCE($2,title), message = COALESCE($3,message),
       announcement_type = COALESCE($4,announcement_type), status = $5,
       targets = COALESCE($6::JSONB,targets), publish_at = COALESCE($7,publish_at),
       expires_at = $8
     WHERE id = $1 RETURNING *`,
    [
      announcementId,
      body.title == null ? null : requiredText(body.title, "Titel", 200),
      body.message == null ? null : requiredText(body.message, "Nachricht", 10_000),
      type, status,
      targets == null ? null : JSON.stringify(targets), publishAt, expiresAt
    ]
  );
  await audit(client, context, request, {
    action: "announcement.update", targetType: "announcement", targetId: announcementId,
    oldState: current.rows[0], newState: updated.rows[0], reason
  });
  return publicValue(updated.rows[0]);
}

async function advancePrivacyRequest(client, context, permissions, request, privacyId, body) {
  requirePermission(permissions, "privacy.manage");
  const reason = requiredText(body.reason, "Begründung", 1000);
  const rowVersion = integer(body.rowVersion, "Datenversion", 1);
  const current = await client.query("SELECT * FROM privacy_requests WHERE id = $1 FOR UPDATE", [privacyId]);
  if (current.rowCount !== 1) throw new InputError("Die Datenschutzanfrage wurde nicht gefunden.", 404, "privacy_request_not_found");
  if (Number(current.rows[0].row_version) !== rowVersion) throw new InputError("Die Anfrage wurde zwischenzeitlich geändert.", 409, "stale_write");
  const nextStatus = enumValue(body.status, new Set([
    "retention_review", "deactivated", "archived", "recovery_period",
    "confirmed", "processing", "completed", "rejected"
  ]), "Datenschutzstatus");
  const transitions = {
    recorded: ["retention_review", "rejected"],
    retention_review: ["deactivated", "processing", "rejected"],
    deactivated: ["archived", "rejected"], archived: ["recovery_period", "rejected"],
    recovery_period: ["confirmed", "rejected"], confirmed: ["processing"],
    processing: ["completed", "rejected"]
  };
  if (!(transitions[current.rows[0].status] || []).includes(nextStatus)) {
    throw new InputError("Dieser Datenschutzschritt ist in der aktuellen Phase nicht zulässig.", 409, "privacy_transition_invalid");
  }
  if (nextStatus === "confirmed" && current.rows[0].first_confirmed_by_platform_user_id === context.platformUserId) {
    throw new InputError("Die endgültige Bestätigung benötigt eine zweite berechtigte Person.", 403, "four_eyes_required");
  }
  const updated = await client.query(
    `UPDATE privacy_requests SET status = $2::VARCHAR,
       retention_review = CASE WHEN $2::VARCHAR = 'retention_review' THEN $3::JSONB ELSE retention_review END,
       first_confirmed_by_platform_user_id = CASE
         WHEN $2::VARCHAR = 'recovery_period' THEN $4 ELSE first_confirmed_by_platform_user_id END,
       second_confirmed_by_platform_user_id = CASE
         WHEN $2::VARCHAR = 'confirmed' THEN $4 ELSE second_confirmed_by_platform_user_id END,
       deletion_log = CASE WHEN $2::VARCHAR = 'completed' THEN $5::JSONB ELSE deletion_log END,
       completed_at = CASE WHEN $2::VARCHAR = 'completed' THEN CURRENT_TIMESTAMP ELSE NULL END
     WHERE id = $1 RETURNING *`,
    [privacyId, nextStatus, JSON.stringify(body.retentionReview || {}), context.platformUserId, JSON.stringify(body.deletionLog || { reason })]
  );
  await audit(client, context, request, {
    action: `privacy.${nextStatus}`, targetType: "privacy_request", targetId: privacyId,
    companyId: current.rows[0].company_id, oldState: current.rows[0], newState: updated.rows[0], reason
  });
  return publicValue(updated.rows[0]);
}

async function listSimple(client, table, order = "created_at DESC") {
  const allowed = new Set([
    "company_registration_requests", "support_tickets", "system_health_components",
    "platform_error_groups", "application_versions", "platform_announcements",
    "platform_backup_runs", "platform_restore_requests", "privacy_requests",
    "platform_settings", "platform_audit_log", "module_catalog"
  ]);
  if (!allowed.has(table)) throw new Error("Nicht erlaubte Plattformtabelle.");
  const result = await client.query(`SELECT * FROM ${table} ORDER BY ${order} LIMIT 500`);
  return publicValue(result.rows);
}

async function listVersions(client) {
  const versions = await listSimple(client, "application_versions", "created_at DESC");
  const outdated = await client.query(
    `WITH production AS (
       SELECT version FROM application_versions
       WHERE release_status = 'production'
       ORDER BY released_at DESC NULLS LAST LIMIT 1
     )
     SELECT account.id AS user_id,account.first_name,account.last_name,account.email,
            company.id AS company_id,company.display_name AS company_name,
            session.app_version,MAX(session.last_seen_at) AS last_seen_at,
            COUNT(*)::INTEGER AS active_session_count
     FROM user_sessions AS session
     JOIN users AS account
       ON account.company_id = session.company_id AND account.id = session.user_id
     JOIN companies AS company ON company.id = session.company_id
     CROSS JOIN production
     WHERE session.revoked_at IS NULL AND session.expires_at > CURRENT_TIMESTAMP
       AND session.app_version IS DISTINCT FROM production.version
     GROUP BY account.id,company.id,session.app_version
     ORDER BY MAX(session.last_seen_at) DESC
     LIMIT 500`
  );
  return { versions, outdatedUsers: publicValue(outdated.rows) };
}

async function listPlatformErrors(client) {
  const result = await client.query(
    `SELECT error_group.*,
            latest.company_id AS latest_company_id,
            latest.user_id AS latest_user_id,
            latest.device_class AS latest_device_class,
            latest.browser AS latest_browser,
            latest.operating_system AS latest_operating_system,
            latest.request_id AS latest_request_id,
            latest.sanitized_context AS latest_context,
            latest.occurred_at AS latest_occurrence_at
     FROM platform_error_groups AS error_group
     LEFT JOIN LATERAL (
       SELECT occurrence.company_id,occurrence.user_id,occurrence.device_class,
              occurrence.browser,occurrence.operating_system,occurrence.request_id,
              occurrence.sanitized_context,occurrence.occurred_at
       FROM platform_error_occurrences AS occurrence
       WHERE occurrence.error_group_id = error_group.id
       ORDER BY occurrence.occurred_at DESC LIMIT 1
     ) AS latest ON TRUE
     ORDER BY error_group.last_seen_at DESC LIMIT 500`
  );
  return publicValue(result.rows);
}

async function listSupportTickets(client) {
  const result = await client.query(
    `SELECT ticket.*,company.display_name AS company_name,
            CASE WHEN assignee.id IS NULL THEN NULL
                 ELSE assignee.first_name || ' ' || assignee.last_name END AS assignee_name,
            COALESCE((
              SELECT jsonb_agg(to_jsonb(event) ORDER BY event.created_at)
              FROM support_ticket_events AS event
              WHERE event.support_ticket_id = ticket.id
            ),'[]'::JSONB) AS history,
            COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'id',attachment.id,'fileName',attachment.file_name,
                'contentType',attachment.content_type,'sizeBytes',attachment.size_bytes,
                'createdAt',attachment.created_at
              ) ORDER BY attachment.created_at)
              FROM support_ticket_attachments AS attachment
              WHERE attachment.support_ticket_id = ticket.id
            ),'[]'::JSONB) AS attachments
     FROM support_tickets AS ticket
     JOIN companies AS company ON company.id = ticket.company_id
     LEFT JOIN platform_users AS assignee ON assignee.id = ticket.assigned_platform_user_id
     ORDER BY CASE ticket.priority
                WHEN 'critical' THEN 1 WHEN 'high' THEN 2
                WHEN 'normal' THEN 3 ELSE 4 END,
              ticket.updated_at DESC
     LIMIT 500`
  );
  return publicValue(result.rows);
}

async function supportContext(client, context, permissions, request, accessId) {
  requirePermission(permissions, "support.access");
  const access = await client.query(
    `SELECT access.*, company.display_name AS company_name, company.company_number
     FROM support_access_sessions AS access
     JOIN companies AS company ON company.id = access.company_id
     WHERE access.id = $1 AND access.platform_user_id = $2
       AND access.ended_at IS NULL AND access.expires_at > CURRENT_TIMESTAMP
     FOR UPDATE OF access`,
    [accessId, context.platformUserId]
  );
  if (access.rowCount !== 1) throw new InputError("Der Supportmodus ist nicht aktiv.", 409, "support_access_inactive");
  const row = access.rows[0];
  const details = await companyDetail(client, row.company_id);
  await client.query(
    `UPDATE support_access_sessions
     SET opened_areas = CASE WHEN opened_areas ? 'company_administration' THEN opened_areas
                             ELSE opened_areas || '["company_administration"]'::JSONB END
     WHERE id = $1`,
    [accessId]
  );
  await client.query(
    `INSERT INTO support_access_events (
       support_access_session_id, platform_user_id, event_type, area, details
     ) VALUES ($1,$2,'area_opened','company_administration','{}')`,
    [accessId, context.platformUserId]
  );
  await audit(client, context, request, {
    action: "support.area_open", targetType: "support_access", targetId: accessId,
    companyId: row.company_id, newState: { area: "company_administration" },
    reason: row.reason_detail
  });
  return { supportAccess: publicValue(row), ...details };
}

export function createPlatformHandler({ pool, config, limiter }) {
  return async function handlePlatformRequest(request, response, url) {
    if (!url.pathname.startsWith("/api/v1/platform")) return false;
    request[CLIENT_IP] = clientIp(request, config.trustedProxyHops);

    if (request.method === "GET" && url.pathname === "/api/v1/platform/setup") {
      json(response, 200, { setup: await setupStatus(pool) });
      return true;
    }
    if (request.method === "POST" && url.pathname === "/api/v1/platform/setup") {
      const account = await createPlatformSuperadmin(
        pool,
        config,
        limiter,
        request,
        await readJson(request)
      );
      json(response, 201, { account });
      return true;
    }
    if (request.method === "POST" && url.pathname === "/api/v1/platform/session") {
      const result = await login(pool, config, limiter, request, await readJson(request));
      json(response, 201, { session: result.session }, {
        "Set-Cookie": platformSessionCookie(result.token, {
          secure: config.cookieSecure, maxAge: config.sessionTtlSeconds
        })
      });
      return true;
    }

    if (["POST", "PATCH", "DELETE", "PUT"].includes(request.method)) {
      await consumeRateLimit(
        limiter,
        "platform_write_ip",
        limiter.key(requestIp(request), "platform-write"),
        { maximum: 300, windowMs: 5 * 60 * 1000 },
        "Zu viele Plattformänderungen von diesem Anschluss. Bitte kurz warten.",
        "write_rate_limited"
      );
    }

    const result = await authenticated(pool, request, async (client, context, permissions) => {
      if (request.method === "GET" && url.pathname === "/api/v1/platform/session") {
        return { status: 200, body: { session: await platformSessionView(client, context) } };
      }
      if (request.method === "DELETE" && url.pathname === "/api/v1/platform/session") {
        await client.query(
          `UPDATE platform_sessions SET revoked_at = CURRENT_TIMESTAMP, revocation_reason = 'logout'
           WHERE id = $1 AND revoked_at IS NULL`,
          [context.sessionId]
        );
        return { status: 200, body: { loggedOut: true }, clearCookie: true };
      }
      if (request.method === "GET" && url.pathname === "/api/v1/platform/overview") {
        requirePermission(permissions, "dashboard.read");
        return { status: 200, body: { overview: await dashboard(client) } };
      }
      if (request.method === "GET" && url.pathname === "/api/v1/platform/companies") {
        requirePermission(permissions, "companies.read");
        return { status: 200, body: { companies: await listCompanies(client, url) } };
      }
      if (request.method === "POST" && url.pathname === "/api/v1/platform/companies") {
        const company = await createCompany(client, context, permissions, request, await readJson(request));
        return { status: 201, body: { company } };
      }
      const firstAdminMatch = /^\/api\/v1\/platform\/companies\/([^/]+)\/administrator$/.exec(url.pathname);
      if (firstAdminMatch && request.method === "POST") {
        const ergebnis = await createFirstCompanyAdministrator(
          client, context, permissions, request,
          validateId(firstAdminMatch[1], "Firmen-ID"), await readJson(request)
        );
        return { status: 201, body: { administrator: ergebnis } };
      }
      const companyMatch = /^\/api\/v1\/platform\/companies\/([^/]+)$/.exec(url.pathname);
      if (companyMatch && request.method === "GET") {
        requirePermission(permissions, "companies.read");
        return { status: 200, body: await companyDetail(client, validateId(companyMatch[1], "Firmen-ID")) };
      }
      if (companyMatch && request.method === "PATCH") {
        const companyId = validateId(companyMatch[1], "Firmen-ID");
        const company = await updateCompany(client, context, permissions, request, companyId, await readJson(request));
        return { status: 200, body: { company } };
      }
      const moduleMatch = /^\/api\/v1\/platform\/companies\/([^/]+)\/modules\/([^/]+)$/.exec(url.pathname);
      if (moduleMatch && request.method === "PUT") {
        const entitlement = await updateCompanyModule(
          client, context, permissions, request,
          validateId(moduleMatch[1], "Firmen-ID"), moduleMatch[2], await readJson(request)
        );
        return { status: 200, body: { entitlement } };
      }
      const companyContractMatch = /^\/api\/v1\/platform\/companies\/([^/]+)\/contracts$/.exec(url.pathname);
      if (companyContractMatch && request.method === "POST") {
        const contract = await assignCompanyContract(
          client, context, permissions, request,
          validateId(companyContractMatch[1], "Firmen-ID"), await readJson(request)
        );
        return { status: 201, body: { contract } };
      }
      if (request.method === "GET" && url.pathname === "/api/v1/platform/modules") {
        requirePermission(permissions, "companies.read");
        return { status: 200, body: { modules: await listSimple(client, "module_catalog", "category, name") } };
      }
      if (request.method === "GET" && url.pathname === "/api/v1/platform/accounts") {
        requirePermission(permissions, "accounts.read");
        return { status: 200, body: { accounts: await listPlatformAccounts(client, url) } };
      }
      if (request.method === "GET" && url.pathname === "/api/v1/platform/administrators") {
        requirePermission(permissions, "platform_users.manage");
        return { status: 200, body: await listPlatformAdministrators(client) };
      }
      if (request.method === "POST" && url.pathname === "/api/v1/platform/administrators") {
        const administrator = await createPlatformAdministrator(
          client, context, permissions, request, await readJson(request)
        );
        return { status: 201, body: { administrator } };
      }
      const administratorMatch = /^\/api\/v1\/platform\/administrators\/([^/]+)\/actions$/.exec(url.pathname);
      if (administratorMatch && request.method === "POST") {
        const administrator = await platformAdministratorAction(
          client, context, permissions, request,
          validateId(administratorMatch[1], "Plattformkonto-ID"), await readJson(request)
        );
        return { status: 200, body: { administrator } };
      }
      const platformRoleMatch = /^\/api\/v1\/platform\/roles\/([^/]+)$/.exec(url.pathname);
      if (platformRoleMatch && request.method === "PATCH") {
        const role = await updatePlatformRole(
          client, context, permissions, request,
          validateId(platformRoleMatch[1], "Plattformrollen-ID"), await readJson(request)
        );
        return { status: 200, body: { role } };
      }
      const accountMatch = /^\/api\/v1\/platform\/accounts\/([^/]+)\/actions$/.exec(url.pathname);
      if (accountMatch && request.method === "POST") {
        const account = await accountAction(
          client, context, permissions, request,
          validateId(accountMatch[1], "Konto-ID"), await readJson(request)
        );
        return { status: 200, body: { account } };
      }
      if (request.method === "GET" && url.pathname === "/api/v1/platform/plans") {
        requirePermission(permissions, "companies.read");
        return { status: 200, body: { plans: await listPlans(client) } };
      }
      if (request.method === "POST" && url.pathname === "/api/v1/platform/plans") {
        requirePermission(permissions, "plans.manage");
        const body = await readJson(request);
        const reason = requiredText(body.reason, "Begründung", 1000);
        const planStatus = enumValue(
          body.status || "draft",
          new Set(["draft", "active", "retired"]),
          "Tarifstatus"
        );
        const planKey = requiredText(body.key, "Tarifschlüssel", 60).toLowerCase();
        if (!/^[a-z][a-z0-9_]*$/.test(planKey)) {
          throw new InputError("Der Tarifschlüssel darf nur Kleinbuchstaben, Zahlen und Unterstriche enthalten.");
        }
        const plan = await client.query(
          `INSERT INTO license_plans (plan_key,name,status,description)
           VALUES ($1,$2,$3,$4) RETURNING *`,
          [planKey, requiredText(body.name, "Name", 120), planStatus, optionalText(body.description, "Beschreibung", 2000)]
        );
        await audit(client, context, request, {
          action: "plan.create", targetType: "license_plan", targetId: plan.rows[0].id,
          newState: plan.rows[0], reason
        });
        return { status: 201, body: { plan: publicValue(plan.rows[0]) } };
      }
      const planMatch = /^\/api\/v1\/platform\/plans\/([^/]+)$/.exec(url.pathname);
      if (planMatch && request.method === "PATCH") {
        const plan = await updatePlan(
          client, context, permissions, request,
          validateId(planMatch[1], "Tarif-ID"), await readJson(request)
        );
        return { status: 200, body: { plan } };
      }
      const planVersionMatch = /^\/api\/v1\/platform\/plans\/([^/]+)\/versions$/.exec(url.pathname);
      if (planVersionMatch && request.method === "POST") {
        const version = await createPlanVersion(
          client, context, permissions, request,
          validateId(planVersionMatch[1], "Tarif-ID"), await readJson(request)
        );
        return { status: 201, body: { version } };
      }
      if (request.method === "GET" && url.pathname === "/api/v1/platform/registrations") {
        requirePermission(permissions, "companies.read");
        const registrations = await client.query(
          `SELECT id,registration_type,status,legal_name,display_name,contact_name,
                  contact_email,requested_plan_key,is_test_company,invitation_expires_at,
                  reviewed_by_platform_user_id,review_reason,reviewed_at,company_id,
                  created_at,updated_at,row_version
           FROM company_registration_requests ORDER BY created_at DESC LIMIT 500`
        );
        return { status: 200, body: { registrations: publicValue(registrations.rows) } };
      }
      if (request.method === "POST" && url.pathname === "/api/v1/platform/registrations") {
        requirePermission(permissions, "companies.create");
        const body = await readJson(request);
        const reason = requiredText(body.reason, "Begründung", 1000);
        const token = createSessionToken();
        const requestedPlanKey = requiredText(
          body.planKey || body.licensePlan || "standard", "Tarif", 60
        ).toLowerCase();
        if (!/^[a-z][a-z0-9_]*$/.test(requestedPlanKey)) throw new InputError("Der Tarifschlüssel ist ungültig.");
        const plan = await client.query(
          "SELECT 1 FROM license_plans WHERE plan_key = $1 AND status IN ('active','draft')",
          [requestedPlanKey]
        );
        if (plan.rowCount !== 1) throw new InputError("Der gewünschte Tarif wurde nicht gefunden.", 404, "plan_not_found");
        const registration = await client.query(
          `INSERT INTO company_registration_requests (
             registration_type,status,legal_name,display_name,contact_name,contact_email,
             requested_plan_key,is_test_company,invitation_token_hash,invitation_expires_at,
             invited_by_platform_user_id
           ) VALUES ('invitation','pending',$1,$2,$3,$4,$5,$6,$7,
                     CURRENT_TIMESTAMP + ($8 * INTERVAL '1 day'),$9)
           RETURNING *`,
          [
            requiredText(body.legalName, "Firmenname", 200),
            requiredText(body.displayName || body.legalName, "Anzeigename", 120),
            requiredText(body.contactName, "Ansprechpartner", 200),
            requiredText(body.contactEmail, "E-Mail-Adresse", 254).toLowerCase(),
            requestedPlanKey, Boolean(body.isTestCompany), hashSessionToken(token),
            integer(body.expiresInDays ?? 7, "Einladungsdauer", 1, 90), context.platformUserId
          ]
        );
        await audit(client, context, request, {
          action: "registration.invite", targetType: "registration", targetId: registration.rows[0].id,
          newState: { ...registration.rows[0], invitation_token_hash: undefined }, reason
        });
        return {
          status: 201,
          body: { registration: publicRegistration(registration.rows[0]), invitationToken: token }
        };
      }
      const registrationMatch = /^\/api\/v1\/platform\/registrations\/([^/]+)$/.exec(url.pathname);
      if (registrationMatch && request.method === "PATCH") {
        const result = await updateRegistration(
          client, context, permissions, request,
          validateId(registrationMatch[1], "Registrierungs-ID"), await readJson(request)
        );
        return { status: 200, body: result };
      }
      if (request.method === "GET" && url.pathname === "/api/v1/platform/support/tickets") {
        requirePermission(permissions, "support.manage");
        return { status: 200, body: { tickets: await listSupportTickets(client) } };
      }
      if (request.method === "POST" && url.pathname === "/api/v1/platform/support/tickets") {
        requirePermission(permissions, "support.manage");
        const body = await readJson(request);
        const reason = requiredText(body.reason, "Begründung", 1000);
        const priority = enumValue(
          body.priority || "normal",
          new Set(["low", "normal", "high", "critical"]),
          "Priorität"
        );
        const companyId = validateId(body.companyId, "Firmen-ID");
        await ensureCompany(client, companyId);
        const assigneeId = await ensurePlatformAssignee(client, body.assigneeId);
        const ticket = await client.query(
          `INSERT INTO support_tickets (
             company_id,contact_name,contact_email,category,priority,subject,description,
             assigned_platform_user_id,status
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
          [
            companyId, requiredText(body.contactName, "Ansprechpartner", 200),
            optionalText(body.contactEmail, "E-Mail-Adresse", 254), requiredText(body.category, "Kategorie", 40),
            priority, requiredText(body.subject, "Betreff", 200),
            requiredText(body.description, "Beschreibung", 10_000), assigneeId,
            assigneeId ? "assigned" : "new"
          ]
        );
        await client.query(
          `INSERT INTO support_ticket_events (support_ticket_id,platform_user_id,event_type,message,new_state)
           VALUES ($1,$2,'created',$3,$4::JSONB)`,
          [ticket.rows[0].id, context.platformUserId, reason, JSON.stringify(ticket.rows[0])]
        );
        await audit(client, context, request, {
          action: "support.ticket_create", targetType: "support_ticket", targetId: ticket.rows[0].id,
          companyId: ticket.rows[0].company_id, newState: ticket.rows[0], reason
        });
        return { status: 201, body: { ticket: publicValue(ticket.rows[0]) } };
      }
      const supportTicketMatch = /^\/api\/v1\/platform\/support\/tickets\/([^/]+)$/.exec(url.pathname);
      if (supportTicketMatch && request.method === "PATCH") {
        const ticket = await updateSupportTicket(
          client, context, permissions, request,
          validateId(supportTicketMatch[1], "Supportfall-ID"), await readJson(request)
        );
        return { status: 200, body: { ticket } };
      }
      if (request.method === "POST" && url.pathname === "/api/v1/platform/support-access") {
        requirePermission(permissions, "support.access");
        const body = await readJson(request);
        const reasonCode = enumValue(body.reasonCode, SUPPORT_REASONS, "Zugriffsgrund");
        const reasonDetail = requiredText(body.reasonDetail, "Begründung", 1000);
        const supportCompanyId = validateId(body.companyId, "Firmen-ID");
        await ensureCompany(client, supportCompanyId);
        const supportTicketId = body.supportTicketId
          ? validateId(body.supportTicketId, "Supportfall-ID")
          : null;
        if (supportTicketId) {
          const ticket = await client.query(
            "SELECT 1 FROM support_tickets WHERE id = $1 AND company_id = $2",
            [supportTicketId, supportCompanyId]
          );
          if (ticket.rowCount !== 1) {
            throw new InputError("Der Supportfall gehört nicht zur ausgewählten Firma.", 409, "support_ticket_company_mismatch");
          }
        }
        await client.query(
          `UPDATE support_access_sessions SET ended_at = expires_at
           WHERE platform_user_id = $1 AND ended_at IS NULL
             AND expires_at <= CURRENT_TIMESTAMP`,
          [context.platformUserId]
        );
        const access = await client.query(
          `INSERT INTO support_access_sessions (
             platform_user_id,company_id,reason_code,reason_detail,support_ticket_id,expires_at
           ) VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP + INTERVAL '60 minutes') RETURNING *`,
          [context.platformUserId, supportCompanyId, reasonCode, reasonDetail, supportTicketId]
        );
        await client.query(
          `INSERT INTO support_access_events (support_access_session_id,platform_user_id,event_type,details)
           VALUES ($1,$2,'started',$3::JSONB)`,
          [access.rows[0].id, context.platformUserId, JSON.stringify({ reasonCode })]
        );
        await audit(client, context, request, {
          action: "support.access_start", targetType: "support_access", targetId: access.rows[0].id,
          companyId: access.rows[0].company_id, newState: access.rows[0], reason: reasonDetail
        });
        return { status: 201, body: { supportAccess: publicValue(access.rows[0]) } };
      }
      const supportContextMatch = /^\/api\/v1\/platform\/support-access\/([^/]+)\/context$/.exec(url.pathname);
      if (supportContextMatch && request.method === "GET") {
        return { status: 200, body: await supportContext(
          client, context, permissions, request, validateId(supportContextMatch[1], "Supportzugriff-ID")
        ) };
      }
      const supportEndMatch = /^\/api\/v1\/platform\/support-access\/([^/]+)\/end$/.exec(url.pathname);
      if (supportEndMatch && request.method === "POST") {
        requirePermission(permissions, "support.access");
        const body = await readJson(request);
        const reason = requiredText(body.reason || "Supportmodus beendet", "Begründung", 1000);
        const accessId = validateId(supportEndMatch[1], "Supportzugriff-ID");
        const access = await client.query(
          `UPDATE support_access_sessions SET ended_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND platform_user_id = $2 AND ended_at IS NULL RETURNING *`,
          [accessId, context.platformUserId]
        );
        if (access.rowCount !== 1) throw new InputError("Der Supportmodus ist nicht aktiv.", 409, "support_access_inactive");
        await client.query(
          `INSERT INTO support_access_events (support_access_session_id,platform_user_id,event_type,details)
           VALUES ($1,$2,'ended',$3::JSONB)`,
          [accessId, context.platformUserId, JSON.stringify({ reason })]
        );
        await audit(client, context, request, {
          action: "support.access_end", targetType: "support_access", targetId: accessId,
          companyId: access.rows[0].company_id, newState: access.rows[0], reason
        });
        return { status: 200, body: { supportAccess: publicValue(access.rows[0]) } };
      }
      if (request.method === "GET" && url.pathname === "/api/v1/platform/health") {
        requirePermission(permissions, "health.manage");
        return { status: 200, body: { components: await listSimple(client, "system_health_components", "name") } };
      }
      const healthMatch = /^\/api\/v1\/platform\/health\/([a-z][a-z0-9_]*)$/.exec(url.pathname);
      if (healthMatch && request.method === "PATCH") {
        const component = await updateHealthComponent(
          client, context, permissions, request, healthMatch[1], await readJson(request)
        );
        return { status: 200, body: { component } };
      }
      if (request.method === "GET" && url.pathname === "/api/v1/platform/errors") {
        requirePermission(permissions, "errors.manage");
        return { status: 200, body: { errors: await listPlatformErrors(client) } };
      }
      const errorMatch = /^\/api\/v1\/platform\/errors\/([^/]+)$/.exec(url.pathname);
      if (errorMatch && request.method === "PATCH") {
        const error = await updateErrorGroup(
          client, context, permissions, request,
          validateId(errorMatch[1], "Fehler-ID"), await readJson(request)
        );
        return { status: 200, body: { error } };
      }
      if (request.method === "GET" && url.pathname === "/api/v1/platform/versions") {
        requirePermission(permissions, "versions.manage");
        return { status: 200, body: await listVersions(client) };
      }
      if (request.method === "POST" && url.pathname === "/api/v1/platform/versions") {
        const version = await createVersion(client, context, permissions, request, await readJson(request));
        return { status: 201, body: { version } };
      }
      const versionMatch = /^\/api\/v1\/platform\/versions\/([^/]+)$/.exec(url.pathname);
      if (versionMatch && request.method === "PATCH") {
        const version = await updateVersion(
          client, context, permissions, request,
          validateId(versionMatch[1], "Versions-ID"), await readJson(request)
        );
        return { status: 200, body: { version } };
      }
      if (request.method === "GET" && url.pathname === "/api/v1/platform/announcements") {
        requirePermission(permissions, "announcements.manage");
        return { status: 200, body: { announcements: await listSimple(client, "platform_announcements", "created_at DESC") } };
      }
      if (request.method === "POST" && url.pathname === "/api/v1/platform/announcements") {
        requirePermission(permissions, "announcements.manage");
        const body = await readJson(request);
        const reason = requiredText(body.reason, "Begründung", 1000);
        const announcementType = enumValue(
          body.type,
          new Set(["maintenance", "outage", "security", "feature", "update", "terms"]),
          "Mitteilungsart"
        );
        const announcementStatus = enumValue(
          body.status || "draft",
          new Set(["draft", "scheduled", "published", "disabled"]),
          "Mitteilungsstatus"
        );
        const targets = await validateAnnouncementTargets(client, body.targets || { scope: "all" });
        const publishAt = optionalTimestamp(body.publishAt, "Veröffentlichung");
        const expiresAt = optionalTimestamp(body.expiresAt, "Ablaufdatum");
        if (publishAt && expiresAt && new Date(expiresAt) <= new Date(publishAt)) {
          throw new InputError("Das Ablaufdatum muss nach der Veröffentlichung liegen.");
        }
        if (announcementStatus === "scheduled" && !publishAt) {
          throw new InputError("Eine geplante Mitteilung benötigt einen Veröffentlichungszeitpunkt.");
        }
        const announcement = await client.query(
          `INSERT INTO platform_announcements (
             title,message,announcement_type,status,targets,publish_at,expires_at,created_by_platform_user_id
           ) VALUES ($1,$2,$3,$4,$5::JSONB,$6,$7,$8) RETURNING *`,
          [
            requiredText(body.title, "Titel", 200), requiredText(body.message, "Nachricht", 10_000),
            announcementType, announcementStatus, JSON.stringify(targets),
            publishAt, expiresAt, context.platformUserId
          ]
        );
        await audit(client, context, request, {
          action: "announcement.create", targetType: "announcement", targetId: announcement.rows[0].id,
          newState: announcement.rows[0], reason
        });
        return { status: 201, body: { announcement: publicValue(announcement.rows[0]) } };
      }
      const announcementMatch = /^\/api\/v1\/platform\/announcements\/([^/]+)$/.exec(url.pathname);
      if (announcementMatch && request.method === "PATCH") {
        const announcement = await updateAnnouncement(
          client, context, permissions, request,
          validateId(announcementMatch[1], "Mitteilungs-ID"), await readJson(request)
        );
        return { status: 200, body: { announcement } };
      }
      if (request.method === "GET" && url.pathname === "/api/v1/platform/backups") {
        requirePermission(permissions, "backups.manage");
        return { status: 200, body: {
          backups: await listSimple(client, "platform_backup_runs", "requested_at DESC"),
          restores: await listSimple(client, "platform_restore_requests", "prepared_at DESC")
        } };
      }
      if (request.method === "POST" && url.pathname === "/api/v1/platform/backups") {
        requirePermission(permissions, "backups.manage");
        const body = await readJson(request);
        const reason = requiredText(body.reason, "Begründung", 1000);
        const backupType = enumValue(
          body.type || "manual",
          new Set(["scheduled", "manual", "company", "test_restore"]),
          "Backupart"
        );
        const backupCompanyId = body.companyId ? validateId(body.companyId, "Firmen-ID") : null;
        if (backupType === "company" && !backupCompanyId) {
          throw new InputError("Ein Firmenbackup benötigt eine Firma.");
        }
        if (backupCompanyId) await ensureCompany(client, backupCompanyId);
        const backup = await client.query(
          `INSERT INTO platform_backup_runs (backup_type,status,scope_company_id,requested_by_platform_user_id)
           VALUES ($1,'queued',$2,$3) RETURNING *`,
          [backupType, backupCompanyId, context.platformUserId]
        );
        await audit(client, context, request, {
          action: "backup.queue", targetType: "backup", targetId: backup.rows[0].id,
          companyId: backup.rows[0].scope_company_id, newState: backup.rows[0], reason
        });
        return { status: 202, body: { backup: publicValue(backup.rows[0]) } };
      }
      if (request.method === "POST" && url.pathname === "/api/v1/platform/restores") {
        const restore = await prepareRestore(client, context, permissions, request, await readJson(request));
        return { status: 201, body: { restore } };
      }
      const restoreMatch = /^\/api\/v1\/platform\/restores\/([^/]+)\/confirm$/.exec(url.pathname);
      if (restoreMatch && request.method === "POST") {
        const restore = await confirmRestore(
          client, context, permissions, request,
          validateId(restoreMatch[1], "Wiederherstellungs-ID"), await readJson(request)
        );
        return { status: 200, body: { restore } };
      }
      if (request.method === "GET" && url.pathname === "/api/v1/platform/privacy") {
        requirePermission(permissions, "privacy.manage");
        return { status: 200, body: { requests: await listSimple(client, "privacy_requests", "created_at DESC") } };
      }
      if (request.method === "POST" && url.pathname === "/api/v1/platform/privacy") {
        requirePermission(permissions, "privacy.manage");
        const body = await readJson(request);
        const privacyType = enumValue(
          body.type,
          new Set(["company_export", "user_export", "company_deletion", "user_deletion", "anonymization"]),
          "Datenschutzanfrage"
        );
        let privacyCompanyId = body.companyId ? validateId(body.companyId, "Firmen-ID") : null;
        const privacyUserId = body.userId ? validateId(body.userId, "Benutzer-ID") : null;
        if (!privacyCompanyId && !privacyUserId) {
          throw new InputError("Eine Datenschutzanfrage benötigt eine Firma oder ein Benutzerkonto.");
        }
        if (["company_export", "company_deletion", "anonymization"].includes(privacyType)
            && !privacyCompanyId) {
          throw new InputError("Diese Datenschutzanfrage benötigt eine Firma.");
        }
        if (["user_export", "user_deletion"].includes(privacyType) && !privacyUserId) {
          throw new InputError("Diese Datenschutzanfrage benötigt ein Benutzerkonto.");
        }
        if (privacyCompanyId) await ensureCompany(client, privacyCompanyId);
        if (privacyUserId) {
          const targetUser = await client.query(
            "SELECT company_id FROM users WHERE id = $1",
            [privacyUserId]
          );
          if (targetUser.rowCount !== 1) throw new InputError("Das Benutzerkonto wurde nicht gefunden.", 404, "account_not_found");
          if (privacyCompanyId && targetUser.rows[0].company_id !== privacyCompanyId) {
            throw new InputError("Benutzerkonto und Firma passen nicht zusammen.", 409, "privacy_scope_mismatch");
          }
          privacyCompanyId ||= targetUser.rows[0].company_id;
        }
        if (body.retentionReview != null
            && (typeof body.retentionReview !== "object" || Array.isArray(body.retentionReview))) {
          throw new InputError("Die Aufbewahrungsprüfung ist ungültig.");
        }
        const privacyReason = requiredText(body.reason, "Begründung", 1000);
        const privacy = await client.query(
          `INSERT INTO privacy_requests (
             request_type,company_id,user_id,status,reason,retention_review,
             recovery_deadline,created_by_platform_user_id
           ) VALUES ($1,$2,$3,'recorded',$4,$5::JSONB,$6,$7) RETURNING *`,
          [privacyType, privacyCompanyId, privacyUserId, privacyReason, JSON.stringify(body.retentionReview || {}), optionalTimestamp(body.recoveryDeadline, "Wiederherstellungsfrist"), context.platformUserId]
        );
        await audit(client, context, request, {
          action: "privacy.request_create", targetType: "privacy_request", targetId: privacy.rows[0].id,
          companyId: privacy.rows[0].company_id, newState: privacy.rows[0], reason: privacyReason
        });
        return { status: 201, body: { request: publicValue(privacy.rows[0]) } };
      }
      const privacyMatch = /^\/api\/v1\/platform\/privacy\/([^/]+)$/.exec(url.pathname);
      if (privacyMatch && request.method === "PATCH") {
        const privacy = await advancePrivacyRequest(
          client, context, permissions, request,
          validateId(privacyMatch[1], "Datenschutzanfrage-ID"), await readJson(request)
        );
        return { status: 200, body: { request: privacy } };
      }
      if (request.method === "GET" && url.pathname === "/api/v1/platform/audit") {
        requirePermission(permissions, "audit.read");
        return { status: 200, body: { audit: await listSimple(client, "platform_audit_log", "occurred_at DESC") } };
      }
      if (request.method === "GET" && url.pathname === "/api/v1/platform/settings") {
        requirePermission(permissions, "settings.manage");
        return { status: 200, body: { settings: await listSimple(client, "platform_settings", "setting_key") } };
      }
      const settingMatch = /^\/api\/v1\/platform\/settings\/([a-z0-9_.]+)$/.exec(url.pathname);
      if (settingMatch && request.method === "PUT") {
        requirePermission(permissions, "settings.manage");
        const body = await readJson(request);
        const reason = requiredText(body.reason, "Begründung", 1000);
        const value = await validatedSettingValue(client, settingMatch[1], body.value);
        const before = await client.query("SELECT * FROM platform_settings WHERE setting_key = $1", [settingMatch[1]]);
        if (before.rowCount !== 1) {
          throw new InputError("Die Systemeinstellung wurde nicht gefunden.", 404, "setting_not_found");
        }
        const setting = await client.query(
          `UPDATE platform_settings SET
             value = $2::JSONB,
             changed_by_platform_user_id = $3,
             change_reason = $4
           WHERE setting_key = $1 RETURNING *`,
          [settingMatch[1], JSON.stringify(value), context.platformUserId, reason]
        );
        await audit(client, context, request, {
          action: "setting.update", targetType: "platform_setting", targetId: settingMatch[1],
          oldState: before.rows[0] || null, newState: setting.rows[0], reason
        });
        return { status: 200, body: { setting: publicValue(setting.rows[0]) } };
      }
      throw new InputError("Plattformendpunkt nicht gefunden.", 404, "not_found");
    });

    const headers = result.clearCookie ? {
      "Set-Cookie": platformSessionCookie("", { secure: config.cookieSecure, maxAge: 0 })
    } : {};
    json(response, result.status, result.body, headers);
    return true;
  };
}
