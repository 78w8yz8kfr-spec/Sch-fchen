import pg from "pg";
import { InputError } from "./validation.mjs";
import { loadCompanyModules } from "./company-modules.mjs";

const { Pool } = pg;

export function companyLogoUrl(objectKey) {
  if (typeof objectKey !== "string" || objectKey.length === 0) return null;
  const segments = objectKey.split("/");
  if (segments.some((segment) => (
    segment === ""
    || segment === "."
    || segment === ".."
    || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment)
  ))) return null;
  return `./assets/${segments.map(encodeURIComponent).join("/")}`;
}

export function createPool(databaseConfig) {
  return new Pool(databaseConfig);
}

async function beginAsApi(client) {
  await client.query("BEGIN");
  await client.query("SET LOCAL ROLE schaefchen_api");
}

async function beginAsPlatformApi(client) {
  await client.query("BEGIN");
  await client.query("SET LOCAL ROLE schaefchen_platform_api");
}

async function setTenant(client, companyId, userId) {
  await client.query(
    "SELECT set_config('app.current_company_id', $1, TRUE), set_config('app.current_user_id', $2, TRUE)",
    [companyId, userId]
  );
}

export async function withApiTransaction(pool, callback) {
  const client = await pool.connect();
  try {
    await beginAsApi(client);
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function withPlatformTransaction(pool, callback) {
  const client = await pool.connect();
  try {
    await beginAsPlatformApi(client);
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function withPlatformSessionTransaction(pool, tokenHash, callback) {
  return withPlatformTransaction(pool, async (client) => {
    const resolved = await client.query(
      "SELECT session_id, platform_user_id, expires_at FROM api_resolve_platform_session($1::CHAR(64))",
      [tokenHash]
    );
    if (resolved.rowCount !== 1) {
      throw new InputError("Die Plattformsitzung ist ungültig oder abgelaufen.", 401, "unauthorized");
    }
    const row = resolved.rows[0];
    const context = {
      sessionId: row.session_id,
      platformUserId: row.platform_user_id,
      expiresAt: row.expires_at
    };
    await client.query(
      "SELECT set_config('app.current_platform_user_id', $1, TRUE)",
      [context.platformUserId]
    );
    return callback(client, context);
  });
}

export async function platformSessionView(client, context) {
  const result = await client.query(
    `SELECT account.id, account.first_name, account.last_name, account.email,
            account.two_factor_enabled,
            COALESCE(jsonb_agg(DISTINCT role.role_key ORDER BY role.role_key)
              FILTER (WHERE role.id IS NOT NULL), '[]'::jsonb) AS roles,
            COALESCE(jsonb_agg(DISTINCT permission.value ORDER BY permission.value)
              FILTER (WHERE permission.value IS NOT NULL), '[]'::jsonb) AS permissions
     FROM platform_users AS account
     LEFT JOIN platform_user_roles AS assignment
       ON assignment.platform_user_id = account.id AND assignment.revoked_at IS NULL
     LEFT JOIN platform_roles AS role ON role.id = assignment.platform_role_id
     LEFT JOIN LATERAL jsonb_array_elements_text(role.permissions) AS permission(value) ON TRUE
     WHERE account.id = $1 AND account.status = 'active'
     GROUP BY account.id`,
    [context.platformUserId]
  );
  if (result.rowCount !== 1) {
    throw new InputError("Das Plattformkonto ist nicht mehr aktiv.", 401, "unauthorized");
  }
  const row = result.rows[0];
  return {
    expiresAt: new Date(context.expiresAt).toISOString(),
    platformUser: {
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      twoFactorEnabled: row.two_factor_enabled,
      roles: row.roles,
      permissions: row.permissions
    }
  };
}

export async function withTenantTransaction(pool, context, callback) {
  return withApiTransaction(pool, async (client) => {
    await setTenant(client, context.companyId, context.userId);
    return callback(client);
  });
}

export async function withSessionTransaction(pool, tokenHash, callback) {
  return withApiTransaction(pool, async (client) => {
    const resolved = await client.query(
      "SELECT session_id, company_id, user_id, expires_at FROM api_resolve_session($1::CHAR(64))",
      [tokenHash]
    );
    if (resolved.rowCount !== 1) {
      throw new InputError("Die Sitzung ist ungültig oder abgelaufen.", 401, "unauthorized");
    }

    const row = resolved.rows[0];
    const context = {
      sessionId: row.session_id,
      companyId: row.company_id,
      userId: row.user_id,
      expiresAt: row.expires_at
    };
    await setTenant(client, context.companyId, context.userId);
    return callback(client, context);
  });
}

export async function sessionView(client, context) {
  const result = await client.query(
    `SELECT
       company.company_number,
       company.display_name,
       company.logo_object_key,
       account.id AS user_id,
       account.personnel_number,
       account.first_name,
       account.last_name,
       account.must_change_password,
       -- Fuehrt jemand ein Berichtsheft, das dieser Mensch unterschreibt?
       -- Sehen und unterschreiben darf ausschliesslich der eingetragene
       -- Ausbilder; ohne diese Angabe wuesste die App nicht, wem sie die
       -- Pruefung ueberhaupt anbieten darf. Ob jemand selbst ein Berichtsheft
       -- fuehrt, sagt seine Rolle - dafuer braucht es hier nichts.
       EXISTS (
         SELECT 1 FROM users AS lehrling
         WHERE lehrling.company_id = account.company_id
           AND lehrling.trainer_user_id = account.id
           AND lehrling.status = 'active'
       ) AS is_trainer,
       COALESCE(
         jsonb_agg(role.role_key ORDER BY role.role_key)
           FILTER (WHERE role.id IS NOT NULL),
         '[]'::jsonb
       ) AS roles
     FROM users AS account
     JOIN companies AS company ON company.id = account.company_id
     LEFT JOIN user_roles AS assignment
       ON assignment.company_id = account.company_id
      AND assignment.user_id = account.id
      AND assignment.revoked_at IS NULL
     LEFT JOIN roles AS role
       ON role.company_id = assignment.company_id
      AND role.id = assignment.role_id
      AND role.status = 'active'
     WHERE account.company_id = $1 AND account.id = $2
     GROUP BY company.company_number, company.display_name, company.logo_object_key, account.id`,
    [context.companyId, context.userId]
  );
  if (result.rowCount !== 1) {
    throw new InputError("Das Benutzerkonto ist nicht mehr aktiv.", 401, "unauthorized");
  }
  const row = result.rows[0];
  // Abgeschaltete Bereiche muss auch ein Monteur kennen, damit die App sie gar
  // nicht erst anbietet. Sonst fuehrte jede Bedienung ins Leere.
  const modules = await loadCompanyModules(client, context);
  return {
    expiresAt: new Date(context.expiresAt).toISOString(),
    modules: Object.fromEntries(modules.map((module) => [module.key, module.enabled])),
    company: {
      number: row.company_number,
      displayName: row.display_name,
      logoUrl: companyLogoUrl(row.logo_object_key)
    },
    user: {
      id: row.user_id,
      personnelNumber: row.personnel_number,
      firstName: row.first_name,
      lastName: row.last_name,
      mustChangePassword: row.must_change_password,
      isTrainer: Boolean(row.is_trainer),
      roles: row.roles
    }
  };
}
