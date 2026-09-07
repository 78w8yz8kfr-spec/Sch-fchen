import { createServer } from "node:http";
import { createApp } from "./app.mjs";
import { loadConfig } from "./config.mjs";
import { createPool } from "./database.mjs";

const config = loadConfig();
const pool = createPool(config.database);
const server = createServer(createApp({ pool, config }));

// Ein Client, der seine Anfrage nur tropfenweise sendet, haelt sonst beliebig
// lange eine Verbindung offen - ohne je etwas Boeses zu wollen, reicht dafuer
// ein Telefon mit einem Balken Empfang auf der Baustelle.
//
// Die Reihenfolge ist nicht beliebig: keepAliveTimeout muss kleiner sein als
// headersTimeout, sonst schliesst der Server eine Verbindung, waehrend der
// Client sie noch fuer nutzbar haelt, und der bekommt einen abgerissenen
// Aufruf statt einer Antwort. Und keepAliveTimeout sollte ueber dem Wert des
// vorgelagerten Netzes liegen (Render laesst rund 60 Sekunden), damit der
// Server nicht zuerst aufloest.
server.keepAliveTimeout = 65000;
server.headersTimeout = 70000;
// Die Gesamtdauer einer Anfrage. Grosszuegig, weil der Excel-Wochenplanimport
// und grosse PDF mit Fotos dahinter liegen - aber nicht unendlich.
server.requestTimeout = 120000;

server.listen(config.port, "0.0.0.0", () => {
  console.log(`Schäfchen API lauscht auf Port ${config.port}.`);
});

async function shutdown(signal) {
  console.log(`${signal} empfangen, API wird beendet.`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Nach einem unbehandelten Fehler ist der Zustand des Prozesses unbekannt.
// Weiterlaufen waere die schlechtere Wahl: eine API, die halb funktioniert,
// schreibt halbe Daten. Deshalb wird die Ursache genannt und geordnet beendet
// - der Behaelter startet neu, und der Fehler steht im Protokoll, statt
// stumm zu verschwinden.
//
// Ohne diese beiden Zeilen endet der Prozess bei einem unbehandelten Fehler
// trotzdem, nur ohne Hinweis darauf, was ihn umgebracht hat.
function beendeNachSchweremFehler(art, error) {
  console.error(`${art}: ${error?.stack || error?.message || error}`);
  shutdown(art);
}

process.on("uncaughtException", (error) => beendeNachSchweremFehler("uncaughtException", error));
process.on("unhandledRejection", (error) => beendeNachSchweremFehler("unhandledRejection", error));
