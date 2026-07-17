import { createServer } from "node:http";
import { createApp } from "./app.mjs";
import { loadConfig } from "./config.mjs";
import { createPool } from "./database.mjs";

const config = loadConfig();
const pool = createPool(config.database);
const server = createServer(createApp({ pool, config }));

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
