import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";
import pg from "pg";
import { createApp } from "../src/app.mjs";
import { createPool } from "../src/database.mjs";
import { hashPassword } from "../src/password.mjs";
import { localDate } from "../src/validation.mjs";

const enabled = process.env.API_INTEGRATION_TEST === "true";
const integrationTest = enabled ? test : test.skip;

integrationTest("Login, Sitzung und idempotente Offline-Zeitbuchung funktionieren mit PostgreSQL", async (t) => {
  const adminPool = new pg.Pool({
    host: process.env.POSTGRES_HOST,
    port: Number(process.env.POSTGRES_PORT || 5432),
    database: process.env.POSTGRES_DB,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD
  });
  const suffix = Date.now().toString(36).toUpperCase();
  const personnelNumber = `API-${suffix}`;
  const password = "API-Integration-2026!";

  const fixture = await adminPool.connect();
  try {
    await fixture.query("BEGIN");
    const company = await fixture.query("SELECT id FROM companies WHERE company_number = 'F-000001'");
    assert.equal(company.rowCount, 1);
    const user = await fixture.query(
      `INSERT INTO users (
         company_id, personnel_number, first_name, last_name, password_hash, must_change_password
       ) VALUES ($1, $2, 'API', 'Integration', $3, FALSE)
       RETURNING id`,
      [company.rows[0].id, personnelNumber, await hashPassword(password)]
    );
    await fixture.query(
      `INSERT INTO user_roles (company_id, user_id, role_id)
       SELECT $1, $2, id FROM roles WHERE company_id = $1 AND role_key = 'installer'`,
      [company.rows[0].id, user.rows[0].id]
    );
    await fixture.query("COMMIT");
  } catch (error) {
    await fixture.query("ROLLBACK");
    throw error;
  } finally {
    fixture.release();
  }

  const config = {
    port: 0,
    allowedOrigin: "http://localhost:4173",
    timeZone: "Europe/Berlin",
    sessionTtlSeconds: 3600,
    cookieSecure: false,
    database: {
      host: process.env.POSTGRES_HOST,
      port: Number(process.env.POSTGRES_PORT || 5432),
      database: process.env.POSTGRES_DB,
      user: process.env.API_DB_USER,
      password: process.env.API_DB_PASSWORD,
      max: 4
    }
  };
  const apiPool = createPool(config.database);
  const server = createServer(createApp({ pool: apiPool, config, logger: { error() {} } }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await apiPool.end();
    await adminPool.end();
  });

  const login = await fetch(`${baseUrl}/api/v1/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: config.allowedOrigin },
    body: JSON.stringify({ companyNumber: "F-000001", personnelNumber, password })
  });
  assert.equal(login.status, 201);
  const cookie = login.headers.get("set-cookie").split(";", 1)[0];
  const loginBody = await login.json();
  assert.equal(loginBody.session.company.number, "F-000001");
  assert.deepEqual(loginBody.session.user.roles, ["installer"]);

  const session = await fetch(`${baseUrl}/api/v1/session`, { headers: { Cookie: cookie } });
  assert.equal(session.status, 200);

  const clockInAt = new Date(Date.now() - 2000).toISOString();
  const clockOutAt = new Date(Date.now() - 1000).toISOString();
  const clockIn = {
    clientEntryId: randomUUID(),
    entryType: "clock_in",
    recordedAt: clockInAt,
    clientCreatedAt: clockInAt
  };
  const first = await fetch(`${baseUrl}/api/v1/time-entries`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(clockIn)
  });
  assert.equal(first.status, 201, await first.text());

  const duplicate = await fetch(`${baseUrl}/api/v1/time-entries`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(clockIn)
  });
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json()).timeEntry.idempotent, true);

  const clockOut = await fetch(`${baseUrl}/api/v1/time-entries`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      clientEntryId: randomUUID(),
      entryType: "clock_out",
      recordedAt: clockOutAt,
      clientCreatedAt: clockOutAt
    })
  });
  assert.equal(clockOut.status, 201, await clockOut.text());

  const workDate = localDate(clockInAt, config.timeZone);
  const workDay = await fetch(`${baseUrl}/api/v1/work-days/${workDate}`, { headers: { Cookie: cookie } });
  assert.equal(workDay.status, 200);
  assert.equal((await workDay.json()).workDay.entries.length, 2);

  const logout = await fetch(`${baseUrl}/api/v1/session`, { method: "DELETE", headers: { Cookie: cookie } });
  assert.equal(logout.status, 200);
  const rejected = await fetch(`${baseUrl}/api/v1/session`, { headers: { Cookie: cookie } });
  assert.equal(rejected.status, 401);
});
