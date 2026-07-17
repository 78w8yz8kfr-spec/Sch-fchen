import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "schaefchen_session";

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function secretsEqual(received, expected) {
  if (typeof received !== "string" || typeof expected !== "string") return false;
  const receivedHash = createHash("sha256").update(received, "utf8").digest();
  const expectedHash = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(receivedHash, expectedHash);
}

export function parseCookies(header = "") {
  const result = Object.create(null);
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;

    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!name || Object.hasOwn(result, name)) continue;

    try {
      result[name] = decodeURIComponent(value);
    } catch {
      result[name] = value;
    }
  }
  return result;
}

export function sessionCookie(token, { secure, maxAge }) {
  const attributes = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/api/v1",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${Math.max(0, Math.floor(maxAge))}`
  ];
  if (secure) attributes.push("Secure");
  return attributes.join("; ");
}

export class LoginRateLimiter {
  constructor({ maximumFailures = 5, windowMs = 15 * 60 * 1000 } = {}) {
    this.maximumFailures = maximumFailures;
    this.windowMs = windowMs;
    this.failures = new Map();
  }

  key(ip, companyNumber, personnelNumber) {
    return `${ip}|${companyNumber.toLowerCase()}|${personnelNumber.toLowerCase()}`;
  }

  isBlocked(key, now = Date.now()) {
    const entry = this.failures.get(key);
    if (!entry) return false;
    if (entry.resetAt <= now) {
      this.failures.delete(key);
      return false;
    }
    return entry.count >= this.maximumFailures;
  }

  fail(key, now = Date.now()) {
    const current = this.failures.get(key);
    const entry = !current || current.resetAt <= now
      ? { count: 0, resetAt: now + this.windowMs }
      : current;
    entry.count += 1;
    this.failures.set(key, entry);
  }

  clear(key) {
    this.failures.delete(key);
  }
}
