import fs from "node:fs";
import path from "node:path";
import type { Db } from "./db.js";

// Applies migrations/NNN_name.sql in order, each once, each in its own
// transaction: a failing migration leaves the database as it was before it.
export async function migrate(db: Db, dir: string): Promise<string[]> {
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const done = new Set(
    (await db.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map((r) => r.name)
  );
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^\d{3}_.+\.sql$/.test(f))
    .sort();
  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), "utf-8");
    try {
      await db.tx(async (t) => {
        await t.exec(sql);
        await t.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      });
    } catch (err) {
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
    }
    applied.push(file);
  }
  return applied;
}
