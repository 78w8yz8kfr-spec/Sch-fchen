import assert from "node:assert/strict";
import test from "node:test";
import {
  clientIp,
  createSessionToken,
  DatabaseRateLimiter,
  hashSessionToken,
  LoginRateLimiter,
  parseCookies,
  platformSessionCookie,
  secretsEqual,
  sessionCookie
} from "../src/security.mjs";

test("Sitzungstoken ist zufällig und wird als SHA-256-Hash gespeichert", () => {
  const first = createSessionToken();
  const second = createSessionToken();
  assert.notEqual(first, second);
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.match(hashSessionToken(first), /^[0-9a-f]{64}$/);
});

test("Plattformsitzung verwendet ein getrenntes, eng begrenztes Cookie", () => {
  const cookie = platformSessionCookie("platform-token", { secure: true, maxAge: 900 });
  assert.match(cookie, /^schaefchen_platform_session=platform-token;/);
  assert.match(cookie, /Path=\/api\/v1\/platform/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Secure/);
  assert.doesNotMatch(cookie, /^schaefchen_session=/);
});

test("Session-Cookie besitzt sichere Browserattribute", () => {
  const cookie = sessionCookie("token", { secure: true, maxAge: 3600 });
  assert.match(cookie, /^schaefchen_session=token;/);
  assert.match(cookie, /Path=\/api\/v1/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Secure/);
  assert.equal(parseCookies("a=1; schaefchen_session=abc%201").schaefchen_session, "abc 1");
});

test("Login-Sperre greift nach fünf Fehlern und kann zurückgesetzt werden", () => {
  const limiter = new LoginRateLimiter({ maximumFailures: 5, windowMs: 1000 });
  const key = limiter.key("127.0.0.1", "F-000001", "M-1");
  for (let attempt = 0; attempt < 5; attempt += 1) limiter.fail(key, 100);
  assert.equal(limiter.isBlocked(key, 200), true);
  limiter.clear(key);
  assert.equal(limiter.isBlocked(key, 200), false);
});

test("allgemeine Schranken besitzen getrennte Bereiche und eine Wartezeit", () => {
  const limiter = new LoginRateLimiter();
  const key = limiter.key("127.0.0.1", "Benutzer");
  assert.equal(limiter.consume("login", key, { maximum: 2, windowMs: 1000 }, 100).allowed, true);
  assert.equal(limiter.consume("login", key, { maximum: 2, windowMs: 1000 }, 200).allowed, true);
  const blocked = limiter.consume("login", key, { maximum: 2, windowMs: 1000 }, 300);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 1);
  assert.equal(limiter.consume("upload", key, { maximum: 1, windowMs: 1000 }, 300).allowed, true);
  limiter.clearBucket("login", key);
  assert.equal(limiter.consume("login", key, { maximum: 2, windowMs: 1000 }, 400).allowed, true);
});

test("Datenbank-Schranken speichern nur einen HMAC und nutzen atomare Funktionen", async () => {
  const calls = [];
  const limiter = new DatabaseRateLimiter({
    secret: "unit-test-rate-limit-secret-at-least-32-characters",
    execute: async (callback) => callback({
      async query(text, parameters) {
        calls.push({ text, parameters });
        return { rows: [{ allowed: false, attempt_count: 6, retry_after_seconds: 42 }] };
      }
    })
  });
  const key = limiter.key("203.0.113.9", "F-000001", "M-17");
  assert.match(key, /^[0-9a-f]{64}$/);
  assert.doesNotMatch(key, /203|000001|M-17/);
  const result = await limiter.consume("company_login_identity", key, {
    maximum: 5,
    windowMs: 900000
  });
  assert.deepEqual(result, { allowed: false, attemptCount: 6, retryAfterSeconds: 42 });
  assert.match(calls[0].text, /api_consume_security_rate_limit/);
  assert.deepEqual(calls[0].parameters, ["company_login_identity", key, 5, 900]);
  await limiter.clearBucket("company_login_identity", key);
  assert.match(calls[1].text, /api_clear_security_rate_limit/);
});

test("Weiterleitungsadressen gelten nur hinter ausdrücklich vertrauten Proxys", () => {
  const request = {
    headers: { "x-forwarded-for": "198.51.100.4" },
    socket: { remoteAddress: "::ffff:127.0.0.1" }
  };
  assert.equal(clientIp(request, 0), "127.0.0.1");
  assert.equal(clientIp(request, 1), "198.51.100.4");
  assert.equal(clientIp({
    headers: { "x-forwarded-for": "nicht-eine-adresse" },
    socket: { remoteAddress: "127.0.0.1" }
  }, 1), "127.0.0.1");
});

test("Einrichtungsschlüssel werden zeitkonstant verglichen", () => {
  assert.equal(secretsEqual("ein-langer-einrichtungsschluessel", "ein-langer-einrichtungsschluessel"), true);
  assert.equal(secretsEqual("falsch", "ein-langer-einrichtungsschluessel"), false);
  assert.equal(secretsEqual(null, "ein-langer-einrichtungsschluessel"), false);
});
