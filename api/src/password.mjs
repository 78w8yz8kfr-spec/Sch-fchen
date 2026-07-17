import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const DEFAULTS = Object.freeze({ N: 16384, r: 8, p: 1, keyLength: 32 });
const FORMAT = /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/;

function options(N, r, p) {
  return { N, r, p, maxmem: Math.max(32 * 1024 * 1024, 128 * N * r + 1024 * 1024) };
}

export async function hashPassword(password) {
  if (typeof password !== "string" || password.length < 12 || password.length > 256) {
    throw new Error("Das Passwort muss zwischen 12 und 256 Zeichen lang sein.");
  }

  const salt = randomBytes(16);
  const derived = await scrypt(
    password,
    salt,
    DEFAULTS.keyLength,
    options(DEFAULTS.N, DEFAULTS.r, DEFAULTS.p)
  );

  return [
    "scrypt",
    DEFAULTS.N,
    DEFAULTS.r,
    DEFAULTS.p,
    salt.toString("base64url"),
    derived.toString("base64url")
  ].join("$");
}

export async function verifyPassword(password, encodedHash) {
  if (typeof password !== "string" || typeof encodedHash !== "string") return false;

  const match = FORMAT.exec(encodedHash);
  if (!match) return false;

  const N = Number(match[1]);
  const r = Number(match[2]);
  const p = Number(match[3]);
  const salt = Buffer.from(match[4], "base64url");
  const expected = Buffer.from(match[5], "base64url");

  if (
    !Number.isInteger(N) || N < 16384 || N > 65536 || (N & (N - 1)) !== 0
    || !Number.isInteger(r) || r < 8 || r > 32
    || !Number.isInteger(p) || p < 1 || p > 4
    || salt.length < 16 || salt.length > 64
    || expected.length < 32 || expected.length > 64
  ) return false;

  try {
    const actual = await scrypt(password, salt, expected.length, options(N, r, p));
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
