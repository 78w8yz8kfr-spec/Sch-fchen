import assert from "node:assert/strict";
import test from "node:test";
import {
  createSessionToken,
  hashSessionToken,
  LoginRateLimiter,
  parseCookies,
  sessionCookie
} from "../src/security.mjs";

test("Sitzungstoken ist zufällig und wird als SHA-256-Hash gespeichert", () => {
  const first = createSessionToken();
  const second = createSessionToken();
  assert.notEqual(first, second);
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.match(hashSessionToken(first), /^[0-9a-f]{64}$/);
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
