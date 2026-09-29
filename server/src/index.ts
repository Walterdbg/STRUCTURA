import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openDb } from "./db.js";
import { migrate } from "./migrate.js";

const config = loadConfig();
const db = await openDb(config.databaseUrl);
const applied = await migrate(db, config.migrationsDir);
const app = await buildApp({ db, config });

if (applied.length) app.log.info({ applied }, "migrations applied");
app.log.info(
  { version: config.appVersion, engineMode: config.engineMode, deploymentId: config.deploymentId },
  "STRUCTURA starting"
);

const shutdown = async () => {
  await app.close();
  await db.close();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

await app.listen({ host: config.host, port: config.port });
