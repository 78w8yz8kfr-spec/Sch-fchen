import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import { createPlatformHandler } from "../src/platform-admin.mjs";
import { LoginRateLimiter } from "../src/security.mjs";

test("Plattform-Anmeldesperre bleibt bei gefälschter IP-Kopfzeile bestehen", async () => {
  let lookups = 0;
  const client = {
    async query(sql) {
      if (sql.includes("FROM api_lookup_platform_user")) {
        lookups += 1;
        return { rows: [], rowCount: 0 };
      }
      assert.ok(["BEGIN", "SET LOCAL ROLE schaefchen_platform_api", "COMMIT"].includes(sql));
      return { rows: [], rowCount: 0 };
    },
    release() {}
  };
  const handler = createPlatformHandler({
    pool: { async connect() { return client; } },
    config: {},
    limiter: new LoginRateLimiter()
  });
  const attempt = (forwarded, remote = "192.0.2.20", email = "security-test@example.invalid") => {
    const request = Readable.from([Buffer.from(JSON.stringify({
      email, password: "synthetic-not-an-account-password"
    }))]);
    request.method = "POST";
    request.headers = { "content-type": "application/json", "x-forwarded-for": forwarded };
    request.socket = { remoteAddress: remote };
    return handler(request, {}, new URL("https://example.invalid/api/v1/platform/session"));
  };
  for (let index = 0; index < 5; index += 1) {
    await assert.rejects(attempt("192.0.2.10"), { status: 401, code: "login_failed" });
  }
  await assert.rejects(attempt("192.0.2.10"), { status: 429, code: "login_rate_limited" });
  await assert.rejects(attempt("192.0.2.11"), { status: 429, code: "login_rate_limited" });
  await assert.rejects(attempt("192.0.2.12", "192.0.2.30", "SECURITY-TEST@example.invalid"), {
    status: 429, code: "login_rate_limited"
  });
  assert.equal(lookups, 5, "Gesperrte Kennungen lösen keine weitere Passwortabfrage aus");
  await assert.rejects(attempt("192.0.2.10", "192.0.2.20", "another-test@example.invalid"), {
    status: 401, code: "login_failed"
  });
  assert.equal(lookups, 6, "Andere Kennungen bleiben unabhängig nutzbar");
});
