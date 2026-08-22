import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.mjs";

const RELEVANT_ENVIRONMENT = [
  "API_ALLOWED_ORIGIN", "API_COOKIE_SECURE", "API_DB_PASSWORD", "API_DB_SSL_CA",
  "API_DB_SSL_MODE", "API_DB_USER", "API_TRUSTED_PROXY_HOPS", "APP_ENVIRONMENT",
  "DATABASE_URL", "NODE_ENV", "POSTGRES_DB", "POSTGRES_HOST",
  "SECURITY_RATE_LIMIT_SECRET", "UPLOAD_SCAN_HOST", "UPLOAD_SCAN_REQUIRED"
];

function configured(overrides, callback) {
  const previous = new Map(RELEVANT_ENVIRONMENT.map((name) => [name, process.env[name]]));
  try {
    for (const name of RELEVANT_ENVIRONMENT) delete process.env[name];
    Object.assign(process.env, {
      API_DB_USER: "api_test",
      API_DB_PASSWORD: "nur-ein-testpasswort",
      API_ALLOWED_ORIGIN: "http://localhost:4173",
      POSTGRES_HOST: "127.0.0.1",
      POSTGRES_DB: "schaefchen_test",
      ...overrides
    });
    return callback();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test("Entwicklung vertraut keinem Proxy und nutzt keine Datenbank-TLS-Abkürzung", () => {
  const config = configured({}, loadConfig);
  assert.equal(config.deploymentEnvironment, "development");
  assert.equal(config.trustedProxyHops, 0);
  assert.equal(config.database.ssl, false);
  assert.equal(config.uploadScanner.required, false);
});

test("Echte Produktionsdaten erzwingen HTTPS, TLS, Geheimnis und Uploadscanner", () => {
  assert.throws(
    () => configured({ APP_ENVIRONMENT: "production" }, loadConfig),
    /SECURITY_RATE_LIMIT_SECRET|HTTPS/
  );

  const config = configured({
    APP_ENVIRONMENT: "production",
    NODE_ENV: "production",
    API_ALLOWED_ORIGIN: "https://app.example.test",
    API_DB_SSL_MODE: "verify-full",
    API_TRUSTED_PROXY_HOPS: "1",
    SECURITY_RATE_LIMIT_SECRET: "production-test-secret-with-at-least-32-characters",
    UPLOAD_SCAN_REQUIRED: "true",
    UPLOAD_SCAN_HOST: "clamav.internal"
  }, loadConfig);
  assert.equal(config.cookieSecure, true);
  assert.equal(config.database.ssl.rejectUnauthorized, true);
  assert.equal(config.uploadScanner.required, true);
  assert.equal(config.uploadScanner.host, "clamav.internal");
});
