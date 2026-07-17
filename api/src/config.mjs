const REQUIRED = [
  "POSTGRES_HOST",
  "POSTGRES_DB",
  "API_DB_USER",
  "API_DB_PASSWORD",
  "API_ALLOWED_ORIGIN"
];

function integer(name, fallback, minimum, maximum) {
  const raw = process.env[name] ?? String(fallback);
  const value = Number(raw);

  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} muss eine ganze Zahl zwischen ${minimum} und ${maximum} sein.`);
  }

  return value;
}

export function loadConfig() {
  const missing = REQUIRED.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Fehlende Umgebungsvariablen: ${missing.join(", ")}`);
  }

  const allowedOrigin = new URL(process.env.API_ALLOWED_ORIGIN);
  if (!['http:', 'https:'].includes(allowedOrigin.protocol)) {
    throw new Error("API_ALLOWED_ORIGIN muss eine HTTP(S)-Adresse sein.");
  }

  const timeZone = process.env.APP_TIME_ZONE || "Europe/Berlin";
  new Intl.DateTimeFormat("de-DE", { timeZone }).format(new Date());

  const production = process.env.NODE_ENV === "production";

  return Object.freeze({
    port: integer("API_PORT", 3000, 1, 65535),
    allowedOrigin: allowedOrigin.origin,
    timeZone,
    sessionTtlSeconds: integer("SESSION_TTL_SECONDS", 28800, 900, 86400),
    cookieSecure: production || process.env.API_COOKIE_SECURE === "true",
    database: {
      host: process.env.POSTGRES_HOST,
      port: integer("POSTGRES_PORT", 5432, 1, 65535),
      database: process.env.POSTGRES_DB,
      user: process.env.API_DB_USER,
      password: process.env.API_DB_PASSWORD,
      max: integer("API_DB_POOL_SIZE", 10, 1, 50),
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      application_name: "schaefchen_api"
    }
  });
}
