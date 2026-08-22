import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

export const SESSION_COOKIE = "schaefchen_session";
export const PLATFORM_SESSION_COOKIE = "schaefchen_platform_session";

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

function normalizedIp(value) {
  if (typeof value !== "string") return null;
  let candidate = value.trim();
  if (candidate.startsWith("[") && candidate.endsWith("]")) {
    candidate = candidate.slice(1, -1);
  }
  if (candidate.toLowerCase().startsWith("::ffff:") && isIP(candidate.slice(7)) === 4) {
    candidate = candidate.slice(7);
  }
  return isIP(candidate) ? candidate.toLowerCase() : null;
}

// X-Forwarded-For darf nur ausgewertet werden, wenn die Zahl der eigenen
// vorgeschalteten Proxys ausdrücklich bekannt ist. So kann ein direkter
// Client keine beliebige Adresse in die Sperr- und Auditlogik einschleusen.
export function clientIp(request, trustedProxyHops = 0) {
  const remote = normalizedIp(request.socket?.remoteAddress) || "unknown";
  if (!Number.isInteger(trustedProxyHops) || trustedProxyHops < 1) return remote;

  const forwarded = request.headers?.["x-forwarded-for"];
  if (typeof forwarded !== "string" || forwarded.length > 2048) return remote;
  const addresses = forwarded.split(",").map(normalizedIp);
  if (addresses.length > 20 || addresses.some((address) => !address)) return remote;

  const chain = [...addresses, remote];
  const clientIndex = chain.length - 1 - trustedProxyHops;
  return clientIndex >= 0 ? chain[clientIndex] : remote;
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

function namedSessionCookie(name, path, token, { secure, maxAge }) {
  const attributes = [
    `${name}=${encodeURIComponent(token)}`,
    `Path=${path}`,
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${Math.max(0, Math.floor(maxAge))}`
  ];
  if (secure) attributes.push("Secure");
  return attributes.join("; ");
}

export function sessionCookie(token, options) {
  return namedSessionCookie(SESSION_COOKIE, "/api/v1", token, options);
}

export function platformSessionCookie(token, options) {
  return namedSessionCookie(
    PLATFORM_SESSION_COOKIE,
    "/api/v1/platform",
    token,
    options
  );
}

export class LoginRateLimiter {
  constructor({ maximumFailures = 5, windowMs = 15 * 60 * 1000 } = {}) {
    this.maximumFailures = maximumFailures;
    this.windowMs = windowMs;
    this.failures = new Map();
  }

  key(...parts) {
    return parts.map((part) => String(part ?? "").toLowerCase()).join("|");
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

  consume(scope, key, {
    maximum = this.maximumFailures,
    windowMs = this.windowMs
  } = {}, now = Date.now()) {
    const bucketKey = `${scope}|${key}`;
    const current = this.failures.get(bucketKey);
    const entry = !current || current.resetAt <= now
      ? { count: 0, resetAt: now + windowMs }
      : current;
    entry.count += 1;
    this.failures.set(bucketKey, entry);
    return {
      allowed: entry.count <= maximum,
      attemptCount: entry.count,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000))
    };
  }

  clearBucket(scope, key) {
    this.failures.delete(`${scope}|${key}`);
  }
}

export class DatabaseRateLimiter {
  constructor({ execute, secret }) {
    if (typeof execute !== "function") throw new TypeError("execute muss eine Funktion sein.");
    if (typeof secret !== "string" || secret.length < 32) {
      throw new TypeError("Das Rate-Limit-Geheimnis muss mindestens 32 Zeichen lang sein.");
    }
    this.execute = execute;
    this.secret = secret;
  }

  key(...parts) {
    const hmac = createHmac("sha256", this.secret);
    for (const part of parts) {
      const value = String(part ?? "");
      hmac.update(String(Buffer.byteLength(value, "utf8")));
      hmac.update(":");
      hmac.update(value, "utf8");
      hmac.update("|");
    }
    return hmac.digest("hex");
  }

  async consume(scope, key, { maximum, windowMs }) {
    if (!/^[a-z][a-z0-9_]{1,39}$/.test(scope)) throw new TypeError("Ungültiger Rate-Limit-Bereich.");
    if (!/^[0-9a-f]{64}$/.test(key)) throw new TypeError("Ungültiger Rate-Limit-Schlüssel.");
    if (!Number.isInteger(maximum) || maximum < 1 || maximum > 10000) {
      throw new TypeError("Ungültige Rate-Limit-Obergrenze.");
    }
    const windowSeconds = Math.ceil(windowMs / 1000);
    if (!Number.isInteger(windowSeconds) || windowSeconds < 1 || windowSeconds > 86400) {
      throw new TypeError("Ungültiges Rate-Limit-Zeitfenster.");
    }
    const result = await this.execute((client) => client.query(
      "SELECT allowed, attempt_count, retry_after_seconds FROM api_consume_security_rate_limit($1,$2,$3,$4)",
      [scope, key, maximum, windowSeconds]
    ));
    const row = result.rows[0];
    return {
      allowed: Boolean(row?.allowed),
      attemptCount: Number(row?.attempt_count || 0),
      retryAfterSeconds: Math.max(1, Number(row?.retry_after_seconds || 1))
    };
  }

  async clearBucket(scope, key) {
    await this.execute((client) => client.query(
      "SELECT api_clear_security_rate_limit($1,$2)",
      [scope, key]
    ));
  }
}
