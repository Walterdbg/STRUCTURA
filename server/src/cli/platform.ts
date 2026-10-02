// Platform operator tool: who is a platform administrator (DEC-039). A
// platform administrator sees platform-wide views (the course library of
// every organization). Only this tool can grant it.
//
//   node server/dist/cli/platform.js --list
//   node server/dist/cli/platform.js --grant <email>
//   node server/dist/cli/platform.js --revoke <email>
//
// Inside Docker: docker compose exec structura-app node server/dist/cli/platform.js ...
import { parseArgs } from "node:util";
import { loadConfig } from "../config.js";
import { openDb } from "../db.js";
import { migrate } from "../migrate.js";

const { values } = parseArgs({ options: { list: { type: "boolean" }, grant: { type: "string" }, revoke: { type: "string" } } });

const config = loadConfig();
const db = await openDb(config.databaseUrl);
try {
  await migrate(db, config.migrationsDir);
  for (const [email, on] of [
    [values.grant, true],
    [values.revoke, false],
  ] as const) {
    if (!email) continue;
    const { rows } = await db.query<{ id: string }>("UPDATE users SET platform_admin = $2 WHERE lower(email) = lower($1) RETURNING id", [email, on]);
    if (!rows[0]) throw new Error(`No user with email ${email}`);
    console.log(`${email}: platform administrator ${on ? "granted" : "revoked"}`);
  }
  if (values.list || (!values.grant && !values.revoke)) {
    const { rows } = await db.query<{ email: string; display_name: string }>("SELECT email, display_name FROM users WHERE platform_admin ORDER BY email");
    console.log(rows.length ? rows.map((r) => `${r.email}  (${r.display_name})`).join("\n") : "No platform administrators.");
  }
} finally {
  await db.close();
}
