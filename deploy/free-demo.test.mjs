import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const base = {
  PATH: process.env.PATH,
  NODE_ENV: "production",
  APP_ENVIRONMENT: "demo",
  DATABASE_URL: "postgresql://migration_owner:test_secret@ep-example.eu-central-1.aws.neon.tech/demo?sslmode=verify-full&sslrootcert=system",
  API_DB_USER: "schaefchen_api_login",
  API_DB_PASSWORD: "different_test_secret",
  API_ALLOWED_ORIGIN: "https://example.onrender.com",
  API_DB_SSL_MODE: "verify-full",
  API_DB_POOL_SIZE: "3"
};
const run = (overrides = {}) => spawnSync(process.execPath, ["deploy/validate-free-demo.mjs"], {
  cwd: new URL("../", import.meta.url),
  env: { ...base, ...overrides }, encoding: "utf8"
});

test("direct TLS-verified demo configuration passes without exposing credentials", () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout + result.stderr, /test_secret|postgresql:\/\//);
});

for (const [name, overrides] of [
  ["real-data environment", { APP_ENVIRONMENT: "production" }],
  ["pooled migration endpoint", { DATABASE_URL: base.DATABASE_URL.replace("ep-example.", "ep-example-pooler.") }],
  ["unverified migration TLS", { DATABASE_URL: base.DATABASE_URL.replace("verify-full", "require") }],
  ["missing system trust store", { DATABASE_URL: base.DATABASE_URL.replace("&sslrootcert=system", "") }],
  ["unverified API TLS", { API_DB_SSL_MODE: "require" }],
  ["owner reused by API", { API_DB_USER: "migration_owner" }],
  ["oversized pool", { API_DB_POOL_SIZE: "10" }],
  ["unrelated database", { DATABASE_URL: base.DATABASE_URL.replace("neon.tech", "example.org") }],
  ["malformed URL containing a secret", { DATABASE_URL: "postgresql://bad:test_secret@[]" }]
]) {
  test(`rejects ${name} without exposing credentials`, () => {
    const result = run(overrides);
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stdout + result.stderr, /test_secret|postgresql:\/\//);
  });
}
