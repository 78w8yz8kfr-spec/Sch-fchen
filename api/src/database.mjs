import pg from "pg";
import { InputError } from "./validation.mjs";

const { Pool } = pg;

export function createPool(databaseConfig) {
  return new Pool(databaseConfig);
}

async function beginAsApi(client) {
  await client.query("BEGIN");
  await client.query("SET LOCAL ROLE schaefchen_api");
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
       account.id AS user_id,
       account.personnel_number,
       account.first_name,
       account.last_name,
       account.must_change_password,
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
     GROUP BY company.company_number, company.display_name, account.id`,
    [context.companyId, context.userId]
  );
  if (result.rowCount !== 1) {
    throw new InputError("Das Benutzerkonto ist nicht mehr aktiv.", 401, "unauthorized");
  }
  const row = result.rows[0];
  return {
    expiresAt: new Date(context.expiresAt).toISOString(),
    company: { number: row.company_number, displayName: row.display_name },
    user: {
      id: row.user_id,
      personnelNumber: row.personnel_number,
      firstName: row.first_name,
      lastName: row.last_name,
      mustChangePassword: row.must_change_password,
      roles: row.roles
    }
  };
}
