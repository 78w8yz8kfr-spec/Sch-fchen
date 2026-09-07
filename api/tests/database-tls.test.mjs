import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.mjs";

function configuration(values = {}) {
  const previous = process.env;
  process.env = {
    API_DB_USER: "schaefchen_api_login",
    API_DB_PASSWORD: "test-only-api-password",
    API_ALLOWED_ORIGIN: "https://schaefchen.example",
    POSTGRES_HOST: "127.0.0.1",
    POSTGRES_DB: "schaefchen",
    ...values
  };
  try { return loadConfig(); }
  finally { process.env = previous; }
}

test("Neon uses certificate-verified TLS and the restricted API credentials", () => {
  const config = configuration({
    DATABASE_URL: "postgresql://owner:owner-password@ep-example.eu-central-1.aws.neon.tech/schaefchen?sslmode=require"
  });
  assert.deepEqual(config.database.ssl, { rejectUnauthorized: true });
  assert.equal(config.database.user, "schaefchen_api_login");
  assert.equal(config.database.password, "test-only-api-password");
});

test("explicit verify-full also secures other PostgreSQL providers", () => {
  assert.deepEqual(configuration({ API_DB_SSL_MODE: "verify-full" }).database.ssl,
    { rejectUnauthorized: true });
});

test("local PostgreSQL retains its existing non-TLS configuration", () => {
  assert.equal(configuration().database.ssl, false);
});

test("unsupported TLS modes fail instead of silently weakening verification", () => {
  assert.throws(() => configuration({ API_DB_SSL_MODE: "require" }), /API_DB_SSL_MODE/);
});
