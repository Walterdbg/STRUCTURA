// One-time setup of a new installation: creates the organization (tenant)
// and its first administrator. Run inside the app container:
//
//   docker compose exec -e ADMIN_PASSWORD='...' structura-app \
//     node server/dist/cli/bootstrap.js --tenant "Name" --timezone America/Panama \
//       --email admin@example.com --name "Admin Name"
//
// The password comes from the ADMIN_PASSWORD variable, never from the
// command line, so it doesn't end up in shell history or process lists.
import { parseArgs } from "node:util";
import { loadConfig } from "../config.js";
import { openDb } from "../db.js";
import { migrate } from "../migrate.js";
import { bootstrapTenant } from "../identity/service.js";

const { values } = parseArgs({
  options: {
    tenant: { type: "string" },
    timezone: { type: "string" },
    email: { type: "string" },
    name: { type: "string" },
    locale: { type: "string", default: "es" },
  },
});

const password = process.env.ADMIN_PASSWORD ?? "";
const missing = ["tenant", "timezone", "email", "name"].filter((k) => !values[k as keyof typeof values]);
if (missing.length || !password) {
  console.error(`Missing: ${[...missing.map((m) => `--${m}`), ...(password ? [] : ["ADMIN_PASSWORD"])].join(", ")}`);
  process.exit(2);
}

const config = loadConfig();
const db = await openDb(config.databaseUrl);
try {
  await migrate(db, config.migrationsDir);
  const res = await bootstrapTenant(db, {
    tenantName: values.tenant!,
    timezone: values.timezone!,
    adminEmail: values.email!,
    adminName: values.name!,
    adminPassword: password,
    locale: values.locale === "en" ? "en" : "es",
  });
  console.log(`Created organization ${res.tenantId} with administrator ${values.email}`);
} catch (err) {
  console.error(`Setup failed: ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  await db.close();
}
