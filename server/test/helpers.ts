import { uuidv7 } from "@structura/domain";
import { loadConfig, type Config } from "../src/config.js";
import { openDb, type Db } from "../src/db.js";
import { migrate } from "../src/migrate.js";

export function testConfig(overrides: Partial<Config> = {}): Config {
  return { ...loadConfig({ ENGINE_MODE: "cloud", DEPLOYMENT_ID: "test" }), ...overrides };
}

// A fresh in-memory database with all migrations applied.
export async function freshDb(): Promise<Db> {
  const db = await openDb(null);
  await migrate(db, testConfig().migrationsDir);
  return db;
}

export async function addTenant(db: Db, name = "Tenant"): Promise<string> {
  const id = uuidv7();
  await db.query("INSERT INTO tenants (id, display_name) VALUES ($1, $2)", [id, name]);
  return id;
}

export async function count(db: Db, table: string): Promise<number> {
  const { rows } = await db.query<{ n: number | string }>(`SELECT count(*)::int AS n FROM ${table}`);
  return Number(rows[0]!.n);
}
