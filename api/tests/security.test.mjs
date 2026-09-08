import assert from "node:assert/strict";
import test from "node:test";
import {
  createSessionToken,
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

test("Einrichtungsschlüssel werden zeitkonstant verglichen", () => {
  assert.equal(secretsEqual("ein-langer-einrichtungsschluessel", "ein-langer-einrichtungsschluessel"), true);
  assert.equal(secretsEqual("falsch", "ein-langer-einrichtungsschluessel"), false);
  assert.equal(secretsEqual(null, "ein-langer-einrichtungsschluessel"), false);
});

test("Abgelaufene Login-Kennungen werden auch bei neuen Kennungen entfernt", () => {
  const limiter = new LoginRateLimiter({ windowMs: 1000 });
  for (let index = 0; index < 1000; index += 1) limiter.fail(`old-${index}`, 0);
  assert.equal(limiter.failures.size, 1000);
  assert.equal(limiter.isBlocked("new-identity", 2000), false);
  assert.equal(limiter.failures.size, 0);
});

test("Viele unterschiedliche Fehlanmeldungen halten die Speichergrenze ein", () => {
  const limiter = new LoginRateLimiter({ maximumEntries: 3, windowMs: 1000 });
  for (let index = 0; index < 1000; index += 1) limiter.fail(`identity-${index}`, 0);
  assert.equal(limiter.failures.size, 3);
  assert.equal(limiter.isBlocked("new-identity", 100), true);
  assert.equal(limiter.isBlocked("identity-0", 100), false);
  limiter.clear("identity-1");
  assert.equal(limiter.isBlocked("new-identity", 100), false);
  limiter.fail("new-identity", 100);
  assert.equal(limiter.failures.size, 3);
});

test("Volle Login-Sperrliste behält Sperren und erholt sich nach Ablauf", () => {
  const limiter = new LoginRateLimiter({ maximumEntries: 2, maximumFailures: 2, windowMs: 1000 });
  limiter.fail("blocked", 0);
  limiter.fail("blocked", 1);
  limiter.fail("pending", 10);
  for (let index = 0; index < 100; index += 1) limiter.fail(`new-${index}`, 100);
  assert.equal(limiter.isBlocked("blocked", 100), true);
  assert.equal(limiter.isBlocked("new-identity", 100), true);
  assert.equal(limiter.isBlocked("new-identity", 1000), false);
  assert.equal(limiter.failures.size, 1);
  limiter.fail("new-identity", 1000);
  assert.equal(limiter.failures.size, 2);
  assert.equal(limiter.isBlocked("pending", 1010), false);
});

test("Die Login-Speichergrenze darf nicht deaktiviert oder ungültig sein", () => {
  for (const maximumEntries of [0, -1, 1.5, Infinity, NaN]) {
    assert.throws(() => new LoginRateLimiter({ maximumEntries }), TypeError);
  }
});
