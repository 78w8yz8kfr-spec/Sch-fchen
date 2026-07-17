const REQUIRED = ["API_DB_USER", "API_DB_PASSWORD"];

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
  if (!process.env.DATABASE_URL && (!process.env.POSTGRES_HOST || !process.env.POSTGRES_DB)) {
    missing.push("DATABASE_URL oder POSTGRES_HOST + POSTGRES_DB");
  }
  if (missing.length > 0) {
    throw new Error(`Fehlende Umgebungsvariablen: ${missing.join(", ")}`);
  }

  const originValue = process.env.API_ALLOWED_ORIGIN
    || (process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : null);
  if (!originValue) {
    throw new Error("API_ALLOWED_ORIGIN oder RENDER_EXTERNAL_HOSTNAME muss gesetzt sein.");
  }
  const allowedOrigin = new URL(originValue);
  if (!['http:', 'https:'].includes(allowedOrigin.protocol)) {
    throw new Error("API_ALLOWED_ORIGIN muss eine HTTP(S)-Adresse sein.");
  }

  const timeZone = process.env.APP_TIME_ZONE || "Europe/Berlin";
  new Intl.DateTimeFormat("de-DE", { timeZone }).format(new Date());

  const production = process.env.NODE_ENV === "production";
  const databaseUrl = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
  const setupToken = process.env.INITIAL_SETUP_TOKEN?.trim() || null;
  if (setupToken && setupToken.length < 24) {
    throw new Error("INITIAL_SETUP_TOKEN muss mindestens 24 Zeichen lang sein.");
  }

  return Object.freeze({
    port: integer("API_PORT", 3000, 1, 65535),
    allowedOrigin: allowedOrigin.origin,
    timeZone,
    sessionTtlSeconds: integer("SESSION_TTL_SECONDS", 28800, 900, 86400),
    cookieSecure: production || process.env.API_COOKIE_SECURE === "true",
    initialCompanyNumber: process.env.INITIAL_COMPANY_NUMBER || "F-000001",
    initialSetupToken: setupToken,
    staticDirectory: process.env.STATIC_DIRECTORY || null,
    database: {
      host: databaseUrl?.hostname || process.env.POSTGRES_HOST,
      port: databaseUrl ? Number(databaseUrl.port || 5432) : integer("POSTGRES_PORT", 5432, 1, 65535),
      database: databaseUrl ? decodeURIComponent(databaseUrl.pathname.slice(1)) : process.env.POSTGRES_DB,
      user: process.env.API_DB_USER,
      password: process.env.API_DB_PASSWORD,
      max: integer("API_DB_POOL_SIZE", 10, 1, 50),
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      application_name: "schaefchen_api"
    }
  });
}
