import { loadConfig } from "../api/src/config.mjs";

try {
  if (process.env.APP_ENVIRONMENT !== "demo") {
    throw new Error("Das kostenlose Neon-Profil ist ausschliesslich fuer die Testumgebung vorgesehen.");
  }
  const url = new URL(process.env.DATABASE_URL);
  if (!["postgres:", "postgresql:"].includes(url.protocol)
      || !url.hostname.endsWith(".neon.tech") || url.hostname.includes("-pooler.")) {
    throw new Error("DATABASE_URL muss den direkten PostgreSQL-Endpunkt von Neon verwenden.");
  }
  if (url.searchParams.get("sslmode") !== "verify-full"
      || url.searchParams.get("sslrootcert") !== "system") {
    throw new Error("Die Migrationsverbindung benoetigt sslmode=verify-full und sslrootcert=system (libpq 17+).");
  }
  if (!url.username || !url.password || url.pathname.length < 2
      || decodeURIComponent(url.username) === process.env.API_DB_USER) {
    throw new Error("Migrationseigentuemer und eingeschraenkter API-Login muessen getrennt sein.");
  }
  const config = loadConfig();
  if (config.deploymentEnvironment !== "demo"
      || config.database.ssl?.rejectUnauthorized !== true
      || config.database.max > 3) {
    throw new Error("Sicherheitsstand aus PR #70, API_DB_SSL_MODE=verify-full und API_DB_POOL_SIZE<=3 erforderlich.");
  }
  console.log("Neon-Testkonfiguration geprueft; Zugangsdaten werden nicht ausgegeben.");
} catch {
  // Weder URI noch Node-URL-Fehler ausgeben: sie koennten Passwoerter enthalten.
  console.error("Neon-Teststart abgebrochen. Demo-Modus, direkten Neon-Endpunkt, getrennte Rollen, TLS verify-full/system und Poolgroesse pruefen. Details: docs/FREE_DEMO_HOSTING.md.");
  process.exitCode = 1;
}
