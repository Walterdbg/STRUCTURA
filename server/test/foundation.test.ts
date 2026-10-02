import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { uuidv7 } from "@structura/domain";
import type { Db } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { addTenant, count, freshDb, testConfig } from "./helpers.js";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});
afterEach(async () => {
  await db.close();
});

async function addCommand(tenantId: string): Promise<string> {
  const id = uuidv7();
  await db.query(
    `INSERT INTO command_log (command_id, tenant_id, deployment_id, command_type, payload_hash, result, occurred_at)
     VALUES ($1, $2, 'test', 'test.command', 'hash', '{}', now())`,
    [id, tenantId]
  );
  return id;
}

async function addAudit(tenantId: string, commandId: string | null): Promise<void> {
  await db.query(
    `INSERT INTO audit_entries (id, tenant_id, command_id, deployment_id, action, record_type, occurred_at)
     VALUES ($1, $2, $3, 'test', 'created', 'test', now())`,
    [uuidv7(), tenantId, commandId]
  );
}

describe("migrations", () => {
  it("apply once; running again changes nothing", async () => {
    expect(await migrate(db, testConfig().migrationsDir)).toEqual([]);
    const { rows } = await db.query<{ name: string }>("SELECT name FROM schema_migrations");
    expect(rows.map((r) => r.name)).toEqual(["001_foundation.sql", "002_identity_events.sql", "003_inventory.sql", "004_reservations.sql", "005_event_location_point.sql", "006_event_maps.sql", "007_map_feature_props.sql", "008_event_types_date_rules.sql", "009_route_repository.sql", "010_route_waypoints.sql", "011_route_location.sql", "012_platform_admin.sql"]);
  });
});

describe("append-only records (spec 18.2, AT-18)", () => {
  it("audit entries cannot be updated or deleted", async () => {
    const tenant = await addTenant(db);
    await addAudit(tenant, null);
    await expect(db.query("UPDATE audit_entries SET action = 'edited'")).rejects.toThrow(/append_only/);
    await expect(db.query("DELETE FROM audit_entries")).rejects.toThrow(/append_only/);
    await expect(db.exec("TRUNCATE audit_entries")).rejects.toThrow(/append_only/);
    expect(await count(db, "audit_entries")).toBe(1);
  });

  it("the command log cannot be updated or deleted", async () => {
    const tenant = await addTenant(db);
    await addCommand(tenant);
    await expect(db.query("UPDATE command_log SET result = '{\"x\":1}'")).rejects.toThrow(/append_only/);
    await expect(db.query("DELETE FROM command_log")).rejects.toThrow(/append_only/);
    expect(await count(db, "command_log")).toBe(1);
  });
});

describe("tenant isolation (AT-28)", () => {
  it("an audit entry cannot point at another tenant's command", async () => {
    const a = await addTenant(db, "A");
    const b = await addTenant(db, "B");
    const commandOfA = await addCommand(a);
    await addAudit(a, commandOfA);
    await expect(addAudit(b, commandOfA)).rejects.toThrow(/foreign key/i);
  });

  it("an outbox row cannot point at another tenant's command", async () => {
    const a = await addTenant(db, "A");
    const b = await addTenant(db, "B");
    const commandOfA = await addCommand(a);
    await expect(
      db.query(
        `INSERT INTO outbox (id, tenant_id, command_id, aggregate_type, aggregate_id, payload)
         VALUES ($1, $2, $3, 'test', $4, '{}')`,
        [uuidv7(), b, commandOfA, uuidv7()]
      )
    ).rejects.toThrow(/foreign key/i);
  });
});

describe("basic constraints", () => {
  it("user emails are unique regardless of case", async () => {
    await db.query("INSERT INTO users (id, email, display_name) VALUES ($1, 'Ana@Example.com', 'Ana')", [uuidv7()]);
    await expect(
      db.query("INSERT INTO users (id, email, display_name) VALUES ($1, 'ana@example.com', 'Ana 2')", [uuidv7()])
    ).rejects.toThrow(/unique/i);
  });

  it("locales are limited to Spanish and English, Spanish by default (DEC-012)", async () => {
    const id = await addTenant(db);
    const { rows } = await db.query<{ default_locale: string }>("SELECT default_locale FROM tenants WHERE id = $1", [id]);
    expect(rows[0]!.default_locale).toBe("es");
    await expect(
      db.query("INSERT INTO tenants (id, display_name, default_locale) VALUES ($1, 'X', 'fr')", [uuidv7()])
    ).rejects.toThrow(/check/i);
  });

  it("NUMERIC values come back as exact text, never as JS numbers", async () => {
    const { rows } = await db.query<{ v: unknown }>("SELECT (0.1::numeric + 0.2::numeric) AS v");
    expect(rows[0]!.v).toBe("0.3");
  });
});
