// DEVELOPMENT ONLY - never used by the Docker image.
// Starts the app on an in-memory PostgreSQL (PGlite) with one synthetic
// organization, so screens can be checked without a versioned build.
// Everything is lost when it stops. Usage (after `npm run build`):
//
//   DEV_PASSWORD=... PORT=8097 WEB_DIR=web/dist node server/dist/cli/dev.js
//
import os from "node:os";
import path from "node:path";
import { FEATURES } from "@structura/domain";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";
import { openDb } from "../db.js";
import { bootstrapTenant } from "../identity/service.js";
import { migrate } from "../migrate.js";

const password = process.env.DEV_PASSWORD;
if (!password) {
  console.error("Set DEV_PASSWORD (at least 10 characters) for the synthetic dev account");
  process.exit(2);
}
if (process.env.DATABASE_URL) {
  console.error("dev.js always uses an in-memory database; unset DATABASE_URL");
  process.exit(2);
}

const config = {
  ...loadConfig({ ...process.env, ENGINE_MODE: "cloud", DEPLOYMENT_ID: "local-dev" }),
  filesDir: process.env.FILES_DIR || path.join(os.tmpdir(), "structura-dev-files"),
};
const db = await openDb(null);
await migrate(db, config.migrationsDir);
await bootstrapTenant(db, {
  tenantName: "Organización de prueba (dev)",
  timezone: "America/Panama",
  adminEmail: "admin@structura.test",
  adminName: "Admin de prueba",
  adminPassword: password,
});
// The test organization has full access: every add-on (Walter's rule).
// DEV_FEATURES=none (or a list) narrows it for testing a restriction.
const devFeatures = process.env.DEV_FEATURES === undefined ? [...FEATURES] : process.env.DEV_FEATURES.split(",").map((s) => s.trim()).filter((s) => s && s !== "none");
await db.query("UPDATE tenants SET features = $1", [devFeatures]);
const app = await buildApp({ db, config, logger: false });
await app.listen({ host: "127.0.0.1", port: config.port });
console.log(`STRUCTURA dev (in-memory) on http://127.0.0.1:${config.port} - version ${config.appVersion}`);
